import crypto from 'crypto';
import { User } from '../models';

/**
 * Telegram notifications.
 *  1. Create a bot with @BotFather and put its token in TELEGRAM_BOT_TOKEN.
 *  2. Each person opens More > Telegram in the app, taps Connect and presses Start in the bot.
 *  3. Every in-app alert is also sent to their Telegram chat.
 * Or, simplest: set TELEGRAM_CHAT_ID (a group or your own chat) and EVERY alert is also posted
 * there, with the name of the person it was for. No one needs to connect anything.
 * The server calls Telegram by long polling, so no public URL or HTTPS is needed.
 */
const token = () => process.env.TELEGRAM_BOT_TOKEN || '';
let botName = process.env.TELEGRAM_BOT_USERNAME || '';

export const telegramEnabled = () => !!token();
export const telegramBot = () => botName.replace(/^@/, '');

async function call<T = any>(method: string, body: object = {}, timeoutMs = 15000): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!json.ok) throw new Error(json.description || `Telegram error ${res.status}`);
  return json.result as T;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const BRAND = process.env.TELEGRAM_BRAND || 'CaptureSheet';
const LINE = '━━━━━━━━━━━━━━';

/** Icon and label for each kind of alert. Unknown titles fall back to a plain notice. */
const KINDS: Record<string, [string, string]> = {
  'Capture scheduled': ['📅', 'SCHEDULED'],
  'Capture moved': ['🔄', 'DATE CHANGED'],
  'Capture changed': ['🔄', 'DATE CHANGED'],
  'Time changed': ['⏰', 'TIME CHANGED'],
  'Capture rescheduled': ['🔁', 'RESCHEDULED'],
  'Capture cancelled': ['🚫', 'CANCELLED'],
  'Capture missed': ['⚠️', 'ATTENTION'],
  'Your video is edited': ['🎬', 'VIDEO READY'],
  'New booking request': ['📥', 'APPROVAL NEEDED'],
  'Booking cancelled by supervisor': ['🚫', 'CANCELLED'],
  'Request approved': ['✅', 'APPROVED'],
  'Request declined': ['❌', 'DECLINED'],
  'Availability conflict': ['⚠️', 'ATTENTION'],
};

/** Pulls "Mon 3 Nov" and "09:00" out of the alert text so they can be shown as clear fields. */
function fields(body: string): { date?: string; time?: string; rest: string } {
  const date = body.match(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}\b/)?.[0];
  const time = body.match(/\b\d{2}:\d{2}\b/)?.[0];
  return { date, time, rest: body };
}

/**
 * Only important alerts go to Telegram; everything else stays in the app.
 *  - Personal chats: anything that changes someone's own date.
 *  - Shared group: only what needs the marketing manager's attention.
 * Edit these two lists to change what is sent.
 */
const PERSONAL = new Set([
  'Capture scheduled',
  'Capture moved',
  'Capture changed',
  'Capture rescheduled',
  'Capture cancelled',
  'Request approved',
  'Request declined',
  'New booking request',
  'Capture missed',
  'Availability conflict',
]);
const GROUP = new Set(['New booking request', 'Capture missed', 'Availability conflict', 'Booking cancelled by supervisor']);

/** Premium layout: brand line, headline, key details as fields, short sentence, footer. */
function format(title: string, body?: string, audience?: string, name?: string): string {
  const [icon, label] = KINDS[title] ?? ['🔔', 'NOTICE'];
  const lines = [`<b>${esc(BRAND.toUpperCase())}</b>  ·  <code>${label}</code>`, LINE, '', `${icon}  <b>${esc(title)}</b>`];
  if (name) lines.push('', `Hello ${esc(name.split(' ')[0])},`);
  if (body) {
    const f = fields(body);
    lines.push('', esc(body));
    if (f.date || f.time) {
      lines.push('');
      if (f.date) lines.push(`🗓  <b>Date</b>   ${esc(f.date)}`);
      if (f.time) lines.push(`🕘  <b>Time</b>   ${esc(f.time)}`);
    }
  }
  lines.push('', LINE);
  lines.push(audience ? `<i>For ${esc(audience)}</i>` : '<i>Open the app for full details.</i>');
  return lines.join('\n');
}

export async function sendTelegram(chatId: string, title: string, body?: string, name?: string): Promise<void> {
  if (!telegramEnabled()) return;
  const text = format(title, body, undefined, name);
  await call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });
}

// Groups allow about 20 messages a minute, so the shared chat is fed slowly from a queue.
const groupQueue: string[] = [];
let draining = false;
function postToGroup(text: string) {
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!chat) return;
  if (groupQueue.length < 300) groupQueue.push(text);
  if (draining) return;
  draining = true;
  void (async () => {
    while (groupQueue.length) {
      const t = groupQueue.shift()!;
      await call('sendMessage', { chat_id: chat, text: t, parse_mode: 'HTML', disable_web_page_preview: true }).catch((e) =>
        console.warn('Telegram group send failed:', e.message)
      );
      await new Promise((r) => setTimeout(r, 3100));
    }
    draining = false;
  })();
}

/** Called for every alert. Never throws and never slows the request down. */
export function pushTelegram(userIds: number[], title: string, body: string): void {
  if (!telegramEnabled() || !userIds.length) return;
  const toGroup = GROUP.has(title);
  const toPeople = PERSONAL.has(title);
  if (!toGroup && !toPeople) return; // not important enough for Telegram
  void (async () => {
    try {
      const users = await User.findAll({ where: { id: userIds } });
      const names = users.map((u) => u.name);
      if (toGroup && process.env.TELEGRAM_CHAT_ID) {
        const who = names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ');
        postToGroup(format(title, body, who));
      }
      for (const u of toPeople ? users : []) {
        if (!u.telegramChatId || u.telegramChatId === process.env.TELEGRAM_CHAT_ID) continue;
        await sendTelegram(u.telegramChatId, title, body, u.name).catch((e) => console.warn(`Telegram send to ${u.username} failed:`, e.message));
      }
    } catch (e: any) {
      console.warn('Telegram push failed:', e?.message);
    }
  })();
}

export const newLinkCode = () => crypto.randomBytes(8).toString('hex');

async function handle(msg: any) {
  const chatId = String(msg?.chat?.id ?? '');
  const text: string = (msg?.text ?? '').trim();
  if (!chatId || !text.startsWith('/')) return;
  const [cmd, arg] = text.split(/\s+/);

  if (cmd.startsWith('/id')) {
    await sendTelegram(chatId, 'Chat ID', `Use this value as TELEGRAM_CHAT_ID:\n${chatId}`);
    return;
  }

  if (cmd.startsWith('/start')) {
    if (!arg) {
      await sendTelegram(chatId, 'Welcome', `To receive your schedule alerts here, open the app, go to More › Telegram alerts and tap Connect.\n\nChat ID: ${chatId}`);
      return;
    }
    const user = await User.findOne({ where: { telegramLinkCode: arg, active: true } });
    if (!user) {
      await sendTelegram(chatId, 'Link expired', 'Open the app, go to More › Telegram alerts and tap Connect again to get a fresh link.');
      return;
    }
    await User.update({ telegramChatId: null }, { where: { telegramChatId: chatId } }); // one chat, one account
    user.telegramChatId = chatId;
    user.telegramLinkCode = null;
    await user.save();
    await sendTelegram(chatId, 'Connected', `Hello ${user.name}, you are all set. Your schedule alerts will arrive here.\n\nSend /stop at any time to turn them off.`);
  } else if (cmd.startsWith('/stop')) {
    const n = await User.update({ telegramChatId: null }, { where: { telegramChatId: chatId } });
    await sendTelegram(chatId, n[0] ? 'Disconnected' : 'Not connected', n[0] ? 'You will no longer receive alerts in this chat.' : 'This chat is not linked to an account.');
  }
}

let running = false;
export async function startTelegramPolling(): Promise<void> {
  if (!telegramEnabled()) {
    console.log('Telegram is off: TELEGRAM_BOT_TOKEN is not set (check backend/.env). Alerts stay in the app only.');
    return;
  }
  if (running) return;
  running = true;
  try {
    const me = await call<{ username: string }>('getMe');
    if (!botName) botName = me.username;
    await call('deleteWebhook'); // polling and webhooks cannot be used together
    console.log(`Telegram bot @${telegramBot()} is on.${process.env.TELEGRAM_CHAT_ID ? ` Every alert is also posted to chat ${process.env.TELEGRAM_CHAT_ID}.` : ' People connect it in the app: More > Telegram alerts.'}`);
  } catch (e: any) {
    console.warn('Telegram is not working, check TELEGRAM_BOT_TOKEN:', e.message);
    running = false;
    return;
  }
  let offset = 0;
  (async () => {
    for (;;) {
      try {
        const updates = await call<any[]>('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] }, 35000);
        for (const u of updates) {
          offset = u.update_id + 1;
          await handle(u.message).catch((e) => console.warn('Telegram update failed:', e.message));
        }
      } catch (e: any) {
        console.warn('Telegram polling:', e.message);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  })();
}
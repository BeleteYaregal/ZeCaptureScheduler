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
const token = () =>
  (process.env.TELEGRAM_BOT_TOKEN || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^bot/i, '');

const groupChatId = () =>
  (process.env.TELEGRAM_CHAT_ID || '')
    .trim()
    .replace(/^["']|["']$/g, '');
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

export async function sendTelegram(chatId: string, title: string, body?: string): Promise<void> {
  if (!telegramEnabled()) return;
  const text = body ? `<b>${esc(title)}</b>\n${esc(body)}` : esc(title);
  await call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });
}

// Groups allow about 20 messages a minute, so the shared chat is fed slowly from a queue.
const groupQueue: string[] = [];
let draining = false;
function postToGroup(text: string) {
  const chat = groupChatId();
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
  void (async () => {
    try {
      const users = await User.findAll({ where: { id: userIds } });
      const names = users.map((u) => u.name);
      if (groupChatId()) {
        const who = names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ');
        postToGroup(`<b>${esc(title)}</b>\n${esc(body)}\n<i>For: ${esc(who)}</i>`);
      }
      for (const u of users) {
        if (!u.telegramChatId || u.telegramChatId === groupChatId()) continue;
        await sendTelegram(u.telegramChatId, title, body).catch((e) => console.warn(`Telegram send to ${u.username} failed:`, e.message));
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
    await sendTelegram(chatId, 'This chat\'s ID', chatId);
    return;
  }

  if (cmd.startsWith('/start')) {
    if (!arg) {
      await sendTelegram(chatId, 'Welcome', `Open the app, go to More > Telegram alerts and tap Connect to link this chat.\n\nThis chat's ID is ${chatId}.`);
      return;
    }
    const user = await User.findOne({ where: { telegramLinkCode: arg, active: true } });
    if (!user) {
      await sendTelegram(chatId, 'This link has expired', 'Open the app, go to More > Telegram and tap Connect again.');
      return;
    }
    await User.update({ telegramChatId: null }, { where: { telegramChatId: chatId } }); // one chat, one account
    user.telegramChatId = chatId;
    user.telegramLinkCode = null;
    await user.save();
    await sendTelegram(chatId, 'Connected', `Hi ${user.name}, your alerts will now arrive here.`);
  } else if (cmd.startsWith('/stop')) {
    const n = await User.update({ telegramChatId: null }, { where: { telegramChatId: chatId } });
    await sendTelegram(chatId, n[0] ? 'Disconnected' : 'Nothing to disconnect', n[0] ? 'You will not get alerts here any more.' : undefined);
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
    /* if (groupChatId()) {
      await sendTelegram(groupChatId(), 'Alerts are connected', 'Every alert from the app will be posted here.').catch((e) =>
        console.warn('Could not post to TELEGRAM_CHAT_ID. Is the bot in that chat, and did you press Start?', e.message)
      );
    } */
  } catch (e: any) {
    console.warn('Telegram is not working, check TELEGRAM_BOT_TOKEN:', e?.cause ? `${e.message} (${e.cause.message || e.cause.code || e.cause})` : e.message);
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
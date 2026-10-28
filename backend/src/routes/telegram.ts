import { Router } from 'express';
import { requireAuth } from '../auth';
import { HttpError, wrap } from '../http';
import { newLinkCode, sendTelegram, telegramBot, telegramEnabled } from '../services/telegram';

export const telegramRouter = Router();
telegramRouter.use(requireAuth);

telegramRouter.get(
  '/telegram',
  wrap(async (req, res) => {
    res.json({ enabled: telegramEnabled(), bot: telegramBot() || null, linked: !!req.user!.telegramChatId });
  })
);

// Creates a one-time link. Opening it in Telegram and pressing Start connects the chat.
telegramRouter.post(
  '/telegram/link',
  wrap(async (req, res) => {
    if (!telegramEnabled()) throw new HttpError(503, 'Telegram is not set up on the server yet', 'NO_TELEGRAM');
    if (!telegramBot()) throw new HttpError(503, 'The bot is still starting. Try again in a few seconds.', 'NO_TELEGRAM');
    const code = newLinkCode();
    req.user!.telegramLinkCode = code;
    await req.user!.save();
    res.json({ url: `https://t.me/${telegramBot()}?start=${code}` });
  })
);

telegramRouter.post(
  '/telegram/test',
  wrap(async (req, res) => {
    if (!req.user!.telegramChatId) throw new HttpError(409, 'Connect Telegram first', 'NOT_LINKED');
    await sendTelegram(req.user!.telegramChatId, 'Test alert', 'Telegram alerts are working.');
    res.json({ ok: true });
  })
);

telegramRouter.delete(
  '/telegram',
  wrap(async (req, res) => {
    req.user!.telegramChatId = null;
    req.user!.telegramLinkCode = null;
    await req.user!.save();
    res.json({ ok: true });
  })
);

import cors from 'cors';
import express from 'express';
import { config } from './config';
import { errorHandler } from './http';
import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { weeksRouter } from './routes/weeks';
import { reportsRouter } from './routes/reports';
import { teamRouter } from './routes/team';
import { telegramRouter } from './routes/telegram';
import { getBranding } from './services/branding';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()) }));
 
  app.use(express.json({ limit: '600kb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  // Public: the sign-in screen needs the app name, logo and color before anyone is signed in.
  app.get('/api/branding', async (_req, res, next) => {
    try {
      res.set('Cache-Control', 'no-cache');
      res.json(await getBranding());
    } catch (e) {
      next(e);
    }
  });
  app.get('/api/branding/icon', async (_req, res, next) => {
    try {
      const b = await getBranding();
      if (b.logo && b.logo.startsWith('data:image/')) {
        const matches = b.logo.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (matches) {
          const mime = matches[1] === 'jpeg' ? 'image/jpeg' : `image/${matches[1]}`;
          const buffer = Buffer.from(matches[2], 'base64');
          res.set('Content-Type', mime);
          res.set('Cache-Control', 'public, max-age=600');
          return res.send(buffer);
        }
      }
      res.redirect('/icon-192.png');
    } catch (e) {
      next(e);
    }
  });
  app.use('/api/auth', authRouter);
  app.use('/api', weeksRouter);
  app.use('/api', adminRouter);
  app.use('/api', reportsRouter);
  app.use('/api', teamRouter);
  app.use('/api', telegramRouter);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);
  return app;
}

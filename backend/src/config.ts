import path from 'path';
import fs from 'fs';

const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.JWT_SECRET) {
  console.warn('⚠️ WARNING: JWT_SECRET was not set in environment variables. Using a fallback secret.');
}

// When both frontend and backend run together in monorepo, Next.js uses PORT,
// so the backend runs on internal port 4000 to prevent port collisions.
const hasFrontendNearby =
  fs.existsSync(path.join(process.cwd(), '..', 'frontend', 'package.json')) ||
  fs.existsSync(path.join(process.cwd(), 'frontend', 'package.json'));
const defaultPort = hasFrontendNearby && process.env.PORT ? 4000 : Number(process.env.PORT || 4000);

export const config = {
  port: Number(process.env.API_PORT || defaultPort),
  jwtSecret: process.env.JWT_SECRET || 'zecapturescheduler-production-secret-fallback-key',
  databaseUrl: process.env.DATABASE_URL || '',
  sqlitePath: process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'scheduler.sqlite'),
  timezone: process.env.APP_TIMEZONE || 'Africa/Addis_Ababa',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  isProd,
};
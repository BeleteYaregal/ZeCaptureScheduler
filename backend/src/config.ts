import path from 'path';

const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set when NODE_ENV=production');
}

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  databaseUrl: process.env.DATABASE_URL || '',
  sqlitePath: process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'scheduler.sqlite'),
  timezone: process.env.APP_TIMEZONE || 'Africa/Addis_Ababa',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  isProd,
};
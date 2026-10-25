import path from 'path';

const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.JWT_SECRET) {
  console.warn('⚠️ WARNING: JWT_SECRET was not set in environment variables. Using a fallback secret.');
}

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'zecapturescheduler-production-secret-fallback-key',
  databaseUrl: process.env.DATABASE_URL || '',
  sqlitePath: process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'scheduler.sqlite'),
  timezone: process.env.APP_TIMEZONE || 'Africa/Addis_Ababa',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  isProd,
};
import bcrypt from 'bcryptjs';
import { createApp } from './app';
import { config } from './config';
import { initDb, User } from './models';

async function ensureAdmin() {
  if ((await User.count()) > 0) return;
  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'admin1234';
  await User.create({
    name: 'Administrator',
    username,
    passwordHash: await bcrypt.hash(password, 10),
    role: 'admin',
    active: true,
  });
  console.log(`First run: created admin account "${username}". Sign in and change the password.`);
  if (!process.env.ADMIN_PASSWORD) console.log('Using the default password "admin1234" (set ADMIN_PASSWORD to change it).');
}

async function main() {
  await initDb();
  await ensureAdmin();
  const app = createApp();
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`Capture Scheduler API running on http://localhost:${config.port}  (timezone ${config.timezone})`);
  });
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});

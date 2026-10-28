/**
 * Seed data.
 *   npm run seed        -> RESETS the database and creates users only
 *   npm run seed:demo   -> RESETS the database, creates users and 3 weeks of demo schedules
 *
 * Logins (only these three roles can sign in):
 *   admin / admin1234
 *   video1 / demo1234          (videographer)
 *   sales01 .. sales24 / demo1234
 * The 2 sales managers and their supervisors are team groups, not accounts.
 */
import bcrypt from 'bcryptjs';
import { config } from './config';
import { addDays, mondayOf, todayIn } from './dates';
import { Booking, CaptureDay, initDb, Manager, sequelize, Supervisor, Unavailability, User } from './models';
import { generateWeek, publishWeek, savePlan, setBookingStatus } from './services/weeks';
import { Op } from 'sequelize';

const MANAGERS = ['Dawit Alemu', 'Selam Tesfaye'];
const SUPERVISORS = ['Meron Bekele', 'Yonas Girma'];
const SALES = [
  'Abel Tadesse', 'Betty Haile', 'Chala Gemechu', 'Dina Mulugeta', 'Elias Kebede', 'Fikir Worku',
  'Genet Asfaw', 'Hana Desta', 'Isayas Berhe', 'Jemal Ahmed', 'Kidist Negash', 'Lemlem Bayou',
  'Mekdes Alemayehu', 'Nahom Fikadu', 'Olana Dibaba', 'Rediet Solomon', 'Samuel Teka', 'Tigist Mamo',
  'Umer Hussen', 'Birtukan Lemma', 'Wondimu Assefa', 'Yodit Getachew', 'Zelalem Tilahun', 'Amanuel Zewdu',
];

async function hash(pw: string) {
  return bcrypt.hash(pw, 10);
}

export async function seedUsers() {
  const demoHash = await hash('demo1234');
  const admin = await User.create({ name: 'Marketing Manager', username: 'admin', passwordHash: await hash('admin1234'), role: 'admin', phone: '0911000000' });
  // Sales managers and supervisors are team groups, not accounts: no username or password.
  const managers: Manager[] = [];
  for (let i = 0; i < MANAGERS.length; i++) {
    managers.push(await Manager.create({ name: MANAGERS[i], phone: `091100010${i}` }));
  }
  const sups: Supervisor[] = [];
  for (let i = 0; i < SUPERVISORS.length; i++) {
    sups.push(await Supervisor.create({ name: SUPERVISORS[i], managerId: managers[i].id, phone: `091100020${i}` }));
  }
  const sales: User[] = [];
  for (let i = 0; i < SALES.length; i++) {
    const sup = sups[i < 12 ? 0 : 1];
    sales.push(
      await User.create({
        name: SALES[i],
        username: `sales${String(i + 1).padStart(2, '0')}`,
        passwordHash: demoHash,
        role: 'sales',
        supervisorId: sup.id,
        phone: `09110003${String(i).padStart(2, '0')}`,
      })
    );
  }
  const video = await User.create({ name: 'Henok Tadesse', username: 'video1', passwordHash: demoHash, role: 'videographer', phone: '0911000400' });
  return { admin, managers, sups, sales, video };
}

export async function seedDemoWeeks(admin: User, video: User, sales: User[]) {
  const today = todayIn(config.timezone);
  const thisMonday = mondayOf(today);

  // Three people are away during the oldest demo week, so they get priority afterwards.
  const away = sales.slice(5, 8);
  const oldest = addDays(thisMonday, -14);
  for (const p of away) {
    for (let i = 0; i < 7; i++) await Unavailability.create({ userId: p.id, date: addDays(oldest, i), reason: 'On leave' });
  }

  for (const offset of [-14, -7, 0]) {
    const ws = addDays(thisMonday, offset);
    const plan = [
      { date: ws, type: 'sales' as const },
      { date: addDays(ws, 1), type: 'sales' as const },
      { date: addDays(ws, 2), type: 'company' as const },
      { date: addDays(ws, 3), type: 'sales' as const },
      { date: addDays(ws, 4), type: 'sales' as const },
      { date: addDays(ws, 5), type: 'company' as const },
    ];
    await savePlan(admin, ws, { videographerId: video.id, days: plan });
    await generateWeek(admin, ws);
    await publishWeek(admin, ws);

    // Mark everything before today as done (one missed capture per past week).
    const days = await CaptureDay.findAll({ where: { weekStart: ws, type: 'sales', date: { [Op.lt]: today } }, order: [['date', 'ASC']] });
    let missedOne = offset < 0;
    for (const d of days) {
      const bookings = await Booking.findAll({ where: { captureDayId: d.id, status: 'planned' }, order: [['slotOrder', 'ASC']] });
      for (const b of bookings) {
        if (missedOne && d.date === days[0].date && b.slotOrder === 2) {
          missedOne = false;
          await setBookingStatus(admin, b.id, { status: 'missed' });
        } else {
          await setBookingStatus(admin, b.id, { status: 'done' });
        }
      }
    }
  }
}

async function main() {
  const demo = process.argv.includes('--demo');
  await initDb();
  await sequelize.sync({ force: true });
  const { admin, video, sales } = await seedUsers();
  if (demo) await seedDemoWeeks(admin, video, sales);
  console.log(`Seeded ${await User.count()} users${demo ? ' and 3 demo weeks' : ''}.`);
  console.log('Logins: admin (Marketing manager) / admin1234 | video1 / demo1234 | sales01..sales24 / demo1234');
}

if (require.main === module) {
  main().then(
    () => process.exit(0),
    (e) => {
      console.error(e);
      process.exit(1);
    }
  );
}

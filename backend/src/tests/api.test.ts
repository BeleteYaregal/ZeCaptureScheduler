import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';

process.env.SQLITE_PATH = ':memory:';

let base = '';
let server: Server;
let nextMonday = '';
let weekAfter = '';
const tokens: Record<string, string> = {};
const ids: Record<string, number> = {};

async function api(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, body: json };
}

async function login(username: string, password = 'demo1234') {
  const r = await api('POST', '/api/auth/login', undefined, { username, password });
  assert.equal(r.status, 200, `login ${username}`);
  tokens[username] = r.body.token;
  ids[username] = r.body.user.id;
}

const plan = (ws: string, salesDates: number[], companyDates: number[], extra: object = {}) => ({
  days: [
    ...salesDates.map((i) => ({ date: add(ws, i), type: 'sales' })),
    ...companyDates.map((i) => ({ date: add(ws, i), type: 'company' })),
  ],
  ...extra,
});
function add(s: string, n: number) {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

before(async () => {
  const { createApp } = await import('../app');
  const { initDb, sequelize } = await import('../models');
  const { seedUsers } = await import('../seed');
  const { mondayOf, addDays, todayIn } = await import('../dates');
  const { config } = await import('../config');
  await initDb();
  await sequelize.sync({ force: true });
  await seedUsers();
  nextMonday = addDays(mondayOf(todayIn(config.timezone)), 7);
  weekAfter = addDays(nextMonday, 7);
  server = createApp().listen(0);
  const addr = server.address() as { port: number };
  base = `http://127.0.0.1:${addr.port}`;
  for (const u of ['sales01', 'sales13', 'video1']) await login(u);
  await login('admin', 'admin1234');
});

after(async () => {
  server?.close();
});

test('login rejects bad credentials', async () => {
  const r = await api('POST', '/api/auth/login', undefined, { username: 'admin', password: 'nope' });
  assert.equal(r.status, 401);
  const me = await api('GET', '/api/auth/me');
  assert.equal(me.status, 401);
});

test('settings: defaults, validation and permissions', async () => {
  const s = await api('GET', '/api/settings', tokens.admin);
  assert.equal(s.body.settings.sales_days_per_week, 4);
  assert.equal(s.body.settings.company_days_per_week, 2);
  assert.equal(s.body.settings.max_team_size, 12);
  const bad = await api('PUT', '/api/settings', tokens.admin, { sales_days_per_week: 5, company_days_per_week: 3 });
  assert.equal(bad.status, 400);
  const forbidden = await api('PUT', '/api/settings', tokens.sales01, { sales_days_per_week: 3 });
  assert.equal(forbidden.status, 403);
});

test('planner enforces the day limits, override allowed', async () => {
  const tooMany = await api('PUT', `/api/weeks/${nextMonday}/plan`, tokens.admin, plan(nextMonday, [0, 1, 2, 3, 4], [5]));
  assert.equal(tooMany.status, 422);
  assert.equal(tooMany.body.code, 'LIMIT_EXCEEDED');
  const notMonday = await api('PUT', `/api/weeks/${add(nextMonday, 1)}/plan`, tokens.admin, plan(nextMonday, [0], []));
  assert.equal(notMonday.status, 400);
  const ok = await api('PUT', `/api/weeks/${nextMonday}/plan`, tokens.admin, plan(nextMonday, [0, 1, 3, 4], [2, 5], { videographerId: ids.video1 }));
  assert.equal(ok.status, 200);
  assert.equal(ok.body.stats.salesDays, 4);
  assert.equal(ok.body.stats.companyDays, 2);
});

test('limits are dynamic: raising them lets a bigger plan through', async () => {
  const up = await api('PUT', '/api/settings', tokens.admin, { sales_days_per_week: 5, company_days_per_week: 2 });
  assert.equal(up.status, 200);
  const five = await api('PUT', `/api/weeks/${weekAfter}/plan`, tokens.admin, plan(weekAfter, [0, 1, 2, 3, 4], [5, 6]));
  assert.equal(five.status, 200);
  const down = await api('PUT', '/api/settings', tokens.admin, { sales_days_per_week: 4 });
  assert.equal(down.status, 200);
  // existing data untouched, but a new 5-day plan is refused again
  const again = await api('PUT', `/api/weeks/${weekAfter}/plan`, tokens.admin, plan(weekAfter, [0, 1, 2, 3, 4], [5]));
  assert.equal(again.status, 422);
});

test('generate: 24 salespeople over 4 days, balanced, idempotent', async () => {
  const r1 = await api('POST', `/api/weeks/${nextMonday}/generate`, tokens.admin);
  assert.equal(r1.status, 200);
  const salesDays = r1.body.days.filter((d: any) => d.type === 'sales');
  assert.equal(salesDays.length, 4);
  for (const d of salesDays) {
    assert.equal(d.bookings.length, 6);
    assert.equal(d.capacity, 6);
    const times = d.bookings.map((b: any) => b.startTime);
    assert.equal(new Set(times).size, 6, 'unique slot times');
  }
  assert.equal(r1.body.unscheduled.length, 0);
  const r2 = await api('POST', `/api/weeks/${nextMonday}/generate`, tokens.admin);
  const total = r2.body.days.reduce((n: number, d: any) => n + d.bookings.length, 0);
  assert.equal(total, 24, 'no duplicates after regenerating');
});

test('publishing requires a videographer on every day', async () => {
  const w3 = add(weekAfter, 7);
  const p = await api('PUT', `/api/weeks/${w3}/plan`, tokens.admin, plan(w3, [0], []));
  assert.equal(p.status, 200);
  await api('POST', `/api/weeks/${w3}/generate`, tokens.admin);
  const r = await api('POST', `/api/weeks/${w3}/publish`, tokens.admin);
  assert.equal(r.status, 422);
  assert.equal(r.body.code, 'NO_VIDEOGRAPHER');
  const notGenerated = await api('PUT', `/api/weeks/${add(w3, 7)}/plan`, tokens.admin, plan(add(w3, 7), [0], [], { videographerId: ids.video1 }));
  assert.equal(notGenerated.status, 200);
  const early = await api('POST', `/api/weeks/${add(w3, 7)}/publish`, tokens.admin);
  assert.equal(early.status, 422);
  assert.equal(early.body.code, 'NOT_GENERATED');
});

test('publishing opens the week with role scoping', async () => {
  const pub = await api('POST', `/api/weeks/${nextMonday}/publish`, tokens.admin);
  assert.equal(pub.status, 200);
  assert.equal(pub.body.week.status, 'published');

  const count = (r: any) => r.body.days.reduce((n: number, d: any) => n + d.bookings.length, 0);
  const mine = await api('GET', `/api/weeks/${nextMonday}`, tokens.sales01);
  assert.equal(count(mine), 1, 'salesperson sees only own booking');
  assert.equal(mine.body.days.find((d: any) => d.type === 'company') !== undefined, true, 'company days are visible');
  const vid = await api('GET', `/api/weeks/${nextMonday}`, tokens.video1);
  assert.equal(count(vid), 24, 'videographer sees the whole run sheet');
  const first = vid.body.days.find((d: any) => d.type === 'sales').bookings[0].person;
  assert.ok(first.managerName && first.supervisorName, 'each booking carries its manager and supervisor');
  const adminView = await api('GET', `/api/weeks/${nextMonday}`, tokens.admin);
  assert.equal(count(adminView), 24, 'admin sees everyone');

  const notes = await api('GET', '/api/notifications', tokens.sales01);
  assert.ok(notes.body.unread >= 1);
  assert.equal(notes.body.items[0].title, 'Capture scheduled');
  const next = await api('GET', '/api/me/next', tokens.sales01);
  assert.ok(next.body.booking?.date);
});

test('cannot edit the plan or regenerate after publishing', async () => {
  const p = await api('PUT', `/api/weeks/${nextMonday}/plan`, tokens.admin, plan(nextMonday, [0], []));
  assert.equal(p.status, 409);
  const g = await api('POST', `/api/weeks/${nextMonday}/generate`, tokens.admin);
  assert.equal(g.status, 409);
});

test('moving into a full day needs an override', async () => {
  const week = await api('GET', `/api/weeks/${nextMonday}`, tokens.admin);
  const salesDays = week.body.days.filter((d: any) => d.type === 'sales');
  const booking = salesDays[0].bookings[0];
  const full = await api('PATCH', `/api/bookings/${booking.id}/move`, tokens.admin, { captureDayId: salesDays[1].id });
  assert.equal(full.status, 409);
  assert.equal(full.body.code, 'DAY_FULL');
  const forced = await api('PATCH', `/api/bookings/${booking.id}/move`, tokens.admin, { captureDayId: salesDays[1].id, override: true });
  assert.equal(forced.status, 200);
  const after = await api('GET', `/api/weeks/${nextMonday}`, tokens.admin);
  const d2 = after.body.days.find((d: any) => d.id === salesDays[1].id);
  assert.equal(d2.bookings.length, 7);
  assert.equal(new Set(d2.bookings.map((b: any) => b.startTime)).size, 7, 'slots recomputed without clashes');
});

test('swap exchanges two people between days', async () => {
  const week = await api('GET', `/api/weeks/${nextMonday}`, tokens.admin);
  const [d0, d1] = week.body.days.filter((d: any) => d.type === 'sales');
  const a = d0.bookings[0];
  const b = d1.bookings[0];
  const r = await api('POST', '/api/bookings/swap', tokens.admin, { bookingId: a.id, withBookingId: b.id });
  assert.equal(r.status, 200);
  const after = await api('GET', `/api/weeks/${nextMonday}`, tokens.admin);
  const nd0 = after.body.days.find((d: any) => d.id === d0.id);
  assert.ok(nd0.bookings.some((x: any) => x.person.id === b.person.id));
});

test('only the admin or assigned videographer can mark status (any day, by design)', async () => {
  const week = await api('GET', `/api/weeks/${nextMonday}`, tokens.admin);
  const booking = week.body.days.find((d: any) => d.type === 'sales').bookings[0];
  const sales = await api('PATCH', `/api/bookings/${booking.id}/status`, tokens.sales01, { status: 'done' });
  assert.equal(sales.status, 403);
  const early = await api('PATCH', `/api/bookings/${booking.id}/status`, tokens.video1, { status: 'done' });
  assert.equal(early.status, 200, 'the assigned videographer may mark any published day');
  const admin = await api('PATCH', `/api/bookings/${booking.id}/status`, tokens.admin, { status: 'missed', reschedule: true });
  assert.equal(admin.status, 200);
  assert.equal(admin.body.triedReschedule, true);
});

test('cancelling a day re-slots people when another day has room', async () => {
  // week after next: one empty sales day with room
  await api('PUT', `/api/weeks/${weekAfter}/plan`, tokens.admin, plan(weekAfter, [0], [], { videographerId: null }));
  const week = await api('GET', `/api/weeks/${nextMonday}`, tokens.admin);
  const target = week.body.days.find((d: any) => d.type === 'sales' && d.date === add(nextMonday, 4));
  const n = target.bookings.filter((b: any) => b.status === 'planned').length;
  const r = await api('POST', `/api/days/${target.id}/cancel`, tokens.admin, { reason: 'Videographer sick' });
  assert.equal(r.status, 200);
  assert.equal(r.body.moved.length + r.body.unplaced.length, n);
  assert.ok(r.body.moved.length > 0, 'some were re-slotted into the spare day');
  const again = await api('POST', `/api/days/${target.id}/cancel`, tokens.admin, {});
  assert.equal(again.status, 409);
});

test('team size limit is enforced and dynamic', async () => {
  const org = await api('GET', '/api/org', tokens.admin);
  const sup1 = org.body.managers[0].supervisors[0];
  assert.equal(sup1.teamSize, 12);
  const full = await api('POST', '/api/users', tokens.admin, { name: 'Extra Person', username: 'extra1', password: 'secret12', role: 'sales', supervisorId: sup1.id });
  assert.equal(full.status, 409);
  assert.equal(full.body.code, 'TEAM_FULL');
  await api('PUT', '/api/settings', tokens.admin, { max_team_size: 13 });
  const ok = await api('POST', '/api/users', tokens.admin, { name: 'Extra Person', username: 'extra1', password: 'secret12', role: 'sales', supervisorId: sup1.id });
  assert.equal(ok.status, 201);
  const dup = await api('POST', '/api/users', tokens.admin, { name: 'Extra Again', username: 'EXTRA1', password: 'secret12', role: 'sales', supervisorId: sup1.id });
  assert.equal(dup.status, 409);
  await api('PUT', '/api/settings', tokens.admin, { max_team_size: 12 });
});

test('managers cannot be accounts; a supervisor login needs a supervisor record', async () => {
  const mgr = await api('POST', '/api/users', tokens.admin, { name: 'Nope Person', username: 'nope_manager', password: 'secret12', role: 'manager' });
  assert.equal(mgr.status, 400, 'manager cannot be an account');
  const sup = await api('POST', '/api/users', tokens.admin, { name: 'Nope Person', username: 'nope_supervisor', password: 'secret12', role: 'supervisor' });
  assert.equal(sup.status, 422, 'supervisor login must point at a supervisor');
  const noSup = await api('POST', '/api/users', tokens.admin, { name: 'No Supervisor', username: 'nosup', password: 'secret12', role: 'sales' });
  assert.equal(noSup.status, 422, 'a salesperson needs a supervisor');
  const ghost = await api('POST', '/api/auth/login', undefined, { username: 'manager1', password: 'demo1234' });
  assert.equal(ghost.status, 401, 'no manager login exists');
});

test('only the admin can register salespeople', async () => {
  const r = await api('POST', '/api/users', tokens.sales01, { name: 'Sneaky Person', username: 'sneaky', password: 'secret12', role: 'sales', supervisorId: 1 });
  assert.equal(r.status, 403);
  const v = await api('POST', '/api/users', tokens.video1, { name: 'Sneaky Person', username: 'sneaky', password: 'secret12', role: 'sales', supervisorId: 1 });
  assert.equal(v.status, 403);
  const anon = await api('POST', '/api/users', undefined, { name: 'Sneaky Person', username: 'sneaky', password: 'secret12', role: 'sales', supervisorId: 1 });
  assert.equal(anon.status, 401);
});

test('managers and supervisors are managed by the admin as team groups', async () => {
  const m = await api('POST', '/api/managers', tokens.admin, { name: 'Test Manager' });
  assert.equal(m.status, 201);
  const s = await api('POST', '/api/supervisors', tokens.admin, { name: 'Test Supervisor', managerId: m.body.manager.id });
  assert.equal(s.status, 201);
  const forbidden = await api('POST', '/api/managers', tokens.video1, { name: 'Nope Manager' });
  assert.equal(forbidden.status, 403);
  const badParent = await api('POST', '/api/supervisors', tokens.admin, { name: 'Orphan', managerId: 99999 });
  assert.equal(badParent.status, 422);
  const blocked = await api('PATCH', `/api/managers/${m.body.manager.id}`, tokens.admin, { active: false });
  assert.equal(blocked.status, 409, 'cannot deactivate a manager that still has a supervisor');
  const off1 = await api('PATCH', `/api/supervisors/${s.body.supervisor.id}`, tokens.admin, { active: false });
  assert.equal(off1.status, 200);
  const off2 = await api('PATCH', `/api/managers/${m.body.manager.id}`, tokens.admin, { active: false });
  assert.equal(off2.status, 200);
  const sales = await api('PATCH', '/api/supervisors/1', tokens.admin, { active: false });
  assert.equal(sales.status, 409, 'cannot deactivate a supervisor that still has salespeople');
});

test('availability: salesperson can mark a day off, others cannot touch it', async () => {
  const day = add(nextMonday, 20);
  const r = await api('POST', '/api/unavailability', tokens.sales01, { date: day, reason: 'Family event' });
  assert.equal(r.status, 201);
  const list = await api('GET', '/api/unavailability', tokens.sales01);
  assert.equal(list.body.items.length, 1);
  const other = await api('GET', `/api/unavailability?userId=${r.body.item.userId + 1}`, tokens.sales01);
  assert.equal(other.status, 403);
  const del = await api('DELETE', `/api/unavailability/${r.body.item.id}`, tokens.sales01);
  assert.equal(del.status, 200);
});

test('dashboard and audit log are admin-only and populated', async () => {
  const forbidden = await api('GET', '/api/dashboard', tokens.sales01);
  assert.equal(forbidden.status, 403);
  const d = await api('GET', '/api/dashboard', tokens.admin);
  assert.equal(d.status, 200);
  assert.equal(d.body.totals.sales, 25);
  const a = await api('GET', '/api/audit', tokens.admin);
  assert.ok(a.body.items.length > 5);
  assert.ok(a.body.items.some((i: any) => i.action.startsWith('schedule.')));
});

test('team view: admin edits, videographer reads, salespeople are blocked', async () => {
  const admin = await api('GET', '/api/org', tokens.admin);
  assert.equal(admin.body.managers.length >= 2, true);
  assert.equal(admin.body.managers[0].supervisors[0].sales.length >= 12, true);
  const vid = await api('GET', '/api/org', tokens.video1);
  assert.equal(vid.status, 200);
  assert.equal(vid.body.videographers.length, 0, 'videographer does not get the account list');
  assert.equal(vid.body.managers[0].supervisors[0].sales[0].username, undefined, 'no usernames for the videographer');
  const sales = await api('GET', '/api/org', tokens.sales01);
  assert.equal(sales.status, 403);
});

// ---------------------------------------------------------------- branding, editing, reports

test('branding: public to read, admin-only to change, validated', async () => {
  const pub = await api('GET', '/api/branding');
  assert.equal(pub.status, 200, 'the sign-in screen can read it without a token');
  assert.equal(pub.body.name, 'CaptureSheet');
  assert.equal((await api('PUT', '/api/branding', tokens.sales01, { name: 'X', color: '#112233', logo: null })).status, 403);
  assert.equal((await api('PUT', '/api/branding', tokens.admin, { name: 'X', color: 'blue', logo: null })).status, 400);
  assert.equal((await api('PUT', '/api/branding', tokens.admin, { name: '', color: '#112233', logo: null })).status, 400);
  assert.equal((await api('PUT', '/api/branding', tokens.admin, { name: 'X', color: '#112233', logo: 'data:text/html;base64,AAAA' })).status, 400);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const ok = await api('PUT', '/api/branding', tokens.admin, { name: 'Acme Sales', color: '#0B5FFF', logo: png });
  assert.equal(ok.status, 200);
  const after = await api('GET', '/api/branding');
  assert.deepEqual({ n: after.body.name, c: after.body.color, l: !!after.body.logo }, { n: 'Acme Sales', c: '#0b5fff', l: true });
  const settings = await api('GET', '/api/settings', tokens.admin);
  assert.equal(JSON.stringify(settings.body).includes('brand_'), false, 'branding does not leak into the numeric settings');
  await api('PUT', '/api/branding', tokens.admin, { name: 'CaptureSheet', color: '#1a56db', logo: null });
});

test('video editing: only after capture, by the assigned videographer, with report and exports', async () => {
  const { CaptureDay, Booking, Week, User } = await import('../models');
  const uid = async (u: string) => (await User.findOne({ where: { username: u } }))!.id;
  const { mondayOf } = await import('../dates');
  const date = '2026-03-03';
  const ws = mondayOf(date);
  await Week.findOrCreate({ where: { weekStart: ws }, defaults: { weekStart: ws, status: 'published' } });
  const day = await CaptureDay.create({ weekStart: ws, date, type: 'sales', startTime: '09:00', videographerId: ids.video1, status: 'active' });
  const mk = async (sales: string, status: string, slotOrder: number) => Booking.create({ captureDayId: day.id, salesId: await uid(sales), slotOrder, startTime: '09:00', status });
  const done = await mk('sales01', 'done', 0);
  const missed = await mk('sales02', 'missed', 1);
  const planned = await mk('sales03', 'planned', 2);
  const edit = (id: number, token: string, v: boolean) => api('PATCH', `/api/bookings/${id}/editing`, token, { done: v });

  assert.equal((await edit(planned.id, tokens.video1, true)).status, 409, 'not captured yet');
  assert.equal((await edit(missed.id, tokens.video1, true)).status, 409, 'missed has no video');
  assert.equal((await edit(done.id, tokens.sales01, true)).status, 403, 'salespeople cannot');

  const range = `from=2026-03-01&to=2026-03-07`;
  const before = await api('GET', `/api/report?${range}`, tokens.admin);
  assert.deepEqual(
    { t: before.body.summary.total, c: before.body.summary.captured, m: before.body.summary.missed, e: before.body.summary.edited, p: before.body.summary.pendingEdit },
    { t: 3, c: 1, m: 1, e: 0, p: 1 }
  );

  const r = await edit(done.id, tokens.video1, true);
  assert.equal(r.status, 200);
  assert.equal(r.body.editDone, true);
  const after = await api('GET', `/api/report?${range}`, tokens.admin);
  assert.equal(after.body.summary.edited, 1);
  assert.equal(after.body.summary.editRate, 100);

  const pending = await api('GET', `/api/report?${range}&editing=pending`, tokens.admin);
  assert.equal(pending.body.rows.length, 0);
  const missedOnly = await api('GET', `/api/report?${range}&status=missed`, tokens.admin);
  assert.deepEqual(missedOnly.body.rows.map((x: any) => x.person), ['Betty Haile']);
  const outside = await api('GET', `/api/report?from=2026-04-01&to=2026-04-30`, tokens.admin);
  assert.equal(outside.body.summary.total, 0, 'date filter excludes other months');

  assert.equal((await api('GET', `/api/report?${range}`, tokens.video1)).status, 403, 'reports are admin-only');
  assert.equal((await api('GET', `/api/report?${range}`, tokens.sales01)).status, 403);
  const queue = await api('GET', `/api/editing?${range}`, tokens.video1);
  assert.equal(queue.status, 200);
  assert.deepEqual(queue.body.rows.map((x: any) => x.status), ['done']);

  const notes = await api('GET', '/api/notifications', tokens.sales01);
  assert.ok(notes.body.items.some((n: any) => n.title === 'Your video is edited'), 'the salesperson is told');

  const undo = await edit(done.id, tokens.admin, false);
  assert.equal(undo.body.editDone, false);

  const csv = await fetch(base + `/api/report.csv?${range}`, { headers: { authorization: `Bearer ${tokens.admin}` } });
  assert.equal(csv.status, 200);
  const text = await csv.text();
  assert.ok(text.includes('"Sales person"') && text.includes('Abel Tadesse') && text.includes('Not edited'));
  const xlsx = await fetch(base + `/api/report.xlsx?${range}`, { headers: { authorization: `Bearer ${tokens.admin}` } });
  assert.equal(xlsx.status, 200);
  assert.ok((xlsx.headers.get('content-type') || '').includes('spreadsheetml'));
  const bytes = new Uint8Array(await xlsx.arrayBuffer());
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), 'PK', 'a real .xlsx file');
  assert.equal((await fetch(base + `/api/report.xlsx?${range}`, { headers: { authorization: `Bearer ${tokens.video1}` } })).status, 403);
});

test('a missed capture alerts the admin; the dashboard shows the editing backlog', async () => {
  const { Booking, CaptureDay, User } = await import('../models');
  const day = await CaptureDay.findOne({ where: { date: '2026-03-03' } });
  const s3 = await User.findOne({ where: { username: 'sales03' } });
  const b = await Booking.findOne({ where: { captureDayId: day!.id, salesId: s3!.id } });
  const r = await api('PATCH', `/api/bookings/${b!.id}/status`, tokens.video1, { status: 'missed' });
  assert.equal(r.status, 200);
  const notes = await api('GET', '/api/notifications', tokens.admin);
  assert.ok(notes.body.items.some((n: any) => n.title === 'Capture missed'));
  const d = await api('GET', '/api/dashboard', tokens.admin);
  assert.equal(typeof d.body.editing.pending, 'number');
  assert.ok(d.body.editing.captured >= 1);
});

test('admin can download a database backup', async () => {
  const res = await fetch(base + '/api/backup', { headers: { authorization: `Bearer ${tokens.admin}` } });
  assert.equal(res.status, 200);
  const head = Buffer.from(await res.arrayBuffer()).subarray(0, 15).toString();
  assert.equal(head, 'SQLite format 3');
  assert.equal((await fetch(base + '/api/backup', { headers: { authorization: `Bearer ${tokens.video1}` } })).status, 403);
});

test('alerts: paging, unread filter and read-one', async () => {
  const { Notification } = await import('../models');
  const me = ids.sales01;
  await Notification.destroy({ where: { userId: me } });
  await Notification.bulkCreate(Array.from({ length: 45 }, (_, i) => ({ userId: me, title: `Alert ${i + 1}`, body: 'x', read: i % 3 === 0 })));
  const p1 = await api('GET', '/api/notifications?limit=20', tokens.sales01);
  assert.equal(p1.body.items.length, 20);
  assert.equal(p1.body.hasMore, true);
  assert.equal(p1.body.items[0].title, 'Alert 45', 'newest first');
  const p2 = await api('GET', `/api/notifications?limit=20&before=${p1.body.items[19].id}`, tokens.sales01);
  assert.equal(p2.body.items.length, 20);
  const p3 = await api('GET', `/api/notifications?limit=20&before=${p2.body.items[19].id}`, tokens.sales01);
  assert.equal(p3.body.items.length, 5);
  assert.equal(p3.body.hasMore, false, 'the last page says there is no more');
  const unread = await api('GET', '/api/notifications?limit=100&unread=1', tokens.sales01);
  assert.equal(unread.body.items.length, 30);
  assert.ok(unread.body.items.every((n: any) => !n.read));
  const before = unread.body.unread;
  assert.equal((await api('POST', `/api/notifications/${unread.body.items[0].id}/read`, tokens.sales01)).status, 200);
  assert.equal((await api('GET', '/api/notifications?limit=1', tokens.sales01)).body.unread, before - 1);
  // someone else's alert cannot be marked
  const other = await api('POST', `/api/notifications/${unread.body.items[1].id}/read`, tokens.video1);
  assert.equal(other.status, 200);
  assert.equal((await api('GET', '/api/notifications?limit=1', tokens.sales01)).body.unread, before - 1, 'only the owner can mark their alerts');
  const dflt = await api('GET', '/api/notifications', tokens.sales01);
  assert.equal(dflt.body.items.length, 45, 'the old call (no limit) still works for the pop-up');
});

test('supervisor: own team, per-day limit, requests, approval, generate keeps requests', async () => {
  const me = await api('GET', '/api/auth/me', tokens.sales01);
  const supId = me.body.user.supervisorId;
  const mk = await api('POST', '/api/users', tokens.admin, { name: 'Sup One', username: 'sup1', password: 'demo1234', role: 'supervisor', supervisorId: supId });
  assert.equal(mk.status, 201);
  assert.equal((await api('POST', '/api/users', tokens.admin, { name: 'Sup Two', username: 'sup1b', password: 'demo1234', role: 'supervisor', supervisorId: supId })).status, 409, 'one login per supervisor');
  await login('sup1');
  assert.equal((await api('GET', '/api/team/members', tokens.sales01)).status, 403);

  await api('PUT', '/api/settings', tokens.admin, { max_team_size: 20 });
  // register own salesperson
  const nm = await api('POST', '/api/team/members', tokens.sup1, { name: 'New Rep', username: 'newrep', password: 'demo1234' });
  assert.equal(nm.status, 201);
  const members = await api('GET', '/api/team/members', tokens.sup1);
  const mine: number[] = members.body.members.filter((m: any) => m.active).map((m: any) => m.id);
  assert.ok(mine.length >= 3);

  const ws = add(nextMonday, 21);
  assert.equal((await api('PUT', `/api/weeks/${ws}/plan`, tokens.admin, plan(ws, [0, 1], [], { videographerId: ids.video1 }))).status, 200);
  const wk = await api('GET', `/api/weeks/${ws}`, tokens.sup1);
  assert.equal(wk.body.days.length, 2, 'supervisor can see a draft week');
  const dayId = wk.body.days[0].id;

  await api('PUT', '/api/settings', tokens.admin, { supervisor_max_per_day: 2 });
  const r = await api('POST', '/api/team/requests', tokens.sup1, { salesIds: mine.slice(0, 3), captureDayId: dayId });
  assert.equal(r.status, 201);
  assert.equal(r.body.created.length, 2, 'limit of 2 per day');
  assert.equal(r.body.failed[0].error.includes('daily limit'), true);
  // outsiders cannot be requested
  const other = await api('POST', '/api/team/requests', tokens.sup1, { salesIds: [ids.sales13], captureDayId: wk.body.days[1].id });
  assert.equal(other.body.created.length, 0);
  // a person cannot be requested twice in the week
  const dup = await api('POST', '/api/team/requests', tokens.sup1, { salesIds: [mine[0]], captureDayId: wk.body.days[1].id });
  assert.equal(dup.body.created.length, 0);

  // generate must keep the requests and everyone else is placed around them
  assert.equal((await api('POST', `/api/weeks/${ws}/generate`, tokens.admin)).status, 200);
  const pend = await api('GET', '/api/requests', tokens.admin);
  assert.equal(pend.body.items.filter((i: any) => i.date === wk.body.days[0].date).length, 2);
  const adminView = await api('GET', `/api/weeks/${ws}`, tokens.admin);
  const names = adminView.body.days.flatMap((d: any) => d.bookings.map((b: any) => b.person.id));
  assert.equal(new Set(names).size, names.length, 'nobody is booked twice');
  const sv = await api('GET', `/api/weeks/${ws}`, tokens.sup1);
  assert.equal(sv.body.days.flatMap((d: any) => d.bookings).length, 2, 'supervisor sees only his own requests in a draft');

  // approve one, decline the other
  const [a, b] = pend.body.items;
  assert.equal((await api('POST', `/api/requests/${a.id}/approve`, tokens.admin, {})).status, 200);
  assert.equal((await api('POST', `/api/requests/${b.id}/decline`, tokens.admin, { reason: 'Too busy' })).status, 200);
  assert.equal((await api('GET', '/api/requests', tokens.admin)).body.items.length, 0);
  assert.equal((await api('GET', '/api/requests', tokens.sup1)).status, 403);
  const notes = await api('GET', '/api/notifications', tokens.sup1);
  assert.ok(notes.body.items.some((n: any) => n.title === 'Request approved'));
  assert.ok(notes.body.items.some((n: any) => n.title === 'Request declined'));
});

test('supervisor cannot request past times; admin cannot approve without override', async () => {
  const { CaptureDay, Booking, User } = await import('../models');
  const { todayIn, mondayOf } = await import('../dates');
  const { config } = await import('../config');
  const members = await api('GET', '/api/team/members', tokens.sup1);
  const mine: number[] = members.body.members.filter((m: any) => m.active).map((m: any) => m.id);

  // 1. Past date
  const pastDay = await CaptureDay.create({ weekStart: '2020-01-06', date: '2020-01-08', type: 'sales', startTime: '09:00', status: 'active' });
  const pastReq = await api('POST', '/api/team/requests', tokens.sup1, { salesIds: [mine[0]], captureDayId: pastDay.id });
  assert.equal(pastReq.status, 422);
  assert.equal(pastReq.body.error, 'That day has passed');

  // 2. Today with a past slot time (00:00)
  const today = todayIn(config.timezone);
  let todayDay = await CaptureDay.findOne({ where: { date: today } });
  if (!todayDay) {
    todayDay = await CaptureDay.create({ weekStart: mondayOf(today), date: today, type: 'sales', startTime: '00:00', status: 'active' });
  } else {
    todayDay.startTime = '00:00';
    await todayDay.save();
  }
  const todayReq = await api('POST', '/api/team/requests', tokens.sup1, { salesIds: [mine[0]], captureDayId: todayDay.id });
  assert.equal(todayReq.status, 422);
  assert.equal(todayReq.body.code, 'TIME_PASSED');

  // 3. Admin cannot approve an already passed request without override
  const supUser = await User.findOne({ where: { username: 'sup1' } });
  const passedBooking = await Booking.create({ captureDayId: pastDay.id, salesId: mine[0], slotOrder: 0, startTime: '09:00', status: 'requested', requestedById: supUser!.id });
  const approveFail = await api('POST', `/api/requests/${passedBooking.id}/approve`, tokens.admin, {});
  assert.equal(approveFail.status, 422);
  assert.equal(approveFail.body.code, 'TIME_PASSED');

  // 4. Admin with override can approve
  const approveOverride = await api('POST', `/api/requests/${passedBooking.id}/approve`, tokens.admin, { override: true });
  assert.equal(approveOverride.status, 200);

  // 5. Admin can reschedule date and time when approving a passed request
  const futureWs = add(nextMonday, 28);
  const futureDay = await CaptureDay.create({ weekStart: futureWs, date: add(futureWs, 1), type: 'sales', startTime: '10:00', status: 'active' });
  const passedBooking2 = await Booking.create({ captureDayId: pastDay.id, salesId: mine[1], slotOrder: 0, startTime: '09:00', status: 'requested', requestedById: supUser!.id });
  const approveRescheduled = await api('POST', `/api/requests/${passedBooking2.id}/approve`, tokens.admin, {
    captureDayId: futureDay.id,
    startTime: '10:30',
  });
  assert.equal(approveRescheduled.status, 200);
  assert.equal(approveRescheduled.body.date, futureDay.date);
  assert.equal(approveRescheduled.body.startTime, '10:00');
  const reloaded = await Booking.findByPk(passedBooking2.id);
  assert.equal(reloaded!.captureDayId, futureDay.id);
  assert.equal(reloaded!.startTime, '10:00');
  assert.equal(reloaded!.status, 'planned');

  // 6. Test GET /api/requests/available-days
  const avail = await api('GET', '/api/requests/available-days', tokens.admin);
  assert.equal(avail.status, 200);
  assert.ok(Array.isArray(avail.body.days));
  assert.ok(avail.body.days.some((d: any) => d.id === futureDay.id));
});

test('standard week: apply to several weeks, build and publish, skip what is planned', async () => {
  const bad = await api('PUT', '/api/settings', tokens.admin, { week_pattern: ['sales', 'sales', 'sales', 'sales', 'sales', 'sales'] });
  assert.equal(bad.status, 400, 'pattern is checked against the day limits');
  assert.equal((await api('PUT', '/api/settings', tokens.admin, { week_pattern: ['sales', 'sales', 'sales', 'sales', 'company', 'off'], default_videographer_id: ids.video1 })).status, 200);
  const from = add(nextMonday, 70);
  const r = await api('POST', '/api/weeks/auto', tokens.admin, { fromWeek: from, weeks: 3, generate: true, publish: true });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.results.map((x: any) => x.result), ['done', 'done', 'done']);
  const wk = await api('GET', `/api/weeks/${from}`, tokens.admin);
  assert.equal(wk.body.week.status, 'published');
  assert.equal(wk.body.days.filter((d: any) => d.type === 'sales').length, 4);
  assert.equal(wk.body.days.filter((d: any) => d.type === 'company').length, 1);
  const again = await api('POST', '/api/weeks/auto', tokens.admin, { fromWeek: from, weeks: 4 });
  assert.deepEqual(again.body.results.map((x: any) => x.result), ['skipped', 'skipped', 'skipped', 'done']);
  assert.equal((await api('POST', '/api/weeks/auto', tokens.sales01 ?? tokens.sup1, { fromWeek: from, weeks: 1 })).status, 403);
});

test('upcoming weeks are open by default from the standard week', async () => {
  await api('PUT', '/api/settings', tokens.admin, { week_pattern: ['sales', 'sales', 'sales', 'sales', 'company', 'off'] });
  const ws = add(nextMonday, 49);
  const v = await api('GET', `/api/weeks/${ws}`, tokens.sup1);
  assert.equal(v.body.days.length, 5, 'a supervisor sees open days without the admin planning the week');
  assert.equal(v.body.days.filter((d: any) => d.type === 'sales').length, 4);
  const far = await api('GET', `/api/weeks/${add(nextMonday, 700)}`, tokens.sup1);
  assert.equal(far.body.days.length, 0, 'far-away weeks are not opened');
  const sales = await api('GET', `/api/weeks/${add(nextMonday, 56)}`, tokens.sales01);
  assert.equal(sales.body.days.length, 5, 'everyone sees the open schedule');
});

test('telegram: off by default, link needs a configured bot, alerts still work', async () => {
  const prevToken = process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_BOT_TOKEN;
  try {
    const st = await api('GET', '/api/telegram', tokens.sales01);
    assert.equal(st.status, 200);
    assert.equal(st.body.enabled, false);
    assert.equal(st.body.linked, false);
    assert.equal((await api('POST', '/api/telegram/link', tokens.sales01)).status, 503);
    assert.equal((await api('POST', '/api/telegram/test', tokens.sales01)).status, 409);
    assert.equal((await api('DELETE', '/api/telegram', tokens.sales01)).status, 200);
    assert.equal((await api('GET', '/api/telegram')).status, 401);
  } finally {
    if (prevToken !== undefined) process.env.TELEGRAM_BOT_TOKEN = prevToken;
  }
});

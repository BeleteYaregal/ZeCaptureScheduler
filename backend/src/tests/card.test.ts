import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';

process.env.SQLITE_PATH = ':memory:';

let base = '';
let server: Server;
let adminToken = '';
let staffToken = '';
let staffId = 0;

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

before(async () => {
  const { createApp } = await import('../app');
  const { initDb, User } = await import('../models');
  const bcrypt = (await import('bcryptjs')).default;
  await initDb();

  await User.create({
    name: 'Admin User',
    username: 'admin',
    passwordHash: await bcrypt.hash('admin1234', 10),
    role: 'admin',
    active: true,
  });

  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      base = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  const res = await api('POST', '/api/auth/login', undefined, { username: 'admin', password: 'admin1234' });
  assert.equal(res.status, 200);
  adminToken = res.body.token;
});

after(() => {
  server?.close();
});

test('staff registration creates account and draft card submission', async () => {
  const reg = await api('POST', '/api/auth/register', undefined, {
    name: 'Abebe Kebede',
    username: 'abebe',
    password: 'password123',
    email: 'abebe@example.com',
    phone: '+251911223344',
    positions: ['Senior Sales Agent', 'Account Manager'],
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.user.name, 'Abebe Kebede');
  staffToken = reg.body.token;
  staffId = reg.body.user.id;

  // Retrieve my submission
  const mySub = await api('GET', '/api/card/my-submission', staffToken);
  assert.equal(mySub.status, 200);
  assert.equal(mySub.body.fullName, 'Abebe Kebede');
  assert.equal(mySub.body.email, 'abebe@example.com');
  assert.deepEqual(mySub.body.phones, ['+251911223344']);
  assert.deepEqual(mySub.body.positions, ['Senior Sales Agent', 'Account Manager']);
  assert.equal(mySub.body.status, 'draft');
});

test('staff can update multi-phone and multi-position info and submit', async () => {
  const update = await api('POST', '/api/card/my-submission', staffToken, {
    fullName: 'Abebe Kebede Worku',
    email: 'abebe.k@company.com',
    phones: ['+251911223344', '+251922334455'],
    positions: ['Senior Property Consultant', 'Team Supervisor'],
    department: 'Residential Sales',
    company: 'ZeCorp Real Estate',
    address: 'Bole Road, Mega Building, Suite 402',
    notes: 'Please include company logo and QR code on back',
    submit: true,
  });
  assert.equal(update.status, 200);
  assert.equal(update.body.fullName, 'Abebe Kebede Worku');
  assert.equal(update.body.status, 'submitted');
  assert.equal(update.body.phones.length, 2);
  assert.equal(update.body.positions.length, 2);
});

test('admin can view card submissions and filter', async () => {
  const list = await api('GET', '/api/card/submissions', adminToken);
  assert.equal(list.status, 200);
  assert.equal(list.body.items.length, 1);
  assert.equal(list.body.items[0].fullName, 'Abebe Kebede Worku');
  assert.equal(list.body.counts.submitted, 1);

  // Search filter
  const search = await api('GET', '/api/card/submissions?search=abebe', adminToken);
  assert.equal(search.status, 200);
  assert.equal(search.body.items.length, 1);

  const searchEmpty = await api('GET', '/api/card/submissions?search=nonexistent', adminToken);
  assert.equal(searchEmpty.status, 200);
  assert.equal(searchEmpty.body.items.length, 0);
});

test('admin sends card design to staff', async () => {
  const subId = 1;
  const send = await api('POST', `/api/card/submissions/${subId}/send-design`, adminToken, {
    cardDesignUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    cardDesignBackUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    adminNote: 'Here is your first design draft. Please check spelling of your phone numbers.',
  });
  assert.equal(send.status, 200);
  assert.equal(send.body.status, 'card_sent');
  assert.ok(send.body.cardDesignUrl);
  assert.equal(send.body.feedbacks.length, 1);

  // Staff checks their submission
  const mySub = await api('GET', '/api/card/my-submission', staffToken);
  assert.equal(mySub.status, 200);
  assert.equal(mySub.body.status, 'card_sent');
  assert.equal(mySub.body.cardDesignUrl, send.body.cardDesignUrl);
});

test('staff sends feedback/corrections and status becomes revision_requested', async () => {
  const fb = await api('POST', '/api/card/my-submission/feedback', staffToken, {
    message: 'Could you make the font for the secondary phone number slightly larger?',
  });
  assert.equal(fb.status, 200);
  assert.equal(fb.body.status, 'revision_requested');
  assert.equal(fb.body.feedbacks.length, 2);
  assert.equal(fb.body.feedbacks[1].senderRole, 'staff');

  // Admin sees updated status
  const adminView = await api('GET', `/api/card/submissions/1`, adminToken);
  assert.equal(adminView.status, 200);
  assert.equal(adminView.body.status, 'revision_requested');
});

test('admin re-sends corrected design and staff approves', async () => {
  // Admin re-sends
  const reSend = await api('POST', `/api/card/submissions/1/send-design`, adminToken, {
    cardDesignUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    adminNote: 'Font size increased as requested!',
  });
  assert.equal(reSend.status, 200);
  assert.equal(reSend.body.status, 'card_sent');

  // Staff approves!
  const approve = await api('POST', '/api/card/my-submission/approve', staffToken);
  assert.equal(approve.status, 200);
  assert.equal(approve.body.status, 'approved');
  assert.ok(approve.body.approvedAt);

  // Admin checks approved status
  const finalView = await api('GET', `/api/card/submissions/1`, adminToken);
  assert.equal(finalView.body.status, 'approved');
});

test('admin can toggle app_mode between capture and card', async () => {
  const update = await api('PUT', '/api/settings', adminToken, {
    app_mode: 'card',
    card_app_name: 'ZeCard Pro',
  });
  assert.equal(update.status, 200);
  assert.equal(update.body.settings.app_mode, 'card');
  assert.equal(update.body.settings.card_app_name, 'ZeCard Pro');

  // Branding reflects it
  const branding = await api('GET', '/api/branding');
  assert.equal(branding.status, 200);
  assert.equal(branding.body.app_mode, 'card');
  assert.equal(branding.body.card_name, 'ZeCard Pro');
});

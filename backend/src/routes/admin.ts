import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth';
import { config } from '../config';
import { saveBranding } from '../services/branding';
import { todayIn, isValidDate, prettyDay } from '../dates';
import { HttpError, wrap } from '../http';
import { AuditLog, Booking, CaptureDay, Manager, Notification, Supervisor, Unavailability, User } from '../models';
import { getDashboard } from '../services/dashboard';
import { audit, notify } from '../services/log';
import { assertTeamRoom, canManageUser } from '../services/org';
import { removeFutureBookingsFor } from '../services/weeks';
import { getSettings, updateSettings } from '../settings';
import { publicUser } from './auth';

export const adminRouter = Router();
adminRouter.use(requireAuth);

// ------------------------------------------------------------------ settings

adminRouter.get(
  '/settings',
  wrap(async (_req, res) => {
    res.json({ settings: await getSettings() });
  })
);

adminRouter.put(
  '/settings',
  requireRole('admin'),
  wrap(async (req, res) => {
    const { before, after } = await updateSettings(req.body);
    const warnings: string[] = [];
    if (after.max_team_size < before.max_team_size) {
      const sups = await Supervisor.findAll({ where: { active: true } });
      let over = 0;
      for (const s of sups) {
        const n = await User.count({ where: { role: 'sales', active: true, supervisorId: s.id } });
        if (n > after.max_team_size) over++;
      }
      if (over) warnings.push(`${over} team(s) are above the new limit. Nobody was removed, but nobody can be added to them.`);
    }
    await audit(req.user!.id, 'settings.update', 'settings', null, { before, after });
    res.json({ settings: after, warnings });
  })
);

// ------------------------------------------------------------------ accounts (admin, sales, videographer)

adminRouter.get(
  '/users',
  requireRole('admin'),
  wrap(async (req, res) => {
    const where: any = {};
    if (typeof req.query.role === 'string' && ['admin', 'sales', 'videographer', 'supervisor'].includes(req.query.role)) where.role = req.query.role;
    if (req.query.active === 'true') where.active = true;
    const users = await User.findAll({ where, order: [['name', 'ASC']] });
    res.json({ users: users.map((u) => ({ ...publicUser(u), active: u.active })) });
  })
);

const CreateUser = z.object({
  name: z.string().trim().min(2).max(80),
  username: z.string().trim().min(3).max(40).regex(/^[a-z0-9._-]+$/i, 'Letters, numbers, dot, dash and underscore only'),
  password: z.string().min(6).max(100),
  role: z.enum(['sales', 'videographer', 'admin', 'supervisor']),
  supervisorId: z.number().int().nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
});

adminRouter.post(
  '/users',
  requireRole('admin'),
  wrap(async (req, res) => {
    const body = CreateUser.parse(req.body);
    const settings = await getSettings();
    const username = body.username.toLowerCase();
    if (await User.findOne({ where: { username } })) throw new HttpError(409, 'That username is taken', 'DUPLICATE');

    let supervisorId: number | null = null;
    if (body.role === 'sales') {
      if (!body.supervisorId) throw new HttpError(422, 'Choose a supervisor for this salesperson', 'BAD_PARENT');
      await assertTeamRoom(body.supervisorId, settings.max_team_size);
      supervisorId = body.supervisorId;
    }

    if (body.role === 'supervisor') {
      const sup = body.supervisorId ? await Supervisor.findByPk(body.supervisorId) : null;
      if (!sup || !sup.active) throw new HttpError(422, 'Choose the supervisor this login belongs to', 'BAD_PARENT');
      if (await User.findOne({ where: { role: 'supervisor', supervisorId: sup.id, active: true } })) {
        throw new HttpError(409, `${sup.name} already has a login`, 'DUPLICATE');
      }
      supervisorId = sup.id;
    }

    const user = await User.create({
      name: body.name,
      username,
      passwordHash: await bcrypt.hash(body.password, 10),
      role: body.role,
      supervisorId,
      phone: body.phone || null,
      active: true,
    });
    await audit(req.user!.id, 'user.create', 'user', user.id, { role: user.role, name: user.name });
    res.status(201).json({ user: publicUser(user) });
  })
);

const PatchUser = z
  .object({
    name: z.string().trim().min(2).max(80),
    phone: z.string().trim().max(30).nullable(),
    active: z.boolean(),
    supervisorId: z.number().int().nullable(),
    password: z.string().min(6).max(100),
  })
  .partial();

adminRouter.patch(
  '/users/:id',
  requireRole('admin'),
  wrap(async (req, res) => {
    const user = await User.findByPk(Number(req.params.id));
    if (!user) throw new HttpError(404, 'User not found');
    const body = PatchUser.parse(req.body);
    const settings = await getSettings();
    const detail: Record<string, unknown> = {};

    if (body.active === false && user.id === req.user!.id) {
      throw new HttpError(409, 'You cannot deactivate your own account', 'SELF');
    }
    if (user.role !== 'sales' && body.supervisorId !== undefined && body.supervisorId !== null) throw new HttpError(422, 'Only salespeople belong to a supervisor', 'BAD_PARENT');

    const newSup = body.supervisorId !== undefined ? body.supervisorId : user.supervisorId;
    const reactivating = body.active === true && !user.active;
    if (user.role === 'sales' && (body.supervisorId !== undefined || reactivating)) {
      if (!newSup) throw new HttpError(422, 'Choose a supervisor for this salesperson', 'BAD_PARENT');
      if (newSup !== user.supervisorId || reactivating) await assertTeamRoom(newSup, settings.max_team_size, user.id);
    }
    if (body.active === false && user.active && user.role === 'sales') {
      detail.removedFutureBookings = await removeFutureBookingsFor(user.id);
    }

    if (body.name !== undefined) user.name = body.name;
    if (body.phone !== undefined) user.phone = body.phone || null;
    if (body.active !== undefined) user.active = body.active;
    if (body.supervisorId !== undefined && user.role === 'sales') user.supervisorId = body.supervisorId;
    if (body.password) {
      user.passwordHash = await bcrypt.hash(body.password, 10);
      detail.passwordReset = true;
    }
    await user.save();
    await audit(req.user!.id, 'user.update', 'user', user.id, { ...body, password: body.password ? '***' : undefined, ...detail });
    res.json({ user: { ...publicUser(user), active: user.active }, ...detail });
  })
);

// ------------------------------------------------------------------ managers and supervisors (teams, no login)

const NamePhone = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(30).nullable().optional(),
});

adminRouter.post(
  '/managers',
  requireRole('admin'),
  wrap(async (req, res) => {
    const body = NamePhone.parse(req.body);
    const m = await Manager.create({ name: body.name, phone: body.phone || null });
    await audit(req.user!.id, 'manager.create', 'manager', m.id, { name: m.name });
    res.status(201).json({ manager: { id: m.id, name: m.name, phone: m.phone, active: m.active } });
  })
);

adminRouter.patch(
  '/managers/:id',
  requireRole('admin'),
  wrap(async (req, res) => {
    const m = await Manager.findByPk(Number(req.params.id));
    if (!m) throw new HttpError(404, 'Sales manager not found');
    const body = NamePhone.partial().extend({ active: z.boolean().optional() }).parse(req.body);
    if (body.active === false && m.active && (await Supervisor.count({ where: { managerId: m.id, active: true } }))) {
      throw new HttpError(409, 'Move this manager’s supervisors to another manager first', 'HAS_TEAM');
    }
    if (body.name !== undefined) m.name = body.name;
    if (body.phone !== undefined) m.phone = body.phone || null;
    if (body.active !== undefined) m.active = body.active;
    await m.save();
    await audit(req.user!.id, 'manager.update', 'manager', m.id, body);
    res.json({ manager: { id: m.id, name: m.name, phone: m.phone, active: m.active } });
  })
);

async function assertActiveManager(id: number) {
  const m = await Manager.findByPk(id);
  if (!m || !m.active) throw new HttpError(422, 'Choose an active sales manager', 'BAD_PARENT');
}

adminRouter.post(
  '/supervisors',
  requireRole('admin'),
  wrap(async (req, res) => {
    const body = NamePhone.extend({ managerId: z.number().int() }).parse(req.body);
    await assertActiveManager(body.managerId);
    const s = await Supervisor.create({ name: body.name, phone: body.phone || null, managerId: body.managerId });
    await audit(req.user!.id, 'supervisor.create', 'supervisor', s.id, { name: s.name, managerId: s.managerId });
    res.status(201).json({ supervisor: { id: s.id, name: s.name, phone: s.phone, managerId: s.managerId, active: s.active } });
  })
);

adminRouter.patch(
  '/supervisors/:id',
  requireRole('admin'),
  wrap(async (req, res) => {
    const s = await Supervisor.findByPk(Number(req.params.id));
    if (!s) throw new HttpError(404, 'Supervisor not found');
    const body = NamePhone.partial().extend({ active: z.boolean().optional(), managerId: z.number().int().optional() }).parse(req.body);
    if (body.managerId !== undefined && body.managerId !== s.managerId) await assertActiveManager(body.managerId);
    if (body.active === false && s.active && (await User.count({ where: { role: 'sales', active: true, supervisorId: s.id } }))) {
      throw new HttpError(409, 'Move this supervisor’s salespeople to another supervisor first', 'HAS_TEAM');
    }
    if (body.name !== undefined) s.name = body.name;
    if (body.phone !== undefined) s.phone = body.phone || null;
    if (body.active !== undefined) s.active = body.active;
    if (body.managerId !== undefined) s.managerId = body.managerId;
    await s.save();
    await audit(req.user!.id, 'supervisor.update', 'supervisor', s.id, body);
    res.json({ supervisor: { id: s.id, name: s.name, phone: s.phone, managerId: s.managerId, active: s.active } });
  })
);

// ------------------------------------------------------------------ org tree (Team tab, admin)

adminRouter.get(
  '/org',
  requireRole('admin', 'videographer'),
  wrap(async (req, res) => {
    // The admin sees and edits everything. The videographer gets a read-only view of the
    // active teams (names and phones) with no usernames and no list of accounts.
    const isAdmin = req.user!.role === 'admin';
    const settings = await getSettings();
    const today = todayIn(config.timezone);

    const managers = (await Manager.findAll({ order: [['name', 'ASC']] })).filter((m) => isAdmin || m.active);
    const supervisors = (await Supervisor.findAll({ order: [['name', 'ASC']] })).filter((s) => isAdmin || s.active);
    const users = await User.findAll({ order: [['name', 'ASC']] });
    const sales = users.filter((u) => u.role === 'sales' && (isAdmin || u.active));

    const lastDone = new Map<number, string>();
    const next = new Map<number, { date: string; startTime: string }>();
    if (sales.length) {
      const bookings = await Booking.findAll({
        where: { salesId: { [Op.in]: sales.map((s) => s.id) }, status: { [Op.in]: ['done', 'planned'] } },
        include: [{ model: CaptureDay, as: 'day', required: true, where: { status: 'active' } }],
      });
      for (const b of bookings) {
        const d = b.day!;
        if (b.status === 'done') {
          const cur = lastDone.get(b.salesId);
          if (!cur || d.date > cur) lastDone.set(b.salesId, d.date);
        } else if (d.date >= today) {
          const cur = next.get(b.salesId);
          if (!cur || d.date < cur.date) next.set(b.salesId, { date: d.date, startTime: b.startTime });
        }
      }
    }
    const salesNode = (u: User) => ({
      id: u.id,
      name: u.name,
      username: isAdmin ? u.username : undefined,
      phone: u.phone,
      active: u.active,
      lastCaptured: lastDone.get(u.id) ?? null,
      next: next.get(u.id) ?? null,
    });
    const supNode = (s: Supervisor) => {
      const team = sales.filter((u) => u.supervisorId === s.id);
      const lg = isAdmin ? users.find((u) => u.role === 'supervisor' && u.supervisorId === s.id && u.active) : undefined;
      return {
        id: s.id,
        name: s.name,
        phone: s.phone,
        active: s.active,
        managerId: s.managerId,
        login: lg ? { id: lg.id, username: lg.username } : null,
        teamSize: team.filter((u) => u.active).length,
        max: settings.max_team_size,
        sales: team.map(salesNode),
      };
    };
    const supIds = new Set(supervisors.map((s) => s.id));

    res.json({
      max: settings.max_team_size,
      managers: managers.map((m) => ({
        id: m.id,
        name: m.name,
        phone: m.phone,
        active: m.active,
        supervisors: supervisors.filter((s) => s.managerId === m.id).map(supNode),
      })),
      unassignedSales: isAdmin ? sales.filter((u) => !u.supervisorId || !supIds.has(u.supervisorId)).map(salesNode) : [],
      videographers: isAdmin
        ? users
            .filter((u) => u.role === 'videographer')
            .map((u) => ({ id: u.id, name: u.name, username: u.username, phone: u.phone, active: u.active }))
        : [],
    });
  })
);

// ------------------------------------------------------------------ availability (days off)

adminRouter.get(
  '/unavailability',
  wrap(async (req, res) => {
    const userId = Number(req.query.userId || req.user!.id);
    if (!(await canManageUser(req.user!, userId))) throw new HttpError(403, 'Not allowed', 'FORBIDDEN');
    const today = todayIn(config.timezone);
    const rows = await Unavailability.findAll({ where: { userId, date: { [Op.gte]: today } }, order: [['date', 'ASC']] });
    res.json({ items: rows.map((r) => ({ id: r.id, userId: r.userId, date: r.date, reason: r.reason })) });
  })
);

adminRouter.post(
  '/unavailability',
  wrap(async (req, res) => {
    const body = z
      .object({ userId: z.number().int().optional(), date: z.string(), reason: z.string().trim().max(120).nullable().optional() })
      .parse(req.body);
    const userId = body.userId ?? req.user!.id;
    if (!(await canManageUser(req.user!, userId))) throw new HttpError(403, 'Not allowed', 'FORBIDDEN');
    if (!isValidDate(body.date)) throw new HttpError(422, 'Pick a valid date', 'BAD_DATE');
    const today = todayIn(config.timezone);
    if (body.date < today) throw new HttpError(422, 'That date is in the past', 'BAD_DATE');
    const target = await User.findByPk(userId);
    if (!target || target.role !== 'sales') throw new HttpError(422, 'Only salespeople have capture availability', 'BAD_PERSON');

    const [row] = await Unavailability.findOrCreate({ where: { userId, date: body.date }, defaults: { userId, date: body.date, reason: body.reason ?? null } });
    let warning: string | null = null;
    const booked = await Booking.findOne({
      where: { salesId: userId, status: 'planned' },
      include: [{ model: CaptureDay, as: 'day', required: true, where: { date: body.date, status: 'active' } }],
    });
    if (booked) {
      warning = `You are already booked on ${prettyDay(body.date)}. The admin has been told and will move your booking.`;
      const admins = await User.findAll({ where: { role: 'admin', active: true } });
      await notify(admins.map((a) => a.id), 'Availability conflict', `${target.name} cannot do ${prettyDay(body.date)} but is booked that day.`);
    }
    await audit(req.user!.id, 'availability.add', 'user', userId, { date: body.date });
    res.status(201).json({ item: { id: row.id, userId, date: row.date, reason: row.reason }, warning });
  })
);

adminRouter.delete(
  '/unavailability/:id',
  wrap(async (req, res) => {
    const row = await Unavailability.findByPk(Number(req.params.id));
    if (!row) throw new HttpError(404, 'Not found');
    if (!(await canManageUser(req.user!, row.userId))) throw new HttpError(403, 'Not allowed', 'FORBIDDEN');
    await row.destroy();
    await audit(req.user!.id, 'availability.remove', 'user', row.userId, { date: row.date });
    res.json({ ok: true });
  })
);

// ------------------------------------------------------------------ dashboard, audit, notifications

adminRouter.get(
  '/dashboard',
  requireRole('admin'),
  wrap(async (_req, res) => {
    res.json(await getDashboard());
  })
);

adminRouter.get(
  '/audit',
  requireRole('admin'),
  wrap(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 60, 200);
    const rows = await AuditLog.findAll({ order: [['id', 'DESC']], limit });
    const users = await User.findAll({ where: { id: { [Op.in]: [...new Set(rows.map((r) => r.userId).filter((x): x is number => x !== null))] } } });
    const names = new Map(users.map((u) => [u.id, u.name]));
    res.json({
      items: rows.map((r) => {
        let detail: unknown = {};
        try {
          detail = JSON.parse(r.detail);
        } catch {
          /* keep {} */
        }
        return {
          id: r.id,
          at: r.createdAt,
          who: r.userId ? names.get(r.userId) ?? `#${r.userId}` : 'system',
          action: r.action,
          entity: r.entity,
          entityId: r.entityId,
          detail,
        };
      }),
    });
  })
);

adminRouter.get(
  '/notifications',
  wrap(async (req, res) => {
    // ?limit=20 (max 100)  ?before=<id> for the next page  ?unread=1 for unread only
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const before = Number(req.query.before) || 0;
    const where: any = { userId: req.user!.id };
    if (before) where.id = { [Op.lt]: before };
    if (req.query.unread === '1') where.read = false;
    const rows = await Notification.findAll({ where, order: [['id', 'DESC']], limit: limit + 1 });
    const unread = await Notification.count({ where: { userId: req.user!.id, read: false } });
    res.json({
      unread,
      hasMore: rows.length > limit,
      items: rows.slice(0, limit).map((n) => ({ id: n.id, title: n.title, body: n.body, read: n.read, at: n.createdAt })),
    });
  })
);

adminRouter.post(
  '/notifications/:id/read',
  wrap(async (req, res) => {
    await Notification.update({ read: true }, { where: { id: Number(req.params.id), userId: req.user!.id } });
    res.json({ ok: true });
  })
);

adminRouter.post(
  '/notifications/read-all',
  wrap(async (req, res) => {
    await Notification.update({ read: true }, { where: { userId: req.user!.id, read: false } });
    res.json({ ok: true });
  })
);

// ------------------------------------------------------------------ branding (name, logo, color)

adminRouter.put(
  '/branding',
  requireRole('admin'),
  wrap(async (req, res) => {
    const b = await saveBranding(req.body);
    await audit(req.user!.id, 'branding.update', 'settings', null, { name: b.name, color: b.color, logo: b.logo ? 'set' : 'none' });
    res.json(b);
  })
);

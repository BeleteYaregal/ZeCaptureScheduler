import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { z } from 'zod';
import { config } from '../config';
import { prettyDay, todayIn } from '../dates';
import { HttpError } from '../http';
import { Booking, CaptureDay, Supervisor, User } from '../models';
import { getSettings } from '../settings';
import { audit, notify } from './log';
import { assertTeamRoom, teamIds } from './org';
import { checkPlacement, OCCUPYING, recomputeSlots, removeFutureBookingsFor, weekIsPublished } from './weeks';

/** The Supervisor record behind a supervisor login. */
export async function mySupervisor(actor: User): Promise<Supervisor> {
  const sup = actor.supervisorId ? await Supervisor.findByPk(actor.supervisorId) : null;
  if (!sup || !sup.active) throw new HttpError(403, 'Your supervisor profile is not active. Ask the admin.', 'FORBIDDEN');
  return sup;
}

const member = (u: User) => ({ id: u.id, name: u.name, username: u.username, phone: u.phone, active: u.active });

export async function listMembers(actor: User) {
  const sup = await mySupervisor(actor);
  const settings = await getSettings();
  const users = await User.findAll({ where: { role: 'sales', supervisorId: sup.id }, order: [['name', 'ASC']] });
  return { supervisor: { id: sup.id, name: sup.name }, max: settings.max_team_size, perDay: settings.supervisor_max_per_day, members: users.map(member) };
}

const NewMember = z.object({
  name: z.string().trim().min(2).max(80),
  username: z.string().trim().min(3).max(40).regex(/^[a-z0-9._-]+$/i, 'Letters, numbers, dot, dash and underscore only'),
  password: z.string().min(6).max(100),
  phone: z.string().trim().max(30).nullable().optional(),
});

export async function createMember(actor: User, body: unknown) {
  const sup = await mySupervisor(actor);
  const b = NewMember.parse(body);
  const settings = await getSettings();
  const username = b.username.toLowerCase();
  if (await User.findOne({ where: { username } })) throw new HttpError(409, 'That username is taken', 'DUPLICATE');
  await assertTeamRoom(sup.id, settings.max_team_size);
  const u = await User.create({
    name: b.name, username, passwordHash: await bcrypt.hash(b.password, 10),
    role: 'sales', supervisorId: sup.id, phone: b.phone || null, active: true,
  });
  await audit(actor.id, 'user.create', 'user', u.id, { role: 'sales', name: u.name, by: 'supervisor' });
  return member(u);
}

const PatchMember = z
  .object({ name: z.string().trim().min(2).max(80), phone: z.string().trim().max(30).nullable(), active: z.boolean(), password: z.string().min(6).max(100) })
  .partial();

export async function patchMember(actor: User, id: number, body: unknown) {
  const sup = await mySupervisor(actor);
  const u = await User.findByPk(id);
  if (!u || u.role !== 'sales' || u.supervisorId !== sup.id) throw new HttpError(404, 'Salesperson not found');
  const b = PatchMember.parse(body);
  const settings = await getSettings();
  const detail: Record<string, unknown> = {};
  if (b.active === true && !u.active) await assertTeamRoom(sup.id, settings.max_team_size, u.id);
  if (b.active === false && u.active) detail.removedFutureBookings = await removeFutureBookingsFor(u.id);
  if (b.name !== undefined) u.name = b.name;
  if (b.phone !== undefined) u.phone = b.phone || null;
  if (b.active !== undefined) u.active = b.active;
  if (b.password) {
    u.passwordHash = await bcrypt.hash(b.password, 10);
    detail.passwordReset = true;
  }
  await u.save();
  await audit(actor.id, 'user.update', 'user', u.id, { ...b, password: b.password ? '***' : undefined, ...detail, by: 'supervisor' });
  return { member: member(u), ...detail };
}

async function adminIds() {
  return (await User.findAll({ where: { role: 'admin', active: true } })).map((a) => a.id);
}

/** Supervisor asks for slots for several of his people on one day. Each is checked on its own. */
export async function createRequests(actor: User, body: unknown) {
  const sup = await mySupervisor(actor);
  const { salesIds, captureDayId } = z
    .object({ salesIds: z.array(z.number().int()).min(1).max(60), captureDayId: z.number().int() })
    .parse(body);
  const settings = await getSettings();
  const day = await CaptureDay.findByPk(captureDayId);
  if (!day) throw new HttpError(404, 'Day not found');
  if (day.date < todayIn(config.timezone)) throw new HttpError(422, 'That day has passed', 'BAD_DAY');
  const team = new Set(await teamIds(actor));

  const created: { salesId: number; bookingId: number }[] = [];
  const failed: { salesId: number; name: string; error: string }[] = [];
  for (const salesId of [...new Set(salesIds)]) {
    const person = await User.findByPk(salesId);
    const name = person?.name ?? 'Unknown';
    try {
      if (!person || !team.has(salesId) || !person.active) throw new HttpError(422, 'Not an active member of your team', 'BAD_PERSON');
      // Per-day limit for this supervisor, counting requests and approved bookings.
      const mine = await Booking.count({
        where: { captureDayId: day.id, salesId: { [Op.in]: [...team] }, status: { [Op.in]: OCCUPYING } },
      });
      if (mine >= settings.supervisor_max_per_day) {
        throw new HttpError(409, `Your daily limit is ${settings.supervisor_max_per_day} people (${prettyDay(day.date)}).`, 'SUP_LIMIT');
      }
      await checkPlacement(salesId, day, settings, {});
      const b = await Booking.create({
        captureDayId: day.id, salesId, slotOrder: 9999, startTime: day.startTime, status: 'requested', requestedById: actor.id,
      });
      created.push({ salesId, bookingId: b.id });
    } catch (e: any) {
      if (!(e instanceof HttpError)) throw e;
      failed.push({ salesId, name, error: e.message });
    }
  }
  if (created.length) {
    await recomputeSlots(day.id, settings);
    await notify(await adminIds(), 'New booking request', `${sup.name} asked for ${created.length} ${created.length === 1 ? 'person' : 'people'} on ${prettyDay(day.date)}.`);
    await audit(actor.id, 'request.create', 'captureDay', day.id, { count: created.length, day: day.date });
  }
  return { created, failed };
}

/** Supervisor withdraws a pending request, or cancels an approved booking he requested. */
export async function withdrawRequest(actor: User, bookingId: number) {
  await mySupervisor(actor);
  const b = await Booking.findByPk(bookingId, { include: [{ model: CaptureDay, as: 'day' }] });
  if (!b || b.requestedById !== actor.id || !['requested', 'planned'].includes(b.status)) {
    throw new HttpError(404, 'Request not found');
  }
  if (b.status === 'planned' && b.day && (await weekIsPublished(b.day.weekStart)) && b.day.date <= todayIn(config.timezone)) {
    throw new HttpError(409, 'That day has started. Ask the admin to change it.', 'BAD_STATUS');
  }
  const was = b.status;
  const day = b.day!;
  await b.destroy();
  await recomputeSlots(day.id, await getSettings());
  if (was === 'planned') {
    await notify(await adminIds(), 'Booking cancelled by supervisor', `${actor.name} cancelled a booking on ${prettyDay(day.date)}.`);
    if (await weekIsPublished(day.weekStart)) await notify([b.salesId], 'Capture cancelled', `Your capture on ${prettyDay(day.date)} was removed.`);
  }
  await audit(actor.id, 'request.withdraw', 'booking', bookingId, { was });
  return { ok: true };
}

// ------------------------------------------------------------------ admin side

export async function listRequests() {
  const rows = await Booking.findAll({
    where: { status: 'requested' },
    include: [{ model: CaptureDay, as: 'day', required: true }],
    order: [['id', 'ASC']],
  });
  const ids = new Set<number>();
  rows.forEach((r) => { ids.add(r.salesId); if (r.requestedById) ids.add(r.requestedById); });
  const users = ids.size ? await User.findAll({ where: { id: { [Op.in]: [...ids] } } }) : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  const sups = await Supervisor.findAll();
  const supName = new Map(sups.map((s) => [s.id, s.name]));
  return {
    items: rows
      .map((r) => {
        const p = byId.get(r.salesId);
        return {
          id: r.id,
          date: r.day!.date,
          weekStart: r.day!.weekStart,
          salesId: r.salesId,
          name: p?.name ?? 'Unknown',
          supervisorName: p?.supervisorId ? supName.get(p.supervisorId) ?? null : null,
          requestedBy: r.requestedById ? byId.get(r.requestedById)?.name ?? null : null,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id),
  };
}

export async function approveRequest(actor: User, bookingId: number, body: unknown) {
  const { override } = z.object({ override: z.boolean().optional() }).parse(body ?? {});
  const b = await Booking.findByPk(bookingId, { include: [{ model: CaptureDay, as: 'day' }] });
  if (!b || b.status !== 'requested') throw new HttpError(404, 'Request not found');
  const settings = await getSettings();
  await checkPlacement(b.salesId, b.day!, settings, { ignoreBookingIds: [b.id], override });
  b.status = 'planned';
  await b.save();
  const when = prettyDay(b.day!.date);
  if (b.requestedById) await notify([b.requestedById], 'Request approved', `${(await User.findByPk(b.salesId))?.name ?? 'Your salesperson'} is booked on ${when}.`);
  if (await weekIsPublished(b.day!.weekStart)) await notify([b.salesId], 'Capture scheduled', `You are booked for ${when} at ${b.startTime}.`);
  await audit(actor.id, 'request.approve', 'booking', b.id, { salesId: b.salesId, day: b.day!.date });
  return { ok: true };
}

export async function declineRequest(actor: User, bookingId: number, body: unknown) {
  const { reason } = z.object({ reason: z.string().trim().max(120).optional() }).parse(body ?? {});
  const b = await Booking.findByPk(bookingId, { include: [{ model: CaptureDay, as: 'day' }] });
  if (!b || b.status !== 'requested') throw new HttpError(404, 'Request not found');
  const day = b.day!;
  await b.destroy();
  await recomputeSlots(day.id, await getSettings());
  if (b.requestedById) {
    const name = (await User.findByPk(b.salesId))?.name ?? 'Your salesperson';
    await notify([b.requestedById], 'Request declined', `${name} on ${prettyDay(day.date)} was not approved.${reason ? ' ' + reason : ''}`.slice(0, 400));
  }
  await audit(actor.id, 'request.decline', 'booking', bookingId, { salesId: b.salesId, day: day.date, reason: reason ?? null });
  return { ok: true };
}

import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { z } from 'zod';
import { config } from '../config';
import { addMinutes, isTimePassed, prettyDay, todayIn } from '../dates';
import { HttpError } from '../http';
import { Booking, CaptureDay, Notification, Supervisor, User } from '../models';
import { getSettings } from '../settings';
import { audit, notify } from './log';
import { assertTeamRoom, teamIds } from './org';
import { capForWeek, checkPlacement, OCCUPYING, recomputeSlots, removeFutureBookingsFor, weekIsPublished } from './weeks';

/** The Supervisor record behind a supervisor login. */
export async function mySupervisor(actor: User): Promise<Supervisor> {
  const sup = actor.supervisorId ? await Supervisor.findByPk(actor.supervisorId) : null;
  if (!sup || !sup.active) throw new HttpError(403, 'Your supervisor profile is not active. Ask the marketing manager.', 'FORBIDDEN');
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
  const { salesIds, captureDayId, startTime } = z
    .object({
      salesIds: z.array(z.number().int()).min(1).max(60),
      captureDayId: z.number().int(),
      startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    })
    .parse(body);
  const settings = await getSettings();
  const day = await CaptureDay.findByPk(captureDayId);
  if (!day) throw new HttpError(404, 'Day not found');
  const today = todayIn(config.timezone);
  if (day.date < today) throw new HttpError(422, 'That day has passed', 'BAD_DAY');

  const cap = await capForWeek(day.weekStart, settings);
  const endTime = settings.day_end_time || '16:30';
  const existingBookings = await Booking.findAll({
    where: { captureDayId: day.id, status: { [Op.ne]: 'rescheduled' } },
  });
  const occupiedTimes = new Set(existingBookings.map((b) => b.startTime));

  let initialSlot: string;
  if (startTime) {
    const slotEnd = addMinutes(startTime, settings.slot_minutes);
    if (startTime < day.startTime || slotEnd > endTime) {
      throw new HttpError(422, `Requested time ${startTime} is outside working hours (${day.startTime} to ${endTime}).`, 'OUTSIDE_HOURS');
    }
    if (day.date === today && isTimePassed(day.date, startTime, config.timezone)) {
      throw new HttpError(
        422,
        `The requested slot at ${startTime} has already passed. Please select an upcoming slot.`,
        'TIME_PASSED'
      );
    }
    if (occupiedTimes.has(startTime)) {
      throw new HttpError(409, `The slot at ${startTime} is already booked.`, 'SLOT_OCCUPIED');
    }
    initialSlot = startTime;
  } else {
    // If no startTime specified, find the first upcoming open slot within working hours
    let found: string | null = null;
    const maxSlots = Math.max(cap, 24);
    for (let s = 0; s < maxSlots; s++) {
      const t = addMinutes(day.startTime, s * settings.slot_minutes);
      if (addMinutes(t, settings.slot_minutes) > endTime) break;
      if (day.date === today && isTimePassed(day.date, t, config.timezone)) continue;
      if (occupiedTimes.has(t)) continue;
      found = t;
      break;
    }
    if (!found) {
      if (day.date === today) {
        throw new HttpError(
          422,
          `All available capture slots for today within working hours (${day.startTime} to ${endTime}) have passed or are full. Please select an upcoming day.`,
          'TIME_PASSED'
        );
      }
      found = addMinutes(day.startTime, existingBookings.length * settings.slot_minutes);
    }
    initialSlot = found;
  }

  const team = new Set(await teamIds(actor));

  const created: { salesId: number; bookingId: number; startTime: string }[] = [];
  const failed: { salesId: number; name: string; error: string }[] = [];
  let currentSlot = initialSlot;
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
      if (addMinutes(currentSlot, settings.slot_minutes) > endTime) {
        throw new HttpError(422, `Cannot schedule at ${currentSlot}: working hours finish at ${endTime}.`, 'OUTSIDE_HOURS');
      }
      if (isTimePassed(day.date, currentSlot, config.timezone)) {
        throw new HttpError(422, `The slot at ${currentSlot} has already passed.`, 'TIME_PASSED');
      }
      await checkPlacement(salesId, day, settings, {});

      const [h0, m0] = day.startTime.split(':').map(Number);
      const [h1, m1] = currentSlot.split(':').map(Number);
      const diffMins = (h1 * 60 + m1) - (h0 * 60 + m0);
      const slotOrder = Math.max(0, Math.floor(diffMins / (settings.slot_minutes || 30)));

      const b = await Booking.create({
        captureDayId: day.id, salesId, slotOrder, startTime: currentSlot, status: 'requested', requestedById: actor.id,
      });
      created.push({ salesId, bookingId: b.id, startTime: currentSlot });
      occupiedTimes.add(currentSlot);

      // Advance to next open slot
      let next = addMinutes(currentSlot, settings.slot_minutes);
      while (occupiedTimes.has(next)) {
        next = addMinutes(next, settings.slot_minutes);
      }
      currentSlot = next;
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
    throw new HttpError(409, 'That day has started. Ask the marketing manager to change it.', 'BAD_STATUS');
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
  await Notification.update({ read: true }, { where: { title: 'New booking request', read: false } }).catch(() => {});
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
          startTime: r.startTime,
          weekStart: r.day!.weekStart,
          salesId: r.salesId,
          name: p?.name ?? 'Unknown',
          supervisorName: p?.supervisorId ? supName.get(p.supervisorId) ?? null : null,
          requestedBy: r.requestedById ? byId.get(r.requestedById)?.name ?? null : null,
          passed: isTimePassed(r.day!.date, r.startTime, config.timezone),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id),
  };
}

export async function listAvailableDays() {
  const today = todayIn(config.timezone);
  const settings = await getSettings();
  const days = await CaptureDay.findAll({
    where: {
      type: 'sales',
      status: 'active',
      date: { [Op.gte]: today },
    },
    order: [['date', 'ASC']],
    limit: 30,
  });

  const list: {
    id: number;
    date: string;
    startTime: string;
    nextSlotTime: string;
    load: number;
    capacity: number;
  }[] = [];

  for (const d of days) {
    const load = await Booking.count({
      where: { captureDayId: d.id, status: { [Op.ne]: 'rescheduled' } },
    });
    const cap = await capForWeek(d.weekStart, settings);
    const endTime = settings.day_end_time || '16:30';
    const nextSlot = addMinutes(d.startTime, load * settings.slot_minutes);
    const slotEnd = addMinutes(nextSlot, settings.slot_minutes);
    const isPassed = d.date === today && isTimePassed(d.date, nextSlot, config.timezone);
    if (!isPassed && load < cap && slotEnd <= endTime) {
      list.push({
        id: d.id,
        date: d.date,
        startTime: d.startTime,
        nextSlotTime: nextSlot,
        load,
        capacity: cap,
      });
    }
  }

  return { days: list };
}

export async function approveRequest(actor: User, bookingId: number, body: unknown) {
  const { override, captureDayId, startTime } = z
    .object({
      override: z.boolean().optional(),
      captureDayId: z.number().int().optional(),
      startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    })
    .parse(body ?? {});

  const b = await Booking.findByPk(bookingId, { include: [{ model: CaptureDay, as: 'day' }] });
  if (!b || b.status !== 'requested') throw new HttpError(404, 'Request not found');

  const settings = await getSettings();
  let targetDay = b.day!;
  let targetStartTime = startTime ?? b.startTime;

  if (captureDayId && captureDayId !== b.captureDayId) {
    const newDay = await CaptureDay.findByPk(captureDayId);
    if (!newDay || newDay.type !== 'sales' || newDay.status !== 'active') {
      throw new HttpError(422, 'Invalid target sales day', 'BAD_DAY');
    }
    targetDay = newDay;
    if (!startTime) {
      const existing = await Booking.count({
        where: { captureDayId: targetDay.id, status: { [Op.ne]: 'rescheduled' } },
      });
      targetStartTime = addMinutes(targetDay.startTime, existing * settings.slot_minutes);
    }
  }

  if (!override && isTimePassed(targetDay.date, targetStartTime, config.timezone)) {
    throw new HttpError(
      422,
      `Cannot approve: the slot on ${prettyDay(targetDay.date)} at ${targetStartTime} has already passed. Please choose an upcoming date and time.`,
      'TIME_PASSED'
    );
  }

  const endTime = settings.day_end_time || '16:30';
  const slotEnd = addMinutes(targetStartTime, settings.slot_minutes);
  if (!override && (targetStartTime < targetDay.startTime || slotEnd > endTime)) {
    throw new HttpError(
      422,
      `Cannot approve: slot ${targetStartTime} is outside working hours (${targetDay.startTime} to ${endTime}).`,
      'OUTSIDE_HOURS'
    );
  }

  await checkPlacement(b.salesId, targetDay, settings, { ignoreBookingIds: [b.id], override });

  const oldDayId = b.captureDayId;
  const dayChanged = targetDay.id !== oldDayId;

  b.captureDayId = targetDay.id;
  b.startTime = targetStartTime;
  b.status = 'planned';
  const [h0, m0] = targetDay.startTime.split(':').map(Number);
  const [h1, m1] = targetStartTime.split(':').map(Number);
  const diffMins = (h1 * 60 + m1) - (h0 * 60 + m0);
  b.slotOrder = Math.max(0, Math.floor(diffMins / (settings.slot_minutes || 30)));
  await b.save();

  if (dayChanged) {
    await recomputeSlots(oldDayId, settings);
  }
  await b.reload();

  const when = `${prettyDay(targetDay.date)} at ${b.startTime}`;
  const rescheduledNote = dayChanged ? ' (rescheduled)' : '';

  if (b.requestedById) {
    await notify(
      [b.requestedById],
      'Request approved',
      `${(await User.findByPk(b.salesId))?.name ?? 'Your salesperson'} is booked for ${when}${rescheduledNote}.`
    );
  }
  if (await weekIsPublished(targetDay.weekStart)) {
    await notify([b.salesId], 'Capture scheduled', `You are booked for ${when}${rescheduledNote}.`);
  }

  await audit(actor.id, 'request.approve', 'booking', b.id, {
    salesId: b.salesId,
    day: targetDay.date,
    startTime: b.startTime,
    rescheduledFrom: dayChanged ? b.day!.date : undefined,
  });

  const remaining = await Booking.count({ where: { status: 'requested' } });
  if (remaining === 0) {
    await Notification.update({ read: true }, { where: { title: 'New booking request', read: false } }).catch(() => {});
  }

  return { ok: true, bookingId: b.id, date: targetDay.date, startTime: b.startTime };
}

export async function declineRequest(actor: User, bookingId: number, body: unknown) {
  const { reason } = z.object({ reason: z.string().trim().max(300).optional() }).parse(body ?? {});
  const b = await Booking.findByPk(bookingId, { include: [{ model: CaptureDay, as: 'day' }] });
  if (!b || b.status !== 'requested') throw new HttpError(404, 'Request not found');
  const day = b.day!;
  await b.destroy();
  await recomputeSlots(day.id, await getSettings());
  if (b.requestedById) {
    const name = (await User.findByPk(b.salesId))?.name ?? 'Your salesperson';
    const reasonText = reason ? ` Reason: ${reason}` : '';
    await notify([b.requestedById], 'Request declined', `${name} on ${prettyDay(day.date)} was not approved.${reasonText}`.slice(0, 400));
  }
  await audit(actor.id, 'request.decline', 'booking', bookingId, { salesId: b.salesId, day: day.date, reason: reason ?? null });

  const remaining = await Booking.count({ where: { status: 'requested' } });
  if (remaining === 0) {
    await Notification.update({ read: true }, { where: { title: 'New booking request', read: false } }).catch(() => {});
  }

  return { ok: true };
}

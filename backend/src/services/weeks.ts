import { Op } from 'sequelize';
import { z } from 'zod';
import { config } from '../config';
import { addDays, addMinutes, isValidDate, mondayOf, prettyDay, todayIn } from '../dates';
import { HttpError } from '../http';
import { Booking, CaptureDay, Unavailability, User, Week } from '../models';
import { autoCap, buildSchedule } from '../scheduler';
import { DEFAULT_SETTINGS, getSettings, Settings } from '../settings';
import { audit, notify } from './log';
import { loadActiveSales, loadOrgMaps, visibleSalesIds } from './org';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ACTIVE = ['planned', 'done']; // counts as "has a capture this week"
const OCCUPYING = ['planned', 'done', 'missed', 'requested']; // takes up a slot on its day
const HOLDING = ['planned', 'done', 'requested']; // blocks a second capture the same week

export function assertMonday(weekStart: string): void {
  if (!isValidDate(weekStart) || mondayOf(weekStart) !== weekStart) {
    throw new HttpError(400, 'weekStart must be a Monday in YYYY-MM-DD format', 'BAD_WEEK');
  }
}

// ---------------------------------------------------------------- helpers

export { capForWeek, checkPlacement, recomputeSlots, weekIsPublished, OCCUPYING, HOLDING };

async function capForWeek(weekStart: string, settings: Settings, activeSalesCount?: number): Promise<number> {
  const n = await CaptureDay.count({ where: { weekStart, type: 'sales', status: 'active' } });
  if (n === 0) return 0;
  if (settings.people_per_sales_day) return settings.people_per_sales_day;
  const total = activeSalesCount ?? (await User.count({ where: { role: 'sales', active: true } }));
  return autoCap(total, n);
}

async function dayLoad(dayId: number, ignoreBookingId?: number): Promise<number> {
  return Booking.count({
    where: {
      captureDayId: dayId,
      status: { [Op.in]: OCCUPYING },
      ...(ignoreBookingId ? { id: { [Op.ne]: ignoreBookingId } } : {}),
    },
  });
}

async function recomputeSlots(dayId: number, settings: Settings): Promise<void> {
  const day = await CaptureDay.findByPk(dayId);
  if (!day) return;
  const list = await Booking.findAll({
    where: { captureDayId: dayId, status: { [Op.ne]: 'rescheduled' } },
    order: [
      ['slotOrder', 'ASC'],
      ['id', 'ASC'],
    ],
  });
  let i = 0;
  for (const b of list) {
    const start = addMinutes(day.startTime, i * settings.slot_minutes);
    if (b.slotOrder !== i || b.startTime !== start) {
      b.slotOrder = i;
      b.startTime = start;
      await b.save();
    }
    i++;
  }
}

async function weekIsPublished(weekStart: string): Promise<boolean> {
  const w = await Week.findOne({ where: { weekStart } });
  return w?.status === 'published';
}

async function assertVideographer(id: number | null | undefined): Promise<void> {
  if (id === null || id === undefined) return;
  const v = await User.findByPk(id);
  if (!v || v.role !== 'videographer' || !v.active) {
    throw new HttpError(422, 'Pick an active videographer', 'BAD_VIDEOGRAPHER');
  }
}

// ---------------------------------------------------------------- read

/**
 * Upcoming weeks are always open: the first time an admin or supervisor looks at a week
 * that has no plan yet, it is created from the standard week (Settings). Nothing is built
 * or published, so the admin can still change it.
 */
async function ensureOpenWeek(weekStart: string): Promise<void> {
  const cur = mondayOf(todayIn(config.timezone));
  if (weekStart < cur || weekStart > addDays(cur, 7 * 12)) return;
  if (await Week.findOne({ where: { weekStart } })) return;
  if (await CaptureDay.count({ where: { weekStart } })) return;
  const settings = await getSettings();
  const kinds = (settings.week_pattern ?? DEFAULT_SETTINGS.week_pattern).map((t, i) => ({ type: t, date: addDays(weekStart, i) })).filter((d) => d.type !== 'off');
  if (!kinds.length) return;
  const vid = settings.default_videographer_id;
  const videographer = vid ? await User.findOne({ where: { id: vid, role: 'videographer', active: true } }) : null;
  try {
    await Week.create({ weekStart, status: 'draft', videographerId: videographer?.id ?? null });
    for (const d of kinds) {
      await CaptureDay.create({
        weekStart,
        date: d.date,
        type: d.type as 'sales' | 'company',
        startTime: settings.day_start_time,
        videographerId: videographer?.id ?? null,
      });
    }
  } catch {
    /* another request created it first */
  }
}

export async function getWeekView(weekStart: string, viewer: User) {
  assertMonday(weekStart);
  if (viewer.role === 'admin' || viewer.role === 'supervisor') await ensureOpenWeek(weekStart);
  const settings = await getSettings();
  const weekEnd = addDays(weekStart, 6);
  const limits = {
    salesDays: settings.sales_days_per_week,
    companyDays: settings.company_days_per_week,
    maxTeamSize: settings.max_team_size,
    supervisorMaxPerDay: settings.supervisor_max_per_day,
  };
  const blank = (status: string) => ({
    week: { weekStart, weekEnd, status, videographerId: null as number | null, videographerName: null as string | null, publishedAt: null as Date | null },
    limits,
    days: [] as any[],
    unscheduled: [] as any[],
    warnings: [] as string[],
    stats: { salesDays: 0, companyDays: 0, booked: 0, planned: 0, done: 0, missed: 0 },
  });

  const week = await Week.findOne({ where: { weekStart } });
  if (!week) return blank('none');
  if (viewer.role !== 'admin' && viewer.role !== 'supervisor' && week.status !== 'published') return blank('unpublished');

  const allDays = await CaptureDay.findAll({ where: { weekStart }, order: [['date', 'ASC']] });
  const activeSalesDays = allDays.filter((d) => d.type === 'sales' && d.status === 'active').length;
  const activeSales = await User.count({ where: { role: 'sales', active: true } });
  const cap = activeSalesDays
    ? settings.people_per_sales_day ?? autoCap(activeSales, activeSalesDays)
    : 0;

  let days = allDays;
  if (viewer.role === 'videographer') days = allDays.filter((d) => d.videographerId === viewer.id);

  const visible = await visibleSalesIds(viewer);
  const bookings = allDays.length
    ? await Booking.findAll({
        where: { captureDayId: { [Op.in]: allDays.map((d) => d.id) } },
        order: [
          ['slotOrder', 'ASC'],
          ['id', 'ASC'],
        ],
      })
    : [];

  const userIds = new Set<number>();
  bookings.forEach((b) => userIds.add(b.salesId));
  allDays.forEach((d) => d.videographerId && userIds.add(d.videographerId));
  if (week.videographerId) userIds.add(week.videographerId);
  const people = userIds.size ? await User.findAll({ where: { id: { [Op.in]: [...userIds] } } }) : [];
  const personMap = new Map(people.map((p) => [p.id, p]));
  const { supMap, mgrMap } = await loadOrgMaps();
  const showPhone = viewer.role !== 'sales';

  const dayIdSet = new Set(days.map((d) => d.id));
  const draftWeek = week.status !== 'published';
  const shownBookings = bookings.filter((b) => {
    if (!dayIdSet.has(b.captureDayId)) return false;
    if (visible !== 'all' && !visible.has(b.salesId)) return false;
    // Requests are between the supervisor and the admin only.
    if (b.status === 'requested' && viewer.role !== 'admin' && viewer.role !== 'supervisor') return false;
    // A supervisor does not see the auto-generated draft, only what his team asked for.
    if (viewer.role === 'supervisor' && draftWeek && b.requestedById === null) return false;
    return true;
  });
  const loadByDay = new Map<number, number>();
  for (const b of bookings) if (OCCUPYING.includes(b.status)) loadByDay.set(b.captureDayId, (loadByDay.get(b.captureDayId) ?? 0) + 1);

  const out = {
    week: {
      weekStart,
      weekEnd,
      status: week.status as string,
      videographerId: week.videographerId,
      videographerName: week.videographerId ? personMap.get(week.videographerId)?.name ?? null : null,
      publishedAt: week.publishedAt,
    },
    limits,
    days: days.map((d) => ({
      id: d.id,
      date: d.date,
      type: d.type,
      status: d.status,
      startTime: d.startTime,
      note: d.note,
      videographer: d.videographerId
        ? { id: d.videographerId, name: personMap.get(d.videographerId)?.name ?? 'Unknown' }
        : null,
      capacity: d.type === 'sales' ? cap : null,
      load: loadByDay.get(d.id) ?? 0,
      mine: shownBookings.filter((b) => b.captureDayId === d.id && OCCUPYING.includes(b.status)).length,
      bookings: shownBookings
        .filter((b) => b.captureDayId === d.id)
        .map((b) => {
          const p = personMap.get(b.salesId);
          const sup = p?.supervisorId ? supMap.get(p.supervisorId) : undefined;
          const mgr = sup ? mgrMap.get(sup.managerId) : undefined;
          return {
            id: b.id,
            slotOrder: b.slotOrder,
            startTime: b.startTime,
            status: b.status,
            editDone: b.editDone,
            requested: b.status === 'requested',
            requestedById: b.requestedById,
            person: {
              id: b.salesId,
              name: p?.name ?? 'Unknown',
              phone: showPhone ? p?.phone ?? null : null,
              supervisorId: sup?.id ?? null,
              supervisorName: sup?.name ?? null,
              managerId: mgr?.id ?? null,
              managerName: mgr?.name ?? null,
            },
          };
        }),
    })),
    unscheduled: [] as any[],
    warnings: [] as string[],
    stats: { salesDays: 0, companyDays: 0, booked: 0, planned: 0, done: 0, missed: 0 },
  };

  const live = allDays.filter((d) => d.status === 'active');
  out.stats.salesDays = live.filter((d) => d.type === 'sales').length;
  out.stats.companyDays = live.filter((d) => d.type === 'company').length;
  for (const b of shownBookings) {
    if (b.status === 'planned') out.stats.planned++;
    if (b.status === 'done') out.stats.done++;
    if (b.status === 'missed') out.stats.missed++;
    if (OCCUPYING.includes(b.status)) out.stats.booked++;
    if (b.status === 'requested') (out.stats as any).requested = ((out.stats as any).requested ?? 0) + 1;
  }

  if (viewer.role === 'admin') {
    try {
      out.warnings = JSON.parse(week.warnings);
    } catch {
      out.warnings = [];
    }
    if (activeSalesDays > 0) {
      const have = new Set(bookings.filter((b) => OCCUPYING.includes(b.status)).map((b) => b.salesId));
      const sales = await loadActiveSales();
      out.unscheduled = sales
        .filter((s) => !have.has(s.user.id))
        .map((s) => ({
          id: s.user.id,
          name: s.user.name,
          supervisorName: s.supervisorId ? supMap.get(s.supervisorId)?.name ?? null : null,
        }));
    }
  }
  return out;
}

// ---------------------------------------------------------------- plan

const PlanSchema = z.object({
  videographerId: z.number().int().nullable().optional(),
  override: z.boolean().optional(),
  days: z
    .array(
      z.object({
        date: z.string(),
        type: z.enum(['sales', 'company']),
        note: z.string().max(200).nullable().optional(),
        startTime: z.string().regex(HHMM).optional(),
        videographerId: z.number().int().nullable().optional(),
      })
    )
    .max(7),
});

export async function savePlan(actor: User, weekStart: string, body: unknown) {
  assertMonday(weekStart);
  const plan = PlanSchema.parse(body);
  const settings = await getSettings();
  const existingWeek = await Week.findOne({ where: { weekStart } });
  if (existingWeek?.status === 'published') {
    throw new HttpError(409, 'This week is already published. Cancel a day or move bookings instead.', 'PUBLISHED');
  }

  const end = addDays(weekStart, 6);
  const seen = new Set<string>();
  for (const d of plan.days) {
    if (!isValidDate(d.date) || d.date < weekStart || d.date > end) {
      throw new HttpError(422, `${d.date} is not inside the week of ${weekStart}`, 'BAD_DATE');
    }
    if (seen.has(d.date)) throw new HttpError(422, `${d.date} appears twice`, 'BAD_DATE');
    seen.add(d.date);
  }

  const salesN = plan.days.filter((d) => d.type === 'sales').length;
  const companyN = plan.days.filter((d) => d.type === 'company').length;
  const problems: string[] = [];
  if (salesN > settings.sales_days_per_week) {
    problems.push(`${salesN} sales days selected, the limit is ${settings.sales_days_per_week}`);
  }
  if (companyN > settings.company_days_per_week) {
    problems.push(`${companyN} company days selected, the limit is ${settings.company_days_per_week}`);
  }
  if (problems.length && !plan.override) {
    throw new HttpError(422, problems.join('. ') + '.', 'LIMIT_EXCEEDED');
  }

  await assertVideographer(plan.videographerId);
  for (const d of plan.days) await assertVideographer(d.videographerId);

  const week =
    existingWeek ??
    (await Week.create({ weekStart, status: 'draft', videographerId: plan.videographerId ?? null }));
  if (plan.videographerId !== undefined) {
    week.videographerId = plan.videographerId;
    await week.save();
  }

  const existing = await CaptureDay.findAll({ where: { weekStart } });
  const byDate = new Map(existing.map((d) => [d.date, d]));
  for (const d of plan.days) {
    const vid = d.videographerId !== undefined ? d.videographerId : week.videographerId;
    const row = byDate.get(d.date);
    if (row) {
      if (row.type === 'sales' && d.type === 'company') await Booking.destroy({ where: { captureDayId: row.id } });
      row.type = d.type;
      row.note = d.note ?? null;
      row.videographerId = vid ?? null;
      row.startTime = d.startTime ?? row.startTime;
      row.status = 'active';
      await row.save();
      byDate.delete(d.date);
    } else {
      await CaptureDay.create({
        weekStart,
        date: d.date,
        type: d.type,
        startTime: d.startTime ?? settings.day_start_time,
        videographerId: vid ?? null,
        note: d.note ?? null,
      });
    }
  }
  for (const row of byDate.values()) {
    await Booking.destroy({ where: { captureDayId: row.id } });
    await row.destroy();
  }
  const salesDays = await CaptureDay.findAll({ where: { weekStart, type: 'sales' } });
  for (const d of salesDays) await recomputeSlots(d.id, settings);

  await audit(actor.id, 'plan.save', 'week', weekStart, {
    sales: salesN,
    company: companyN,
    overrideUsed: problems.length > 0,
    problems,
  });
  return getWeekView(weekStart, actor);
}

// ---------------------------------------------------------------- generate

export async function generateWeek(actor: User, weekStart: string) {
  assertMonday(weekStart);
  const week = await Week.findOne({ where: { weekStart } });
  if (!week) throw new HttpError(404, 'Pick the capture days for this week first', 'NO_PLAN');
  if (week.status === 'published') {
    throw new HttpError(409, 'This week is published. Move bookings manually or cancel a day.', 'PUBLISHED');
  }
  const settings = await getSettings();
  const days = await CaptureDay.findAll({ where: { weekStart, status: 'active' }, order: [['date', 'ASC']] });
  const salesDays = days.filter((d) => d.type === 'sales');
  if (!salesDays.length) throw new HttpError(422, 'Add at least one sales day to generate a schedule', 'NO_SALES_DAYS');

  // Idempotent: wipe this draft week's bookings, then rebuild. Bookings a supervisor
  // requested (pending or approved) are kept and counted against each day's capacity.
  if (days.length) {
    await Booking.destroy({ where: { captureDayId: { [Op.in]: days.map((d) => d.id) }, requestedById: null } });
  }
  const kept = await Booking.findAll({
    where: { captureDayId: { [Op.in]: salesDays.map((d) => d.id) }, status: { [Op.in]: OCCUPYING } },
  });
  const keptPeople = new Set(kept.map((b) => b.salesId));
  const reserved = new Map<number, number>();
  for (const b of kept) reserved.set(b.captureDayId, (reserved.get(b.captureDayId) ?? 0) + 1);

  const allSales = await loadActiveSales();
  const sales = allSales.filter((s) => !keptPeople.has(s.user.id));
  const names = new Map(sales.map((s) => [s.user.id, s.user.name]));

  // History: last time each person was captured or already scheduled BEFORE this week.
  const hist = await Booking.findAll({
    where: { status: { [Op.in]: ACTIVE } },
    include: [{ model: CaptureDay, as: 'day', required: true, where: { status: 'active', date: { [Op.lt]: weekStart } } }],
  });
  const last = new Map<number, string>();
  for (const b of hist) {
    const d = b.day!.date;
    const cur = last.get(b.salesId);
    if (!cur || d > cur) last.set(b.salesId, d);
  }

  const unRows = await Unavailability.findAll({ where: { date: { [Op.in]: salesDays.map((d) => d.date) } } });
  const unavailable = new Map<number, Set<string>>();
  for (const r of unRows) {
    if (!unavailable.has(r.userId)) unavailable.set(r.userId, new Set());
    unavailable.get(r.userId)!.add(r.date);
  }

  const result = buildSchedule({
    people: sales.map((s) => ({
      id: s.user.id,
      supervisorId: s.supervisorId,
      managerId: s.managerId,
      lastScheduled: last.get(s.user.id) ?? null,
    })),
    days: salesDays.map((d) => ({ key: d.id, date: d.date })),
    perDayCap: settings.people_per_sales_day ?? autoCap(allSales.length, salesDays.length),
    unavailable,
    reserved,
  });

  let booked = 0;
  for (const d of salesDays) {
    const ids = result.assignments.get(d.id) ?? [];
    for (let i = 0; i < ids.length; i++) {
      await Booking.create({
        captureDayId: d.id,
        salesId: ids[i],
        slotOrder: i,
        startTime: addMinutes(d.startTime, i * settings.slot_minutes),
        status: 'planned',
      });
      booked++;
    }
  }

  const warnings: string[] = [];
  if (!sales.length) warnings.push('There are no active salespeople to schedule.');
  const cap = result.unplaced.filter((u) => u.reason === 'capacity');
  const una = result.unplaced.filter((u) => u.reason === 'unavailable');
  if (cap.length) {
    const list = cap.slice(0, 5).map((u) => names.get(u.personId)).join(', ');
    warnings.push(
      `${cap.length} ${cap.length === 1 ? 'person does' : 'people do'} not fit this week (${result.cap} per day across ${salesDays.length} sales days): ${list}${cap.length > 5 ? ' and more' : ''}. They go first next week. Add a sales day or raise the per-day limit to fit everyone.`
    );
  }
  for (const u of una) warnings.push(`${names.get(u.personId)} is unavailable on every sales day this week.`);

  for (const d of salesDays) await recomputeSlots(d.id, settings);
  week.warnings = JSON.stringify(warnings);
  await week.save();
  await audit(actor.id, 'schedule.generate', 'week', weekStart, { booked, unplaced: result.unplaced.length, perDay: result.cap });
  return getWeekView(weekStart, actor);
}

// ---------------------------------------------------------------- publish

export async function publishWeek(actor: User, weekStart: string) {
  assertMonday(weekStart);
  const week = await Week.findOne({ where: { weekStart } });
  if (!week) throw new HttpError(404, 'Nothing to publish yet. Pick the days first.', 'NO_PLAN');
  if (week.status === 'published') throw new HttpError(409, 'Already published', 'PUBLISHED');
  const days = await CaptureDay.findAll({ where: { weekStart, status: 'active' }, order: [['date', 'ASC']] });
  if (!days.length) throw new HttpError(422, 'Pick at least one capture day first', 'NO_PLAN');
  if (days.some((d) => !d.videographerId)) {
    throw new HttpError(422, 'Assign a videographer before publishing, so they can see their run sheet', 'NO_VIDEOGRAPHER');
  }

  const bookings = days.length
    ? await Booking.findAll({ where: { captureDayId: { [Op.in]: days.map((d) => d.id) }, status: 'planned' } })
    : [];
  const hasSalesDays = days.some((d) => d.type === 'sales');
  if (hasSalesDays && bookings.length === 0 && (await User.count({ where: { role: 'sales', active: true } })) > 0) {
    throw new HttpError(422, 'Generate the schedule before publishing', 'NOT_GENERATED');
  }

  week.status = 'published';
  week.publishedAt = new Date();
  await week.save();

  const dayById = new Map(days.map((d) => [d.id, d]));
  for (const b of bookings) {
    const d = dayById.get(b.captureDayId)!;
    await notify([b.salesId], 'Capture scheduled', `You are booked for ${prettyDay(d.date)} at ${b.startTime}.`);
  }
  // Only salespeople and videographers have accounts, so only they are notified.
  const label = `${prettyDay(weekStart)} to ${prettyDay(addDays(weekStart, 6))}`;
  const vids = new Set<number>();
  days.forEach((d) => d.videographerId && vids.add(d.videographerId));
  if (week.videographerId) vids.add(week.videographerId);
  await notify(
    [...vids],
    'New week published',
    `${label}: ${bookings.length} captures across ${days.filter((d) => d.type === 'sales').length} sales days.`
  );

  await audit(actor.id, 'schedule.publish', 'week', weekStart, { bookings: bookings.length });
  return getWeekView(weekStart, actor);
}

// ---------------------------------------------------------------- manual edits

interface PlaceOpts {
  ignoreBookingIds?: number[];
  override?: boolean;
  /** Swaps do not change how many people a day holds, so fullness is not checked. */
  skipCapacity?: boolean;
}

async function checkPlacement(salesId: number, day: CaptureDay, settings: Settings, o: PlaceOpts): Promise<void> {
  if (day.type !== 'sales' || day.status !== 'active') {
    throw new HttpError(422, 'That is not an active sales day', 'BAD_DAY');
  }
  const ignore = o.ignoreBookingIds ?? [];
  const idFilter = ignore.length ? { id: { [Op.notIn]: ignore } } : {};
  const dup = await Booking.count({ where: { captureDayId: day.id, salesId, status: { [Op.in]: HOLDING }, ...idFilter } });
  if (dup) throw new HttpError(409, 'That person is already booked on this day', 'ALREADY_ON_DAY');
  if (o.override) return;

  const person = await User.findByPk(salesId);
  const un = await Unavailability.count({ where: { userId: salesId, date: day.date } });
  if (un) {
    throw new HttpError(409, `${person?.name ?? 'This person'} marked ${prettyDay(day.date)} as unavailable.`, 'UNAVAILABLE');
  }
  if (!o.skipCapacity) {
    const cap = await capForWeek(day.weekStart, settings);
    const load = await Booking.count({ where: { captureDayId: day.id, status: { [Op.in]: OCCUPYING }, ...idFilter } });
    if (load >= cap) {
      throw new HttpError(409, `${prettyDay(day.date)} is full (${load} of ${cap}).`, 'DAY_FULL');
    }
  }
  const sameWeek = await Booking.count({
    where: { salesId, status: { [Op.in]: HOLDING }, ...idFilter },
    include: [{ model: CaptureDay, as: 'day', required: true, where: { weekStart: day.weekStart } }],
  });
  if (sameWeek) {
    throw new HttpError(409, `${person?.name ?? 'This person'} already has a capture that week.`, 'ALREADY_BOOKED_THIS_WEEK');
  }
}

export async function moveBooking(actor: User, bookingId: number, body: unknown) {
  const { captureDayId, override } = z
    .object({ captureDayId: z.number().int(), override: z.boolean().optional() })
    .parse(body);
  const b = await Booking.findByPk(bookingId);
  if (!b) throw new HttpError(404, 'Booking not found');
  if (b.status !== 'planned') throw new HttpError(409, 'Only planned captures can be moved', 'BAD_STATUS');
  const target = await CaptureDay.findByPk(captureDayId);
  if (!target) throw new HttpError(404, 'Day not found');
  if (target.id === b.captureDayId) throw new HttpError(422, 'Already on that day', 'SAME_DAY');
  const settings = await getSettings();
  await checkPlacement(b.salesId, target, settings, { ignoreBookingIds: [b.id], override });

  const oldDayId = b.captureDayId;
  b.captureDayId = target.id;
  b.slotOrder = 9999;
  await b.save();
  await recomputeSlots(oldDayId, settings);
  await recomputeSlots(target.id, settings);
  await b.reload();

  if (await weekIsPublished(target.weekStart)) {
    await notify([b.salesId], 'Capture moved', `Your capture is now on ${prettyDay(target.date)} at ${b.startTime}.`);
  }
  await audit(actor.id, 'booking.move', 'booking', b.id, { salesId: b.salesId, toDay: target.date, override: !!override });
  return { ok: true };
}

export async function addBooking(actor: User, body: unknown) {
  const { salesId, captureDayId, override } = z
    .object({ salesId: z.number().int(), captureDayId: z.number().int(), override: z.boolean().optional() })
    .parse(body);
  const person = await User.findByPk(salesId);
  if (!person || person.role !== 'sales' || !person.active) throw new HttpError(422, 'Pick an active salesperson', 'BAD_PERSON');
  const day = await CaptureDay.findByPk(captureDayId);
  if (!day) throw new HttpError(404, 'Day not found');
  const settings = await getSettings();
  await checkPlacement(salesId, day, settings, { override });

  const b = await Booking.create({ captureDayId, salesId, slotOrder: 9999, startTime: day.startTime, status: 'planned' });
  await recomputeSlots(captureDayId, settings);
  await b.reload();
  if (await weekIsPublished(day.weekStart)) {
    await notify([salesId], 'Capture scheduled', `You are booked for ${prettyDay(day.date)} at ${b.startTime}.`);
  }
  await audit(actor.id, 'booking.add', 'booking', b.id, { salesId, day: day.date, override: !!override });
  return { ok: true, id: b.id };
}

export async function removeBooking(actor: User, bookingId: number) {
  const b = await Booking.findByPk(bookingId);
  if (!b) throw new HttpError(404, 'Booking not found');
  const day = await CaptureDay.findByPk(b.captureDayId);
  const settings = await getSettings();
  await b.destroy();
  if (day) {
    await recomputeSlots(day.id, settings);
    if (await weekIsPublished(day.weekStart)) {
      await notify([b.salesId], 'Capture cancelled', `Your capture on ${prettyDay(day.date)} was removed.`);
    }
  }
  await audit(actor.id, 'booking.remove', 'booking', bookingId, { salesId: b.salesId });
  return { ok: true };
}

export async function swapBookings(actor: User, body: unknown) {
  const { bookingId, withBookingId, override } = z
    .object({ bookingId: z.number().int(), withBookingId: z.number().int(), override: z.boolean().optional() })
    .parse(body);
  if (bookingId === withBookingId) throw new HttpError(422, 'Pick two different people', 'SAME_BOOKING');
  const a = await Booking.findByPk(bookingId);
  const b = await Booking.findByPk(withBookingId);
  if (!a || !b) throw new HttpError(404, 'Booking not found');
  if (a.status !== 'planned' || b.status !== 'planned') {
    throw new HttpError(409, 'Only planned captures can be swapped', 'BAD_STATUS');
  }
  const settings = await getSettings();
  const dayA = (await CaptureDay.findByPk(a.captureDayId))!;
  const dayB = (await CaptureDay.findByPk(b.captureDayId))!;

  if (dayA.id !== dayB.id) {
    const ignore = [a.id, b.id];
    await checkPlacement(a.salesId, dayB, settings, { ignoreBookingIds: ignore, override, skipCapacity: true });
    await checkPlacement(b.salesId, dayA, settings, { ignoreBookingIds: ignore, override, skipCapacity: true });
  }
  const slotA = a.slotOrder;
  const slotB = b.slotOrder;
  a.captureDayId = dayB.id;
  a.slotOrder = slotB;
  b.captureDayId = dayA.id;
  b.slotOrder = slotA;
  await a.save();
  await b.save();
  await recomputeSlots(dayA.id, settings);
  if (dayB.id !== dayA.id) await recomputeSlots(dayB.id, settings);
  await a.reload();
  await b.reload();

  if ((await weekIsPublished(dayA.weekStart)) || (await weekIsPublished(dayB.weekStart))) {
    await notify([a.salesId], 'Capture changed', `Your capture is now on ${prettyDay(dayB.date)} at ${a.startTime}.`);
    await notify([b.salesId], 'Capture changed', `Your capture is now on ${prettyDay(dayA.date)} at ${b.startTime}.`);
  }
  await audit(actor.id, 'booking.swap', 'booking', a.id, { with: b.id, a: a.salesId, b: b.salesId });
  return { ok: true };
}

export async function shiftBooking(actor: User, bookingId: number, body: unknown) {
  const { direction } = z.object({ direction: z.enum(['up', 'down']) }).parse(body);
  const b = await Booking.findByPk(bookingId);
  if (!b) throw new HttpError(404, 'Booking not found');
  const settings = await getSettings();
  const list = await Booking.findAll({
    where: { captureDayId: b.captureDayId, status: { [Op.ne]: 'rescheduled' } },
    order: [
      ['slotOrder', 'ASC'],
      ['id', 'ASC'],
    ],
  });
  const idx = list.findIndex((x) => x.id === b.id);
  const j = direction === 'up' ? idx - 1 : idx + 1;
  if (j < 0 || j >= list.length) return { ok: true, changed: false };
  const other = list[j];
  const tmp = b.slotOrder;
  b.slotOrder = other.slotOrder === tmp ? (direction === 'up' ? tmp - 1 : tmp + 1) : other.slotOrder;
  other.slotOrder = tmp;
  await b.save();
  await other.save();
  await recomputeSlots(b.captureDayId, settings);
  await b.reload();
  await other.reload();
  const day = await CaptureDay.findByPk(b.captureDayId);
  if (day && (await weekIsPublished(day.weekStart))) {
    await notify([b.salesId], 'Time changed', `Your capture on ${prettyDay(day.date)} is now at ${b.startTime}.`);
    await notify([other.salesId], 'Time changed', `Your capture on ${prettyDay(day.date)} is now at ${other.startTime}.`);
  }
  await audit(actor.id, 'booking.shift', 'booking', b.id, { direction });
  return { ok: true, changed: true };
}

// ---------------------------------------------------------------- status & reschedule

async function findNextSlot(salesId: number, afterDate: string, settings: Settings, ignoreBookingId?: number) {
  const days = await CaptureDay.findAll({
    where: { type: 'sales', status: 'active', date: { [Op.gt]: afterDate } },
    order: [['date', 'ASC']],
    limit: 40,
  });
  const activeSales = await User.count({ where: { role: 'sales', active: true } });
  for (const d of days) {
    if (!(await Week.findOne({ where: { weekStart: d.weekStart } }))) continue;
    if (await Unavailability.count({ where: { userId: salesId, date: d.date } })) continue;
    const mine = await Booking.count({
      where: { salesId, status: { [Op.in]: ACTIVE }, ...(ignoreBookingId ? { id: { [Op.ne]: ignoreBookingId } } : {}) },
      include: [{ model: CaptureDay, as: 'day', required: true, where: { weekStart: d.weekStart } }],
    });
    if (mine) continue;
    const cap = await capForWeek(d.weekStart, settings, activeSales);
    if ((await dayLoad(d.id)) >= cap) continue;
    return d;
  }
  return null;
}

/** Moves a missed/cancelled booking to the next free sales day. No permission check. */
async function autoReschedule(actor: User, b: Booking, settings: Settings) {
  const today = todayIn(config.timezone);
  const slot = await findNextSlot(b.salesId, today, settings, b.id);
  if (!slot) return null;
  const nb = await Booking.create({
    captureDayId: slot.id,
    salesId: b.salesId,
    slotOrder: 9999,
    startTime: slot.startTime,
    status: 'planned',
    note: 'Rescheduled',
  });
  b.status = 'rescheduled';
  await b.save();
  await recomputeSlots(slot.id, settings);
  await nb.reload();
  if (await weekIsPublished(slot.weekStart)) {
    await notify([b.salesId], 'Capture rescheduled', `Your new capture is ${prettyDay(slot.date)} at ${nb.startTime}.`);
  }
  await audit(actor.id, 'booking.reschedule', 'booking', b.id, { newBooking: nb.id, day: slot.date });
  return { id: nb.id, dayId: slot.id, date: slot.date, startTime: nb.startTime };
}

async function loadForStatus(actor: User, bookingId: number) {
  const b = await Booking.findByPk(bookingId, { include: [{ model: CaptureDay, as: 'day' }] });
  if (!b || !b.day) throw new HttpError(404, 'Booking not found');
  if (actor.role !== 'admin' && actor.id !== b.day.videographerId) {
    throw new HttpError(403, 'Only the admin or the assigned videographer can do that', 'FORBIDDEN');
  }
  return b;
}

export async function setBookingStatus(actor: User, bookingId: number, body: unknown) {
  const { status, reschedule } = z
    .object({ status: z.enum(['planned', 'done', 'missed']), reschedule: z.boolean().optional() })
    .parse(body);
  const b = await loadForStatus(actor, bookingId);
  const day = b.day!;
  if (!(await weekIsPublished(day.weekStart))) throw new HttpError(409, 'Publish the week first', 'NOT_PUBLISHED');
  if (b.status === 'rescheduled') throw new HttpError(409, 'This capture was already rescheduled', 'BAD_STATUS');
  if (b.status === 'requested') throw new HttpError(409, 'This is still a request. Approve it first.', 'BAD_STATUS');
  
 /*  if (actor.role !== 'admin' && day.date > todayIn(config.timezone)) {
    throw new HttpError(422, 'You can mark a capture once its day has started', 'TOO_EARLY');
  } */
  
  b.status = status;
  await b.save();
  await audit(actor.id, `booking.${status}`, 'booking', b.id, { salesId: b.salesId, day: day.date });
  if (status === 'missed' && actor.role !== 'admin') {
    const person = await User.findByPk(b.salesId);
    const admins = await User.findAll({ where: { role: 'admin', active: true } });
    await notify(admins.map((a) => a.id), 'Capture missed', `${person?.name ?? 'A salesperson'} was marked missed on ${prettyDay(day.date)}.`);
  }
  let rescheduled = null;
  if (status === 'missed' && reschedule) {
    rescheduled = await autoReschedule(actor, b, await getSettings());
  }
  return { ok: true, status: b.status, rescheduled, triedReschedule: !!(status === 'missed' && reschedule) };
}

export async function setEditing(actor: User, bookingId: number, body: unknown) {
  const { done } = z.object({ done: z.boolean() }).parse(body);
  const b = await loadForStatus(actor, bookingId);
  if (b.status !== 'done') throw new HttpError(409, 'Mark the capture as done before updating video editing', 'NOT_CAPTURED');
  b.editDone = done;
  b.editedAt = done ? new Date() : null;
  await b.save();
  await audit(actor.id, done ? 'booking.edit_done' : 'booking.edit_undo', 'booking', b.id, { salesId: b.salesId, day: b.day!.date });
  if (done) await notify([b.salesId], 'Your video is edited', `The video from ${prettyDay(b.day!.date)} has been edited.`);
  return { ok: true, editDone: b.editDone };
}

export async function rescheduleBooking(actor: User, bookingId: number) {
  const b = await loadForStatus(actor, bookingId);
  if (!['missed', 'planned'].includes(b.status)) {
    throw new HttpError(409, 'Only planned or missed captures can be rescheduled', 'BAD_STATUS');
  }
  const r = await autoReschedule(actor, b, await getSettings());
  return { placed: !!r, rescheduled: r };
}

export async function cancelDay(actor: User, dayId: number, body: unknown) {
  const { reason } = z.object({ reason: z.string().max(120).optional() }).parse(body ?? {});
  const day = await CaptureDay.findByPk(dayId);
  if (!day) throw new HttpError(404, 'Day not found');
  if (day.status === 'cancelled') throw new HttpError(409, 'Already cancelled', 'BAD_STATUS');
  const settings = await getSettings();
  const bookings = await Booking.findAll({ where: { captureDayId: day.id, status: 'planned' } });
  day.status = 'cancelled';
  if (reason) day.note = `Cancelled: ${reason}`;
  await day.save();

  const published = await weekIsPublished(day.weekStart);
  const moved: { name: string; date: string }[] = [];
  const unplaced: string[] = [];
  const nameOf = async (id: number) => (await User.findByPk(id))?.name ?? 'Unknown';
  for (const b of bookings) {
    const r = await autoReschedule(actor, b, settings);
    if (r) moved.push({ name: await nameOf(b.salesId), date: r.date });
    else {
      b.status = 'rescheduled';
      await b.save();
      unplaced.push(await nameOf(b.salesId));
      if (published) {
        await notify([b.salesId], 'Capture cancelled', `${prettyDay(day.date)} was cancelled. A new date will be shared soon.`);
      }
    }
  }
  await audit(actor.id, 'day.cancel', 'captureDay', day.id, { date: day.date, reason: reason ?? null, moved: moved.length, unplaced: unplaced.length });
  return { ok: true, moved, unplaced };
}

/** Used when a salesperson is deactivated: drop their upcoming planned captures. */
export async function removeFutureBookingsFor(userId: number): Promise<number> {
  const today = todayIn(config.timezone);
  const settings = await getSettings();
  const rows = await Booking.findAll({
    where: { salesId: userId, status: { [Op.in]: ['planned', 'requested'] } },
    include: [{ model: CaptureDay, as: 'day', required: true, where: { date: { [Op.gte]: today } } }],
  });
  const dayIds = new Set(rows.map((r) => r.captureDayId));
  for (const r of rows) await r.destroy();
  for (const dayId of dayIds) await recomputeSlots(dayId, settings);
  return rows.length;
}

// ---------------------------------------------------------------- standard week & plan ahead

const AutoSchema = z.object({
  fromWeek: z.string(),
  weeks: z.number().int().min(1).max(12),
  videographerId: z.number().int().nullable().optional(),
  generate: z.boolean().optional(),
  publish: z.boolean().optional(),
  /** Replace weeks that already have days (never a published week). */
  overwrite: z.boolean().optional(),
});

/** Applies the standard week (Settings) to one or more weeks, optionally building and publishing each. */
export async function autoPlan(actor: User, body: unknown) {
  const b = AutoSchema.parse(body);
  assertMonday(b.fromWeek);
  const settings = await getSettings();
  const vid = b.videographerId ?? settings.default_videographer_id ?? null;
  if (b.publish && !vid) throw new HttpError(422, 'Choose a videographer first, so the weeks can be published', 'NO_VIDEOGRAPHER');
  if (vid) await assertVideographer(vid);
  const pattern = settings.week_pattern ?? DEFAULT_SETTINGS.week_pattern;
  if (!pattern.some((d) => d !== 'off')) {
    throw new HttpError(422, 'The standard week is empty. Set it in Settings first.', 'NO_PATTERN');
  }

  const results: { weekStart: string; result: 'done' | 'skipped' | 'failed'; note: string }[] = [];
  for (let i = 0; i < b.weeks; i++) {
    const ws = addDays(b.fromWeek, 7 * i);
    try {
      const week = await Week.findOne({ where: { weekStart: ws } });
      if (week?.status === 'published') {
        results.push({ weekStart: ws, result: 'skipped', note: 'Already published' });
        continue;
      }
      const dayIds = (await CaptureDay.findAll({ where: { weekStart: ws } })).map((d) => d.id);
      const scheduled = dayIds.length ? await Booking.count({ where: { captureDayId: { [Op.in]: dayIds } } }) : 0;
      if (scheduled > 0 && !b.overwrite) {
        results.push({ weekStart: ws, result: 'skipped', note: 'Already scheduled' });
        continue;
      }
      await savePlan(actor, ws, {
        videographerId: vid,
        days: pattern
          .map((t, k) => ({ date: addDays(ws, k), type: t }))
          .filter((d) => d.type !== 'off'),
      });
      let note = 'Days set';
      const hasSales = pattern.includes('sales');
      if ((b.generate || b.publish) && hasSales) {
        await generateWeek(actor, ws);
        note = 'Schedule built';
      }
      if (b.publish) {
        await publishWeek(actor, ws);
        note = 'Published';
      }
      results.push({ weekStart: ws, result: 'done', note });
    } catch (e: any) {
      results.push({ weekStart: ws, result: 'failed', note: e?.message ?? 'Failed' });
    }
  }
  await audit(actor.id, 'plan.auto', 'week', b.fromWeek, {
    weeks: b.weeks,
    done: results.filter((r) => r.result === 'done').length,
    generate: !!b.generate,
    publish: !!b.publish,
  });
  return { results };
}
import { Op } from 'sequelize';
import { config } from '../config';
import { addDays, diffDays, mondayOf, todayIn } from '../dates';
import { Booking, CaptureDay, Manager, Supervisor, User, Week } from '../models';
import { getSettings } from '../settings';
import { loadActiveSales } from './org';

export async function getDashboard() {
  const settings = await getSettings();
  const today = todayIn(config.timezone);
  const thisWeek = mondayOf(today);
  const sales = await loadActiveSales();
  const users = await User.findAll();
  const userMap = new Map(users.map((u) => [u.id, u]));
  const sups = await Supervisor.findAll({ order: [['name', 'ASC']] });
  const mgrs = await Manager.findAll();
  const supMap = new Map(sups.map((s) => [s.id, s]));
  const mgrMap = new Map(mgrs.map((m) => [m.id, m]));

  const historyStart = addDays(thisWeek, -7 * 7);
  const rows = await Booking.findAll({
    where: { status: { [Op.in]: ['done', 'missed', 'planned'] } },
    include: [{ model: CaptureDay, as: 'day', required: true, where: { status: 'active', date: { [Op.gte]: addDays(today, -400) } } }],
  });

  const lastDone = new Map<number, string>();
  const weekly = new Map<string, { done: number; missed: number }>();
  for (let i = 0; i < 8; i++) weekly.set(addDays(historyStart, 7 * i), { done: 0, missed: 0 });
  const missedRecent: { bookingId: number; name: string; date: string }[] = [];
  const thisWeekCounts = { planned: 0, done: 0, missed: 0 };

  for (const b of rows) {
    const d = b.day!;
    if (b.status === 'done') {
      const cur = lastDone.get(b.salesId);
      if (!cur || d.date > cur) lastDone.set(b.salesId, d.date);
    }
    const w = weekly.get(d.weekStart);
    if (w && b.status === 'done') w.done++;
    if (w && b.status === 'missed') w.missed++;
    if (b.status === 'missed') missedRecent.push({ bookingId: b.id, name: userMap.get(b.salesId)?.name ?? 'Unknown', date: d.date });
    if (d.weekStart === thisWeek) thisWeekCounts[b.status as 'planned' | 'done' | 'missed']++;
  }
  missedRecent.sort((a, b) => b.date.localeCompare(a.date));

  const overdueAll = sales
    .map((s) => {
      const last = lastDone.get(s.user.id) ?? null;
      return {
        id: s.user.id,
        name: s.user.name,
        supervisorName: s.supervisorId ? supMap.get(s.supervisorId)?.name ?? null : null,
        managerName: s.managerId ? mgrMap.get(s.managerId)?.name ?? null : null,
        lastCaptured: last,
        daysSince: last ? diffDays(today, last) : null,
      };
    })
    .filter((s) => s.daysSince === null || s.daysSince > settings.overdue_days)
    .sort((a, b) => (b.daysSince ?? 99999) - (a.daysSince ?? 99999));
  const overdueIds = new Set(overdueAll.map((o) => o.id));

  const coverage = sups
    .filter((s) => s.active)
    .map((sup) => {
      const team = sales.filter((s) => s.supervisorId === sup.id);
      return {
        supervisorId: sup.id,
        name: sup.name,
        managerName: sup.managerId ? mgrMap.get(sup.managerId)?.name ?? null : null,
        teamSize: team.length,
        max: settings.max_team_size,
        upToDate: team.filter((s) => !overdueIds.has(s.user.id)).length,
      };
    });

  const week = await Week.findOne({ where: { weekStart: thisWeek } });
  const thisWeekDays = week ? await CaptureDay.findAll({ where: { weekStart: thisWeek, status: 'active' } }) : [];

  const upcomingDays = await CaptureDay.findAll({
    where: { status: 'active', date: { [Op.gte]: today } },
    order: [['date', 'ASC']],
    limit: 6,
  });
  const upIds = upcomingDays.map((d) => d.id);
  const upBookings = upIds.length
    ? await Booking.findAll({ where: { captureDayId: { [Op.in]: upIds }, status: { [Op.in]: ['planned', 'done', 'missed'] } } })
    : [];
  const weekRows = await Week.findAll({ where: { weekStart: { [Op.in]: [...new Set(upcomingDays.map((d) => d.weekStart))] } } });
  const weekStatus = new Map(weekRows.map((w) => [w.weekStart, w.status]));

  const doneAll = rows.filter((r) => r.status === 'done');
  const editedAll = doneAll.filter((r) => r.editDone).length;
  const editing = { captured: doneAll.length, edited: editedAll, pending: doneAll.length - editedAll, rate: doneAll.length ? Math.round((editedAll / doneAll.length) * 100) : 0 };

  return {
    today,
    editing,
    totals: {
      sales: sales.length,
      supervisors: sups.filter((s) => s.active).length,
      managers: mgrs.filter((m) => m.active).length,
      videographers: users.filter((u) => u.role === 'videographer' && u.active).length,
    },
    thisWeek: {
      weekStart: thisWeek,
      status: week?.status ?? 'none',
      salesDays: thisWeekDays.filter((d) => d.type === 'sales').length,
      companyDays: thisWeekDays.filter((d) => d.type === 'company').length,
      ...thisWeekCounts,
    },
    overdueDays: settings.overdue_days,
    overdueCount: overdueAll.length,
    overdue: overdueAll.slice(0, 12),
    coverage,
    history: [...weekly.entries()].map(([weekStart, v]) => ({ weekStart, ...v })),
    missedRecent: missedRecent.slice(0, 8),
    upcoming: upcomingDays.map((d) => ({
      id: d.id,
      date: d.date,
      type: d.type,
      startTime: d.startTime,
      bookings: upBookings.filter((b) => b.captureDayId === d.id).length,
      weekStatus: weekStatus.get(d.weekStart) ?? 'draft',
    })),
  };
}

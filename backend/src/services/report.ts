import { Op } from 'sequelize';
import { config } from '../config';
import { addDays, isValidDate, todayIn } from '../dates';
import { Booking, CaptureDay, User } from '../models';
import { loadOrgMaps } from './org';

export interface ReportFilters {
  from: string;
  to: string;
  managerId?: number;
  supervisorId?: number;
  /** all | done | missed | planned */
  status: string;
  /** all | edited | pending  (pending = captured but not edited yet) */
  editing: string;
  q?: string;
}

export interface ReportRow {
  id: number;
  date: string;
  time: string;
  person: string;
  supervisor: string;
  manager: string;
  status: 'planned' | 'done' | 'missed';
  editing: 'edited' | 'pending' | 'na';
  editedOn: string | null;
  videographer: string;
}

export function parseFilters(q: Record<string, unknown>): ReportFilters {
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const to = isValidDate(str(q.to)) ? str(q.to) : todayIn(config.timezone);
  const from = isValidDate(str(q.from)) ? str(q.from) : addDays(to, -29);
  const num = (v: unknown) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : undefined);
  const status = ['done', 'missed', 'planned'].includes(str(q.status)) ? str(q.status) : 'all';
  const editing = ['edited', 'pending'].includes(str(q.editing)) ? str(q.editing) : 'all';
  return {
    from: from <= to ? from : to,
    to,
    managerId: num(q.managerId),
    supervisorId: num(q.supervisorId),
    status,
    editing,
    q: str(q.q).trim().toLowerCase().slice(0, 60) || undefined,
  };
}

export async function runReport(f: ReportFilters) {
  const days = await CaptureDay.findAll({ where: { date: { [Op.between]: [f.from, f.to] }, status: 'active', type: 'sales' }, order: [['date', 'ASC']] });
  const dayMap = new Map(days.map((d) => [d.id, d]));
  const bookings = days.length
    ? await Booking.findAll({ where: { captureDayId: { [Op.in]: days.map((d) => d.id) }, status: { [Op.in]: ['planned', 'done', 'missed'] } } })
    : [];
  const ids = new Set<number>();
  bookings.forEach((b) => ids.add(b.salesId));
  days.forEach((d) => d.videographerId && ids.add(d.videographerId));
  const users = ids.size ? await User.findAll({ where: { id: { [Op.in]: [...ids] } } }) : [];
  const uMap = new Map(users.map((u) => [u.id, u]));
  const { supMap, mgrMap } = await loadOrgMaps();

  let rows: ReportRow[] = bookings.map((b) => {
    const d = dayMap.get(b.captureDayId)!;
    const p = uMap.get(b.salesId);
    const sup = p?.supervisorId ? supMap.get(p.supervisorId) : undefined;
    const mgr = sup ? mgrMap.get(sup.managerId) : undefined;
    return {
      id: b.id,
      date: d.date,
      time: b.startTime,
      person: p?.name ?? 'Unknown',
      supervisor: sup?.name ?? '',
      manager: mgr?.name ?? '',
      status: b.status as ReportRow['status'],
      editing: b.status === 'done' ? (b.editDone ? 'edited' : 'pending') : 'na',
      editedOn: b.editedAt ? b.editedAt.toISOString().slice(0, 10) : null,
      videographer: d.videographerId ? uMap.get(d.videographerId)?.name ?? '' : '',
      _sup: sup?.id,
      _mgr: mgr?.id,
    } as ReportRow & { _sup?: number; _mgr?: number };
  });

  rows = rows.filter((r: any) => {
    if (f.managerId && r._mgr !== f.managerId) return false;
    if (f.supervisorId && r._sup !== f.supervisorId) return false;
    if (f.status !== 'all' && r.status !== f.status) return false;
    if (f.editing === 'edited' && r.editing !== 'edited') return false;
    if (f.editing === 'pending' && r.editing !== 'pending') return false;
    if (f.q && !`${r.person} ${r.supervisor} ${r.manager}`.toLowerCase().includes(f.q)) return false;
    return true;
  });
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.person.localeCompare(b.person));
  rows.forEach((r: any) => {
    delete r._sup;
    delete r._mgr;
  });

  const captured = rows.filter((r) => r.status === 'done').length;
  const missed = rows.filter((r) => r.status === 'missed').length;
  const edited = rows.filter((r) => r.editing === 'edited').length;
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const summary = {
    total: rows.length,
    booked: rows.filter((r) => r.status === 'planned').length,
    captured,
    missed,
    edited,
    pendingEdit: captured - edited,
    captureRate: pct(captured, captured + missed),
    editRate: pct(edited, captured),
  };
  return { filters: f, summary, rows };
}

export const STATUS_TEXT: Record<string, string> = { planned: 'Booked', done: 'Captured', missed: 'Missed' };
export const EDIT_TEXT: Record<string, string> = { edited: 'Edited', pending: 'Not edited', na: '' };

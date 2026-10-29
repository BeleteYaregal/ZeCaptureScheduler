// Date-only helpers (YYYY-MM-DD, company calendar). Times are shown in 24-hour format.
const TZ = 'Africa/Addis_Ababa';
const DAY_MS = 86_400_000;
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const toDate = (s: string) => new Date(s + 'T00:00:00Z');

export function todayStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function nowTimeStr(): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}
export function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = (hhmm || '09:00').split(':').map(Number);
  const total = (h || 0) * 60 + (m || 0) + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}
export function isTimePassed(date: string, time: string, today = todayStr(), nowTime = nowTimeStr()): boolean {
  if (date < today) return true;
  if (date > today) return false;
  return time <= nowTime;
}
export const addDays = (s: string, n: number) => new Date(toDate(s).getTime() + n * DAY_MS).toISOString().slice(0, 10);
export const weekdayIndex = (s: string) => (toDate(s).getUTCDay() + 6) % 7;
export const mondayOf = (s: string) => addDays(s, -weekdayIndex(s));
export const dayNumber = (s: string) => toDate(s).getUTCDate();
export const weekdayName = (s: string) => WEEKDAYS[weekdayIndex(s)];
export const weekdayShort = (s: string) => WEEKDAYS[weekdayIndex(s)].slice(0, 3);
export const monthShort = (s: string) => MONTHS[toDate(s).getUTCMonth()];
export const diffDays = (a: string, b: string) => Math.round((toDate(a).getTime() - toDate(b).getTime()) / DAY_MS);

/** "Thursday 22 Oct" */
export const longDay = (s: string) => `${weekdayName(s)} ${dayNumber(s)} ${monthShort(s)}`;
/** "Thu 22 Oct" */
export const shortDay = (s: string) => `${weekdayShort(s)} ${dayNumber(s)} ${monthShort(s)}`;
/** "19 – 25 Oct" or "27 Oct – 2 Nov" */
export function weekRange(weekStart: string): string {
  const end = addDays(weekStart, 6);
  return monthShort(weekStart) === monthShort(end)
    ? `${dayNumber(weekStart)} – ${dayNumber(end)} ${monthShort(end)}`
    : `${dayNumber(weekStart)} ${monthShort(weekStart)} – ${dayNumber(end)} ${monthShort(end)}`;
}

/** "today", "tomorrow", "in 3 days", "yesterday", "5 days ago" */
export function relativeDay(s: string, today = todayStr()): string {
  const d = diffDays(s, today);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: TZ });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export interface SlotInfo {
  time: string;
  passed: boolean;
  occupied: boolean;
}

export function computeDaySlots(
  startTime: string,
  capacity: number,
  slotMinutes: number,
  occupiedTimes: Set<string>,
  date: string,
  today = todayStr(),
  nowTime = nowTimeStr()
): SlotInfo[] {
  const cap = Math.max(1, capacity || 6);
  const slots: SlotInfo[] = [];
  for (let i = 0; i < cap; i++) {
    const time = addMinutes(startTime || '09:00', i * (slotMinutes || 30));
    const passed = isTimePassed(date, time, today, nowTime);
    const occupied = occupiedTimes.has(time);
    slots.push({ time, passed, occupied });
  }
  return slots;
}


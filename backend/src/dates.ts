// Date-only helpers. All dates are "YYYY-MM-DD" strings in the company's local
// calendar (Africa/Addis_Ababa by default), so there are no timezone surprises.
// Timestamps (createdAt, publishedAt, audit) are stored in UTC by the database.

const DAY_MS = 86_400_000;

export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const toDate = (s: string) => new Date(s + 'T00:00:00Z');
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (s: string, n: number) => fmt(new Date(toDate(s).getTime() + n * DAY_MS));

/** Monday = 0 ... Sunday = 6 */
export const weekdayIndex = (s: string) => (toDate(s).getUTCDay() + 6) % 7;

export const mondayOf = (s: string) => addDays(s, -weekdayIndex(s));

export const diffDays = (a: string, b: string) => Math.round((toDate(a).getTime() - toDate(b).getTime()) / DAY_MS);

export function todayIn(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Tue 28 Oct" */
export function prettyDay(s: string): string {
  const d = toDate(s);
  return `${DAY_NAMES[weekdayIndex(s)]} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
}

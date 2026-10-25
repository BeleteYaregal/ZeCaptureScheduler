/**
 * Pure scheduling algorithm (no database). Given the people to capture and the
 * sales days of a week, decide who is captured on which day and in what order.
 *
 * Goals, in priority order:
 *  1. Fairness  - people captured least recently (or never) are placed first, so
 *                 when capacity is short, the people who waited longest get the slots.
 *  2. Spread    - each supervisor's team (and each manager's group) is spread evenly
 *                 across the days, so no single team is captured all on one day.
 *  3. Balance   - days are loaded evenly and never exceed the per-day cap.
 *  4. Availability - nobody is booked on a day they marked unavailable.
 */

export interface Person {
  id: number;
  supervisorId: number | null;
  managerId: number | null;
  /** Most recent date (YYYY-MM-DD) they were captured or already scheduled, null = never. */
  lastScheduled: string | null;
}

export interface SalesDay {
  key: number | string;
  date: string; // YYYY-MM-DD
}

export type UnplacedReason = 'capacity' | 'unavailable' | 'no_sales_days';

export interface BuildInput {
  people: Person[];
  days: SalesDay[];
  /** Max people per day. null = auto-balance: ceil(people / days). */
  perDayCap: number | null;
  /** personId -> set of dates they cannot be captured. */
  unavailable?: Map<number, Set<string>>;
  /** day key -> places already taken by fixed bookings (supervisor requests). */
  reserved?: Map<number | string, number>;
}

export interface BuildResult {
  cap: number;
  /** day key -> person ids in slot order */
  assignments: Map<number | string, number[]>;
  unplaced: { personId: number; reason: UnplacedReason }[];
}

export function autoCap(peopleCount: number, dayCount: number): number {
  if (dayCount <= 0) return 0;
  return Math.max(1, Math.ceil(peopleCount / dayCount));
}

function byPriority(a: Person, b: Person): number {
  if (a.lastScheduled === b.lastScheduled) return a.id - b.id;
  if (a.lastScheduled === null) return -1; // never captured goes first
  if (b.lastScheduled === null) return 1;
  return a.lastScheduled.localeCompare(b.lastScheduled) || a.id - b.id;
}

/** Interleave people by supervisor so one team is not captured back to back. */
function interleave(list: Person[]): Person[] {
  const groups = new Map<number | string, Person[]>();
  for (const p of list) {
    const k = p.supervisorId ?? 'none';
    const g = groups.get(k);
    if (g) g.push(p);
    else groups.set(k, [p]);
  }
  const queues = [...groups.values()].sort((a, b) => b.length - a.length);
  const out: Person[] = [];
  while (out.length < list.length) {
    for (const q of queues) {
      const next = q.shift();
      if (next) out.push(next);
    }
  }
  return out;
}

export function buildSchedule(input: BuildInput): BuildResult {
  const unavailable = input.unavailable ?? new Map<number, Set<string>>();
  const days = [...input.days].sort((a, b) => a.date.localeCompare(b.date));
  const result: BuildResult = { cap: 0, assignments: new Map(), unplaced: [] };

  if (days.length === 0) {
    result.unplaced = input.people.map((p) => ({ personId: p.id, reason: 'no_sales_days' as const }));
    return result;
  }

  const cap = input.perDayCap ?? autoCap(input.people.length, days.length);
  result.cap = cap;

  const placed: Person[][] = days.map(() => []);
  const taken = (i: number) => placed[i].length + (input.reserved?.get(days[i].key) ?? 0);
  const canUse = (p: Person, i: number) => !unavailable.get(p.id)?.has(days[i].date);
  const countBy = (i: number, pred: (q: Person) => boolean) => placed[i].reduce((n, q) => n + (pred(q) ? 1 : 0), 0);
  const score = (p: Person, i: number) =>
    (p.supervisorId !== null ? countBy(i, (q) => q.supervisorId === p.supervisorId) : 0) * 1_000_000 +
    (p.managerId !== null ? countBy(i, (q) => q.managerId === p.managerId) : 0) * 1_000 +
    placed[i].length;

  let unplaced: Person[] = [];
  for (const p of [...input.people].sort(byPriority)) {
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < days.length; i++) {
      if (taken(i) >= cap || !canUse(p, i)) continue;
      const s = score(p, i);
      if (s < bestScore) {
        best = i;
        bestScore = s;
      }
    }
    if (best >= 0) placed[best].push(p);
    else unplaced.push(p);
  }

  // Repair pass: someone could not be placed only because the days they CAN attend
  // are full, while a free slot exists on a day somebody else could swap to.
  let progress = true;
  while (progress && unplaced.length) {
    progress = false;
    for (const u of [...unplaced]) {
      let done = false;
      for (let i = 0; i < days.length && !done; i++) {
        if (!canUse(u, i)) continue; // u can attend day i, but it is full
        for (const occupant of placed[i]) {
          const j = days.findIndex((_, k) => k !== i && taken(k) < cap && canUse(occupant, k));
          if (j >= 0) {
            placed[i] = placed[i].filter((q) => q.id !== occupant.id);
            placed[j].push(occupant);
            placed[i].push(u);
            unplaced = unplaced.filter((q) => q.id !== u.id);
            done = true;
            progress = true;
            break;
          }
        }
      }
    }
  }

  for (let i = 0; i < days.length; i++) {
    result.assignments.set(days[i].key, interleave(placed[i]).map((p) => p.id));
  }
  result.unplaced = unplaced.map((p) => ({
    personId: p.id,
    reason: days.some((_, i) => canUse(p, i)) ? ('capacity' as const) : ('unavailable' as const),
  }));
  return result;
}

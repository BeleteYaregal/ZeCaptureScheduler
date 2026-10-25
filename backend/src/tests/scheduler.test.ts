import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoCap, buildSchedule, Person, SalesDay } from '../scheduler';
import { addDays, isValidDate, mondayOf, weekdayIndex } from '../dates';

function team(): Person[] {
  // 2 managers (100, 200), 1 supervisor each (10, 20), 12 sales each
  const out: Person[] = [];
  for (let i = 1; i <= 12; i++) out.push({ id: i, supervisorId: 10, managerId: 100, lastScheduled: null });
  for (let i = 13; i <= 24; i++) out.push({ id: i, supervisorId: 20, managerId: 200, lastScheduled: null });
  return out;
}

const fourDays: SalesDay[] = [
  { key: 'mon', date: '2026-10-26' },
  { key: 'tue', date: '2026-10-27' },
  { key: 'thu', date: '2026-10-29' },
  { key: 'fri', date: '2026-10-30' },
];

test('24 people over 4 days: 6 per day, 3 from each supervisor per day', () => {
  const r = buildSchedule({ people: team(), days: fourDays, perDayCap: null });
  assert.equal(r.cap, 6);
  assert.equal(r.unplaced.length, 0);
  for (const d of fourDays) {
    const ids = r.assignments.get(d.key)!;
    assert.equal(ids.length, 6, String(d.key));
    assert.equal(ids.filter((id) => id <= 12).length, 3, `${d.key} supervisor 10`);
    assert.equal(ids.filter((id) => id > 12).length, 3, `${d.key} supervisor 20`);
  }
  const all = [...r.assignments.values()].flat();
  assert.equal(new Set(all).size, 24, 'nobody booked twice');
});

test('slot order alternates between supervisors', () => {
  const r = buildSchedule({ people: team(), days: fourDays, perDayCap: null });
  const ids = r.assignments.get('mon')!;
  for (let i = 1; i < ids.length; i++) {
    const a = ids[i - 1] <= 12 ? 10 : 20;
    const b = ids[i] <= 12 ? 10 : 20;
    assert.notEqual(a, b, 'neighbours come from different teams');
  }
});

test('when capacity is short, the longest-waiting people are placed first', () => {
  const people = team().map((p) => ({
    ...p,
    lastScheduled: p.id <= 8 ? '2026-10-19' : p.id <= 16 ? '2026-10-05' : null,
  }));
  // 4 days x 4 people = 16 slots for 24 people
  const r = buildSchedule({ people, days: fourDays, perDayCap: 4 });
  const placed = new Set([...r.assignments.values()].flat());
  assert.equal(placed.size, 16);
  // never-captured (17..24) and oldest (9..16) get in; the recently captured (1..8) wait
  for (let id = 9; id <= 24; id++) assert.ok(placed.has(id), `person ${id} should be placed`);
  for (let id = 1; id <= 8; id++) assert.ok(!placed.has(id), `person ${id} should wait`);
  assert.equal(r.unplaced.length, 8);
  assert.ok(r.unplaced.every((u) => u.reason === 'capacity'));
});

test('unavailable dates are respected', () => {
  const unavailable = new Map<number, Set<string>>([[1, new Set(['2026-10-26', '2026-10-27'])]]);
  const r = buildSchedule({ people: team(), days: fourDays, perDayCap: null, unavailable });
  const day = [...r.assignments.entries()].find(([, ids]) => ids.includes(1))![0];
  assert.ok(day === 'thu' || day === 'fri');
  assert.equal(r.unplaced.length, 0);
});

test('repair pass places a constrained person by moving someone else', () => {
  // 4 people, 2 days, cap 2. Persons 1 and 2 can only attend day B. Persons 3 and 4 are free.
  const people: Person[] = [1, 2, 3, 4].map((id) => ({ id, supervisorId: 1, managerId: 1, lastScheduled: null }));
  const days: SalesDay[] = [
    { key: 'A', date: '2026-10-26' },
    { key: 'B', date: '2026-10-27' },
  ];
  const unavailable = new Map<number, Set<string>>([
    [1, new Set(['2026-10-26'])],
    [2, new Set(['2026-10-26'])],
  ]);
  const r = buildSchedule({ people, days, perDayCap: 2, unavailable });
  assert.equal(r.unplaced.length, 0);
  assert.deepEqual([...r.assignments.get('B')!].sort(), [1, 2]);
  assert.deepEqual([...r.assignments.get('A')!].sort(), [3, 4]);
});

test('someone unavailable on every sales day is reported as unavailable', () => {
  const unavailable = new Map<number, Set<string>>([[5, new Set(fourDays.map((d) => d.date))]]);
  const r = buildSchedule({ people: team(), days: fourDays, perDayCap: null, unavailable });
  assert.deepEqual(r.unplaced, [{ personId: 5, reason: 'unavailable' }]);
});

test('fewer people than days leaves some days empty without errors', () => {
  const people = team().slice(0, 2);
  const r = buildSchedule({ people, days: fourDays, perDayCap: null });
  assert.equal(r.cap, 1);
  assert.equal(r.unplaced.length, 0);
  assert.equal([...r.assignments.values()].flat().length, 2);
});

test('no sales days: nobody can be placed', () => {
  const r = buildSchedule({ people: team(), days: [], perDayCap: null });
  assert.equal(r.unplaced.length, 24);
  assert.ok(r.unplaced.every((u) => u.reason === 'no_sales_days'));
});

test('empty team is fine', () => {
  const r = buildSchedule({ people: [], days: fourDays, perDayCap: null });
  assert.equal(r.unplaced.length, 0);
});

test('generating twice gives the same result (deterministic)', () => {
  const a = buildSchedule({ people: team(), days: fourDays, perDayCap: null });
  const b = buildSchedule({ people: team(), days: fourDays, perDayCap: null });
  assert.deepEqual([...a.assignments.entries()], [...b.assignments.entries()]);
});

test('autoCap', () => {
  assert.equal(autoCap(24, 4), 6);
  assert.equal(autoCap(25, 4), 7);
  assert.equal(autoCap(0, 4), 1);
  assert.equal(autoCap(10, 0), 0);
});

test('date helpers', () => {
  assert.equal(mondayOf('2026-10-22'), '2026-10-19'); // Thursday -> Monday
  assert.equal(mondayOf('2026-10-25'), '2026-10-19'); // Sunday -> Monday
  assert.equal(weekdayIndex('2026-10-19'), 0);
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.ok(isValidDate('2026-02-28'));
  assert.ok(!isValidDate('2026-02-30'));
  assert.ok(!isValidDate('2026-13-01'));
  assert.ok(!isValidDate('hello'));
});

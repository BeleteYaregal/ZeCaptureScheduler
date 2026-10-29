'use client';
import { useState } from 'react';
import { useAuth } from '@/components/Auth';
import { IconChevronL, IconChevronR, IconEmpty } from '@/components/Icons';
import { Empty, ErrorBox, Loading, Notice, Sheet, useToast } from '@/components/ui';
import { api, emitDataChanged, useFetch } from '@/lib/api';
import { addDays, addMinutes, computeDaySlots, longDay, mondayOf, nowTimeStr, todayStr, weekdayIndex, weekRange } from '@/lib/dates';
import type { DayView, NotificationItem, WeekView } from '@/lib/types';

interface Member {
  id: number;
  name: string;
  active: boolean;
}

export default function BookPage() {
  const { user } = useAuth();
  const toast = useToast();
  const today = todayStr();
  const [weekStart, setWeekStart] = useState(weekdayIndex(today) >= 5 ? addDays(mondayOf(today), 7) : mondayOf(today));
  const [pick, setPick] = useState<DayView | null>(null);
  const week = useFetch<WeekView>(`/api/weeks/${weekStart}`);
  const team = useFetch<{ members: Member[]; perDay: number }>('/api/team/members');
  const alerts = useFetch<{ items: NotificationItem[] }>('/api/notifications?limit=5');
  if (!user || user.role !== 'supervisor') return null;

  const recentDecline = alerts.data?.items.find((n) => n.title === 'Request declined');
  const data = week.data;
  const limit = data?.limits.supervisorMaxPerDay ?? team.data?.perDay ?? 0;
  const slotMinutes = data?.limits.slotMinutes ?? 30;
  const days = (data?.days ?? []).filter((d) => d.type === 'sales' && d.status === 'active' && d.date >= today);
  const bookedThisWeek = new Set((data?.days ?? []).flatMap((d) => d.bookings.filter((b) => b.status !== 'rescheduled').map((b) => b.person.id)));
  const reload = () => week.reload();

  async function withdraw(id: number) {
    try {
      await api(`/api/team/requests/${id}`, { method: 'DELETE' });
      toast('Removed');
      emitDataChanged();
      reload();
    } catch (e: any) {
      toast(e.message);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="title">Book your team</h1>
          <p className="subtitle">
            Up to {limit} people per day. The marketing manager approves each request.
          </p>
        </div>
      </div>

      {recentDecline && (
        <Notice kind="info">
          <strong>Notice from manager:</strong> {recentDecline.body}
        </Notice>
      )}

      <div className="weeknav">
        <button className="iconbtn" aria-label="Previous week" disabled={weekStart <= mondayOf(today)} onClick={() => setWeekStart(addDays(weekStart, -7))}>
          <IconChevronL />
        </button>
        <span className="range num">{weekRange(weekStart)}</span>
        <button className="iconbtn" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          <IconChevronR />
        </button>
      </div>

      {week.error && <ErrorBox message={week.error} onRetry={reload} />}
      {week.loading && !data && <Loading rows={2} />}

      {data && days.length === 0 && (
        <div className="sheet">
          <Empty icon={<IconEmpty />} title="No open days left this week" text="Days that already passed are not shown. Use the arrows to see the next weeks." />
        </div>
      )}

      {days.map((d) => {
        const mine = d.bookings.filter((b) => b.status !== 'rescheduled');
        const dayFull = d.capacity !== null && (d.load ?? 0) >= d.capacity;
        const limitHit = mine.length >= limit;
        const gap = d.slotMinutes ?? slotMinutes;
        const occupied = new Set(d.occupiedSlots ?? d.bookings.filter((b) => b.status !== 'rescheduled').map((b) => b.startTime));
        const daySlots = computeDaySlots(d.startTime, d.capacity ?? 8, gap, occupied, d.date, today, nowTimeStr());
        const openSlots = daySlots.filter((s) => !s.passed && !s.occupied);
        const allSlotsPassed = daySlots.length > 0 && daySlots.every((s) => s.passed);
        const timePassed = d.date < today || (d.date === today && (allSlotsPassed || openSlots.length === 0));
        const nextSlot = d.nextSlotTime ?? openSlots[0]?.time ?? d.startTime ?? '09:00';
        return (
          <div key={d.id} className="list" style={{ marginBottom: 14 }}>
            <div className="group-head">
              <div>
                <div className="name">{longDay(d.date)}</div>
                <div className="small muted">
                  {timePassed
                    ? 'All slots have passed'
                    : dayFull
                    ? 'Day is full'
                    : limitHit
                    ? `Your ${mine.length} ${mine.length === 1 ? 'request' : 'requests'} booked`
                    : `Next available: ${nextSlot} (${gap} min)`}
                </div>
              </div>
              <button className="btn btn-primary btn-sm" disabled={timePassed || dayFull || limitHit} onClick={() => setPick(d)}>
                {timePassed ? 'Passed' : limitHit ? 'Limit reached' : dayFull ? 'Full' : 'Request'}
              </button>
            </div>
            {mine.length === 0 && <p className="pad muted small">Nobody from your team booked yet.</p>}
            {mine.map((b) => (
              <div key={b.id} className="row">
                <div className="grow">
                  <div className="name">{b.person.name}</div>
                  <div className="small muted">Slot at {b.startTime}</div>
                </div>
                <span className={`pill ${b.status === 'requested' ? '' : `pill-${b.status === 'planned' ? 'sales' : b.status}`}`}>
                  {b.status === 'requested' ? 'Pending approval' : b.status === 'planned' ? 'Approved' : b.status === 'done' ? 'Done' : 'Missed'}
                </span>
                {(b.status === 'requested' || b.status === 'planned') && (
                  <button className="btn btn-ghost btn-sm" onClick={() => withdraw(b.id)}>
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        );
      })}

      {pick && (
        <RequestSheet
          day={pick}
          members={(team.data?.members ?? []).filter((m) => m.active)}
          busy={bookedThisWeek}
          room={Math.max(0, limit - pick.bookings.filter((b) => b.status !== 'rescheduled').length)}
          slotMinutes={pick.slotMinutes ?? slotMinutes}
          onClose={() => setPick(null)}
          onDone={() => {
            setPick(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function RequestSheet({
  day,
  members,
  busy,
  room,
  slotMinutes = 30,
  onClose,
  onDone,
}: {
  day: DayView;
  members: Member[];
  busy: Set<number>;
  room: number;
  slotMinutes?: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [sel, setSel] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);

  const today = todayStr();
  const nowTime = nowTimeStr();
  const gap = slotMinutes || day.slotMinutes || 30;
  const occupied = new Set(day.occupiedSlots ?? day.bookings.filter((b) => b.status !== 'rescheduled').map((b) => b.startTime));
  const slots = computeDaySlots(day.startTime, day.capacity ?? 8, gap, occupied, day.date, today, nowTime);
  const openSlots = slots.filter((s) => !s.passed && !s.occupied);
  const firstSlot = day.nextSlotTime ?? openSlots[0]?.time ?? day.startTime ?? '09:00';

  const allPassed = slots.length > 0 && slots.every((s) => s.passed);
  const toggle = (id: number) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < room ? [...s, id] : s));

  // Compute consecutive slots for each selected person, increasing based on the gap!
  const assignedSlots: string[] = [];
  if (firstSlot && sel.length > 0) {
    let cur = firstSlot;
    const occ = new Set(occupied);
    for (let i = 0; i < sel.length; i++) {
      assignedSlots.push(cur);
      occ.add(cur);
      let next = addMinutes(cur, gap);
      while (occ.has(next)) next = addMinutes(next, gap);
      cur = next;
    }
  }

  async function send() {
    if (allPassed) {
      setErrs([`All capture slots for ${longDay(day.date)} have already passed.`]);
      return;
    }
    setSaving(true);
    setErrs([]);
    try {
      const r = await api<{ created: unknown[]; failed: { name: string; error: string }[] }>('/api/team/requests', {
        method: 'POST',
        body: { salesIds: sel, captureDayId: day.id, startTime: firstSlot },
      });
      if (r.failed.length) setErrs(r.failed.map((f) => `${f.name}: ${f.error}`));
      if (r.created.length) toast(`${r.created.length} sent for approval`);
      if (!r.failed.length) {
        emitDataChanged();
        onDone();
      } else if (r.created.length) {
        emitDataChanged();
        setSel([]);
      }
    } catch (e: any) {
      setErrs([e.message]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet title={`Request ${longDay(day.date)}`} subtitle={`You can add ${room} more ${room === 1 ? 'person' : 'people'} on this day.`} onClose={errs.length ? onDone : onClose}>
      {allPassed && (
        <Notice kind="error">
          All capture slots for this day have already passed. Please close and select another day.
        </Notice>
      )}
      {errs.map((e, i) => (
        <Notice key={i} kind="error">
          {e}
        </Notice>
      ))}

      {!allPassed && (
        <div style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--surface-2, rgba(0,0,0,0.04))', borderRadius: 8 }}>
          <div className="small" style={{ fontWeight: 600 }}>
            {sel.length === 0 ? (
              <span className="muted">Next available slot starts at <strong>{firstSlot}</strong> ({gap} min per capture)</span>
            ) : sel.length === 1 ? (
              <span>Requested slot: <strong style={{ color: 'var(--indigo-strong, #4f46e5)' }}>{assignedSlots[0]}</strong></span>
            ) : (
              <span>
                Requested slots ({gap} min gap):{' '}
                <strong style={{ color: 'var(--indigo-strong, #4f46e5)' }}>{assignedSlots.join(', ')}</strong>
              </span>
            )}
          </div>
        </div>
      )}

      <div className="list">
        {members.length === 0 && <p className="pad muted">Register your salespeople in My team first.</p>}
        {members.map((m) => {
          const taken = busy.has(m.id);
          return (
            <label key={m.id} className="row" style={{ opacity: taken ? 0.5 : 1 }}>
              <input type="checkbox" checked={sel.includes(m.id)} disabled={allPassed || taken || (!sel.includes(m.id) && sel.length >= room)} onChange={() => toggle(m.id)} />
              <div className="grow name">{m.name}</div>
              {taken && <span className="small muted">Already booked this week</span>}
            </label>
          );
        })}
      </div>
      <div style={{ height: 12 }} />
      <button className="btn btn-primary btn-block" disabled={allPassed || saving || sel.length === 0} onClick={send}>
        {allPassed
          ? 'Time has passed'
          : saving
          ? 'Sending…'
          : sel.length <= 1
          ? `Send request${sel.length === 1 ? ` for ${assignedSlots[0]}` : ''}`
          : `Send ${sel.length} requests (${assignedSlots[0]} – ${assignedSlots[assignedSlots.length - 1]})`}
      </button>
    </Sheet>
  );
}

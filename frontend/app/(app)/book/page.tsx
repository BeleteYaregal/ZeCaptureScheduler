'use client';
import { useState } from 'react';
import { useAuth } from '@/components/Auth';
import { IconChevronL, IconChevronR, IconEmpty } from '@/components/Icons';
import { Empty, ErrorBox, Loading, Notice, Sheet, useToast } from '@/components/ui';
import { api, useFetch } from '@/lib/api';
import { addDays, addMinutes, isTimePassed, longDay, mondayOf, nowTimeStr, todayStr, weekdayIndex, weekRange } from '@/lib/dates';
import type { DayView, WeekView } from '@/lib/types';

interface Member {
  id: number;
  name: string;
  active: boolean;
}

export default function BookPage() {
  const { user } = useAuth();
  const toast = useToast();
  const today = todayStr();
  const [weekStart, setWeekStart] = useState(weekdayIndex(today) >= 5 ? addDays(mondayOf(today), 7) : mondayOf(today)); // from Saturday on, start with next week
  const [pick, setPick] = useState<DayView | null>(null);
  const week = useFetch<WeekView>(`/api/weeks/${weekStart}`);
  const team = useFetch<{ members: Member[]; perDay: number }>('/api/team/members');
  if (!user || user.role !== 'supervisor') return null;

  const data = week.data;
  const limit = data?.limits.supervisorMaxPerDay ?? team.data?.perDay ?? 0;
  const days = (data?.days ?? []).filter((d) => d.type === 'sales' && d.status === 'active' && d.date >= today);
  const bookedThisWeek = new Set((data?.days ?? []).flatMap((d) => d.bookings.filter((b) => b.status !== 'rescheduled').map((b) => b.person.id)));
  const reload = () => week.reload();

  async function withdraw(id: number) {
    try {
      await api(`/api/team/requests/${id}`, { method: 'DELETE' });
      toast('Removed');
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
        const nextSlotTime = addMinutes(d.startTime || '09:00', (d.load ?? 0) * 30);
        const timePassed = isTimePassed(d.date, nextSlotTime, today, nowTimeStr());
        return (
          <div key={d.id} className="list" style={{ marginBottom: 14 }}>
            <div className="group-head">
              <div>
                <div className="name">{longDay(d.date)}</div>
                <div className="small muted">
                  Your team {mine.length}/{limit} · Day {d.load ?? 0}/{d.capacity ?? '–'}
                  {timePassed && ' · Time passed'}
                </div>
              </div>
              <button className="btn btn-primary btn-sm" disabled={timePassed || dayFull || limitHit} onClick={() => setPick(d)}>
                {timePassed ? 'Time passed' : limitHit ? 'Your limit' : dayFull ? 'Day full' : 'Request'}
              </button>
            </div>
            {mine.length === 0 && <p className="pad muted small">Nobody from your team yet.</p>}
            {mine.map((b) => (
              <div key={b.id} className="row">
                <div className="grow name">{b.person.name}</div>
                <span className={`pill ${b.status === 'requested' ? '' : `pill-${b.status === 'planned' ? 'sales' : b.status}`}`}>
                  {b.status === 'requested' ? 'Waiting for approval' : b.status === 'planned' ? 'Approved' : b.status === 'done' ? 'Done' : 'Missed'}
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

function RequestSheet({ day, members, busy, room, onClose, onDone }: { day: DayView; members: Member[]; busy: Set<number>; room: number; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [sel, setSel] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);
  const nextSlotTime = addMinutes(day.startTime || '09:00', (day.load ?? 0) * 30);
  const isPassed = isTimePassed(day.date, nextSlotTime);
  const toggle = (id: number) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < room ? [...s, id] : s));

  async function send() {
    if (isPassed) {
      setErrs([`The available slot time on ${longDay(day.date)} (${nextSlotTime}) has already passed.`]);
      return;
    }
    setSaving(true);
    setErrs([]);
    try {
      const r = await api<{ created: unknown[]; failed: { name: string; error: string }[] }>('/api/team/requests', { method: 'POST', body: { salesIds: sel, captureDayId: day.id } });
      if (r.failed.length) setErrs(r.failed.map((f) => `${f.name}: ${f.error}`));
      if (r.created.length) toast(`${r.created.length} sent for approval`);
      if (!r.failed.length) onDone();
      else if (r.created.length) setSel([]);
    } catch (e: any) {
      setErrs([e.message]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet title={`Request ${longDay(day.date)}`} subtitle={`You can add ${room} more ${room === 1 ? 'person' : 'people'} on this day.`} onClose={errs.length ? onDone : onClose}>
      {isPassed && (
        <Notice kind="error">
          The capture time for this day ({nextSlotTime}) has already passed. Please close and select an upcoming day.
        </Notice>
      )}
      {errs.map((e, i) => (
        <Notice key={i} kind="error">
          {e}
        </Notice>
      ))}
      <div className="list">
        {members.length === 0 && <p className="pad muted">Register your salespeople in My team first.</p>}
        {members.map((m) => {
          const taken = busy.has(m.id);
          return (
            <label key={m.id} className="row" style={{ opacity: taken ? 0.5 : 1 }}>
              <input type="checkbox" checked={sel.includes(m.id)} disabled={isPassed || taken || (!sel.includes(m.id) && sel.length >= room)} onChange={() => toggle(m.id)} />
              <div className="grow name">{m.name}</div>
              {taken && <span className="small muted">Already booked this week</span>}
            </label>
          );
        })}
      </div>
      <div style={{ height: 12 }} />
      <button className="btn btn-primary btn-block" disabled={isPassed || saving || sel.length === 0} onClick={send}>
        {isPassed ? 'Time has passed' : `Send ${sel.length || ''} ${sel.length === 1 ? 'request' : 'requests'}`}
      </button>
    </Sheet>
  );
}

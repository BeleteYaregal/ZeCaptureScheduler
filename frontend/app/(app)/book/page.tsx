'use client';
import { useState } from 'react';
import { useAuth } from '@/components/Auth';
import { IconChevronL, IconChevronR, IconEmpty } from '@/components/Icons';
import { Empty, ErrorBox, Loading, Notice, Sheet, useToast } from '@/components/ui';
import { api, useFetch } from '@/lib/api';
import { addDays, longDay, mondayOf, todayStr, weekRange } from '@/lib/dates';
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
  const [weekStart, setWeekStart] = useState(mondayOf(today));
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
            Up to {limit} people per day. The admin approves each request.
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
          <Empty icon={<IconEmpty />} title="No open days this week" text="When the admin plans sales days for this week, you can request slots here." />
        </div>
      )}

      {days.map((d) => {
        const mine = d.bookings.filter((b) => b.status !== 'rescheduled');
        const dayFull = d.capacity !== null && (d.load ?? 0) >= d.capacity;
        const limitHit = mine.length >= limit;
        return (
          <div key={d.id} className="list" style={{ marginBottom: 14 }}>
            <div className="group-head">
              <div>
                <div className="name">{longDay(d.date)}</div>
                <div className="small muted">
                  Your team {mine.length}/{limit} · Day {d.load ?? 0}/{d.capacity ?? '–'}
                </div>
              </div>
              <button className="btn btn-primary btn-sm" disabled={dayFull || limitHit} onClick={() => setPick(d)}>
                {limitHit ? 'Your limit' : dayFull ? 'Day full' : 'Request'}
              </button>
            </div>
            {mine.length === 0 && <p className="pad muted small">Nobody from your team yet.</p>}
            {mine.map((b) => (
              <div key={b.id} className="row">
                <div className="grow name">{b.person.name}</div>
                <span className={`pill ${b.status === 'requested' ? '' : `pill-${b.status === 'planned' ? 'sales' : b.status}`}`}>
                  {b.status === 'requested' ? 'Waiting for admin' : b.status === 'planned' ? 'Approved' : b.status === 'done' ? 'Done' : 'Missed'}
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
  const toggle = (id: number) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < room ? [...s, id] : s));

  async function send() {
    setSaving(true);
    setErrs([]);
    try {
      const r = await api<{ created: unknown[]; failed: { name: string; error: string }[] }>('/api/team/requests', { method: 'POST', body: { salesIds: sel, captureDayId: day.id } });
      if (r.failed.length) setErrs(r.failed.map((f) => `${f.name}: ${f.error}`));
      if (r.created.length) toast(`${r.created.length} sent to the admin`);
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
              <input type="checkbox" checked={sel.includes(m.id)} disabled={taken || (!sel.includes(m.id) && sel.length >= room)} onChange={() => toggle(m.id)} />
              <div className="grow name">{m.name}</div>
              {taken && <span className="small muted">Already booked this week</span>}
            </label>
          );
        })}
      </div>
      <div style={{ height: 12 }} />
      <button className="btn btn-primary btn-block" disabled={saving || sel.length === 0} onClick={send}>
        Send {sel.length || ''} {sel.length === 1 ? 'request' : 'requests'}
      </button>
    </Sheet>
  );
}

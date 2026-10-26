'use client';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { longDay, shortDay, todayStr } from '@/lib/dates';
import { STATUS_LABEL } from '@/lib/labels';
import type { BookingView, DayView, Role, WeekView } from '@/lib/types';
import { IconCheck, IconChevronR, IconDown, IconMove, IconPhone, IconPlus, IconSwap, IconTrash, IconUp, IconWarn, IconX, IconWand } from './Icons';
import { Notice, Sheet, useToast } from './ui';

const OVERRIDABLE = ['DAY_FULL', 'UNAVAILABLE', 'ALREADY_BOOKED_THIS_WEEK'];

interface Props {
  day: DayView;
  week: WeekView;
  role: Role;
  userId: number;
  published: boolean;
  onChanged: () => void;
  /** Start in the manager > supervisor grouping (used for the videographer). */
  defaultGrouped?: boolean;
}

const PAGE = 10;

export default function DaySheet({ day, week, role, userId, published, onChanged, defaultGrouped }: Props) {
  const [grouped, setGrouped] = useState(!!defaultGrouped);
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<BookingView | null>(null);
  const [dayMenu, setDayMenu] = useState<null | 'add' | 'cancel'>(null);
  const isAdmin = role === 'admin';
  const today = todayStr();
  const live = day.bookings.filter((b) => b.status !== 'rescheduled');
  const cancelled = day.status === 'cancelled';

  const groups = useMemo(() => {
    const byMgr = new Map<string, Map<string, BookingView[]>>();
    for (const b of live) {
      const m = b.person.managerName ?? 'No sales manager';
      const s = b.person.supervisorName ?? 'No supervisor';
      if (!byMgr.has(m)) byMgr.set(m, new Map());
      const sm = byMgr.get(m)!;
      if (!sm.has(s)) sm.set(s, []);
      sm.get(s)!.push(b);
    }
    return [...byMgr.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([manager, sups]) => ({
        manager,
        count: [...sups.values()].reduce((n, l) => n + l.length, 0),
        sups: [...sups.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([name, list]) => ({ name, list: list.sort((a, b) => a.startTime.localeCompare(b.startTime)) })),
      }));
  }, [live]);

  // "By team" view shows the same first N people, so both views page the same way.
  const shownGroups = useMemo(() => {
    let left = shown;
    return groups
      .map((g) => ({
        ...g,
        sups: g.sups
          .map((s) => {
            const list = s.list.slice(0, Math.max(0, left));
            left -= list.length;
            return { ...s, list, total: s.list.length };
          })
          .filter((s) => s.list.length > 0),
      }))
      .filter((g) => g.sups.length > 0);
  }, [groups, shown]);
  const hidden = Math.max(0, live.length - shown);

  const canOpen = (isAdmin || role === 'videographer') && !cancelled;
  const toast = useToast();
  const canTick = published && !cancelled && (isAdmin || role === 'videographer');
  async function tick(b: BookingView, status: 'done' | 'missed') {
    try {
      await api(`/api/bookings/${b.id}/status`, { method: 'PATCH', body: { status, reschedule: false } });
      toast(status === 'done' ? 'Marked as done' : 'Marked as missed');
      onChanged();
    } catch (e: any) {
      toast(e.message || 'Could not save');
    }
  }

  async function setEdit(b: BookingView, done: boolean) {
    try {
      await api(`/api/bookings/${b.id}/editing`, { method: 'PATCH', body: { done } });
      toast(done ? 'Video editing marked as done' : 'Video editing set back to not done');
      onChanged();
    } catch (e: any) {
      toast(e.message || 'Could not save');
    }
  }

  return (
    <section className="sheet" aria-label={longDay(day.date)}>
      <div className="sheet-head">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <h2 className="day">{longDay(day.date)}</h2>
          {cancelled ? (
            <span className="pill pill-missed">Cancelled</span>
          ) : (
            <span className={`pill ${day.type === 'sales' ? 'pill-sales' : 'pill-company'}`}>{day.type === 'sales' ? 'Sales day' : 'Company day'}</span>
          )}
        </div>
        <div className="callbar">
          <span>
            Call time <b className="num">{day.startTime}</b>
          </span>
          {day.type === 'sales' && !cancelled && role !== 'sales' && (
            <span>
              <b className="num">{live.length}</b>
              {day.capacity ? ` of ${day.capacity}` : ''} people
            </span>
          )}
          {day.videographer && <span>{day.videographer.name}</span>}
        </div>
        {day.note && <p className="muted small">{day.note}</p>}
        {day.type === 'sales' && !cancelled && live.length > 1 && (
          <div className="seg" role="group" aria-label="Group the list">
            <button aria-pressed={!grouped} onClick={() => setGrouped(false)}>
              By time
            </button>
            <button aria-pressed={grouped} onClick={() => setGrouped(true)}>
              By team
            </button>
          </div>
        )}
      </div>

      {cancelled ? (
        <p className="pad muted">This day was cancelled. Anyone booked on it was moved to another day or will get a new date.</p>
      ) : day.type === 'company' ? (
        <p className="pad muted">Company content day. Nobody from sales is booked.</p>
      ) : live.length === 0 ? (
        <p className="pad muted">{role === 'sales' ? 'You are not booked on this day.' : isAdmin ? 'Nobody is booked on this day yet.' : 'Nobody is booked on this day.'}</p>
      ) : grouped ? (
        shownGroups.map((g) => (
          <div key={g.manager}>
            <div className="group-head">
              <span className="name">{g.manager}</span>
              <span className="pill">{g.count}</span>
            </div>
            {g.sups.map((s) => (
              <div key={s.name}>
                <div className="subhead">
                  <span>{s.name}</span>
                  <span className="faint num">{s.total}</span>
                </div>
                <ul className="slots">
                  {s.list.map((b) => (
                    <SlotRow key={b.id} b={b} mine={b.person.id === userId} onOpen={canOpen ? () => setOpen(b) : undefined} onTick={canTick ? (s) => tick(b, s) : undefined} onEdit={canTick ? (d) => setEdit(b, d) : undefined} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))
      ) : (
        <ul className="slots">
          {live.slice(0, shown).map((b) => (
            <SlotRow key={b.id} b={b} mine={b.person.id === userId} showTeam onOpen={canOpen ? () => setOpen(b) : undefined} onTick={canTick ? (s) => tick(b, s) : undefined} onEdit={canTick ? (d) => setEdit(b, d) : undefined} />
          ))}
        </ul>
      )}

      {hidden > 0 && !cancelled && day.type === 'sales' && (
        <div className="pad" style={{ paddingTop: 4 }}>
          <button className="btn btn-soft btn-block" onClick={() => setShown((n) => n + PAGE)}>
            Show more ({hidden} left)
          </button>
        </div>
      )}

      {isAdmin && !cancelled && (
        <div className="sheet-foot">
          {day.type === 'sales' && (
            <button className="btn btn-soft btn-sm" onClick={() => setDayMenu('add')}>
              <IconPlus /> Add person
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setDayMenu('cancel')}>
            Cancel this day
          </button>
        </div>
      )}

      {open && (
        <BookingMenu
          booking={open}
          day={day}
          week={week}
          role={role}
          published={published}
          today={today}
          onClose={() => setOpen(null)}
          onChanged={onChanged}
        />
      )}
      {dayMenu === 'add' && <AddPerson day={day} week={week} onClose={() => setDayMenu(null)} onChanged={onChanged} />}
      {dayMenu === 'cancel' && <CancelDay day={day} onClose={() => setDayMenu(null)} onChanged={onChanged} />}
    </section>
  );
}

/* ------------------------------------------------------------ one row on the timeline */

function SlotRow({ b, mine, showTeam, onOpen, onTick, onEdit }: { b: BookingView; mine: boolean; showTeam?: boolean; onOpen?: () => void; onTick?: (s: 'done' | 'missed') => void; onEdit?: (done: boolean) => void }) {
  const inner = (
    <>
      <span className="time num">{b.startTime}</span>
      <span className="rail">
        <span className="node" />
      </span>
      <span>
        <span className="who">{b.person.name}</span>
        {showTeam && b.person.supervisorName && (
          <span className="sup" style={{ display: 'block' }}>
            {b.person.managerName ? `${b.person.managerName} · ${b.person.supervisorName}` : b.person.supervisorName}
          </span>
        )}
      </span>
      <span className="acts">
        {b.status !== 'planned' && <span className={`pill pill-${b.status}`}>{STATUS_LABEL[b.status]}</span>}
        {b.status === 'done' && <span className={`pill ${b.editDone ? 'pill-done' : ''}`}>{b.editDone ? 'Video edited' : 'Awaiting edit'}</span>}
        {mine && b.status === 'planned' && <span className="pill pill-sales">You</span>}
        {onOpen && <IconChevronR className="chev" />}
      </span>
    </>
  );
  return (
    <li>
      {onOpen ? (
        <button className="slot" data-status={b.status} data-mine={mine} onClick={onOpen} aria-label={`${b.person.name}, ${b.startTime}`}>
          {inner}
        </button>
      ) : (
        <div className="slot" data-status={b.status} data-mine={mine}>
          {inner}
        </div>
      )}
      {onTick && b.status === 'planned' && (
        <div className="tickrow">
          <button className="btn btn-good btn-sm" onClick={() => onTick('done')}>
            <IconCheck /> Done
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => onTick('missed')}>
            <IconX /> Missed
          </button>
        </div>
      )}
      {onEdit && b.status === 'done' && (
        <div className="tickrow">
          <button className={`btn btn-sm ${b.editDone ? 'btn-ghost' : 'btn-soft'}`} onClick={() => onEdit(!b.editDone)}>
            <IconCheck /> {b.editDone ? 'Editing done. Undo' : 'Mark video edited'}
          </button>
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------ action helper */

function useAct(onChanged: () => void, close: () => void) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; code?: string } | null>(null);
  async function run<T>(fn: () => Promise<T>, ok: string | ((r: T) => string), closeAfter = true) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fn();
      toast(typeof ok === 'function' ? ok(r) : ok);
      onChanged();
      if (closeAfter) close();
      return r;
    } catch (e: any) {
      setErr({ message: e.message || 'Something went wrong', code: e.code });
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  return { busy, err, run, setErr };
}

function ErrorWithOverride({ err, onForce, busy }: { err: { message: string; code?: string }; onForce?: () => void; busy: boolean }) {
  return (
    <Notice
      kind="error"
      action={
        onForce && err.code && OVERRIDABLE.includes(err.code) ? (
          <button className="btn btn-sm btn-danger" onClick={onForce} disabled={busy}>
            Do it anyway
          </button>
        ) : undefined
      }
    >
      {err.message}
    </Notice>
  );
}

/* ------------------------------------------------------------ menu for one booking */

type Mode = 'menu' | 'move' | 'swap' | 'remove';

function BookingMenu({
  booking,
  day,
  week,
  role,
  published,
  today,
  onClose,
  onChanged,
}: {
  booking: BookingView;
  day: DayView;
  week: WeekView;
  role: Role;
  published: boolean;
  today: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<Mode>('menu');
  const { busy, err, run, setErr } = useAct(onChanged, onClose);
  const isAdmin = role === 'admin';
  const planned = booking.status === 'planned';
  const canMark = published && (isAdmin || role === 'videographer');
  const otherDays = week.days.filter((d) => d.type === 'sales' && d.status === 'active' && d.id !== day.id);

  const mark = (status: 'done' | 'missed' | 'planned', reschedule = false) =>
    run(
      () => api<any>(`/api/bookings/${booking.id}/status`, { method: 'PATCH', body: { status, reschedule } }),
      (r) =>
        status === 'done'
          ? 'Marked as done'
          : status === 'planned'
            ? 'Set back to booked'
            : r.triedReschedule
              ? r.rescheduled
                ? `Missed. Rebooked for ${shortDay(r.rescheduled.date)} at ${r.rescheduled.startTime}`
                : 'Missed. No free day to rebook, add a sales day'
              : 'Marked as missed'
    );

  const rebook = () =>
    run(
      () => api<any>(`/api/bookings/${booking.id}/reschedule`, { method: 'POST' }),
      (r) => (r.placed ? `Rebooked for ${shortDay(r.rescheduled.date)} at ${r.rescheduled.startTime}` : 'No free day found. Add a sales day first.')
    );

  if (mode === 'move') {
    return (
      <Sheet title="Move to another day" subtitle={booking.person.name} onClose={onClose}>
        {otherDays.length === 0 ? (
          <Notice kind="info">There is no other sales day this week.</Notice>
        ) : (
          <DayPicker
            days={otherDays}
            busy={busy}
            err={err}
            onPick={(d, override) =>
              run(
                () => api(`/api/bookings/${booking.id}/move`, { method: 'PATCH', body: { captureDayId: d.id, override } }),
                `Moved to ${shortDay(d.date)}`
              )
            }
          />
        )}
        <div style={{ height: 12 }} />
        <button className="btn btn-ghost btn-block" onClick={() => (setErr(null), setMode('menu'))}>
          Back
        </button>
      </Sheet>
    );
  }

  if (mode === 'swap') {
    const candidates = week.days
      .filter((d) => d.type === 'sales' && d.status === 'active')
      .flatMap((d) => d.bookings.filter((b) => b.status === 'planned' && b.id !== booking.id).map((b) => ({ d, b })));
    return (
      <Sheet title="Swap with" subtitle={`${booking.person.name} · ${shortDay(day.date)} ${booking.startTime}`} onClose={onClose}>
        {err && <ErrorWithOverride err={err} busy={busy} />}
        {candidates.length === 0 ? (
          <Notice kind="info">Nobody else is booked this week.</Notice>
        ) : (
          <div className="list" style={{ maxHeight: '52dvh', overflowY: 'auto' }}>
            {candidates.map(({ d, b }) => (
              <button
                key={b.id}
                className="row"
                disabled={busy}
                onClick={() =>
                  run(
                    () => api('/api/bookings/swap', { method: 'POST', body: { bookingId: booking.id, withBookingId: b.id } }),
                    `Swapped with ${b.person.name}`
                  )
                }
              >
                <div className="grow">
                  <div className="name">{b.person.name}</div>
                  <div className="meta">
                    {shortDay(d.date)} · {b.startTime}
                    {b.person.supervisorName ? ` · ${b.person.supervisorName}` : ''}
                  </div>
                </div>
                <IconSwap className="ico" />
              </button>
            ))}
          </div>
        )}
        <div style={{ height: 12 }} />
        <button className="btn btn-ghost btn-block" onClick={() => (setErr(null), setMode('menu'))}>
          Back
        </button>
      </Sheet>
    );
  }

  if (mode === 'remove') {
    return (
      <Sheet title={`Remove ${booking.person.name}?`} subtitle={`They will no longer be booked on ${shortDay(day.date)}.`} onClose={onClose}>
        {err && <ErrorWithOverride err={err} busy={busy} />}
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={() => setMode('menu')}>
            Keep
          </button>
          <button className="btn btn-danger" disabled={busy} onClick={() => run(() => api(`/api/bookings/${booking.id}`, { method: 'DELETE' }), 'Removed from the schedule')}>
            Remove
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={booking.person.name}
      subtitle={`${shortDay(day.date)} · ${booking.startTime}${booking.person.supervisorName ? ` · ${booking.person.supervisorName}` : ''}`}
      onClose={onClose}
    >
      {err && <ErrorWithOverride err={err} busy={busy} />}
      {role === 'videographer' && published && !canMark && booking.status === 'planned' && (
        <Notice kind="info">You can mark this capture once {shortDay(day.date)} has started.</Notice>
      )}
      <div className="actions">
        {booking.person.phone && (
          <a className="action" href={`tel:${booking.person.phone}`}>
            <IconPhone /> Call {booking.person.phone}
          </a>
        )}
        {canMark && planned && (
          <>
            <button className="action" disabled={busy} onClick={() => mark('done')}>
              <IconCheck /> Mark as done
            </button>
            <button className="action" disabled={busy} onClick={() => mark('missed')}>
              <IconX /> Mark as missed
            </button>
            <button className="action" disabled={busy} onClick={() => mark('missed', true)}>
              <IconWand /> Missed, rebook on the next free day
            </button>
          </>
        )}
        {canMark && booking.status === 'missed' && (
          <button className="action" disabled={busy} onClick={rebook}>
            <IconWand /> Rebook on the next free day
          </button>
        )}
        {isAdmin && booking.status !== 'planned' && booking.status !== 'rescheduled' && (
          <button className="action" disabled={busy} onClick={() => mark('planned')}>
            <IconCheck /> Set back to booked
          </button>
        )}
        {isAdmin && planned && (
          <>
            {otherDays.length > 0 && (
              <button className="action" onClick={() => setMode('move')}>
                <IconMove /> Move to another day
              </button>
            )}
            <button className="action" onClick={() => setMode('swap')}>
              <IconSwap /> Swap with someone
            </button>
            <button className="action" disabled={busy} onClick={() => run(() => api(`/api/bookings/${booking.id}/shift`, { method: 'POST', body: { direction: 'up' } }), 'Moved earlier')}>
              <IconUp /> Move earlier in the day
            </button>
            <button className="action" disabled={busy} onClick={() => run(() => api(`/api/bookings/${booking.id}/shift`, { method: 'POST', body: { direction: 'down' } }), 'Moved later')}>
              <IconDown /> Move later in the day
            </button>
          </>
        )}
        {isAdmin && (
          <button className="action" data-kind="danger" onClick={() => setMode('remove')}>
            <IconTrash /> Remove from schedule
          </button>
        )}
      </div>
    </Sheet>
  );
}

function DayPicker({
  days,
  busy,
  err,
  onPick,
}: {
  days: DayView[];
  busy: boolean;
  err: { message: string; code?: string } | null;
  onPick: (d: DayView, override: boolean) => void;
}) {
  const [chosen, setChosen] = useState<DayView | null>(null);
  return (
    <>
      {err && <ErrorWithOverride err={err} busy={busy} onForce={chosen ? () => onPick(chosen, true) : undefined} />}
      <div className="daychips">
        {days.map((d) => {
          const n = d.bookings.filter((b) => b.status !== 'rescheduled').length;
          return (
            <button
              key={d.id}
              disabled={busy}
              aria-pressed={chosen?.id === d.id}
              onClick={() => {
                setChosen(d);
                onPick(d, false);
              }}
            >
              {shortDay(d.date)}
              <small className="num">
                {n}
                {d.capacity ? ` / ${d.capacity}` : ''} booked
              </small>
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ------------------------------------------------------------ add a person / cancel a day */

function AddPerson({ day, week, onClose, onChanged }: { day: DayView; week: WeekView; onClose: () => void; onChanged: () => void }) {
  const { busy, err, run } = useAct(onChanged, onClose);
  const [chosen, setChosen] = useState<number | null>(null);
  return (
    <Sheet title="Add a person" subtitle={`${longDay(day.date)}`} onClose={onClose}>
      {err && <ErrorWithOverride err={err} busy={busy} onForce={chosen ? () => run(() => api('/api/bookings', { method: 'POST', body: { salesId: chosen, captureDayId: day.id, override: true } }), 'Added to the schedule') : undefined} />}
      {week.unscheduled.length === 0 ? (
        <Notice kind="good">Everyone already has a capture this week.</Notice>
      ) : (
        <div className="list" style={{ maxHeight: '55dvh', overflowY: 'auto' }}>
          {week.unscheduled.map((p) => (
            <button
              key={p.id}
              className="row"
              disabled={busy}
              onClick={() => {
                setChosen(p.id);
                run(() => api('/api/bookings', { method: 'POST', body: { salesId: p.id, captureDayId: day.id } }), `${p.name} added`);
              }}
            >
              <span className="avatar">{p.name.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
              <div className="grow">
                <div className="name">{p.name}</div>
                <div className="meta">{p.supervisorName ?? 'No supervisor'}</div>
              </div>
              <IconPlus className="ico" />
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

function CancelDay({ day, onClose, onChanged }: { day: DayView; onClose: () => void; onChanged: () => void }) {
  const { busy, err, run } = useAct(onChanged, onClose);
  const [reason, setReason] = useState('');
  const n = day.bookings.filter((b) => b.status === 'planned').length;
  return (
    <Sheet title={`Cancel ${shortDay(day.date)}?`} subtitle={day.type === 'sales' && n ? `${n} people are booked. We will try to rebook each one on the next free sales day.` : undefined} onClose={onClose}>
      {err && <ErrorWithOverride err={err} busy={busy} />}
      <label className="field">
        <span className="label">Reason (optional)</span>
        <input className="input" value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} placeholder="For example: videographer is sick" />
      </label>
      <div className="btn-row">
        <button className="btn btn-ghost" onClick={onClose}>
          Keep the day
        </button>
        <button
          className="btn btn-danger"
          disabled={busy}
          onClick={() =>
            run(
              () => api<any>(`/api/days/${day.id}/cancel`, { method: 'POST', body: { reason: reason || undefined } }),
              (r) => `Day cancelled. ${r.moved.length} rebooked${r.unplaced.length ? `, ${r.unplaced.length} need a new date` : ''}`
            )
          }
        >
          Cancel day
        </button>
      </div>
      {day.type === 'sales' && n > 0 && (
        <p className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <IconWarn width={16} height={16} /> People who cannot be rebooked are told a new date will follow.
        </p>
      )}
    </Sheet>
  );
}
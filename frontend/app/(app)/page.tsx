'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/Auth';
import DaySheet from '@/components/DaySheet';
import { IconChevronL, IconChevronR, IconEmpty } from '@/components/Icons';
import { Empty, ErrorBox, Loading, Notice, Sheet, useToast } from '@/components/ui';
import { api, useFetch } from '@/lib/api';
import {
  addDays,
  dayNumber,
  longDay,
  mondayOf,
  monthShort,
  relativeDay,
  todayStr,
  weekdayShort,
  weekRange,
} from '@/lib/dates';
import type { User, WeekView } from '@/lib/types';

type Kind = 'sales' | 'company' | 'off';
const DAY3 = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SchedulePage() {
  const { user } = useAuth();
  const toast = useToast();
  const today = todayStr();
  const currentMonday = mondayOf(today);
  const [weekStart, setWeekStart] = useState(currentMonday);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showDayEditor, setShowDayEditor] = useState(false);
  const [showPublish, setShowPublish] = useState(false);

  const { data, error, loading, reload } = useFetch<WeekView>(`/api/weeks/${weekStart}`);
  const next = useFetch<{ booking: { id: number; date: string; startTime: string } | null }>(
    user?.role === 'sales' ? '/api/me/next' : null
  );
  const vids = useFetch<{ users: User[] }>(
    user?.role === 'admin' ? '/api/users?role=videographer&active=true' : null
  );
  const reqs = useFetch<{ items: unknown[] }>(user?.role === 'admin' ? '/api/requests' : null);

  if (!user) return null;
  const isAdmin = user.role === 'admin';
  const days = data?.days ?? [];
  const sel =
    days.find((d) => d.date === picked) ??
    days.find((d) => d.date === today) ??
    days.find((d) => d.date >= today) ??
    days[0] ??
    null;

  const go = (n: number) => {
    setWeekStart(addDays(weekStart, 7 * n));
    setPicked(null);
  };
  const changed = () => {
    reload();
    next.reload();
  };

  // Build day type map from loaded days
  const kindMap: Record<string, Kind> = {};
  for (let i = 0; i < 6; i++) {
    const date = addDays(weekStart, i);
    const d = days.find((x) => x.date === date);
    kindMap[date] = d ? (d.type as Kind) : 'off';
  }

  // Admin: save which days are Sales / Company / Off — NO auto-assignment.
  // Admin then manually adds people to each sales day via "Add person" button.
  async function saveDays(picks: Record<string, Kind>, videographerId: number | null) {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/weeks/${weekStart}/plan`, {
        method: 'PUT',
        body: {
          videographerId,
          override: true,
          days: Object.entries(picks)
            .filter(([, k]) => k !== 'off')
            .map(([date, type]) => ({ date, type })),
        },
      });
      // No auto-generate — admin adds people manually.
      toast('Days saved. Tap a sales day then "Add person" to assign people.');
      setShowDayEditor(false);
      await reload();
    } catch (e: any) {
      setErr(e.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  // Admin: publish so all roles can see the final schedule
  async function doPublish() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/weeks/${weekStart}/publish`, { method: 'POST' });
      toast('Published — the team can now see this week.');
      setShowPublish(false);
      await reload();
    } catch (e: any) {
      setErr(e.message || 'Could not publish');
    } finally {
      setBusy(false);
    }
  }

  const pending = reqs.data?.items.length ?? 0;
  const published = data?.week.status === 'published';
  const videographers = vids.data?.users ?? [];
  const hasDays = days.length > 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="title">
            {user.role === 'sales' ? `Hi, ${user.name.split(' ')[0]}` : 'Schedule'}
          </h1>
          <p className="subtitle">
            {user.role === 'videographer'
              ? 'Your capture days, by team'
              : user.role === 'sales'
              ? 'When the camera is on you'
              : 'Who is captured, and when'}
          </p>
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 6 }}>
            {hasDays && !published && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowPublish(true)}>
                Publish
              </button>
            )}
            <button className="btn btn-soft btn-sm" onClick={() => setShowDayEditor(true)}>
              Edit days
            </button>
          </div>
        )}
      </div>

      {/* Sales: next capture hero card */}
      {user.role === 'sales' && next.data && (
        next.data.booking ? (
          <div className="next">
            <div className="when">Your next capture · {relativeDay(next.data.booking.date, today)}</div>
            <div className="big num">{next.data.booking.startTime}</div>
            <div className="day">{longDay(next.data.booking.date)}</div>
          </div>
        ) : (
          <div className="sheet" style={{ marginBottom: 18 }}>
            <Empty
              icon={<IconEmpty />}
              title="No upcoming capture"
              text="When the admin publishes a schedule that includes you, your date and time show up here."
            />
          </div>
        )
      )}

      {/* Week navigator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div className="weeknav">
          <button className="iconbtn" onClick={() => go(-1)} aria-label="Previous week">
            <IconChevronL />
          </button>
          <span className="range num">{weekRange(weekStart)}</span>
          <button className="iconbtn" onClick={() => go(1)} aria-label="Next week">
            <IconChevronR />
          </button>
        </div>
        {weekStart !== currentMonday && (
          <button
            className="btn btn-soft btn-sm"
            onClick={() => {
              setWeekStart(currentMonday);
              setPicked(null);
            }}
          >
            This week
          </button>
        )}
      </div>

      {/* Day chips */}
      <div className="strip" role="group" aria-label="Days of the week">
        {Array.from({ length: 6 }).map((_, i) => {
          const date = addDays(weekStart, i);
          const d = days.find((x) => x.date === date);
          return (
            <button
              key={date}
              className="chip"
              data-type={d?.type}
              data-cancelled={d?.status === 'cancelled'}
              data-today={date === today}
              aria-pressed={sel?.date === date}
              disabled={!d}
              onClick={() => setPicked(date)}
              aria-label={`${weekdayShort(date)} ${dayNumber(date)}${d ? `, ${d.type} day` : ', nothing planned'}`}
            >
              {weekdayShort(date)}
              <b className="num">{dayNumber(date)}</b>
            </button>
          );
        })}
      </div>
      <div className="legend">
        <span>
          <i style={{ background: 'var(--indigo)' }} />
          Sales day
        </span>
        <span>
          <i style={{ background: 'var(--amber-bar)' }} />
          Company day
        </span>
      </div>

      {/* Errors / notices */}
      {err && <Notice kind="error">{err}</Notice>}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading rows={2} />}

      {isAdmin && pending > 0 && (
        <Notice
          kind="info"
          action={
            <Link className="btn btn-sm btn-soft" href="/requests">
              Review
            </Link>
          }
        >
          {pending} supervisor {pending === 1 ? 'request is' : 'requests are'} waiting for approval.
        </Notice>
      )}

      {/* Draft notice for admin */}
      {isAdmin && hasDays && !published && (
        <Notice
          kind="info"
          action={
            <button className="btn btn-sm btn-soft" onClick={() => setShowPublish(true)}>
              Publish now
            </button>
          }
        >
          This week is a draft. Add people to each sales day, then publish so the team can see it.
        </Notice>
      )}

      {data && data.warnings.length > 0 && (
        <Notice>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {data.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Notice>
      )}

      {/* Empty states */}
      {data && days.length === 0 && (
        <div className="sheet">
          {isAdmin ? (
            <Empty
              icon={<IconEmpty />}
              title="No capture days yet"
              text="Tap 'Edit days' to choose which days are Sales or Company. Then add people manually to each day."
              action={
                <button className="btn btn-primary" onClick={() => setShowDayEditor(true)}>
                  Set up this week
                </button>
              }
            />
          ) : (
            <Empty
              icon={<IconEmpty />}
              title={user.role === 'videographer' ? 'No days assigned to you' : 'Nothing scheduled yet'}
              text={
                user.role === 'videographer'
                  ? 'When the admin sets up a week with you, your days appear here.'
                  : 'The admin has not set up this week yet. Check back soon.'
              }
            />
          )}
        </div>
      )}

      {/* Day detail */}
      {data && sel && (
        <DaySheet
          key={sel.id}
          day={sel}
          week={data}
          role={user.role}
          userId={user.id}
          published={published}
          onChanged={changed}
          defaultGrouped={user.role === 'videographer'}
        />
      )}

      {/* Admin footer stats */}
      {data && hasDays && isAdmin && (
        <p className="small faint" style={{ marginTop: 14, textAlign: 'center' }}>
          {data.stats.booked} booked · {data.stats.done} done · {data.stats.missed} missed
          {!published && (
            <span style={{ marginLeft: 8, color: 'var(--amber)' }}> · draft</span>
          )}
        </p>
      )}

      {/* Day editor sheet (admin only) */}
      {showDayEditor && data && (
        <DayEditorSheet
          weekStart={weekStart}
          kindMap={kindMap}
          videographers={videographers}
          defaultVideoId={data.week.videographerId ?? videographers[0]?.id ?? null}
          limits={data.limits}
          busy={busy}
          onClose={() => {
            setShowDayEditor(false);
            setErr(null);
          }}
          onSave={saveDays}
        />
      )}

      {/* Publish confirmation sheet */}
      {showPublish && (
        <Sheet
          title="Publish this week?"
          subtitle="The team will be notified and can see the schedule."
          onClose={() => setShowPublish(false)}
        >
          <p className="muted">
            Only publish when you have added everyone you want to each sales day. You can still
            move or add people after publishing.
          </p>
          <div style={{ height: 16 }} />
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={() => setShowPublish(false)}>
              Not yet
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={doPublish}>
              {busy ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------
   Day editor sheet — admin only.
   Choose Sales / Company / Off per day. No auto-assignment.
   Admin adds people manually from the schedule view.
---------------------------------------------------------------- */

function DayEditorSheet({
  weekStart,
  kindMap,
  videographers,
  defaultVideoId,
  limits,
  busy,
  onClose,
  onSave,
}: {
  weekStart: string;
  kindMap: Record<string, Kind>;
  videographers: User[];
  defaultVideoId: number | null;
  limits: { salesDays: number; companyDays: number };
  busy: boolean;
  onClose: () => void;
  onSave: (picks: Record<string, Kind>, videographerId: number | null) => void;
}) {
  const [picks, setPicks] = useState<Record<string, Kind>>(kindMap);
  const [vid, setVid] = useState<number | null>(defaultVideoId);

  // Sync when the parent weekStart changes
  useEffect(() => {
    setPicks(kindMap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const sales = Object.values(picks).filter((k) => k === 'sales').length;
  const company = Object.values(picks).filter((k) => k === 'company').length;
  const any = sales + company > 0;
  const over = sales > limits.salesDays || company > limits.companyDays;

  return (
    <Sheet
      title="Set up this week"
      subtitle="Choose which days are Sales or Company. You will add people manually afterwards."
      onClose={onClose}
    >
      <div className="list">
        {DAY3.map((_, i) => {
          const date = addDays(weekStart, i);
          const k = picks[date] ?? 'off';
          return (
            <div key={date} className="planrow">
              <div className="d">
                {weekdayShort(date)}
                <small className="num">
                  {dayNumber(date)} {monthShort(date)}
                </small>
              </div>
              <div className="seg">
                {(['off', 'sales', 'company'] as const).map((x) => (
                  <button
                    key={x}
                    data-kind={x === 'off' ? undefined : x}
                    aria-pressed={k === x}
                    onClick={() => setPicks((p) => ({ ...p, [date]: x }))}
                  >
                    {x === 'off' ? 'Off' : x === 'sales' ? 'Sales' : 'Company'}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {videographers.length > 0 && (
        <label className="field" style={{ marginTop: 14 }}>
          <span className="label">Videographer (for this week)</span>
          <select
            className="select"
            value={vid ?? ''}
            onChange={(e) => setVid(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Choose a videographer</option>
            {videographers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {over && (
        <div style={{ marginTop: 10 }}>
          <Notice>
            You have {sales} sales and {company} company days. The usual limit is{' '}
            {limits.salesDays} / {limits.companyDays}. You can still save.
          </Notice>
        </div>
      )}

      <p className="hint" style={{ marginTop: 10 }}>
        After saving, tap a <strong>Sales day</strong> chip then tap{' '}
        <strong>&ldquo;Add person&rdquo;</strong> to assign individuals one by one.
        Supervisors can also request their team members.
      </p>

      <button
        className="btn btn-primary btn-block"
        style={{ marginTop: 12 }}
        disabled={!any || busy}
        onClick={() => onSave(picks, vid)}
      >
        {busy ? 'Saving…' : 'Save days'}
      </button>
      <button
        className="btn btn-ghost btn-block"
        style={{ marginTop: 8 }}
        disabled={busy}
        onClick={onClose}
      >
        Cancel
      </button>
    </Sheet>
  );
}

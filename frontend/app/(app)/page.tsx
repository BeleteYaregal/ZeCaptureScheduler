'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/Auth';
import DaySheet from '@/components/DaySheet';
import { IconChevronL, IconChevronR, IconEmpty } from '@/components/Icons';
import { Empty, ErrorBox, Loading, Notice } from '@/components/ui';
import { useFetch } from '@/lib/api';
import { addDays, dayNumber, longDay, mondayOf, relativeDay, todayStr, weekdayShort, weekRange } from '@/lib/dates';
import type { WeekView } from '@/lib/types';

export default function SchedulePage() {
  const { user } = useAuth();
  const today = todayStr();
  const [weekStart, setWeekStart] = useState(mondayOf(today));
  const [picked, setPicked] = useState<string | null>(null);
  const { data, error, loading, reload } = useFetch<WeekView>(`/api/weeks/${weekStart}`);
  const next = useFetch<{ booking: { id: number; date: string; startTime: string } | null }>(user?.role === 'sales' ? '/api/me/next' : null);

  const reqs = useFetch<{ items: unknown[] }>(user?.role === 'admin' ? '/api/requests' : null);
  if (!user) return null;
  const isAdmin = user.role === 'admin';
  const days = data?.days ?? [];
  const sel = days.find((d) => d.date === picked) ?? days.find((d) => d.date === today) ?? days.find((d) => d.date >= today) ?? days[0] ?? null;
  const published = data?.week.status === 'published';
  const currentMonday = mondayOf(today);

  const go = (n: number) => {
    setWeekStart(addDays(weekStart, 7 * n));
    setPicked(null);
  };
  const changed = () => {
    reload();
    next.reload();
  };

  useEffect(() => {
    const handler = () => {
      reqs.reload();
      reload();
    };
    window.addEventListener('app:data-changed', handler);
    return () => window.removeEventListener('app:data-changed', handler);
  }, [reqs, reload]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="title">{user.role === 'sales' ? `Hi, ${user.name.split(' ')[0]}` : 'Schedule'}</h1>
          <p className="subtitle">
            {user.role === 'videographer' ? 'Your capture days, by team' : user.role === 'sales' ? 'When the camera is on you' : 'Who is captured, and when'}
          </p>
        </div>
      </div>

      {user.role === 'sales' && next.data && (
        next.data.booking ? (
          <div className="next">
            <div className="when">Your next capture · {relativeDay(next.data.booking.date, today)}</div>
            <div className="big num">{next.data.booking.startTime}</div>
            <div className="day">{longDay(next.data.booking.date)}</div>
          </div>
        ) : (
          <div className="sheet" style={{ marginBottom: 18 }}>
            <Empty icon={<IconEmpty />} title="No upcoming capture" text="Your date and time show up here as soon as you are scheduled." />
          </div>
        )
      )}

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

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading rows={2} />}

      {isAdmin && (reqs.data?.items.length ?? 0) > 0 && (
        <Notice
          kind="info"
          action={
            <Link className="btn btn-sm btn-soft" href="/requests">
              Review
            </Link>
          }
        >
          {reqs.data!.items.length} supervisor {reqs.data!.items.length === 1 ? 'request is' : 'requests are'} waiting for approval.
        </Notice>
      )}
      {data && isAdmin && data.warnings.length > 0 && (
        <Notice>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {data.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Notice>
      )}

      {data && days.length === 0 && !isAdmin && (
        <div className="sheet">
          <Empty icon={<IconEmpty />} title="No capture days this week" text="Check another week, or come back later." />
        </div>
      )}
      {data && days.length === 0 && isAdmin && (
        <div className="sheet">
          <Empty
            icon={<IconEmpty />}
            title="No capture days this week"
            text="Set the standard week (Sales and Company days) in Settings."
            action={
              <Link className="btn btn-primary" href="/settings">
                Open Settings
              </Link>
            }
          />
        </div>
      )}

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

      {data && days.length > 0 && isAdmin && (
        <p className="small faint" style={{ marginTop: 14, textAlign: 'center' }}>
          {data.stats.booked} booked · {data.stats.done} done · {data.stats.missed} missed
        </p>
      )}
    </div>
  );
}

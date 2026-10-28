'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/Auth';
import { IconChevronL, IconChevronR } from '@/components/Icons';
import { ErrorBox, Loading, useToast } from '@/components/ui';
import { api, useFetch } from '@/lib/api';
import { addDays, mondayOf, shortDay, todayStr, weekRange } from '@/lib/dates';
import type { DayKind, User, WeekView } from '@/lib/types';

const KINDS: { key: DayKind; label: string }[] = [
  { key: 'sales', label: 'Sales' },
  { key: 'company', label: 'Company' },
  { key: 'off', label: 'Off' },
];

export default function DaysPage() {
  const { user } = useAuth();
  const toast = useToast();
  const today = todayStr();
  const [weekStart, setWeekStart] = useState(mondayOf(today));
  const [busy, setBusy] = useState<string | null>(null);
  const { data, error, loading, reload } = useFetch<WeekView>(user?.role === 'admin' ? `/api/weeks/${weekStart}` : null);
  const vids = useFetch<{ users: User[] }>(user?.role === 'admin' ? '/api/users?role=videographer&active=true' : null);
  if (!user) return null;
  if (user.role !== 'admin') return <div className="page"><p className="muted">Only the marketing manager can change the days.</p></div>;

  const setType = async (date: string, type: DayKind) => {
    setBusy(date);
    try {
      await api(`/api/days/${date}`, { method: 'PUT', body: { type } });
      toast(type === 'off' ? 'Day switched off' : `Set to ${type} day`);
      reload();
    } catch (e: any) {
      toast(e.message || 'Could not change the day');
    } finally {
      setBusy(null);
    }
  };
  const setVideographer = async (id: number | null) => {
    try {
      await api('/api/videographer', { method: 'PUT', body: { videographerId: id } });
      toast('Videographer updated');
      reload();
    } catch (e: any) {
      toast(e.message || 'Could not save');
    }
  };

  return (
    <div className="page">
      <Link href="/more" className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}>
        <IconChevronL /> More
      </Link>
      <div className="page-head">
        <div>
          <h1 className="title">Capture days</h1>
          <p className="subtitle">Choose what each day is. People are assigned automatically.</p>
        </div>
      </div>

      <div className="weeknav" style={{ marginBottom: 10 }}>
        <button className="iconbtn" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
          <IconChevronL />
        </button>
        <span className="range num">{weekRange(weekStart)}</span>
        <button className="iconbtn" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">
          <IconChevronR />
        </button>
      </div>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading rows={3} />}

      {data && (
        <div className="sheet">
          <div className="list">
            {Array.from({ length: 6 }).map((_, i) => {
              const date = addDays(weekStart, i);
              const d = data.days.find((x) => x.date === date);
              const cur: DayKind = d && d.status !== 'cancelled' ? d.type : 'off';
              const past = date < today;
              return (
                <div className="row" key={date} style={{ justifyContent: 'space-between', opacity: past ? 0.5 : 1 }}>
                  <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{shortDay(date)}</span>
                  <div className="seg" role="group" aria-label={`Type for ${shortDay(date)}`}>
                    {KINDS.map((k) => (
                      <button key={k.key} aria-pressed={cur === k.key} disabled={past || busy === date} onClick={() => cur !== k.key && setType(date, k.key)}>
                        {k.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600 }}>Videographer</span>
              <select className="select" style={{ width: 170 }} value={data.week.videographerId ?? ''} onChange={(e) => setVideographer(e.target.value ? Number(e.target.value) : null)} aria-label="Videographer">
                <option value="">Not set</option>
                {vids.data?.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/Auth';
import { IconCheck, IconChevronL, IconFilm } from '@/components/Icons';
import { Empty, ErrorBox, Loading, useToast } from '@/components/ui';
import { api, useFetch } from '@/lib/api';
import { addDays, longDay, todayStr } from '@/lib/dates';
import type { ReportResult, ReportRow } from '@/lib/types';

const VIEWS = [
  { id: 'pending', label: 'To edit' },
  { id: 'edited', label: 'Edited' },
  { id: 'all', label: 'All' },
];
const SPANS = [
  { id: 14, label: '14 days' },
  { id: 30, label: '30 days' },
  { id: 90, label: '90 days' },
  { id: 365, label: 'A year' },
];

export default function EditingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [view, setView] = useState('pending');
  const [span, setSpan] = useState(30);
  const [busyId, setBusyId] = useState<number | null>(null);
  const today = todayStr();
  const allowed = user && (user.role === 'admin' || user.role === 'videographer');
  const path = allowed ? `/api/editing?from=${addDays(today, -span)}&to=${today}&editing=${view}` : null;
  const { data, error, loading, reload } = useFetch<ReportResult>(path);
  // The headline numbers always cover the whole period, whichever list is showing.
  const totals = useFetch<ReportResult>(allowed ? `/api/editing?from=${addDays(today, -span)}&to=${today}&editing=all` : null);

  const groups = useMemo(() => {
    const m = new Map<string, ReportRow[]>();
    for (const r of data?.rows ?? []) m.set(r.date, [...(m.get(r.date) ?? []), r]);
    return [...m.entries()];
  }, [data]);

  useEffect(() => {
    if (user && !allowed) router.replace('/');
  }, [user, allowed, router]);
  if (!user || !allowed) return null;

  async function mark(r: ReportRow, done: boolean) {
    setBusyId(r.id);
    try {
      await api(`/api/bookings/${r.id}/editing`, { method: 'PATCH', body: { done } });
      toast(done ? `${r.person}: video marked as edited` : `${r.person}: set back to not edited`);
      await Promise.all([reload(), totals.reload()]);
    } catch (e: any) {
      toast(e.message || 'Could not save', 'error');
    } finally {
      setBusyId(null);
    }
  }

  const s = totals.data?.summary;
  const pct = s && s.captured ? Math.round((s.edited / s.captured) * 100) : 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          {user.role === 'admin' && (
            <Link href="/more" className="backlink">
              <IconChevronL width={18} height={18} /> More
            </Link>
          )}
          <h1 className="title">Video editing</h1>
          <p className="subtitle">Tick each video once it is edited.</p>
        </div>
      </div>

      {s && (
        <section className="sheet pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <div>
              <div className="big-n num">{s.pendingEdit}</div>
              <div className="muted small">waiting to be edited</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="h2 num">
                {s.edited} <span className="faint" style={{ fontWeight: 500 }}>of {s.captured}</span>
              </div>
              <div className="muted small">edited</div>
            </div>
          </div>
          <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Videos edited">
            <i style={{ width: `${pct}%` }} />
          </div>
        </section>
      )}

      <div className="seg" role="group" aria-label="Show" style={{ marginTop: 16 }}>
        {VIEWS.map((v) => (
          <button key={v.id} aria-pressed={view === v.id} onClick={() => setView(v.id)}>
            {v.label}
          </button>
        ))}
      </div>
      <div className="chips-scroll" role="group" aria-label="Period" style={{ marginTop: 12 }}>
        {SPANS.map((x) => (
          <button key={x.id} className="fchip" aria-pressed={span === x.id} onClick={() => setSpan(x.id)}>
            Last {x.label}
          </button>
        ))}
      </div>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading rows={3} />}

      {data && groups.length === 0 && (
        <div className="sheet" style={{ marginTop: 14 }}>
          <Empty
            icon={view === 'pending' ? <IconCheck /> : <IconFilm />}
            title={view === 'pending' ? 'All caught up' : 'Nothing here yet'}
            text={view === 'pending' ? 'Every captured video in this period is edited.' : 'Videos appear here after a capture is marked done.'}
          />
        </div>
      )}

      {groups.map(([date, items]) => (
        <section key={date} style={{ marginTop: 16 }}>
          <h2 className="list-title" style={{ marginTop: 0 }}>
            {longDay(date)}
          </h2>
          <div className="list">
            {items.map((r) => (
              <div key={r.id} className="row">
                <div className="grow">
                  <div className="name">{r.person}</div>
                  <div className="meta">
                    {r.time}
                    {r.supervisor ? ` · ${r.supervisor}` : ''}
                    {r.manager ? ` · ${r.manager}` : ''}
                  </div>
                </div>
                {r.editing === 'edited' ? (
                  <div className="edit-done">
                    <span className="pill pill-done">
                      <IconCheck /> Edited
                    </span>
                    <button className="linkbtn" disabled={busyId === r.id} onClick={() => mark(r, false)}>
                      Undo
                    </button>
                  </div>
                ) : (
                  <button className="btn btn-primary btn-sm" disabled={busyId === r.id} onClick={() => mark(r, true)}>
                    <IconCheck /> Mark edited
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

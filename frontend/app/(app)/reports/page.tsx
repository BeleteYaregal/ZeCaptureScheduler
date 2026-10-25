'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/Auth';
import { IconChevronL, IconDownload, IconEmpty, IconSearch } from '@/components/Icons';
import { Empty, ErrorBox, Loading, useToast } from '@/components/ui';
import { downloadFile, useFetch } from '@/lib/api';
import { addDays, mondayOf, shortDay, todayStr } from '@/lib/dates';
import type { OrgView, ReportResult, ReportRow } from '@/lib/types';

type Period = 'week' | 'lastweek' | 'month' | '30' | '90' | 'custom';
const PERIODS: { id: Period; label: string }[] = [
  { id: 'week', label: 'This week' },
  { id: 'lastweek', label: 'Last week' },
  { id: 'month', label: 'This month' },
  { id: '30', label: 'Last 30 days' },
  { id: '90', label: 'Last 90 days' },
  { id: 'custom', label: 'Custom' },
];

function range(p: Period, today: string): { from: string; to: string } {
  const mon = mondayOf(today);
  switch (p) {
    case 'week':
      return { from: mon, to: addDays(mon, 6) };
    case 'lastweek':
      return { from: addDays(mon, -7), to: addDays(mon, -1) };
    case 'month':
      return { from: today.slice(0, 8) + '01', to: today };
    case '90':
      return { from: addDays(today, -89), to: today };
    default:
      return { from: addDays(today, -29), to: today };
  }
}

const STATUS_TEXT = { planned: 'Booked', done: 'Captured', missed: 'Missed' } as const;
const SHOW_MAX = 200;

export default function ReportsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const today = todayStr();
  const [period, setPeriod] = useState<Period>('30');
  const [custom, setCustom] = useState(range('30', today));
  const [managerId, setManagerId] = useState('');
  const [supervisorId, setSupervisorId] = useState('');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState('all');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<'xlsx' | 'csv' | null>(null);

  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/');
  }, [user, router]);
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const isAdmin = user?.role === 'admin';
  const { from, to } = period === 'custom' ? custom : range(period, today);
  const qs = useMemo(() => {
    const p = new URLSearchParams({ from, to, status, editing });
    if (managerId) p.set('managerId', managerId);
    if (supervisorId) p.set('supervisorId', supervisorId);
    if (q) p.set('q', q);
    return p.toString();
  }, [from, to, status, editing, managerId, supervisorId, q]);

  const org = useFetch<OrgView>(isAdmin ? '/api/org' : null);
  const { data, error, loading, reload } = useFetch<ReportResult>(isAdmin && from <= to ? `/api/report?${qs}` : null);
  if (!user || !isAdmin) return null;

  const managers = org.data?.managers ?? [];
  const supervisors = managers.filter((m) => !managerId || String(m.id) === managerId).flatMap((m) => m.supervisors);

  async function download(kind: 'xlsx' | 'csv') {
    setBusy(kind);
    try {
      await downloadFile(`/api/report.${kind}?${qs}`, `capture-report.${kind}`);
      toast(kind === 'xlsx' ? 'Excel report downloaded' : 'CSV downloaded');
    } catch (e: any) {
      toast(e.message || 'Could not create the report', 'error');
    } finally {
      setBusy(null);
    }
  }

  const s = data?.summary;
  const rows = data?.rows ?? [];

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <Link href="/more" className="backlink">
            <IconChevronL width={18} height={18} /> More
          </Link>
          <h1 className="title">Reports</h1>
          <p className="subtitle">Who was captured, who was missed, and which videos are edited.</p>
        </div>
        <div className="head-actions">
          <button className="btn btn-primary btn-sm" disabled={!!busy || !data || rows.length === 0} onClick={() => download('xlsx')}>
            <IconDownload /> {busy === 'xlsx' ? 'Preparing…' : 'Excel'}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={!!busy || !data || rows.length === 0} onClick={() => download('csv')}>
            CSV
          </button>
        </div>
      </div>

      <section className="sheet pad filters" aria-label="Filters">
        <div className="chips-scroll" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p.id} className="fchip" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        {period === 'custom' ? (
          <div className="filter-grid">
            <label className="field">
              <span className="label">From</span>
              <input className="input" type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">To</span>
              <input className="input" type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
            </label>
          </div>
        ) : (
          <p className="faint small" style={{ margin: '2px 0 12px' }}>
            {shortDay(from)} to {shortDay(to)}
          </p>
        )}
        <div className="filter-grid">
          <label className="field">
            <span className="label">Sales manager</span>
            <select className="select" value={managerId} onChange={(e) => (setManagerId(e.target.value), setSupervisorId(''))}>
              <option value="">All managers</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Supervisor</span>
            <select className="select" value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}>
              <option value="">All supervisors</option>
              {supervisors.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span className="label">Capture</span>
            <div className="seg" role="group" aria-label="Capture status">
              {[
                ['all', 'All'],
                ['done', 'Captured'],
                ['missed', 'Missed'],
                ['planned', 'Booked'],
              ].map(([id, label]) => (
                <button key={id} aria-pressed={status === id} onClick={() => setStatus(id)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="label">Video editing</span>
            <div className="seg" role="group" aria-label="Video editing">
              {[
                ['all', 'All'],
                ['edited', 'Edited'],
                ['pending', 'Not edited'],
              ].map(([id, label]) => (
                <button key={id} aria-pressed={editing === id} onClick={() => setEditing(id)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="label">Search</span>
          <span className="input-icon">
            <IconSearch />
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, supervisor or manager" />
          </span>
        </label>
      </section>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {from > to && <ErrorBox message="The start date must be before the end date." />}
      {loading && !data && <Loading rows={3} />}

      {data && s && (
        <>
          <div className="tiles" aria-label="Summary">
            <Tile label="Scheduled" value={s.total} />
            <Tile label="Captured" value={s.captured} tone="good" sub={`${s.captureRate}% of finished`} />
            <Tile label="Missed" value={s.missed} tone={s.missed ? 'bad' : undefined} />
            <Tile label="Video edited" value={s.edited} tone="good" sub={`${s.editRate}% of captured`} />
            <Tile label="Waiting for edit" value={s.pendingEdit} tone={s.pendingEdit ? 'warn' : undefined} />
          </div>

          {rows.length === 0 ? (
            <div className="sheet">
              <Empty icon={<IconEmpty />} title="Nothing matches" text="Try a wider date range or clear a filter." />
            </div>
          ) : (
            <>
              <div className="rtable-wrap sheet">
                <table className="rtable">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Sales person</th>
                      <th>Supervisor</th>
                      <th>Manager</th>
                      <th>Capture</th>
                      <th>Video editing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, SHOW_MAX).map((r) => (
                      <tr key={r.id}>
                        <td className="num">
                          {shortDay(r.date)} <span className="faint">{r.time}</span>
                        </td>
                        <td>
                          <b>{r.person}</b>
                        </td>
                        <td>{r.supervisor || '–'}</td>
                        <td>{r.manager || '–'}</td>
                        <td>
                          <StatusPill r={r} />
                        </td>
                        <td>
                          <EditPill r={r} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="list rlist">
                {rows.slice(0, SHOW_MAX).map((r) => (
                  <div key={r.id} className="row" style={{ alignItems: 'flex-start' }}>
                    <div className="grow">
                      <div className="name">{r.person}</div>
                      <div className="meta">
                        {shortDay(r.date)} · {r.time}
                        {r.supervisor ? ` · ${r.supervisor}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
                      <StatusPill r={r} />
                      <EditPill r={r} />
                    </div>
                  </div>
                ))}
              </div>
              {rows.length > SHOW_MAX && <p className="faint small" style={{ textAlign: 'center', marginTop: 12 }}>Showing the first {SHOW_MAX} of {rows.length}. The download has all of them.</p>}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: 'good' | 'bad' | 'warn' }) {
  return (
    <div className="tile" data-tone={tone}>
      <div className="n num">{value}</div>
      <div className="l">{label}</div>
      {sub && <div className="s">{sub}</div>}
    </div>
  );
}
function StatusPill({ r }: { r: ReportRow }) {
  return <span className={`pill ${r.status === 'done' ? 'pill-done' : r.status === 'missed' ? 'pill-missed' : 'pill-sales'}`}>{STATUS_TEXT[r.status]}</span>;
}
function EditPill({ r }: { r: ReportRow }) {
  if (r.editing === 'na') return <span className="faint">–</span>;
  return <span className={`pill ${r.editing === 'edited' ? 'pill-done' : 'pill-company'}`}>{r.editing === 'edited' ? 'Edited' : 'Not edited'}</span>;
}

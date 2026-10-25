'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/components/Auth';
import { Empty, ErrorBox, Loading, Notice, useToast } from '@/components/ui';
import { IconEmpty } from '@/components/Icons';
import { api, useFetch } from '@/lib/api';
import { dayNumber, initials, monthShort, relativeDay, shortDay } from '@/lib/dates';
import type { Dashboard } from '@/lib/types';

export default function InsightsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useFetch<Dashboard>(user?.role === 'admin' ? '/api/dashboard' : null);

  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/');
  }, [user, router]);
  if (!user || user.role !== 'admin') return null;

  async function rebook(id: number) {
    try {
      const r = await api<{ placed: boolean; rescheduled: { date: string; startTime: string } | null }>(`/api/bookings/${id}/reschedule`, { method: 'POST' });
      toast(r.placed && r.rescheduled ? `Rebooked for ${shortDay(r.rescheduled.date)} at ${r.rescheduled.startTime}` : 'No free day found. Add a sales day first.', r.placed ? 'ok' : 'error');
      reload();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }

  const t = data?.thisWeek;
  const total = t ? t.done + t.planned + t.missed : 0;
  const maxBar = data ? Math.max(1, ...data.history.map((h) => h.done + h.missed)) : 1;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="title">Insights</h1>
          <p className="subtitle">Who is covered, who is overdue</p>
        </div>
      </div>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading rows={3} />}

      {data && t && (
        <>
          <section className="sheet pad">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 className="h2">This week</h2>
              <span className={`pill ${t.status === 'published' ? 'pill-done' : t.status === 'draft' ? 'pill-company' : ''}`}>{t.status === 'published' ? 'Published' : t.status === 'draft' ? 'Draft' : 'Not planned'}</span>
            </div>
            {total === 0 ? (
              <p className="muted">No captures booked this week.</p>
            ) : (
              <>
                <div className="stack" role="img" aria-label={`${t.done} done, ${t.planned} booked, ${t.missed} missed`}>
                  <i style={{ width: `${(t.done / total) * 100}%`, background: 'var(--green)' }} />
                  <i style={{ width: `${(t.planned / total) * 100}%`, background: 'var(--indigo)' }} />
                  <i style={{ width: `${(t.missed / total) * 100}%`, background: 'var(--tally)' }} />
                </div>
                <div className="legendrow">
                  <span>
                    <b className="num" style={{ color: 'var(--green)' }}>{t.done}</b> done
                  </span>
                  <span>
                    <b className="num" style={{ color: 'var(--indigo-strong)' }}>{t.planned}</b> booked
                  </span>
                  <span>
                    <b className="num" style={{ color: 'var(--tally)' }}>{t.missed}</b> missed
                  </span>
                </div>
              </>
            )}
            <p className="small muted" style={{ marginTop: 10 }}>
              {t.salesDays} sales {t.salesDays === 1 ? 'day' : 'days'} · {t.companyDays} company {t.companyDays === 1 ? 'day' : 'days'} · {data.totals.sales} salespeople
            </p>
          </section>

          <section className="sheet pad" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 className="h2">Video editing</h2>
              <Link href="/editing" className="pill pill-sales">Open the list</Link>
            </div>
            {data.editing.captured === 0 ? (
              <p className="muted">No captured videos yet.</p>
            ) : (
              <>
                <div className="progress" role="progressbar" aria-valuenow={data.editing.rate} aria-valuemin={0} aria-valuemax={100} aria-label="Videos edited">
                  <i style={{ width: `${data.editing.rate}%` }} />
                </div>
                <div className="legendrow">
                  <span><b className="num">{data.editing.edited}</b> edited</span>
                  <span><b className="num" style={{ color: data.editing.pending ? 'var(--amber)' : undefined }}>{data.editing.pending}</b> waiting</span>
                  <span><b className="num">{data.editing.rate}%</b> done</span>
                </div>
              </>
            )}
          </section>

          {data.missedRecent.length > 0 && (
            <section className="section">
              <div className="section-head">
                <h2 className="h2">Missed captures</h2>
              </div>
              <div className="list">
                {data.missedRecent.map((m) => (
                  <div key={m.bookingId} className="row">
                    <span className="avatar">{initials(m.name)}</span>
                    <div className="grow">
                      <div className="name">{m.name}</div>
                      <div className="meta">Missed {shortDay(m.date)}</div>
                    </div>
                    <button className="btn btn-soft btn-sm" onClick={() => rebook(m.bookingId)}>
                      Rebook
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="section">
            <div className="section-head">
              <h2 className="h2">Overdue</h2>
              <span className="small muted">Not captured in {data.overdueDays}+ days</span>
            </div>
            {data.overdue.length === 0 ? (
              <Notice kind="good">Everyone has been captured within {data.overdueDays} days.</Notice>
            ) : (
              <div className="list">
                {data.overdue.map((o) => (
                  <div key={o.id} className="row">
                    <span className="avatar">{initials(o.name)}</span>
                    <div className="grow">
                      <div className="name">{o.name}</div>
                      <div className="meta">{o.supervisorName ?? 'No supervisor'}</div>
                    </div>
                    <span className={`pill ${o.daysSince === null ? 'pill-missed' : 'pill-company'}`}>{o.daysSince === null ? 'Never' : `${o.daysSince} days`}</span>
                  </div>
                ))}
                {data.overdueCount > data.overdue.length && <p className="pad muted small">and {data.overdueCount - data.overdue.length} more</p>}
              </div>
            )}
          </section>

          <section className="section">
            <div className="section-head">
              <h2 className="h2">Coming up</h2>
            </div>
            {data.upcoming.length === 0 ? (
              <div className="sheet">
                <Empty icon={<IconEmpty />} title="Nothing planned" text="Plan the next week in the Planner tab." />
              </div>
            ) : (
              <div className="list">
                {data.upcoming.map((u) => (
                  <div key={u.id} className="row">
                    <div className="grow">
                      <div className="name">{shortDay(u.date)}</div>
                      <div className="meta">
                        {relativeDay(u.date, data.today)} · {u.type === 'sales' ? `${u.bookings} booked` : 'Company content'}
                      </div>
                    </div>
                    <span className={`pill ${u.type === 'sales' ? 'pill-sales' : 'pill-company'}`}>{u.type === 'sales' ? 'Sales' : 'Company'}</span>
                    {u.weekStatus !== 'published' && <span className="pill">Draft</span>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="section">
            <div className="section-head">
              <h2 className="h2">Team coverage</h2>
              <span className="small muted">Captured within {data.overdueDays} days</span>
            </div>
            <div className="list">
              {data.coverage.length === 0 && <p className="pad muted">No supervisors yet.</p>}
              {data.coverage.map((c) => (
                <div key={c.supervisorId} className="row">
                  <div className="grow">
                    <div className="name">{c.name}</div>
                    <div className="meta">{c.managerName ?? 'No sales manager'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="small num" style={{ fontWeight: 650 }}>
                      {c.upToDate} / {c.teamSize}
                    </div>
                    <div className="meter">
                      <i style={{ width: c.teamSize ? `${(c.upToDate / c.teamSize) * 100}%` : '0%' }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <h2 className="h2">Last 8 weeks</h2>
              <span className="small muted">Captures done</span>
            </div>
            <div className="sheet pad">
              <div className="bars" role="img" aria-label="Captures done and missed per week">
                {data.history.map((h) => (
                  <div className="col" key={h.weekStart}>
                    {h.missed > 0 && <div className="seg-missed" style={{ height: `${(h.missed / maxBar) * 100}%` }} />}
                    <div className="seg-done" style={{ height: `${(h.done / maxBar) * 100}%` }} title={`${h.done} done`} />
                  </div>
                ))}
              </div>
              <div className="bars-labels num">
                {data.history.map((h) => (
                  <span key={h.weekStart}>
                    {dayNumber(h.weekStart)} {monthShort(h.weekStart)}
                  </span>
                ))}
              </div>
              <div className="legendrow">
                <span>
                  <i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'var(--indigo)', marginRight: 6 }} />
                  Done
                </span>
                <span>
                  <i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'var(--tally)', marginRight: 6 }} />
                  Missed
                </span>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

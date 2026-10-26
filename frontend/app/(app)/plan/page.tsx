'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/Auth';
import DaySheet from '@/components/DaySheet';
import { IconChevronL, IconChevronR } from '@/components/Icons';
import { ErrorBox, Loading, Notice, Sheet, Switch, useToast } from '@/components/ui';
import { api, useFetch } from '@/lib/api';
import { addDays, dayNumber, mondayOf, monthShort, todayStr, weekdayShort, weekRange } from '@/lib/dates';
import type { User, WeekView } from '@/lib/types';

type Kind = 'sales' | 'company' | 'off';
type PlanSettings = { week_pattern?: Kind[]; default_videographer_id?: number | null };
const DAY3 = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT: Record<Kind, string> = { sales: 'Sales', company: 'Co.', off: 'Off' };

export default function PlannerPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [weekStart, setWeekStart] = useState(addDays(mondayOf(todayStr()), 7));
  const week = useFetch<WeekView>(`/api/weeks/${weekStart}`);
  const vids = useFetch<{ users: User[] }>('/api/users?role=videographer&active=true');
  const settings = useFetch<{ settings: PlanSettings }>('/api/settings');
  const [videoId, setVideoId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'days' | 'publish' | 'ahead'>(null);

  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/');
  }, [user, router]);

  const data = week.data;
  const pattern = settings.data?.settings.week_pattern?.length === 6 ? settings.data.settings.week_pattern : null;
  const videographers = vids.data?.users ?? [];

  useEffect(() => {
    if (!data) return;
    setVideoId(data.week.videographerId ?? settings.data?.settings.default_videographer_id ?? videographers[0]?.id ?? null);
    setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, vids.data, settings.data]);

  if (!user || user.role !== 'admin') return null;

  const published = data?.week.status === 'published';
  const days = (data?.days ?? []).filter((d) => d.status === 'active');
  const booked = days.reduce((n, d) => n + d.bookings.filter((b) => b.status !== 'rescheduled').length, 0);
  const requested = days.reduce((n, d) => n + d.bookings.filter((b) => (b.status as string) === 'requested').length, 0);
  const state: 'empty' | 'planned' | 'built' | 'published' = published ? 'published' : days.length === 0 ? 'empty' : booked === 0 ? 'planned' : 'built';
  const videoName = videographers.find((u) => u.id === (data?.week.videographerId ?? videoId))?.name;
  const thisMonday = mondayOf(todayStr());
  const tag = weekStart === thisMonday ? 'This week' : weekStart === addDays(thisMonday, 7) ? 'Next week' : weekStart < thisMonday ? 'Past week' : '';

  // Whatever the admin picks becomes the default next time. Best effort, never blocks the action.
  async function remember(body: { week_pattern?: Kind[]; default_videographer_id?: number | null }) {
    try {
      await api('/api/settings', { method: 'PUT', body });
      settings.reload();
    } catch {
      /* the plan itself still worked */
    }
  }

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      toast(ok);
      setSheet(null);
      await week.reload();
    } catch (e: any) {
      setErr(e.message || 'Something went wrong');
      setSheet(null);
    } finally {
      setBusy(false);
    }
  }

  const planStandard = () =>
    run(async () => {
      const r = await api<any>('/api/weeks/auto', { method: 'POST', body: { fromWeek: weekStart, weeks: 1, generate: true, overwrite: true, videographerId: videoId } });
      if (r.results[0]?.result === 'failed') throw new Error(r.results[0].note);
      if (videoId && videoId !== settings.data?.settings.default_videographer_id) await remember({ default_videographer_id: videoId });
    }, 'Week planned');
  const build = () => run(() => api(`/api/weeks/${weekStart}/generate`, { method: 'POST' }), 'Schedule built');
  const publish = () =>
    run(async () => {
      // The videographer is only needed here, at the last step.
      if (!data?.week.videographerId && videoId) {
        await api(`/api/weeks/${weekStart}/plan`, {
          method: 'PUT',
          body: { videographerId: videoId, override: true, days: days.map((d) => ({ date: d.date, type: d.type })) },
        });
        await remember({ default_videographer_id: videoId });
      }
      await api(`/api/weeks/${weekStart}/publish`, { method: 'POST' });
    }, 'Published. The team has been told.');

  return (
    <div className="page" style={{ paddingBottom: 40 }}>
      <div className="page-head">
        <div>
          <h1 className="title">Planner</h1>
          <p className="subtitle">One week at a time</p>
        </div>
        {pattern && (
          <button className="btn btn-ghost btn-sm" onClick={() => setSheet('ahead')}>
            Plan ahead
          </button>
        )}
      </div>

      <div className="sheet" style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <button className="iconbtn" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
          <IconChevronL />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div className="num" style={{ fontWeight: 700, fontSize: 16 }}>{weekRange(weekStart)}</div>
          {tag && <div className="small muted">{tag}</div>}
        </div>
        <button className="iconbtn" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">
          <IconChevronR />
        </button>
      </div>

      {week.error && <ErrorBox message={week.error} onRetry={week.reload} />}
      {err && <Notice kind="error">{err}</Notice>}
      {week.loading && !data && <Loading rows={2} />}

      {data && (
        <>
          {requested > 0 && (
            <Notice kind="info" action={<Link className="btn btn-sm btn-soft" href="/requests">Review</Link>}>
              {requested} supervisor {requested === 1 ? 'request is' : 'requests are'} waiting.
            </Notice>
          )}

          {/* The one thing to do next */}
          <div className="sheet pad" style={{ marginBottom: 18 }}>
            {state === 'empty' && (
              <>
                <div className="h2">Plan this week</div>
                <p className="small muted" style={{ margin: '4px 0 14px' }}>
                  {pattern ? 'Uses your standard week and builds the schedule for you.' : 'Choose which days the camera is on.'}
                </p>
                {pattern && <DayChips kinds={pattern} />}
                {pattern && (
                  <label className="field">
                    <span className="label">Videographer (optional now)</span>
                    <select className="select" value={videoId ?? ''} onChange={(e) => setVideoId(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">Choose a videographer</option>
                      {videographers.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                {pattern ? (
                  <button className="btn btn-primary btn-block" disabled={busy} onClick={planStandard}>
                    {busy ? 'Planning…' : 'Plan this week'}
                  </button>
                ) : (
                  <button className="btn btn-primary btn-block" onClick={() => setSheet('days')}>Choose days</button>
                )}
                {pattern && (
                  <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => setSheet('days')}>
                    Choose different days
                  </button>
                )}
              </>
            )}

            {state === 'planned' && (
              <>
                <div className="h2">Days are set</div>
                <p className="small muted" style={{ margin: '4px 0 14px' }}>Next, build the schedule. Everyone is spread fairly across the sales days.</p>
                <DayChips kinds={DAY3.map((_, i) => kindOf(days, addDays(weekStart, i)))} />
                <button className="btn btn-primary btn-block" disabled={busy} onClick={build}>
                  {busy ? 'Building…' : 'Build the schedule'}
                </button>
              </>
            )}

            {state === 'built' && (
              <>
                <div className="h2">Ready to publish</div>
                <p className="small muted" style={{ margin: '4px 0 14px' }}>
                  {booked} {booked === 1 ? 'person' : 'people'} on {days.filter((d) => d.type === 'sales').length === 1 ? '1 sales day' : `${days.filter((d) => d.type === 'sales').length} sales days`}. Check the list below, then publish.
                </p>
                <DayChips kinds={DAY3.map((_, i) => kindOf(days, addDays(weekStart, i)))} />
                {!data.week.videographerId && (
                  <label className="field">
                    <span className="label">Videographer</span>
                    <select className="select" value={videoId ?? ''} onChange={(e) => setVideoId(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">Choose a videographer</option>
                      {videographers.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                <button className="btn btn-primary btn-block" disabled={busy || (!data.week.videographerId && !videoId)} onClick={() => setSheet('publish')}>
                  Publish to the team
                </button>
              </>
            )}

            {state === 'published' && (
              <>
                <div className="h2">Published</div>
                <p className="small muted" style={{ margin: '4px 0 14px' }}>
                  The team can see this week{videoName ? ` · ${videoName}` : ''}. You can still move people below.
                </p>
                <DayChips kinds={DAY3.map((_, i) => kindOf(days, addDays(weekStart, i)))} />
                <Link className="btn btn-soft btn-block" href="/">Open the schedule</Link>
              </>
            )}
          </div>

          {state !== 'empty' && state !== 'published' && (
            <div style={{ display: 'flex', gap: 8, margin: '-6px 0 18px' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setSheet('days')}>Change days</button>
              {state === 'built' && (
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={build}>Rebuild</button>
              )}
            </div>
          )}

          {data.warnings.length > 0 && !published && (
            <Notice>
              <ul style={{ paddingLeft: 18, margin: 0 }}>
                {data.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Notice>
          )}

          {booked > 0 && (
            <section>
              <h2 className="h2" style={{ marginBottom: 4 }}>Schedule</h2>
              <p className="small muted" style={{ marginBottom: 12 }}>Tap a person to move, swap or remove them.</p>
              <div style={{ display: 'grid', gap: 16 }}>
                {days
                  .filter((d) => d.type === 'sales')
                  .map((d) => (
                    <DaySheet key={d.id} day={d} week={data} role="admin" userId={user.id} published={published} onChanged={week.reload} />
                  ))}
              </div>
            </section>
          )}
        </>
      )}

      {sheet === 'days' && data && (
        <DaysSheet
          weekStart={weekStart}
          current={Object.fromEntries(days.map((d) => [d.date, d.type as Kind]))}
          pattern={pattern}
          videographers={videographers}
          videoId={videoId}
          hasBookings={booked > 0}
          limits={data.limits}
          onClose={() => setSheet(null)}
          onSave={(picks, vid, override, asDefault) =>
            run(async () => {
              await api(`/api/weeks/${weekStart}/plan`, {
                method: 'PUT',
                body: {
                  videographerId: vid,
                  override,
                  days: Object.entries(picks)
                    .filter(([, k]) => k !== 'off')
                    .map(([date, type]) => ({ date, type })),
                },
              });
              const body: { week_pattern?: Kind[]; default_videographer_id?: number | null } = {};
              if (asDefault) body.week_pattern = DAY3.map((_, i) => picks[addDays(weekStart, i)] ?? 'off');
              if (vid) body.default_videographer_id = vid;
              if (Object.keys(body).length) await remember(body);
            }, 'Days saved')
          }
        />
      )}

      {sheet === 'publish' && (
        <Sheet title="Publish this week?" subtitle={`${weekRange(weekStart)} · ${booked} captures${videoName ? ` · ${videoName}` : ''}`} onClose={() => setSheet(null)}>
          <p className="muted">Salespeople and the videographer are notified and can see the schedule straight away.</p>
          <div style={{ height: 16 }} />
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={() => setSheet(null)}>Not yet</button>
            <button className="btn btn-primary" disabled={busy} onClick={publish}>
              {busy ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </Sheet>
      )}

      {sheet === 'ahead' && (
        <AheadSheet
          weekStart={weekStart}
          videographers={videographers}
          defaultVideo={settings.data?.settings.default_videographer_id ?? videoId}
          onClose={() => setSheet(null)}
          onDone={() => week.reload()}
        />
      )}
    </div>
  );
}

function kindOf(days: WeekView['days'], date: string): Kind {
  const d = days.find((x) => x.date === date);
  return d ? (d.type as Kind) : 'off';
}

function DayChips({ kinds }: { kinds: Kind[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginBottom: 16 }}>
      {DAY3.map((d, i) => {
        const k = kinds[i] ?? 'off';
        return (
          <div key={d} className="chip" data-type={k === 'off' ? undefined : k} aria-label={`${d}: ${k}`} style={{ cursor: 'default', textAlign: 'center', opacity: k === 'off' ? 0.5 : 1 }}>
            {d}
            <span style={{ display: 'block', fontSize: 11, fontWeight: 700, marginTop: 2 }}>{SHORT[k]}</span>
          </div>
        );
      })}
    </div>
  );
}

function DaysSheet({
  weekStart,
  current,
  pattern,
  videographers,
  videoId,
  hasBookings,
  limits,
  onClose,
  onSave,
}: {
  weekStart: string;
  current: Record<string, Kind>;
  pattern: Kind[] | null;
  videographers: User[];
  videoId: number | null;
  hasBookings: boolean;
  limits: { salesDays: number; companyDays: number };
  onClose: () => void;
  onSave: (picks: Record<string, Kind>, videographerId: number | null, override: boolean, asDefault: boolean) => void;
}) {
  const planned = Object.keys(current).length > 0;
  // A week with nothing planned starts from the standard week, so the days are already selected.
  const initial = Object.fromEntries(
    DAY3.map((_, i) => {
      const date = addDays(weekStart, i);
      return [date, planned ? current[date] ?? 'off' : pattern?.[i] ?? 'off'];
    })
  ) as Record<string, Kind>;
  const [picks, setPicks] = useState<Record<string, Kind>>(initial);
  const [vid, setVid] = useState<number | null>(videoId);
  const [override, setOverride] = useState(false);
  const [asDefault, setAsDefault] = useState(true);
  const sales = Object.values(picks).filter((k) => k === 'sales').length;
  const company = Object.values(picks).filter((k) => k === 'company').length;
  const over = sales > limits.salesDays || company > limits.companyDays;
  const any = sales + company > 0;

  return (
    <Sheet title="Change days" subtitle="Tap a day to turn it Off, Sales or Company." onClose={onClose}>
      <div className="list">
        {DAY3.map((_, i) => {
          const date = addDays(weekStart, i);
          const k = picks[date];
          return (
            <div key={date} className="planrow">
              <div className="d">
                {weekdayShort(date)}
                <small className="num">{dayNumber(date)} {monthShort(date)}</small>
              </div>
              <div className="seg">
                {(['off', 'sales', 'company'] as const).map((x) => (
                  <button key={x} data-kind={x === 'off' ? undefined : x} aria-pressed={k === x} onClick={() => setPicks((p) => ({ ...p, [date]: x }))}>
                    {x === 'off' ? 'Off' : x === 'sales' ? 'Sales' : 'Company'}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {pattern && (
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setPicks(Object.fromEntries(pattern.map((k, i) => [addDays(weekStart, i), k])))}>
          Use my standard week
        </button>
      )}

      <label className="field" style={{ marginTop: 12 }}>
        <span className="label">Videographer</span>
        <select className="select" value={vid ?? ''} onChange={(e) => setVid(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Choose a videographer</option>
          {videographers.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </label>

      {over && (
        <Notice>
          <div>That is {sales} sales and {company} company days. Your limit is {limits.salesDays} and {limits.companyDays}.</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10 }}>
            <span>Allow it this week</span>
            <Switch checked={override} onChange={setOverride} label="Allow more days than the limit this week" />
          </div>
        </Notice>
      )}
      <div className="row" style={{ padding: '10px 2px' }}>
        <div className="grow">
          <div className="name">Use as my standard week</div>
          <div className="meta">Next weeks start with these days</div>
        </div>
        <Switch checked={asDefault && !over} onChange={setAsDefault} label="Use as my standard week" />
      </div>
      {hasBookings && <p className="hint">Changing days can reset bookings on the days you change.</p>}
      <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} disabled={!any || (over && !override)} onClick={() => onSave(picks, vid, override, asDefault && !over)}>
        Save days
      </button>
    </Sheet>
  );
}

function AheadSheet({
  weekStart,
  videographers,
  defaultVideo,
  onClose,
  onDone,
}: {
  weekStart: string;
  videographers: User[];
  defaultVideo: number | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [weeks, setWeeks] = useState(4);
  const [video, setVideo] = useState<number | null>(defaultVideo ?? videographers[0]?.id ?? null);
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ weekStart: string; result: string; note: string }[] | null>(null);

  async function go() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ results: { weekStart: string; result: string; note: string }[] }>('/api/weeks/auto', {
        method: 'POST',
        body: { fromWeek: weekStart, weeks, videographerId: video, generate: true, publish },
      });
      if (video && video !== defaultVideo) api('/api/settings', { method: 'PUT', body: { default_videographer_id: video } }).catch(() => {});
      setDone(r.results);
      onDone();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Plan ahead" subtitle="Plans the coming weeks with your standard week. Weeks already planned are skipped." onClose={onClose}>
      {err && <Notice kind="error">{err}</Notice>}
      {done ? (
        <>
          <div className="list">
            {done.map((r) => (
              <div key={r.weekStart} className="row">
                <div className="grow name">{weekRange(r.weekStart)}</div>
                <span className={`pill ${r.result === 'done' ? 'pill-done' : ''}`}>{r.result === 'done' ? r.note : r.result === 'failed' ? r.note : 'Skipped'}</span>
              </div>
            ))}
          </div>
          <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={onClose}>Done</button>
        </>
      ) : (
        <>
          <label className="field">
            <span className="label">How many weeks, from {weekRange(weekStart)}</span>
            <select className="select" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
              {[1, 2, 4, 8, 12].map((n) => (
                <option key={n} value={n}>{n} {n === 1 ? 'week' : 'weeks'}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Videographer{publish ? '' : ' (optional now)'}</span>
            <select className="select" value={video ?? ''} onChange={(e) => setVideo(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Choose a videographer</option>
              {videographers.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </label>
          <div className="list">
            <div className="row">
              <div className="grow">
                <div className="name">Publish them too</div>
                <div className="meta">Off: you review each week first</div>
              </div>
              <Switch checked={publish} onChange={setPublish} label="Publish the weeks too" />
            </div>
          </div>
          <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} disabled={busy || (publish && !video)} onClick={go}>
            {busy ? 'Planning…' : `Plan ${weeks} ${weeks === 1 ? 'week' : 'weeks'}`}
          </button>
        </>
      )}
    </Sheet>
  );
}
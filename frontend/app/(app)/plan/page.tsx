'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/Auth';
import DaySheet from '@/components/DaySheet';
import { IconChevronL, IconChevronR, IconWand } from '@/components/Icons';
import { ErrorBox, Loading, Notice, Sheet, Switch, useToast } from '@/components/ui';
import { api, useFetch } from '@/lib/api';
import { addDays, dayNumber, longDay, mondayOf, monthShort, todayStr, weekdayShort, weekRange } from '@/lib/dates';
import type { User, WeekView } from '@/lib/types';

type Pick = 'sales' | 'company' | null;

export default function PlannerPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [weekStart, setWeekStart] = useState(addDays(mondayOf(todayStr()), 7));
  const week = useFetch<WeekView>(`/api/weeks/${weekStart}`);
  const vids = useFetch<{ users: User[] }>('/api/users?role=videographer&active=true');
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [videoId, setVideoId] = useState<number | null>(null);
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'generate' | 'publish'>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/');
  }, [user, router]);

  const data = week.data;
  const serverPicks = useMemo(() => {
    const m: Record<string, Pick> = {};
    for (const d of data?.days ?? []) if (d.status === 'active') m[d.date] = d.type;
    return m;
  }, [data]);

  useEffect(() => {
    if (!data) return;
    setPicks(serverPicks);
    setVideoId(data.week.videographerId ?? vids.data?.users[0]?.id ?? null);
    setOverride(false);
    setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, vids.data]);

  if (!user || user.role !== 'admin') return null;

  const limits = data?.limits ?? { salesDays: 4, companyDays: 2, maxTeamSize: 12 };
  const salesN = Object.values(picks).filter((p) => p === 'sales').length;
  const companyN = Object.values(picks).filter((p) => p === 'company').length;
  const over = salesN > limits.salesDays || companyN > limits.companyDays;
  const status = data?.week.status;
  const published = status === 'published';
  const hasPlan = (data?.days.length ?? 0) > 0 && status === 'draft';
  const dirty =
    JSON.stringify(Object.entries(picks).filter(([, v]) => v).sort()) !== JSON.stringify(Object.entries(serverPicks).sort()) ||
    (data ? (videoId ?? null) !== (data.week.videographerId ?? null) : false);
  const bookedCount = data?.days.reduce((n, d) => n + d.bookings.filter((b) => b.status !== 'rescheduled').length, 0) ?? 0;
  const step = published ? 3 : bookedCount > 0 && !dirty ? 3 : hasPlan && !dirty ? 2 : 1;
  const videoName = vids.data?.users.find((u) => u.id === videoId)?.name;

  async function call(kind: 'save' | 'generate' | 'publish', fn: () => Promise<any>, ok: string) {
    setBusy(kind);
    setErr(null);
    try {
      await fn();
      toast(ok);
      await week.reload();
      if (kind === 'publish') setConfirm(false);
    } catch (e: any) {
      setErr(e.message || 'Something went wrong');
      if (kind === 'publish') setConfirm(false);
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    call(
      'save',
      () =>
        api(`/api/weeks/${weekStart}/plan`, {
          method: 'PUT',
          body: {
            videographerId: videoId,
            override,
            days: Object.entries(picks)
              .filter(([, v]) => v)
              .map(([date, type]) => ({ date, type })),
          },
        }),
      'Days saved'
    );
  const generate = () => call('generate', () => api(`/api/weeks/${weekStart}/generate`, { method: 'POST' }), 'Schedule built');
  const publish = () => call('publish', () => api(`/api/weeks/${weekStart}/publish`, { method: 'POST' }), 'Published. The team has been notified.');

  const primary = dirty
    ? { label: busy === 'save' ? 'Saving…' : 'Save days', run: save, disabled: (over && !override) || Object.values(picks).every((v) => !v) }
    : published
      ? null
      : hasPlan && bookedCount === 0
        ? { label: busy === 'generate' ? 'Building…' : 'Build the schedule', run: generate, disabled: !(data?.days.some((d) => d.type === 'sales')) }
        : hasPlan
          ? { label: 'Publish to the team', run: () => setConfirm(true), disabled: false }
          : null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="title">Planner</h1>
          <p className="subtitle">Pick the days, build the schedule, then publish</p>
        </div>
      </div>

      <div className="steps" aria-label={`Step ${step} of 3`}>
        <span data-on={step >= 1} />
        <span data-on={step >= 2} />
        <span data-on={step >= 3} />
      </div>

      <div className="weeknav" style={{ marginBottom: 14 }}>
        <button className="iconbtn" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
          <IconChevronL />
        </button>
        <span className="range num">{weekRange(weekStart)}</span>
        <button className="iconbtn" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">
          <IconChevronR />
        </button>
      </div>

      {week.error && <ErrorBox message={week.error} onRetry={week.reload} />}
      {err && <Notice kind="error">{err}</Notice>}
      {week.loading && !data && <Loading rows={3} />}

      {data && (
        <>
          {published && (
            <Notice
              kind="good"
              action={
                <Link className="btn btn-sm btn-ghost" href="/">
                  Open the schedule
                </Link>
              }
            >
              This week is published. You can still move people from the schedule.
            </Notice>
          )}

          <div className="counter" style={{ marginBottom: 14 }}>
            <div data-over={salesN > limits.salesDays}>
              <div className="n num">
                {salesN}
                <span className="faint" style={{ fontSize: 16 }}> / {limits.salesDays}</span>
              </div>
              <div className="l">Sales days</div>
            </div>
            <div data-over={companyN > limits.companyDays}>
              <div className="n num">
                {companyN}
                <span className="faint" style={{ fontSize: 16 }}> / {limits.companyDays}</span>
              </div>
              <div className="l">Company days</div>
            </div>
          </div>

          <div className="list" role="group" aria-label="Choose the days">
            {Array.from({ length: 6 }).map((_, i) => {
              const date = addDays(weekStart, i);
              const v = picks[date] ?? null;
              const set = (x: Pick) => setPicks((p) => ({ ...p, [date]: p[date] === x ? null : x }));
              return (
                <div key={date} className="planrow">
                  <div className="d">
                    {weekdayShort(date)}
                    <small className="num">
                      {dayNumber(date)} {monthShort(date)}
                    </small>
                  </div>
                  <div className="seg">
                    <button aria-pressed={v === null} disabled={published} onClick={() => set(null)}>
                      Off
                    </button>
                    <button data-kind="sales" aria-pressed={v === 'sales'} disabled={published} onClick={() => set('sales')}>
                      Sales
                    </button>
                    <button data-kind="company" aria-pressed={v === 'company'} disabled={published} onClick={() => set('company')}>
                      Company
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {over && !published && (
            <div style={{ marginTop: 14 }}>
              <Notice>
                {salesN > limits.salesDays && <div>You picked {salesN} sales days. The limit is {limits.salesDays}.</div>}
                {companyN > limits.companyDays && <div>You picked {companyN} company days. The limit is {limits.companyDays}.</div>}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10 }}>
                  <span>Allow this for this week only</span>
                  <Switch checked={override} onChange={setOverride} label="Allow more days than the limit this week" />
                </div>
              </Notice>
            </div>
          )}

          <label className="field" style={{ marginTop: 18 }}>
            <span className="label">Videographer</span>
            <select className="select" value={videoId ?? ''} disabled={published} onChange={(e) => setVideoId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Choose a videographer</option>
              {vids.data?.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            {vids.data && vids.data.users.length === 0 && <p className="hint">No videographer yet. Add one in the Team tab.</p>}
          </label>

          {dirty && bookedCount > 0 && !published && (
            <Notice kind="info">Saving changes to the days can reset bookings on the days you change.</Notice>
          )}

          {data.warnings.length > 0 && (
            <Notice>
              <ul style={{ paddingLeft: 18, margin: 0 }}>
                {data.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Notice>
          )}

          {hasPlan && !dirty && (
            <section className="section">
              <div className="section-head">
                <h2 className="h2">{bookedCount > 0 ? 'Review the schedule' : 'Next: build the schedule'}</h2>
                {bookedCount > 0 && !published && (
                  <button className="btn btn-soft btn-sm" disabled={busy !== null} onClick={generate}>
                    <IconWand /> Rebuild
                  </button>
                )}
              </div>
              {bookedCount === 0 ? (
                <p className="muted">
                  The app spreads everyone across the sales days. People who were captured longest ago go first, and each supervisor’s team is spread evenly.
                </p>
              ) : (
                <>
                  <p className="muted" style={{ marginBottom: 12 }}>
                    Tap a person to move them, swap them or remove them. Rebuilding replaces any manual changes.
                  </p>
                  <div style={{ display: 'grid', gap: 16 }}>
                    {data.days
                      .filter((d) => d.type === 'sales')
                      .map((d) => (
                        <DaySheet key={d.id} day={d} week={data} role="admin" userId={user.id} published={published} onChanged={week.reload} />
                      ))}
                  </div>
                </>
              )}
            </section>
          )}
        </>
      )}

      {primary && (
        <div className="savebar">
          <button className="btn btn-primary btn-block" disabled={primary.disabled || busy !== null} onClick={primary.run}>
            {primary.label}
          </button>
        </div>
      )}

      {confirm && (
        <Sheet title="Publish this week?" subtitle={`${weekRange(weekStart)} · ${bookedCount} captures${videoName ? ` · ${videoName}` : ''}`} onClose={() => setConfirm(false)}>
          <p className="muted">Salespeople and the videographer will be notified and can see the schedule straight away.</p>
          <div style={{ height: 16 }} />
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={() => setConfirm(false)}>
              Not yet
            </button>
            <button className="btn btn-primary" disabled={busy !== null} onClick={publish}>
              {busy === 'publish' ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

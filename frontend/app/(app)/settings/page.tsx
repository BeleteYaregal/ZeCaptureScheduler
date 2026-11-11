'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/Auth';
import { IconChevronL } from '@/components/Icons';
import { ErrorBox, Loading, Notice, Stepper, Switch, useToast } from '@/components/ui';
import { api, useFetch } from '@/lib/api';
import { useBrand } from '@/lib/brand';
import type { Settings, User } from '@/lib/types';
import Link from 'next/link';

export default function SettingsPage() {
  const { user } = useAuth();
  const { brand, setBrand } = useBrand();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useFetch<{ settings: Settings }>('/api/settings');
  const vids = useFetch<{ users: User[] }>('/api/users?role=videographer&active=true');
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string[]>([]);

  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/');
  }, [user, router]);
  useEffect(() => {
    if (data) setS(data.settings);
  }, [data]);

  if (!user || user.role !== 'admin') return null;
  const dirty = !!s && !!data && JSON.stringify(s) !== JSON.stringify(data.settings);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => (p ? { ...p, [k]: v } : p));
  const tooMany = !!s && s.sales_days_per_week + s.company_days_per_week > 7;

  async function save() {
    if (!s) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ settings: Settings; warnings: string[] }>('/api/settings', { method: 'PUT', body: s });
      setWarn(r.warnings);
      setBrand({
        ...brand,
        app_mode: r.settings.app_mode || 'capture',
        card_name: r.settings.card_app_name || 'ZeCard Info',
      });
      window.dispatchEvent(new CustomEvent('app:data-changed'));
      toast('Settings saved');
      await reload();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link href="/more" className="small" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--indigo-strong)', fontWeight: 650, marginBottom: 6 }}>
            <IconChevronL width={18} height={18} /> More
          </Link>
          <h1 className="title">Settings</h1>
          <p className="subtitle">Every number here can change at any time</p>
        </div>
      </div>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !s && <Loading rows={3} />}
      {err && <Notice kind="error">{err}</Notice>}
      {warn.map((w, i) => (
        <Notice key={i}>{w}</Notice>
      ))}

      {s && (
        <>
          <h2 className="h2" style={{ margin: '4px 0 10px' }}>Active Application Mode</h2>
          <div className="list" style={{ marginBottom: 20 }}>
            <div style={{ padding: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginBottom: 12 }}>
                <button
                  type="button"
                  className="btn"
                  style={{
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 4,
                    background: (s.app_mode || 'capture') === 'capture' ? 'var(--brand)' : 'var(--bg-subtle, rgba(0,0,0,0.04))',
                    color: (s.app_mode || 'capture') === 'capture' ? '#fff' : 'inherit',
                    border: (s.app_mode || 'capture') === 'capture' ? '2px solid var(--brand)' : '1px solid var(--border-color)',
                    borderRadius: 10,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onClick={() => set('app_mode', 'capture')}
                >
                  <strong style={{ fontSize: '0.95rem' }}>🗓 Capture Scheduler Mode</strong>
                  <span style={{ fontSize: '0.8rem', opacity: 0.85 }}>
                    Video capture scheduling, team booking & editing queue
                  </span>
                </button>

                <button
                  type="button"
                  className="btn"
                  style={{
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 4,
                    background: s.app_mode === 'card' ? 'var(--brand)' : 'var(--bg-subtle, rgba(0,0,0,0.04))',
                    color: s.app_mode === 'card' ? '#fff' : 'inherit',
                    border: s.app_mode === 'card' ? '2px solid var(--brand)' : '1px solid var(--border-color)',
                    borderRadius: 10,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onClick={() => set('app_mode', 'card')}
                >
                  <strong style={{ fontSize: '0.95rem' }}>🪪 Business Card & ID Portal Mode</strong>
                  <span style={{ fontSize: '0.8rem', opacity: 0.85 }}>
                    Staff registration, multi-contact info, card design feedback & approval
                  </span>
                </button>
              </div>

              {s.app_mode === 'card' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginTop: 12, borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
                  <label className="field">
                    <span className="label">Custom App Name (Card Collection Mode)</span>
                    <input
                      className="input"
                      value={s.card_app_name || 'ZeCard Info'}
                      onChange={(e) => set('card_app_name', e.target.value)}
                      placeholder="e.g. ZeCard Info, Staff ID & Card Portal..."
                    />
                  </label>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <div>
                      <span style={{ fontWeight: 550, display: 'block' }}>Allow Staff Self-Registration</span>
                      <span className="small muted">Staff can register their account directly on the sign-in page</span>
                    </div>
                    <Switch label="Staff self-registration" checked={s.allow_staff_registration ?? true} onChange={(v) => set('allow_staff_registration', v)} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {s.app_mode === 'card' ? (
            <div
              className="card"
              style={{
                padding: '20px 22px',
                background: 'var(--bg-subtle, rgba(0,0,0,0.03))',
                borderRadius: 14,
                border: '1px solid var(--border-color)',
                marginTop: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: '1.25rem' }}>🪪</span>
                <strong style={{ fontSize: '1.05rem', color: 'var(--text-strong)' }}>
                  {s.card_app_name || 'ZeCard Info'} Mode is Active
                </strong>
              </div>
              <p className="small muted" style={{ margin: 0, lineHeight: 1.6 }}>
                The application is running exclusively in <strong>Business Card & ID Info</strong> mode.
                Staff members can register, submit multi-value contact details, preview card designs, and communicate directly with the admin.
                Video capture scheduling options are hidden while this mode is active.
              </p>
            </div>
          ) : (
            <>
              <h2 className="h2" style={{ margin: '4px 0 10px' }}>Capture days per week</h2>
          <div className="list">
            <Row title="Sales days" hint="Days when salespeople are captured">
              <Stepper label="sales days" value={s.sales_days_per_week} min={0} max={7} onChange={(n) => set('sales_days_per_week', n)} />
            </Row>
            <Row title="Company days" hint="Days for company content, nobody booked">
              <Stepper label="company days" value={s.company_days_per_week} min={0} max={7} onChange={(n) => set('company_days_per_week', n)} />
            </Row>
          </div>
          {tooMany && (
            <div style={{ marginTop: 10 }}>
              <Notice kind="error">Sales days and company days cannot add up to more than 7.</Notice>
            </div>
          )}

          <h2 className="h2" style={{ margin: '26px 0 4px' }}>Standard week</h2>
          <p className="small muted" style={{ marginBottom: 10 }}>Set it once. The Planner applies it to any week, or to the next few months, in one tap.</p>
          <div className="list">
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((name, i) => (
              <div key={name} className="planrow">
                <div className="d">{name.slice(0, 3)}</div>
                <div className="seg">
                  {(['off', 'sales', 'company'] as const).map((k) => (
                    <button
                      key={k}
                      data-kind={k === 'off' ? undefined : k}
                      aria-pressed={s.week_pattern[i] === k}
                      onClick={() => set('week_pattern', s.week_pattern.map((x, j) => (j === i ? k : x)))}
                    >
                      {k === 'off' ? 'Off' : k === 'sales' ? 'Sales' : 'Company'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <Row title="Usual videographer" hint="Used when the standard week is applied">
              <select className="select" style={{ width: 170 }} value={s.default_videographer_id ?? ''} onChange={(e) => set('default_videographer_id', e.target.value ? Number(e.target.value) : null)} aria-label="Usual videographer">
                <option value="">Not set</option>
                {vids.data?.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Row>
          </div>
          {(() => {
            const sn = s.week_pattern.filter((x) => x === 'sales').length;
            const cn = s.week_pattern.filter((x) => x === 'company').length;
            return sn > s.sales_days_per_week || cn > s.company_days_per_week ? (
              <div style={{ marginTop: 10 }}>
                <Notice kind="error">
                  The standard week has {sn} sales and {cn} company days. Raise the limits above or change the week.
                </Notice>
              </div>
            ) : null;
          })()}

          <h2 className="h2" style={{ margin: '26px 0 10px' }}>Teams</h2>
          <div className="list">
            <Row title="Salespeople per supervisor" hint="The most one supervisor can have">
              <Stepper label="team size" value={s.max_team_size} min={1} max={100} onChange={(n) => set('max_team_size', n)} />
            </Row>
          </div>

          <div className="list" style={{ marginTop: 10 }}>
            <Row title="Supervisor limit per day" hint="The most people one supervisor can book or request on a single day">
              <Stepper label="supervisor limit per day" value={s.supervisor_max_per_day} min={1} max={50} onChange={(n) => set('supervisor_max_per_day', n)} />
            </Row>
          </div>

          <h2 className="h2" style={{ margin: '26px 0 10px' }}>Each sales day</h2>
          <div className="list">
            <Row title="Balance automatically" hint="Spread everyone evenly across the sales days">
              <Switch label="Balance automatically" checked={s.people_per_sales_day === null} onChange={(v) => set('people_per_sales_day', v ? null : 6)} />
            </Row>
            {s.people_per_sales_day !== null && (
              <Row title="People per day" hint="The most people captured on one day">
                <Stepper label="people per day" value={s.people_per_sales_day} min={1} max={200} onChange={(n) => set('people_per_sales_day', n)} />
              </Row>
            )}
            <Row title="Minutes per person">
              <select className="select" style={{ width: 120 }} value={s.slot_minutes} onChange={(e) => set('slot_minutes', Number(e.target.value))} aria-label="Minutes per person">
                {[10, 15, 20, 30, 45, 60, 90].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </Row>
            <Row title="First capture at">
              <input className="input" type="time" style={{ width: 130 }} value={s.day_start_time} onChange={(e) => set('day_start_time', e.target.value)} aria-label="First capture time" />
            </Row>
            <Row title="Day finishes at" hint="Last capture must end by this time (default 16:30)">
              <input className="input" type="time" style={{ width: 130 }} value={s.day_end_time || '16:30'} onChange={(e) => set('day_end_time', e.target.value)} aria-label="Day finish time" />
            </Row>
            <Row title="Lunch break / Out time" hint="Reserve a gap for videographer lunch break (no captures)">
              <Switch label="Lunch break" checked={s.lunch_break_enabled !== false} onChange={(v) => set('lunch_break_enabled', v)} />
            </Row>
            {s.lunch_break_enabled !== false && (
              <>
                <Row title="Lunch break starts" hint="Videographer break starts (default 12:30 PM)">
                  <input className="input" type="time" style={{ width: 130 }} value={s.lunch_start_time || '12:30'} onChange={(e) => set('lunch_start_time', e.target.value)} aria-label="Lunch break start time" />
                </Row>
                <Row title="Lunch break ends" hint="Videographer break ends (default 1:30 PM / 1 hour gap)">
                  <input className="input" type="time" style={{ width: 130 }} value={s.lunch_end_time || '13:30'} onChange={(e) => set('lunch_end_time', e.target.value)} aria-label="Lunch break end time" />
                </Row>
              </>
            )}
          </div>

          <h2 className="h2" style={{ margin: '26px 0 10px' }}>Overdue</h2>
          <div className="list">
            <Row title="Mark as overdue after" hint="Days since the last completed capture">
              <Stepper label="overdue days" value={s.overdue_days} min={1} max={365} onChange={(n) => set('overdue_days', n)} />
            </Row>
          </div>

              <p className="small muted" style={{ marginTop: 14 }}>
                Changes apply to weeks you plan from now on. Weeks that are already published keep their schedule.
              </p>
            </>
          )}

          <div className="savebar">
            <button className="btn btn-primary btn-block" disabled={!dirty || busy || tooMany} onClick={save}>
              {busy ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', gap: 14, paddingTop: 12, paddingBottom: 12 }}>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="name" style={{ whiteSpace: 'normal' }}>{title}</div>
        {hint && <div className="meta">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

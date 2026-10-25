'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/Auth';
import { IconChevronL } from '@/components/Icons';
import { ErrorBox, Loading, Notice, Stepper, Switch, useToast } from '@/components/ui';
import { api, useFetch } from '@/lib/api';
import type { Settings } from '@/lib/types';
import Link from 'next/link';

export default function SettingsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useFetch<{ settings: Settings }>('/api/settings');
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

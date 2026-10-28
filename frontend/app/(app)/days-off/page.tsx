'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/Auth';
import { IconCalendar } from '@/components/Icons';
import { Empty, ErrorBox, Loading, Notice, useToast } from '@/components/ui';
import { api, useFetch } from '@/lib/api';
import { longDay, todayStr } from '@/lib/dates';

interface Item {
  id: number;
  date: string;
  reason: string | null;
}

export default function DaysOffPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useFetch<{ items: Item[] }>(user?.role === 'sales' ? '/api/unavailability' : null);
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== 'sales') router.replace('/');
  }, [user, router]);
  if (!user || user.role !== 'sales') return null;

  async function add() {
    setBusy(true);
    setErr(null);
    setWarn(null);
    try {
      const r = await api<{ warning: string | null }>('/api/unavailability', { method: 'POST', body: { date, reason: reason || null } });
      setWarn(r.warning);
      toast('Day off added');
      setDate('');
      setReason('');
      reload();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    try {
      await api(`/api/unavailability/${id}`, { method: 'DELETE' });
      toast('Removed');
      reload();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="title">Days off</h1>
          <p className="subtitle">Tell the marketing manager when you cannot be captured</p>
        </div>
      </div>

      <div className="sheet pad">
        {err && <Notice kind="error">{err}</Notice>}
        {warn && <Notice>{warn}</Notice>}
        <label className="field">
          <span className="label">Date</span>
          <input className="input" type="date" min={todayStr()} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">Reason (optional)</span>
          <input className="input" value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} placeholder="For example: family event" />
        </label>
        <button className="btn btn-primary btn-block" disabled={busy || !date} onClick={add}>
          Add day off
        </button>
      </div>

      <section className="section">
        <div className="section-head">
          <h2 className="h2">Upcoming</h2>
        </div>
        {error && <ErrorBox message={error} onRetry={reload} />}
        {loading && !data && <Loading rows={2} />}
        {data && data.items.length === 0 && (
          <div className="sheet">
            <Empty icon={<IconCalendar />} title="No days off" text="The schedule will only avoid dates you add here." />
          </div>
        )}
        {data && data.items.length > 0 && (
          <div className="list">
            {data.items.map((i) => (
              <div key={i.id} className="row">
                <div className="grow">
                  <div className="name">{longDay(i.date)}</div>
                  {i.reason && <div className="meta">{i.reason}</div>}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => remove(i.id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

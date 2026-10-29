'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/Auth';
import { IconChevronL, IconEmpty } from '@/components/Icons';
import { Empty, ErrorBox, Loading, Notice, useToast } from '@/components/ui';
import { api, useFetch } from '@/lib/api';
import { longDay } from '@/lib/dates';

interface Req {
  id: number;
  date: string;
  startTime?: string;
  name: string;
  supervisorName: string | null;
  requestedBy: string | null;
  passed?: boolean;
}

export default function RequestsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useFetch<{ items: Req[] }>('/api/requests');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/');
  }, [user, router]);
  if (!user || user.role !== 'admin') return null;

  async function act(r: Req, what: 'approve' | 'decline') {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/requests/${r.id}/${what}`, { method: 'POST', body: {} });
      toast(what === 'approve' ? 'Approved' : 'Declined');
      await reload();
    } catch (e: any) {
      setErr(`${r.name}: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }
  async function approveAll() {
    setBusy(true);
    setErr(null);
    const fails: string[] = [];
    for (const r of data?.items ?? []) {
      try {
        await api(`/api/requests/${r.id}/approve`, { method: 'POST', body: {} });
      } catch (e: any) {
        fails.push(`${r.name}: ${e.message}`);
      }
    }
    if (fails.length) setErr(fails.join(' · '));
    else toast('All approved');
    setBusy(false);
    reload();
  }

  const items = data?.items ?? [];
  const dates = [...new Set(items.map((i) => i.date))];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link href="/more" className="small" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--indigo-strong)', fontWeight: 650, marginBottom: 6 }}>
            <IconChevronL width={18} height={18} /> More
          </Link>
          <h1 className="title">Supervisor requests</h1>
          <p className="subtitle">{items.length ? `${items.length} waiting for you` : 'Nothing waiting'}</p>
        </div>
        {items.length > 1 && (
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={approveAll}>
            Approve all
          </button>
        )}
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading rows={3} />}
      {err && <Notice kind="error">{err}</Notice>}
      {data && items.length === 0 && (
        <div className="sheet">
          <Empty icon={<IconEmpty />} title="No pending requests" text="When a supervisor asks for slots, they show up here." />
        </div>
      )}
      {dates.map((d) => (
        <div key={d} className="list" style={{ marginBottom: 14 }}>
          <div className="group-head">
            <div className="name">{longDay(d)}</div>
          </div>
          {items
            .filter((i) => i.date === d)
            .map((r) => (
              <div key={r.id} className="row">
                <div className="grow">
                  <div className="name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {r.name}
                    {r.passed && <span className="pill pill-missed">Time passed</span>}
                  </div>
                  <div className="small muted">
                    {r.supervisorName ?? 'No supervisor'}{r.startTime ? ` · Slot at ${r.startTime}` : ''}
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act(r, 'decline')}>
                  Decline
                </button>
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act(r, 'approve')}>
                  Approve
                </button>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

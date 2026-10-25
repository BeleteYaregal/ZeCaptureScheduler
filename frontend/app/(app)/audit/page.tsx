'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/components/Auth';
import { IconChevronL, IconHistory } from '@/components/Icons';
import { Empty, ErrorBox, Loading } from '@/components/ui';
import { useFetch } from '@/lib/api';
import { timeAgo } from '@/lib/dates';
import { actionLabel } from '@/lib/labels';

interface Item {
  id: number;
  at: string;
  who: string;
  action: string;
  entity: string;
  detail: Record<string, any>;
}

function summary(i: Item): string {
  const d = i.detail || {};
  if (i.action === 'plan.save') return `${d.sales ?? 0} sales days, ${d.company ?? 0} company days${d.overrideUsed ? ' (limit overridden)' : ''}`;
  if (i.action === 'schedule.generate') return `${d.booked ?? 0} booked${d.unplaced ? `, ${d.unplaced} did not fit` : ''}`;
  if (i.action === 'schedule.publish') return `${d.bookings ?? 0} captures`;
  if (i.action === 'day.cancel') return `${d.date}${d.reason ? `: ${d.reason}` : ''}`;
  if (i.action.startsWith('user.') || i.action.startsWith('manager.') || i.action.startsWith('supervisor.')) return d.name ? String(d.name) : '';
  if (i.action === 'booking.move') return d.toDay ? `to ${d.toDay}` : '';
  if (i.action.startsWith('availability.')) return d.date ?? '';
  return '';
}

export default function AuditPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { data, error, loading, reload } = useFetch<{ items: Item[] }>(user?.role === 'admin' ? '/api/audit?limit=100' : null);

  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/');
  }, [user, router]);
  if (!user || user.role !== 'admin') return null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link href="/more" className="small" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--indigo-strong)', fontWeight: 650, marginBottom: 6 }}>
            <IconChevronL width={18} height={18} /> More
          </Link>
          <h1 className="title">Activity log</h1>
          <p className="subtitle">Every change, who made it and when</p>
        </div>
      </div>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading rows={4} />}
      {data && data.items.length === 0 && (
        <div className="sheet">
          <Empty icon={<IconHistory />} title="Nothing yet" text="Changes to schedules, people and settings are recorded here." />
        </div>
      )}
      {data && data.items.length > 0 && (
        <div className="list">
          {data.items.map((i) => (
            <div key={i.id} className="row" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="name" style={{ whiteSpace: 'normal' }}>{actionLabel(i.action)}</div>
                <div className="meta">
                  {i.who} · {timeAgo(i.at)}
                </div>
                {summary(i) && <div className="meta" style={{ color: 'var(--ink)' }}>{summary(i)}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

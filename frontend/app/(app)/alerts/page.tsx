'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/Auth';
import { IconBell, IconChevronL } from '@/components/Icons';
import { Empty, ErrorBox, Loading, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/dates';
import type { NotificationItem } from '@/lib/types';

const PAGE = 20;
type Filter = 'all' | 'unread';
interface Page {
  unread: number;
  hasMore: boolean;
  items: NotificationItem[];
}

/** Today / Yesterday / a date, in the phone's own time zone. */
function groupLabel(iso: string): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(new Date()) - start(d)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function AlertsPage() {
  const { refreshUnread } = useAuth();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = useCallback((before?: number) => `/api/notifications?limit=${PAGE}${filter === 'unread' ? '&unread=1' : ''}${before ? `&before=${before}` : ''}`, [filter]);

  const loadFirst = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<Page>(url());
      setItems(r.items);
      setUnread(r.unread);
      setHasMore(r.hasMore);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    loadFirst();
  }, [loadFirst]);

  async function loadMore() {
    const last = items[items.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const r = await api<Page>(url(last.id));
      setItems((cur) => [...cur, ...r.items.filter((n) => !cur.some((c) => c.id === n.id))]);
      setHasMore(r.hasMore);
      setUnread(r.unread);
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setLoadingMore(false);
    }
  }

  async function readOne(n: NotificationItem) {
    if (n.read) return;
    setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
    try {
      await api(`/api/notifications/${n.id}/read`, { method: 'POST' });
      refreshUnread();
    } catch (e: any) {
      toast(e.message, 'error');
      loadFirst();
    }
  }

  async function readAll() {
    try {
      await api('/api/notifications/read-all', { method: 'POST' });
      await loadFirst();
      refreshUnread();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }

  // Group the loaded alerts by day, keeping newest first.
  const groups: { label: string; list: NotificationItem[] }[] = [];
  for (const n of items) {
    const label = groupLabel(n.at);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.list.push(n);
    else groups.push({ label, list: [n] });
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link href="/more" className="backlink">
            <IconChevronL width={18} height={18} /> More
          </Link>
          <h1 className="title">Alerts</h1>
        </div>
        {unread > 0 && (
          <button className="btn btn-soft btn-sm" onClick={readAll}>
            Mark all read
          </button>
        )}
      </div>

      <div className="seg" role="group" aria-label="Show">
        <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          All
        </button>
        <button aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')}>
          Unread{unread > 0 ? ` (${unread})` : ''}
        </button>
      </div>

      {error && <ErrorBox message={error} onRetry={loadFirst} />}
      {loading && items.length === 0 && <div style={{ marginTop: 14 }}><Loading rows={3} /></div>}

      {!loading && !error && items.length === 0 && (
        <div className="sheet" style={{ marginTop: 14 }}>
          <Empty
            icon={<IconBell />}
            title={filter === 'unread' ? 'You are all caught up' : 'No alerts yet'}
            text={filter === 'unread' ? 'No unread alerts.' : 'You will see a message here when a schedule is published or your capture changes.'}
          />
        </div>
      )}

      {groups.map((g) => (
        <section key={g.label} style={{ marginTop: 16 }}>
          <h2 className="list-title" style={{ marginTop: 0 }}>
            {g.label}
          </h2>
          <div className="list">
            {g.list.map((n) => (
              <button
                key={n.id}
                className="row"
                style={{ alignItems: 'flex-start', background: n.read ? undefined : 'var(--indigo-wash)' }}
                onClick={() => readOne(n)}
                aria-label={n.read ? n.title : `${n.title}, unread. Tap to mark as read`}
              >
                <div className="grow">
                  <div className="name" style={{ whiteSpace: 'normal' }}>{n.title}</div>
                  <div className="meta" style={{ color: 'var(--ink)' }}>{n.body}</div>
                  <div className="meta">{timeAgo(n.at)}</div>
                </div>
                {!n.read && <span className="pill pill-live">New</span>}
              </button>
            ))}
          </div>
        </section>
      ))}

      {hasMore && (
        <button className="btn btn-ghost btn-block" style={{ marginTop: 18 }} disabled={loadingMore} onClick={loadMore}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
      {!hasMore && items.length > PAGE && <p className="faint small" style={{ textAlign: 'center', marginTop: 16 }}>That is everything.</p>}
    </div>
  );
}

'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/dates';
import type { NotificationItem } from '@/lib/types';
import { useAuth } from './Auth';
import { IconBell } from './Icons';

export const ALERTS_SEEN_KEY = 'callsheet.alerts.seen';
const POLL_MS = 30_000;

function readSeen(): number[] {
  try {
    return JSON.parse(sessionStorage.getItem(ALERTS_SEEN_KEY) || '[]');
  } catch {
    return [];
  }
}
function writeSeen(ids: number[]) {
  try {
    sessionStorage.setItem(ALERTS_SEEN_KEY, JSON.stringify(ids.slice(-300)));
  } catch {
    /* ignore */
  }
}

/**
 * Pops up unread alerts right after sign-in, and again whenever a new one arrives
 * while the app is open (checked every 30 seconds and when you come back to the tab).
 */
export default function AlertHost() {
  const { user, refreshUnread } = useAuth();
  const [pop, setPop] = useState<NotificationItem[] | null>(null);
  const busy = useRef(false);

  const check = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await api<{ unread: number; items: NotificationItem[] }>('/api/notifications');
      refreshUnread();
      const seen = new Set(readSeen());
      const fresh = r.items.filter((n) => !n.read && !seen.has(n.id));
      if (fresh.length) {
        writeSeen([...seen, ...fresh.map((n) => n.id)]);
        setPop((cur) => {
          const merged = [...fresh, ...(cur ?? [])];
          return merged.filter((n, i) => merged.findIndex((m) => m.id === n.id) === i);
        });
      }
    } catch {
      /* offline: try again next time */
    } finally {
      busy.current = false;
    }
  }, [refreshUnread]);

  useEffect(() => {
    if (!user) return;
    check();
    const t = setInterval(check, POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user, check]);

  useEffect(() => {
    if (!pop) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPop(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pop]);

  async function markRead() {
    setPop(null);
    try {
      await api('/api/notifications/read-all', { method: 'POST' });
    } finally {
      refreshUnread();
    }
  }

  if (!pop || pop.length === 0) return null;
  const shown = pop.slice(0, 4);
  const more = pop.length - shown.length;

  return (
    <div className="scrim" style={{ zIndex: 90 }} onMouseDown={(e) => e.target === e.currentTarget && setPop(null)}>
      <div className="modal alert-pop" role="alertdialog" aria-modal="true" aria-labelledby="alert-pop-title">
        <div className="grab" />
        <div className="alert-pop-icon">
          <IconBell />
          <span className="alert-pop-count">{pop.length > 9 ? '9+' : pop.length}</span>
        </div>
        <h2 id="alert-pop-title" className="modal-title" style={{ textAlign: 'center' }}>
          {pop.length === 1 ? 'You have a new alert' : `You have ${pop.length} new alerts`}
        </h2>
        <ul className="alert-pop-list">
          {shown.map((n) => (
            <li key={n.id}>
              <b>{n.title}</b>
              <span>{n.body}</span>
              <small>{timeAgo(n.at)}</small>
            </li>
          ))}
        </ul>
        {more > 0 && <p className="muted small" style={{ textAlign: 'center', marginTop: 8 }}>and {more} more</p>}
        <div className="btn-row" style={{ marginTop: 18 }}>
          <Link href="/alerts" className="btn btn-ghost" onClick={() => setPop(null)}>
            View all
          </Link>
          <button className="btn btn-primary" onClick={markRead} autoFocus>
            Mark as read
          </button>
        </div>
      </div>
    </div>
  );
}

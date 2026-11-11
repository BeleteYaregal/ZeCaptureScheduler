'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, type ReactElement, type ReactNode } from 'react';
import { useFetch } from '@/lib/api';
import { useBrand, BrandLogo } from '@/lib/brand';
import { ThemeToggle } from '@/lib/theme';
import type { Role } from '@/lib/types';
import AlertHost from './AlertHost';
import { useAuth } from './Auth';
import { IconBell, IconCalendar, IconChart, IconFilm, IconIdCard, IconLock, IconMore, IconSend, IconSettings, IconTeam } from './Icons';

interface Tab {
  href: string;
  label: string;
  icon: (p: any) => ReactElement;
  roles: Role[];
  match?: (p: string) => boolean;
}

const ALL: Role[] = ['admin', 'sales', 'videographer', 'supervisor'];

const TABS: Tab[] = [
  { href: '/', label: 'Schedule', icon: IconCalendar, roles: ALL, match: (p) => p === '/' },
  { href: '/requests', label: 'Requests', icon: IconSend, roles: ['admin'] },
  { href: '/team', label: 'Team', icon: IconTeam, roles: ['admin', 'videographer'] },
  { href: '/insights', label: 'Insights', icon: IconChart, roles: ['admin'] },
  { href: '/book', label: 'Book', icon: IconSend, roles: ['supervisor'] },
  { href: '/my-team', label: 'My team', icon: IconTeam, roles: ['supervisor'] },
  { href: '/editing', label: 'Editing', icon: IconFilm, roles: ['videographer'] },
  { href: '/days-off', label: 'Days off', icon: IconLock, roles: ['sales', 'videographer'] },
  { href: '/more', label: 'More', icon: IconMore, roles: ALL },
];

const CARD_TABS_ADMIN: Tab[] = [
  { href: '/cards', label: 'Cards & ID', icon: IconIdCard, roles: ['admin'], match: (p) => p === '/cards' || p === '/' },
  { href: '/settings', label: 'Settings', icon: IconSettings, roles: ['admin'] },
  { href: '/more', label: 'More', icon: IconMore, roles: ['admin'] },
];

const CARD_TABS_USER: Tab[] = [
  { href: '/card', label: 'My Card & ID', icon: IconIdCard, roles: ALL, match: (p) => p === '/card' || p === '/' },
  { href: '/more', label: 'More', icon: IconMore, roles: ALL },
];

// Screens that live under "More" (the admin reaches Editing from there, the videographer has its own tab).
const MORE_PATHS = ['/more', '/settings', '/audit', '/alerts', '/reports', '/branding'];

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, unread, refreshUnread } = useAuth();
  const { brand } = useBrand();
  const path = usePathname();
  const isCardMode = brand.app_mode === 'card';
  const reqs = useFetch<{ items: unknown[] }>(user?.role === 'admin' && !isCardMode ? '/api/requests' : null);
  const cardSubs = useFetch<{ counts: { submitted: number; revision_requested: number } }>(
    user?.role === 'admin' && isCardMode ? '/api/card/submissions' : null
  );

  useEffect(() => {
    const handler = () => {
      if (isCardMode) cardSubs.reload();
      else reqs.reload();
      refreshUnread();
    };
    window.addEventListener('app:data-changed', handler);
    return () => window.removeEventListener('app:data-changed', handler);
  }, [reqs, cardSubs, isCardMode, refreshUnread]);

  useEffect(() => {
    if (user?.role === 'admin') {
      if (isCardMode) cardSubs.reload();
      else reqs.reload();
    }
    refreshUnread();
  }, [path, isCardMode]);

  if (!user) return null;
  const cardPending = (cardSubs.data?.counts?.submitted ?? 0) + (cardSubs.data?.counts?.revision_requested ?? 0);
  const pending = isCardMode ? cardPending : (reqs.data?.items.length ?? 0);
  const baseTabs = isCardMode ? (user.role === 'admin' ? CARD_TABS_ADMIN : CARD_TABS_USER) : TABS;
  const tabs = baseTabs.filter((t) => t.roles.includes(user.role));
  const inMore = isCardMode
    ? path === '/more' || path.startsWith('/more/') || path.startsWith('/audit') || path.startsWith('/branding') || path.startsWith('/alerts')
    : MORE_PATHS.some((m) => path.startsWith(m)) || (user.role === 'admin' && path.startsWith('/editing'));
  const effectiveBrandName = brand.app_mode === 'card' ? (brand.card_name || 'ZeCard Info') : brand.name;

  return (
    <div className="shell">
      <nav className="tabbar" aria-label="Main">
        <div className="brand rail-only">
          <BrandLogo size={32} />
          <span className="brand-name">{effectiveBrandName}</span>
        </div>
        {tabs.map((t) => {
          const active = t.href === '/more' ? inMore : t.match ? t.match(path) : path.startsWith(t.href);
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href} className="tab" aria-current={active ? 'page' : undefined}>
              <span className="ico">
                <Icon />
                {(t.href === '/requests' || t.href === '/cards') && pending > 0 && (
                  <span className="badge">{pending > 9 ? '9+' : pending}</span>
                )}
              </span>
              {t.label}
            </Link>
          );
        })}
        <div className="rail-foot rail-only">
          <ThemeToggle className="tab tab-btn" label />
        </div>
      </nav>
      <div>
        <header className="topbar">
          <div className="brand">
            <BrandLogo size={32} />
            <span className="brand-name">{effectiveBrandName}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <ThemeToggle />
            <Link href="/alerts" className="iconbtn" aria-label={unread ? `Alerts, ${unread} unread` : 'Alerts'}>
              <IconBell />
              {unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
            </Link>
          </div>
        </header>
        <main className="main">{children}</main>
      </div>
      <AlertHost />
    </div>
  );
}

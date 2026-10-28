'use client';
import Link from 'next/link';
import { useState } from 'react';
import { IconBell, IconChevronR, IconDatabase, IconFilm, IconHistory, IconLock, IconLogout, IconPalette, IconReport, IconSend, IconSettings, IconSmartphone } from '@/components/Icons';
import { InstallSheet } from '@/components/InstallPrompt';
import { Notice, Sheet, useToast } from '@/components/ui';
import { api, downloadFile, useFetch } from '@/lib/api';
import { initials } from '@/lib/dates';
import { ROLE_LABEL } from '@/lib/labels';
import { ThemeMode, useTheme } from '@/lib/theme';

const MODES: { id: ThemeMode; label: string }[] = [
  { id: 'light', label: 'Day' },
  { id: 'dark', label: 'Night' },
  { id: 'system', label: 'Auto' },
];

export default function MorePage() {
  const { user, unread, signOut } = useAuth();
  const { mode, setMode } = useTheme();
  const toast = useToast();
  const [pw, setPw] = useState(false);
  const [tg, setTg] = useState(false);
  const [install, setInstall] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const isAdmin = user.role === 'admin';

  async function backup() {
    setBusy(true);
    try {
      await downloadFile('/api/backup', 'capturesheet-backup.sqlite');
      toast('Backup downloaded');
    } catch (e: any) {
      toast(e.message || 'Could not create the backup', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="title">More</h1>
      </div>

      <div className="sheet pad" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span className="avatar avatar-lg">{initials(user.name)}</span>
        <div style={{ minWidth: 0 }}>
          <div className="h2">{user.name}</div>
          <div className="muted small">
            {ROLE_LABEL[user.role]} · @{user.username}
          </div>
          {user.phone && <div className="muted small">{user.phone}</div>}
        </div>
      </div>

      {isAdmin && (
        <>
          <h2 className="list-title">Manage</h2>
          <div className="list">
            <Link href="/reports" className="row">
              <IconReport className="ico" />
              <div className="grow">
                <div className="name">Reports and export</div>
                <div className="meta">Filter by date and team, download Excel</div>
              </div>
              <IconChevronR className="ico" />
            </Link>
            <Link href="/editing" className="row">
              <IconFilm className="ico" />
              <div className="grow">
                <div className="name">Video editing</div>
                <div className="meta">Which videos are edited, which are waiting</div>
              </div>
              <IconChevronR className="ico" />
            </Link>
            <Link href="/branding" className="row">
              <IconPalette className="ico" />
              <div className="grow">
                <div className="name">Branding</div>
                <div className="meta">App name, logo and color</div>
              </div>
              <IconChevronR className="ico" />
            </Link>
            <Link href="/settings" className="row">
              <IconSettings className="ico" />
              <div className="grow">
                <div className="name">Settings</div>
                <div className="meta">Capture days, team size, slot length</div>
              </div>
              <IconChevronR className="ico" />
            </Link>
            <Link href="/audit" className="row">
              <IconHistory className="ico" />
              <div className="grow">
                <div className="name">Activity log</div>
                <div className="meta">Who changed what, and when</div>
              </div>
              <IconChevronR className="ico" />
            </Link>
            <button className="row" onClick={backup} disabled={busy}>
              <IconDatabase className="ico" />
              <div className="grow">
                <div className="name">{busy ? 'Preparing backup…' : 'Download backup'}</div>
                <div className="meta">A copy of all your data</div>
              </div>
              <IconChevronR className="ico" />
            </button>
          </div>
        </>
      )}

      <h2 className="list-title">Your account</h2>
      <div className="list">
        <Link href="/alerts" className="row">
          <IconBell className="ico" />
          <div className="grow name">Alerts</div>
          {unread > 0 && <span className="pill pill-live">{unread} new</span>}
          <IconChevronR className="ico" />
        </Link>
        <button className="row" onClick={() => setTg(true)}>
          <IconSend className="ico" />
          <div className="grow">
            <div className="name">Telegram alerts</div>
            <div className="meta">Get your alerts in Telegram too</div>
          </div>
          <IconChevronR className="ico" />
        </button>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div className="grow">
            <div className="name">Appearance</div>
            <div className="meta">Day, night, or follow your phone</div>
          </div>
          <div className="seg" role="group" aria-label="Appearance" style={{ minWidth: 190 }}>
            {MODES.map((m) => (
              <button key={m.id} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <button className="row" onClick={() => setInstall(true)}>
          <IconSmartphone className="ico" />
          <div className="grow">
            <div className="name">Install app</div>
            <div className="meta">Add to iPhone or Android home screen</div>
          </div>
          <IconChevronR className="ico" />
        </button>
        <button className="row" onClick={() => setPw(true)}>
          <IconLock className="ico" />
          <div className="grow name">Change password</div>
          <IconChevronR className="ico" />
        </button>
      </div>

      <div className="list" style={{ marginTop: 18 }}>
        <button className="row" onClick={signOut} style={{ color: 'var(--tally)' }}>
          <IconLogout className="ico" style={{ color: 'var(--tally)' }} />
          <div className="grow name">Sign out</div>
        </button>
      </div>

      {pw && <ChangePassword onClose={() => setPw(false)} />}
      {tg && <TelegramSheet onClose={() => setTg(false)} />}
      {install && <InstallSheet onClose={() => setInstall(false)} />}
    </div>
  );
}

function ChangePassword({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api('/api/auth/change-password', { method: 'POST', body: { current, next } });
      toast('Password changed');
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Change password" onClose={onClose}>
      {err && <Notice kind="error">{err}</Notice>}
      <label className="field">
        <span className="label">Current password</span>
        <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label className="field">
        <span className="label">New password</span>
        <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        <p className="hint">At least 6 characters.</p>
      </label>
      <button className="btn btn-primary btn-block" disabled={busy || !current || next.length < 6} onClick={save}>
        Save password
      </button>
    </Sheet>
  );
}

function TelegramSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const { data, loading, reload } = useFetch<{ enabled: boolean; bot: string | null; linked: boolean }>('/api/telegram');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

  async function act(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      if (ok) toast(ok);
      await reload();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const connect = () =>
    act(async () => {
      const r = await api<{ url: string }>('/api/telegram/link', { method: 'POST' });
      window.open(r.url, '_blank');
      setOpened(true);
    });

  return (
    <Sheet title="Telegram alerts" subtitle="Every alert you get in the app also arrives in Telegram." onClose={onClose}>
      {err && <Notice kind="error">{err}</Notice>}
      {loading && !data && <p className="muted">Loading…</p>}
      {data && !data.enabled && <Notice>Telegram is not set up yet. Ask your system owner to add the bot token on the server.</Notice>}
      {data?.enabled && data.linked && (
        <>
          <Notice kind="good">Connected. Your alerts arrive in Telegram.</Notice>
          <button className="btn btn-soft btn-block" disabled={busy} onClick={() => act(() => api('/api/telegram/test', { method: 'POST' }), 'Test sent')}>
            Send a test alert
          </button>
          <div style={{ height: 8 }} />
          <button className="btn btn-danger btn-block" disabled={busy} onClick={() => act(() => api('/api/telegram', { method: 'DELETE' }), 'Disconnected')}>
            Disconnect
          </button>
        </>
      )}
      {data?.enabled && !data.linked && (
        <>
          <p className="muted" style={{ marginBottom: 12 }}>
            Tap Connect, then press <b>Start</b> in the Telegram chat{data.bot ? ` with @${data.bot}` : ''}. Come back here afterwards.
          </p>
          <button className="btn btn-primary btn-block" disabled={busy} onClick={connect}>
            Connect Telegram
          </button>
          {opened && (
            <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => reload()}>
              I pressed Start
            </button>
          )}
        </>
      )}
    </Sheet>
  );
}

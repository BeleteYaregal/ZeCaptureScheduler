'use client';
import { useState } from 'react';
import { useAuth } from '@/components/Auth';
import { IconPlus } from '@/components/Icons';
import { ErrorBox, Loading, Notice, Sheet, useToast } from '@/components/ui';
import { api, useFetch } from '@/lib/api';
import { randomPassword } from '@/lib/labels';

interface Member {
  id: number;
  name: string;
  username: string;
  phone: string | null;
  active: boolean;
}

export default function MyTeamPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useFetch<{ supervisor: { name: string }; max: number; members: Member[] }>('/api/team/members');
  const [sheet, setSheet] = useState<{ edit?: Member } | null>(null);
  const [created, setCreated] = useState<{ name: string; username: string; password: string } | null>(null);
  if (!user || user.role !== 'supervisor') return null;
  const active = data?.members.filter((m) => m.active).length ?? 0;
  const full = !!data && active >= data.max;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="title">My team</h1>
          <p className="subtitle">{data ? `${active} of ${data.max} salespeople` : 'Your salespeople'}</p>
        </div>
        <button className="btn btn-primary btn-sm" disabled={full} onClick={() => setSheet({})}>
          <IconPlus width={18} height={18} /> Register
        </button>
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading rows={3} />}
      {full && <Notice kind="info">Your team is full. Ask the admin to raise the limit in Settings.</Notice>}
      {data && (
        <div className="list">
          {data.members.length === 0 && <p className="pad muted">Nobody yet. Register your first salesperson.</p>}
          {data.members.map((m) => (
            <button key={m.id} className="row" onClick={() => setSheet({ edit: m })} style={{ opacity: m.active ? 1 : 0.55 }}>
              <div className="grow" style={{ textAlign: 'left' }}>
                <div className="name">{m.name}</div>
                <div className="small muted">@{m.username}{m.phone ? ` · ${m.phone}` : ''}</div>
              </div>
              {!m.active && <span className="pill">Inactive</span>}
            </button>
          ))}
        </div>
      )}
      {sheet && (
        <MemberForm
          edit={sheet.edit}
          onClose={() => setSheet(null)}
          onDone={() => {
            setSheet(null);
            reload();
          }}
          onCreated={(c) => {
            setSheet(null);
            setCreated(c);
            reload();
          }}
        />
      )}
      {created && (
        <Sheet title="Salesperson registered" subtitle="Share these sign-in details with them." onClose={() => setCreated(null)}>
          <div className="list">
            <div className="row"><span className="muted">Name</span><b>{created.name}</b></div>
            <div className="row"><span className="muted">Username</span><b>{created.username}</b></div>
            <div className="row"><span className="muted">Password</span><b>{created.password}</b></div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function MemberForm({ edit, onClose, onDone, onCreated }: { edit?: Member; onClose: () => void; onDone: () => void; onCreated: (c: { name: string; username: string; password: string }) => void }) {
  const toast = useToast();
  const [name, setName] = useState(edit?.name ?? '');
  const [username, setUsername] = useState(edit?.username ?? '');
  const [phone, setPhone] = useState(edit?.phone ?? '');
  const [password, setPassword] = useState(edit ? '' : randomPassword());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canSave = name.trim().length >= 2 && (edit ? true : username.trim().length >= 3 && password.length >= 6);

  async function run(fn: () => Promise<unknown>, ok: string, after: () => void) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      toast(ok);
      after();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    edit
      ? run(() => api(`/api/team/members/${edit.id}`, { method: 'PATCH', body: { name, phone: phone || null, ...(password ? { password } : {}) } }), 'Saved', onDone)
      : run(() => api('/api/team/members', { method: 'POST', body: { name, username, password, phone: phone || null } }), 'Registered', () => onCreated({ name, username: username.toLowerCase(), password }));
  const toggle = () => run(() => api(`/api/team/members/${edit!.id}`, { method: 'PATCH', body: { active: !edit!.active } }), edit!.active ? 'Deactivated' : 'Reactivated', onDone);

  return (
    <Sheet title={edit ? 'Edit salesperson' : 'Register a salesperson'} onClose={onClose}>
      {err && <Notice kind="error">{err}</Notice>}
      <label className="field">
        <span className="label">Full name</span>
        <input className="input" value={name} autoFocus={!edit} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span className="label">Username</span>
        <input className="input" value={username} disabled={!!edit} onChange={(e) => setUsername(e.target.value.toLowerCase())} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      </label>
      <label className="field">
        <span className="label">{edit ? 'New password (leave empty to keep)' : 'Password'}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          <button type="button" className="btn btn-soft btn-sm" style={{ minHeight: 50 }} onClick={() => setPassword(randomPassword())}>Suggest</button>
        </div>
      </label>
      <label className="field">
        <span className="label">Phone (optional)</span>
        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
      </label>
      <button className="btn btn-primary btn-block" disabled={busy || !canSave} onClick={save}>
        {edit ? 'Save changes' : 'Register salesperson'}
      </button>
      {edit && (
        <>
          <div style={{ height: 10 }} />
          <button className={`btn btn-block ${edit.active ? 'btn-danger' : 'btn-good'}`} disabled={busy} onClick={toggle}>
            {edit.active ? 'Deactivate' : 'Reactivate'}
          </button>
        </>
      )}
    </Sheet>
  );
}

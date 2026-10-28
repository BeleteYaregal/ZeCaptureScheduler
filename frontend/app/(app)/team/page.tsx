'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/Auth';
import { IconChevronR, IconDown, IconEmpty, IconPhone, IconPlus, IconSearch, IconTeam, IconUp, IconUser } from '@/components/Icons';
import { Empty, ErrorBox, Loading, Notice, Sheet, Switch, useToast } from '@/components/ui';
import { api, useFetch } from '@/lib/api';
import { initials, shortDay } from '@/lib/dates';
import { randomPassword } from '@/lib/labels';
import type { ManagerNode, OrgView, SalesNode, SupNode } from '@/lib/types';

type SheetState =
  | null
  | { kind: 'add' }
  | { kind: 'manager'; edit?: ManagerNode }
  | { kind: 'supervisor'; edit?: SupNode; managerId?: number }
  | { kind: 'account'; role: 'sales' | 'videographer' | 'supervisor'; edit?: { id: number; name: string; username?: string; phone: string | null; active: boolean; supervisorId?: number | null }; supervisorId?: number }
  | { kind: 'created'; name: string; username: string; password: string };

type Tab = 'teams' | 'people' | 'crew';
type Flat = SalesNode & { supId: number | null; supName: string | null; mgrName: string | null };
const PAGE = 30;

export default function TeamPage() {
  const { user } = useAuth();
  const router = useRouter();
  const allowed = !!user && user.role !== 'sales' && user.role !== 'supervisor';
  const { data, error, loading, reload } = useFetch<OrgView>(allowed ? '/api/org' : null);
  useEffect(() => {
    if (user && (user.role === 'sales' || user.role === 'supervisor')) router.replace('/');
  }, [user, router]);
  const [tab, setTab] = useState<Tab>('teams');
  const [q, setQ] = useState('');
  const [showOff, setShowOff] = useState(false);
  const [supFilter, setSupFilter] = useState<string>('all'); // 'all' | 'none' | supervisor id
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<SheetState>(null);
  const isAdmin = user?.role === 'admin';
  const needle = q.trim().toLowerCase();

  useEffect(() => setLimit(PAGE), [needle, supFilter, showOff, tab]);

  const flat = useMemo<Flat[]>(() => {
    if (!data) return [];
    const out: Flat[] = [];
    for (const m of data.managers)
      for (const s of m.supervisors)
        for (const p of s.sales) out.push({ ...p, supId: s.id, supName: s.name, mgrName: m.name });
    for (const p of data.unassignedSales) out.push({ ...p, supId: null, supName: null, mgrName: null });
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const view = useMemo(() => {
    if (!data) return [];
    const hit = (t: string) => t.toLowerCase().includes(needle);
    return data.managers
      .filter((m) => showOff || m.active)
      .map((m) => ({
        ...m,
        supervisors: m.supervisors
          .filter((s) => showOff || s.active)
          .map((s) => {
            const nameHit = !needle || hit(s.name) || hit(m.name);
            return { ...s, sales: s.sales.filter((p) => (showOff || p.active) && (nameHit || hit(p.name))) };
          })
          .filter((s) => !needle || s.sales.length > 0 || hit(s.name)),
      }))
      .filter((m) => !needle || m.supervisors.length > 0 || hit(m.name));
  }, [data, needle, showOff]);

  const people = useMemo(
    () =>
      flat.filter((p) => {
        if (!showOff && !p.active) return false;
        if (supFilter === 'none' ? p.supId !== null : supFilter !== 'all' && String(p.supId) !== supFilter) return false;
        return !needle || p.name.toLowerCase().includes(needle) || (p.supName ?? '').toLowerCase().includes(needle) || (p.username ?? '').toLowerCase().includes(needle);
      }),
    [flat, needle, showOff, supFilter]
  );

  if (!user || user.role === 'sales' || user.role === 'supervisor') return null;
  const done = () => {
    setSheet(null);
    reload();
  };
  const toggle = (k: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const isOpen = (k: string) => !!needle || open.has(k);

  const activeSales = flat.filter((p) => p.active).length;
  const sups = data?.managers.flatMap((m) => m.supervisors.filter((s) => s.active)) ?? [];
  const unassigned = data?.unassignedSales.filter((p) => p.active).length ?? 0;
  const allSups = data?.managers.flatMap((m) => m.supervisors.map((s) => ({ ...s, mgr: m.name }))) ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="title">Team</h1>
          <p className="subtitle">Sales managers, supervisors and their teams</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary btn-sm" onClick={() => setSheet({ kind: 'add' })}>
            <IconPlus /> Add
          </button>
        )}
      </div>

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
          {[
            { n: data.managers.filter((m) => m.active).length, l: 'Managers' },
            { n: sups.length, l: 'Supervisors' },
            { n: activeSales, l: 'Salespeople' },
          ].map((x) => (
            <div key={x.l} className="sheet" style={{ padding: '12px 14px', textAlign: 'center' }}>
              <div className="num" style={{ fontSize: 22, fontWeight: 750 }}>{x.n}</div>
              <div className="small muted">{x.l}</div>
            </div>
          ))}
        </div>
      )}

      <div className="seg" role="group" aria-label="Team view" style={{ marginBottom: 12 }}>
        <button aria-pressed={tab === 'teams'} onClick={() => setTab('teams')}>Teams</button>
        <button aria-pressed={tab === 'people'} onClick={() => setTab('people')}>
          People{unassigned > 0 && isAdmin ? ` · ${unassigned}!` : ''}
        </button>
        {isAdmin && (
          <button aria-pressed={tab === 'crew'} onClick={() => setTab('crew')}>Videographers</button>
        )}
      </div>

      {tab !== 'crew' && (
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <IconSearch width={18} height={18} style={{ position: 'absolute', left: 14, top: 16, color: 'var(--ink-3)' }} />
          <input
            className="input"
            type="search"
            placeholder={tab === 'people' ? 'Search name, username or supervisor' : 'Search a team or person'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search the team"
            style={{ paddingLeft: 42 }}
          />
        </div>
      )}

      {tab === 'people' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <select className="select" value={supFilter} onChange={(e) => setSupFilter(e.target.value)} aria-label="Filter by supervisor" style={{ flex: 1, minWidth: 0 }}>
            <option value="all">All supervisors</option>
            {isAdmin && unassigned > 0 && <option value="none">Not in a team ({unassigned})</option>}
            {allSups
              .filter((s) => showOff || s.active)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.teamSize})
                </option>
              ))}
          </select>
        </div>
      )}

      {isAdmin && tab !== 'crew' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 2px 10px' }}>
          <span className="small muted">Show inactive</span>
          <Switch checked={showOff} onChange={setShowOff} label="Show inactive people" />
        </div>
      )}

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading rows={3} />}

      {data && data.managers.length === 0 && tab === 'teams' && (
        <div className="sheet">
          <Empty
            icon={<IconEmpty />}
            title="No teams yet"
            text={isAdmin ? 'Start by adding a sales manager. Then add their supervisors, then register the salespeople.' : 'The admin has not set up the teams yet.'}
            action={isAdmin ? <button className="btn btn-primary" onClick={() => setSheet({ kind: 'manager' })}>Add a sales manager</button> : undefined}
          />
        </div>
      )}

      {/* ---------------------------------------------------------------- Teams */}
      {tab === 'teams' &&
        view.map((m) => {
          const mk = `m${m.id}`;
          const people = m.supervisors.reduce((n, s) => n + s.teamSize, 0);
          return (
            <section key={m.id} className="sheet" style={{ marginBottom: 12, overflow: 'hidden' }}>
              <div className="row" style={{ cursor: 'pointer' }} onClick={() => toggle(mk)} role="button" aria-expanded={isOpen(mk)}>
                <span className="avatar">{initials(m.name)}</span>
                <div className="grow">
                  <div className="name" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {m.name}
                    {!m.active && <span className="pill">Inactive</span>}
                  </div>
                  <div className="meta">
                    Sales manager · {m.supervisors.length} {m.supervisors.length === 1 ? 'supervisor' : 'supervisors'} · {people} people
                  </div>
                </div>
                {isAdmin && (
                  <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setSheet({ kind: 'manager', edit: m }); }}>
                    Edit
                  </button>
                )}
                {isOpen(mk) ? <IconUp className="ico" /> : <IconDown className="ico" />}
              </div>

              {isOpen(mk) && (
                <div style={{ borderTop: '1px solid var(--line)' }}>
                  {m.supervisors.length === 0 && <p className="pad muted small">No supervisors yet.</p>}
                  {m.supervisors.map((sv) => {
                    const sk = `s${sv.id}`;
                    return (
                      <div key={sv.id} style={{ borderTop: '1px solid var(--line)' }}>
                        <div className="row" style={{ cursor: 'pointer', paddingLeft: 24 }} onClick={() => toggle(sk)} role="button" aria-expanded={isOpen(sk)}>
                          <div className="grow">
                            <div className="name" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              {sv.name}
                              {!sv.active && <span className="pill">Inactive</span>}
                              {isAdmin && sv.active && !sv.login && <span className="pill pill-requested">No login</span>}
                            </div>
                            <div className="meter" data-full={sv.teamSize >= sv.max} style={{ marginTop: 6, maxWidth: 140 }}>
                              <i style={{ width: `${Math.min(100, (sv.teamSize / sv.max) * 100)}%` }} />
                            </div>
                          </div>
                          <span className="small num" style={{ fontWeight: 650 }}>{sv.teamSize}/{sv.max}</span>
                          {isOpen(sk) ? <IconUp className="ico" /> : <IconDown className="ico" />}
                        </div>
                        {isOpen(sk) && (
                          <div style={{ background: 'var(--surface-2, transparent)' }}>
                            {isAdmin && (
                              <div style={{ display: 'flex', gap: 8, padding: '4px 16px 10px 24px', flexWrap: 'wrap' }}>
                                {sv.active && (
                                  <button
                                    className="btn btn-soft btn-sm"
                                    onClick={() =>
                                      setSheet({
                                        kind: 'account',
                                        role: 'supervisor',
                                        supervisorId: sv.id,
                                        edit: sv.login ? { id: sv.login.id, name: sv.name, username: sv.login.username, phone: sv.phone, active: true } : undefined,
                                      })
                                    }
                                  >
                                    {sv.login ? `Login @${sv.login.username}` : 'Create login'}
                                  </button>
                                )}
                                <button className="btn btn-ghost btn-sm" onClick={() => setSheet({ kind: 'supervisor', edit: sv })}>Edit supervisor</button>
                              </div>
                            )}
                            {sv.sales.length === 0 && <p className="pad muted small">No salespeople here yet.</p>}
                            {sv.sales.map((p) => (
                              <PersonRow key={p.id} p={p} admin={!!isAdmin} onOpen={() => setSheet({ kind: 'account', role: 'sales', edit: { ...p, supervisorId: sv.id } })} />
                            ))}
                            {isAdmin && (
                              <button className="row" onClick={() => setSheet({ kind: 'account', role: 'sales', supervisorId: sv.id })} style={{ color: 'var(--indigo-strong)', fontWeight: 650 }} disabled={sv.teamSize >= sv.max}>
                                <IconPlus className="ico" style={{ color: 'var(--indigo)' }} />
                                {sv.teamSize >= sv.max ? 'Team is full' : 'Register a salesperson'}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {isAdmin && !needle && (
                    <button className="row" style={{ borderTop: '1px solid var(--line)', color: 'var(--indigo-strong)', fontWeight: 650 }} onClick={() => setSheet({ kind: 'supervisor', managerId: m.id })}>
                      <IconPlus className="ico" style={{ color: 'var(--indigo)' }} /> Add a supervisor
                    </button>
                  )}
                </div>
              )}
            </section>
          );
        })}

      {/* ---------------------------------------------------------------- People */}
      {tab === 'people' && data && (
        <>
          {isAdmin && unassigned > 0 && supFilter === 'all' && !needle && (
            <Notice
              action={
                <button className="btn btn-sm btn-soft" onClick={() => setSupFilter('none')}>
                  Show
                </button>
              }
            >
              {unassigned} {unassigned === 1 ? 'salesperson has' : 'salespeople have'} no supervisor and cannot be scheduled.
            </Notice>
          )}
          <p className="small muted" style={{ margin: '2px 2px 8px' }}>
            {people.length} {people.length === 1 ? 'person' : 'people'}
          </p>
          {people.length === 0 ? (
            <div className="sheet">
              <Empty icon={<IconEmpty />} title="Nobody found" text="Try another name or clear the filters." />
            </div>
          ) : (
            <div className="list">
              {people.slice(0, limit).map((p) => (
                <PersonRow
                  key={p.id}
                  p={p}
                  sub={p.supName ? `${p.supName} · ${p.mgrName}` : 'No supervisor'}
                  admin={!!isAdmin}
                  onOpen={() => setSheet({ kind: 'account', role: 'sales', edit: { ...p, supervisorId: p.supId } })}
                />
              ))}
            </div>
          )}
          {people.length > limit && (
            <button className="btn btn-soft btn-block" style={{ marginTop: 12 }} onClick={() => setLimit((l) => l + PAGE)}>
              Show more ({people.length - limit} left)
            </button>
          )}
        </>
      )}

      {/* ---------------------------------------------------------------- Videographers */}
      {tab === 'crew' && isAdmin && data && (
        <section>
          <div className="section-head">
            <h2 className="h2">Videographers</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => setSheet({ kind: 'account', role: 'videographer' })}>
              <IconPlus /> Add
            </button>
          </div>
          <div className="list">
            {data.videographers.length === 0 && <p className="pad muted">No videographer yet. Add one so a week can be published.</p>}
            {data.videographers.map((v) => (
              <button key={v.id} className="row" onClick={() => setSheet({ kind: 'account', role: 'videographer', edit: v })} style={!v.active ? { opacity: 0.55 } : undefined}>
                <span className="avatar">{initials(v.name)}</span>
                <div className="grow">
                  <div className="name">{v.name}</div>
                  <div className="meta">@{v.username}</div>
                </div>
                {!v.active && <span className="pill">Inactive</span>}
                <IconChevronR className="ico" />
              </button>
            ))}
          </div>
        </section>
      )}

      {sheet?.kind === 'add' && (
        <Sheet title="Add to the team" onClose={() => setSheet(null)}>
          <div className="actions">
            <button className="action" onClick={() => setSheet({ kind: 'account', role: 'sales' })}>
              <IconUser /> Register a salesperson
            </button>
            <button className="action" onClick={() => setSheet({ kind: 'supervisor' })}>
              <IconTeam /> Add a supervisor
            </button>
            <button className="action" onClick={() => setSheet({ kind: 'manager' })}>
              <IconTeam /> Add a sales manager
            </button>
            <button className="action" onClick={() => setSheet({ kind: 'account', role: 'videographer' })}>
              <IconUser /> Add a videographer
            </button>
          </div>
        </Sheet>
      )}
      {sheet?.kind === 'manager' && <ManagerForm edit={sheet.edit} onClose={() => setSheet(null)} onDone={done} />}
      {sheet?.kind === 'supervisor' && <SupervisorForm org={data} edit={sheet.edit} managerId={sheet.managerId} onClose={() => setSheet(null)} onDone={done} />}
      {sheet?.kind === 'account' && (
        <AccountForm
          org={data}
          role={sheet.role}
          edit={sheet.edit}
          presetSupervisor={sheet.supervisorId}
          onClose={() => setSheet(null)}
          onDone={done}
          onCreated={(c) => {
            reload();
            setSheet({ kind: 'created', ...c });
          }}
        />
      )}
      {sheet?.kind === 'created' && <CreatedSheet {...sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------ rows */

function PersonRow({ p, admin, onOpen, sub }: { p: SalesNode; admin: boolean; onOpen: () => void; sub?: string }) {
  const when = p.next
    ? `Next: ${shortDay(p.next.date)} · ${p.next.startTime}`
    : p.lastCaptured
      ? `Last captured ${shortDay(p.lastCaptured)}`
      : 'Not captured yet';
  const body = (
    <>
      <span className="avatar" style={!p.active ? { opacity: 0.5 } : undefined}>
        {initials(p.name)}
      </span>
      <div className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
        <div className="name">{p.name}</div>
        <div className="meta">{sub ? `${sub} · ${when}` : when}</div>
      </div>
      {!p.active && <span className="pill">Inactive</span>}
    </>
  );
  if (admin) {
    return (
      <button className="row" onClick={onOpen}>
        {body}
        <IconChevronR className="ico" />
      </button>
    );
  }
  return (
    <div className="row">
      {body}
      {p.phone && (
        <a className="iconbtn" href={`tel:${p.phone}`} aria-label={`Call ${p.name}`}>
          <IconPhone />
        </a>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ forms */

function useSubmit(onDone: () => void) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function run<T>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> {
    setBusy(true);
    setErr(null);
    try {
      const r = await fn();
      if (ok) toast(ok);
      onDone();
      return r;
    } catch (e: any) {
      setErr(e.message || 'Something went wrong');
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  return { busy, err, run };
}

function ManagerForm({ edit, onClose, onDone }: { edit?: ManagerNode; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(edit?.name ?? '');
  const [phone, setPhone] = useState(edit?.phone ?? '');
  const { busy, err, run } = useSubmit(onDone);
  return (
    <Sheet title={edit ? 'Edit sales manager' : 'Add a sales manager'} subtitle="A sales manager is a team group. They do not sign in." onClose={onClose}>
      {err && <Notice kind="error">{err}</Notice>}
      <label className="field">
        <span className="label">Full name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!edit} />
      </label>
      <label className="field">
        <span className="label">Phone (optional)</span>
        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
      </label>
      <button
        className="btn btn-primary btn-block"
        disabled={busy || name.trim().length < 2}
        onClick={() =>
          run(
            () => (edit ? api(`/api/managers/${edit.id}`, { method: 'PATCH', body: { name, phone: phone || null } }) : api('/api/managers', { method: 'POST', body: { name, phone: phone || null } })),
            edit ? 'Saved' : 'Sales manager added'
          )
        }
      >
        {edit ? 'Save changes' : 'Add sales manager'}
      </button>
      {edit && (
        <>
          <div style={{ height: 10 }} />
          <button className={`btn btn-block ${edit.active ? 'btn-danger' : 'btn-good'}`} disabled={busy} onClick={() => run(() => api(`/api/managers/${edit.id}`, { method: 'PATCH', body: { active: !edit.active } }), edit.active ? 'Deactivated' : 'Reactivated')}>
            {edit.active ? 'Deactivate' : 'Reactivate'}
          </button>
        </>
      )}
    </Sheet>
  );
}

function SupervisorForm({ org, edit, managerId, onClose, onDone }: { org: OrgView | null; edit?: SupNode; managerId?: number; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(edit?.name ?? '');
  const [phone, setPhone] = useState(edit?.phone ?? '');
  const [mgr, setMgr] = useState<number | ''>(edit?.managerId ?? managerId ?? '');
  const { busy, err, run } = useSubmit(() => {});
  const [login, setLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(randomPassword());
  const [made, setMade] = useState<{ username: string; password: string } | null>(null);
  const managers = org?.managers.filter((m) => m.active) ?? [];
  const loginOk = !login || (username.trim().length >= 3 && password.length >= 6);
  if (made) {
    return (
      <Sheet title="Supervisor added" subtitle="Give these sign-in details to the supervisor." onClose={onDone}>
        <div className="list">
          <div className="row"><span className="muted">Username</span><b>{made.username}</b></div>
          <div className="row"><span className="muted">Password</span><b>{made.password}</b></div>
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet title={edit ? 'Edit supervisor' : 'Add a supervisor'} subtitle="A supervisor leads a team under a sales manager and can sign in to book his own team." onClose={onClose}>
      {err && <Notice kind="error">{err}</Notice>}
      <label className="field">
        <span className="label">Full name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!edit} />
      </label>
      <label className="field">
        <span className="label">Sales manager</span>
        <select className="select" value={mgr} onChange={(e) => setMgr(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Choose a sales manager</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {managers.length === 0 && <p className="hint">Add a sales manager first.</p>}
      </label>
      <label className="field">
        <span className="label">Phone (optional)</span>
        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
      </label>
      {!edit && (
        <>
          <label className="row" style={{ padding: '4px 0' }}>
            <input type="checkbox" checked={login} onChange={(e) => setLogin(e.target.checked)} />
            <span className="grow name">Create a sign-in for this supervisor</span>
          </label>
          {login && (
            <>
              <label className="field">
                <span className="label">Username</span>
                <input className="input" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
              </label>
              <label className="field">
                <span className="label">Password</span>
                <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
              </label>
            </>
          )}
        </>
      )}
      <button
        className="btn btn-primary btn-block"
        disabled={busy || name.trim().length < 2 || !mgr || (!edit && !loginOk)}
        onClick={() =>
          run(async () => {
            if (edit) {
              await api(`/api/supervisors/${edit.id}`, { method: 'PATCH', body: { name, phone: phone || null, managerId: mgr } });
              onDone();
              return true;
            }
            const r = await api<{ supervisor: { id: number } }>('/api/supervisors', { method: 'POST', body: { name, phone: phone || null, managerId: mgr } });
            if (login) {
              await api('/api/users', { method: 'POST', body: { name, username, password, role: 'supervisor', supervisorId: r.supervisor.id, phone: phone || null } });
              setMade({ username: username.toLowerCase(), password });
            } else onDone();
            return r;
          }, edit ? 'Saved' : 'Supervisor added')
        }
      >
        {edit ? 'Save changes' : 'Add supervisor'}
      </button>
      {edit && (
        <>
          <div style={{ height: 10 }} />
          <button className={`btn btn-block ${edit.active ? 'btn-danger' : 'btn-good'}`} disabled={busy} onClick={() => run(() => api(`/api/supervisors/${edit.id}`, { method: 'PATCH', body: { active: !edit.active } }), edit.active ? 'Deactivated' : 'Reactivated')}>
            {edit.active ? 'Deactivate' : 'Reactivate'}
          </button>
        </>
      )}
    </Sheet>
  );
}

function AccountForm({
  org,
  role,
  edit,
  presetSupervisor,
  onClose,
  onDone,
  onCreated,
}: {
  org: OrgView | null;
  role: 'sales' | 'videographer' | 'supervisor';
  edit?: { id: number; name: string; username?: string; phone: string | null; active: boolean; supervisorId?: number | null };
  presetSupervisor?: number;
  onClose: () => void;
  onDone: () => void;
  onCreated: (c: { name: string; username: string; password: string }) => void;
}) {
  const [name, setName] = useState(edit?.name ?? '');
  const [username, setUsername] = useState(edit?.username ?? '');
  const [phone, setPhone] = useState(edit?.phone ?? '');
  const [password, setPassword] = useState(edit ? '' : randomPassword());
  const [sup, setSup] = useState<number | ''>(edit?.supervisorId ?? presetSupervisor ?? '');
  const { busy, err, run } = useSubmit(() => {});
  const label = role === 'sales' ? 'salesperson' : role === 'supervisor' ? 'supervisor login' : 'videographer';

  const suggestUsername = (n: string) =>
    n
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join('.');

  const canSave = name.trim().length >= 2 && (edit ? true : username.trim().length >= 3 && password.length >= 6) && (role !== 'sales' || !!sup);

  async function save() {
    if (edit) {
      const body: Record<string, unknown> = { name, phone: phone || null };
      if (role === 'sales') body.supervisorId = sup || null;
      if (password) body.password = password;
      const r = await run(() => api(`/api/users/${edit.id}`, { method: 'PATCH', body }), 'Saved');
      if (r) onDone();
    } else {
      const body = { name, username, password, role, phone: phone || null, supervisorId: role === 'sales' ? sup : role === 'supervisor' ? presetSupervisor : undefined };
      const r = await run(() => api(`/api/users`, { method: 'POST', body }));
      if (r) onCreated({ name, username: username.toLowerCase(), password });
    }
  }

  async function toggleActive() {
    if (!edit) return;
    const r = await run(() => api(`/api/users/${edit.id}`, { method: 'PATCH', body: { active: !edit.active } }), edit.active ? 'Deactivated' : 'Reactivated');
    if (r) onDone();
  }

  return (
    <Sheet title={edit ? `Edit ${label}` : `Register a ${label}`} subtitle={edit ? undefined : 'They sign in with the username and password you set here.'} onClose={onClose}>
      {err && <Notice kind="error">{err}</Notice>}
      <label className="field">
        <span className="label">Full name</span>
        <input
          className="input"
          value={name}
          autoFocus={!edit}
          onChange={(e) => {
            setName(e.target.value);
            if (!edit && (!username || username === suggestUsername(name))) setUsername(suggestUsername(e.target.value));
          }}
        />
      </label>
      {role === 'sales' && (
        <label className="field">
          <span className="label">Supervisor</span>
          <select className="select" value={sup} onChange={(e) => setSup(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Choose a supervisor</option>
            {org?.managers
              .filter((m) => m.active)
              .map((m) => (
                <optgroup key={m.id} label={m.name}>
                  {m.supervisors
                    .filter((s) => s.active)
                    .map((s) => (
                      <option key={s.id} value={s.id} disabled={s.teamSize >= s.max && s.id !== edit?.supervisorId}>
                        {s.name} ({s.teamSize}/{s.max}
                        {s.teamSize >= s.max && s.id !== edit?.supervisorId ? ', full' : ''})
                      </option>
                    ))}
                </optgroup>
              ))}
          </select>
        </label>
      )}
      <label className="field">
        <span className="label">Username</span>
        <input className="input" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} disabled={!!edit} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        {edit && <p className="hint">Usernames cannot be changed.</p>}
      </label>
      <label className="field">
        <span className="label">{edit ? 'New password (leave empty to keep)' : 'Password'}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          <button type="button" className="btn btn-soft btn-sm" style={{ minHeight: 50 }} onClick={() => setPassword(randomPassword())}>
            Suggest
          </button>
        </div>
        <p className="hint">At least 6 characters.</p>
      </label>
      <label className="field">
        <span className="label">Phone (optional)</span>
        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
      </label>
      <button className="btn btn-primary btn-block" disabled={busy || !canSave} onClick={save}>
        {edit ? 'Save changes' : `Register ${label}`}
      </button>
      {edit && (
        <>
          <div style={{ height: 10 }} />
          <button className={`btn btn-block ${edit.active ? 'btn-danger' : 'btn-good'}`} disabled={busy} onClick={toggleActive}>
            {edit.active ? 'Deactivate account' : 'Reactivate account'}
          </button>
          {edit.active && role === 'sales' && <p className="hint">Deactivating removes their upcoming captures.</p>}
        </>
      )}
    </Sheet>
  );
}

function CreatedSheet({ name, username, password, onClose }: { name: string; username: string; password: string; onClose: () => void }) {
  const toast = useToast();
  const text = `CaptureSheet sign-in\nUsername: ${username}\nPassword: ${password}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied');
    } catch {
      toast('Could not copy. Select the text and copy it.', 'error');
    }
  }
  return (
    <Sheet title="Account ready" subtitle={`Share these with ${name}. The password is not shown again.`} onClose={onClose}>
      <div className="list pad" style={{ display: 'grid', gap: 12 }}>
        <div>
          <div className="small muted">Username</div>
          <div className="h2 num" style={{ userSelect: 'all' }}>{username}</div>
        </div>
        <div>
          <div className="small muted">Password</div>
          <div className="h2 num" style={{ userSelect: 'all' }}>{password}</div>
        </div>
      </div>
      <div style={{ height: 14 }} />
      <div className="btn-row">
        <button className="btn btn-soft" onClick={copy}>
          Copy
        </button>
        <button className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Sheet>
  );
}

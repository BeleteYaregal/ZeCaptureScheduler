'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/Auth';
import { IconChevronL, IconEmpty } from '@/components/Icons';
import { Empty, ErrorBox, Loading, Notice, Sheet, useToast } from '@/components/ui';
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

interface AvailableDay {
  id: number;
  date: string;
  startTime: string;
  nextSlotTime: string;
  load: number;
  capacity: number;
}

export default function RequestsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useFetch<{ items: Req[] }>('/api/requests');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rescheduleReq, setRescheduleReq] = useState<Req | null>(null);

  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/');
  }, [user, router]);
  if (!user || user.role !== 'admin') return null;

  async function act(r: Req, what: 'approve' | 'decline') {
    if (what === 'approve' && r.passed) {
      setRescheduleReq(r);
      return;
    }
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
    const valid = (data?.items ?? []).filter((r) => !r.passed);
    const passedCount = (data?.items ?? []).filter((r) => r.passed).length;
    for (const r of valid) {
      try {
        await api(`/api/requests/${r.id}/approve`, { method: 'POST', body: {} });
      } catch (e: any) {
        fails.push(`${r.name}: ${e.message}`);
      }
    }
    if (fails.length) setErr(fails.join(' · '));
    else if (passedCount > 0) toast(`Approved valid requests (${passedCount} passed requests need rescheduling)`);
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
                {r.passed ? (
                  <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setRescheduleReq(r)}>
                    Reschedule & Approve
                  </button>
                ) : (
                  <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act(r, 'approve')}>
                    Approve
                  </button>
                )}
              </div>
            ))}
        </div>
      ))}

      {rescheduleReq && (
        <RescheduleSheet
          req={rescheduleReq}
          onClose={() => setRescheduleReq(null)}
          onDone={() => {
            setRescheduleReq(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function RescheduleSheet({
  req,
  onClose,
  onDone,
}: {
  req: Req;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const { data, loading, error } = useFetch<{ days: AvailableDay[] }>('/api/requests/available-days');
  const [selectedDayId, setSelectedDayId] = useState<number | null>(null);
  const [slotTime, setSlotTime] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const days = data?.days ?? [];

  useEffect(() => {
    if (days.length > 0 && selectedDayId === null) {
      setSelectedDayId(days[0].id);
      setSlotTime(days[0].nextSlotTime);
    }
  }, [days, selectedDayId]);

  const onSelectDay = (dayId: number) => {
    setSelectedDayId(dayId);
    const d = days.find((x) => x.id === dayId);
    if (d) setSlotTime(d.nextSlotTime);
  };

  async function submit() {
    if (!selectedDayId) {
      setErr('Please select an upcoming day');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      await api(`/api/requests/${req.id}/approve`, {
        method: 'POST',
        body: {
          captureDayId: selectedDayId,
          startTime: slotTime || undefined,
        },
      });
      toast(`Approved and rescheduled`);
      onDone();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      title="Reschedule & Approve"
      subtitle={`Select a new date and time for ${req.name}`}
      onClose={onClose}
    >
      {req.passed && (
        <Notice kind="info">
          The requested slot on {longDay(req.date)}{req.startTime ? ` at ${req.startTime}` : ''} has passed. Pick an upcoming date and time below to approve.
        </Notice>
      )}

      {err && <Notice kind="error">{err}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      {loading && <Loading rows={2} />}

      {!loading && days.length === 0 && (
        <p className="pad muted">No upcoming active sales days with open slots available.</p>
      )}

      {!loading && days.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="label" style={{ display: 'block', marginBottom: 6 }}>New capture date</label>
            <select
              className="input"
              value={selectedDayId ?? ''}
              onChange={(e) => onSelectDay(Number(e.target.value))}
            >
              {days.map((d) => (
                <option key={d.id} value={d.id}>
                  {longDay(d.date)} — Slot at {d.nextSlotTime} ({d.load}/{d.capacity} booked)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" style={{ display: 'block', marginBottom: 6 }}>Start time</label>
            <input
              type="time"
              className="input"
              value={slotTime}
              onChange={(e) => setSlotTime(e.target.value)}
            />
          </div>

          <div style={{ height: 10 }} />

          <button
            className="btn btn-primary btn-block"
            disabled={submitting || !selectedDayId}
            onClick={submit}
          >
            {submitting ? 'Saving...' : 'Approve with New Date & Time'}
          </button>
        </div>
      )}
    </Sheet>
  );
}

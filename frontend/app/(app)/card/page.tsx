'use client';
import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@/components/Auth';
import { IconCheck, IconPhone, IconPlus, IconTrash, IconUser, IconImage, IconSend } from '@/components/Icons';
import { Empty, ErrorBox, Loading, Notice, useToast } from '@/components/ui';
import { api, useFetch } from '@/lib/api';
import { useBrand } from '@/lib/brand';
import type { CardSubmissionView } from '@/lib/types';

function statusBadge(status: string) {
  switch (status) {
    case 'approved':
      return <span className="status-pill status-done">Approved</span>;
    case 'card_sent':
      return <span className="status-pill" style={{ background: 'var(--brand)', color: '#fff' }}>Design Ready for Review</span>;
    case 'revision_requested':
      return <span className="status-pill" style={{ background: 'var(--amber, #f59e0b)', color: '#fff' }}>Revision Requested</span>;
    case 'submitted':
      return <span className="status-pill status-planned">Submitted · Designing</span>;
    case 'draft':
    default:
      return <span className="status-pill status-requested">Draft Info</span>;
  }
}

export default function MyCardPage() {
  const { user } = useAuth();
  const { brand } = useBrand();
  const toast = useToast();
  const { data, error, loading, reload } = useFetch<CardSubmissionView>('/api/card/my-submission');

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [approving, setApproving] = useState(false);

  // Form fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phones, setPhones] = useState<string[]>(['']);
  const [positions, setPositions] = useState<string[]>(['']);
  const [department, setDepartment] = useState('');
  const [company, setCompany] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setFullName(data.fullName || user?.name || '');
      setEmail(data.email || '');
      setPhones(data.phones && data.phones.length > 0 ? data.phones : [user?.phone || '']);
      setPositions(data.positions && data.positions.length > 0 ? data.positions : ['Sales Representative']);
      setDepartment(data.department || '');
      setCompany(data.company || '');
      setAddress(data.address || '');
      setNotes(data.notes || '');
      setPhotoUrl(data.photoUrl || null);
      if (data.status === 'draft') {
        setEditing(true);
      }
    }
  }, [data, user]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Empty title="No Card Found" text="Could not load your card details." />;

  const appTitle = brand.app_mode === 'card' ? (brand.card_name || 'ZeCard Info') : brand.name;

  function addPhone() {
    setPhones((p) => [...p, '']);
  }

  function removePhone(idx: number) {
    if (phones.length <= 1) {
      setPhones(['']);
      return;
    }
    setPhones((p) => p.filter((_, i) => i !== idx));
  }

  function updatePhone(idx: number, val: string) {
    setPhones((p) => {
      const next = [...p];
      next[idx] = val;
      return next;
    });
  }

  function addPosition() {
    setPositions((pos) => [...pos, '']);
  }

  function removePosition(idx: number) {
    if (positions.length <= 1) {
      setPositions(['']);
      return;
    }
    setPositions((pos) => pos.filter((_, i) => i !== idx));
  }

  function updatePosition(idx: number, val: string) {
    setPositions((pos) => {
      const next = [...pos];
      next[idx] = val;
      return next;
    });
  }

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 800_000) {
      toast('Photo must be smaller than 800KB', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPhotoUrl(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveInfo(submit: boolean) {
    const validPhones = phones.map((p) => p.trim()).filter(Boolean);
    const validPositions = positions.map((p) => p.trim()).filter(Boolean);

    if (!fullName.trim()) {
      toast('Full name is required', 'error');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      toast('A valid email address is required', 'error');
      return;
    }
    if (validPhones.length === 0) {
      toast('At least one phone number is required', 'error');
      return;
    }
    if (validPositions.length === 0) {
      toast('At least one position / title is required', 'error');
      return;
    }

    setBusy(true);
    try {
      await api('/api/card/my-submission', {
        method: 'POST',
        body: {
          fullName: fullName.trim(),
          email: email.trim(),
          phones: validPhones,
          positions: validPositions,
          department: department.trim() || null,
          company: company.trim() || null,
          address: address.trim() || null,
          notes: notes.trim() || null,
          photoUrl: photoUrl || null,
          submit,
        },
      });
      toast(submit ? 'Business card details submitted for design!' : 'Draft details saved successfully!', 'ok');
      setEditing(false);
      reload();
    } catch (err: any) {
      toast(err.message || 'Could not save details', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleSendFeedback(e: FormEvent) {
    e.preventDefault();
    if (!feedbackMsg.trim()) return;
    setSendingFeedback(true);
    try {
      await api('/api/card/my-submission/feedback', {
        method: 'POST',
        body: { message: feedbackMsg.trim() },
      });
      toast('Feedback sent to design team!', 'ok');
      setFeedbackMsg('');
      reload();
    } catch (err: any) {
      toast(err.message || 'Could not send feedback', 'error');
    } finally {
      setSendingFeedback(false);
    }
  }

  async function handleApprove() {
    if (!confirm('Are you sure you want to approve this business card design? Once approved, it will be finalized for printing.')) {
      return;
    }
    setApproving(true);
    try {
      await api('/api/card/my-submission/approve', { method: 'POST' });
      toast('Card design approved! Thank you.', 'ok');
      reload();
    } catch (err: any) {
      toast(err.message || 'Could not approve card', 'error');
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 780 }}>
      <div className="page-head" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 className="title" style={{ margin: 0 }}>
              {data.fullName || user?.name}
            </h1>
            {statusBadge(data.status)}
          </div>
          <p className="subtitle">{appTitle} · Business Card & ID Card Profile</p>
        </div>

        {!editing && data.status !== 'approved' && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
            Edit My Info
          </button>
        )}
      </div>

      {data.status === 'approved' && (
        <div
          style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 12,
            padding: '16px 20px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: '#10b981',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <IconCheck style={{ width: 22, height: 22 }} />
          </div>
          <div>
            <strong style={{ display: 'block', color: 'var(--text-strong, #111)', fontSize: '1rem' }}>
              Business Card Approved!
            </strong>
            <span className="small muted">
              Your business card has been approved and passed to production. Approved on{' '}
              {data.approvedAt ? new Date(data.approvedAt).toLocaleDateString() : 'recently'}.
            </span>
          </div>
        </div>
      )}

      {/* DESIGN SHOWCASE SECTION (IF ADMIN SENT DESIGN) */}
      {data.cardDesignUrl && (
        <section className="card" style={{ marginBottom: 24, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>Card Design Preview</h2>
              <p className="small muted" style={{ margin: '2px 0 0' }}>
                Review your customized business card design below.
              </p>
            </div>
            {data.status !== 'approved' && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleApprove}
                disabled={approving}
                style={{ background: '#10b981', borderColor: '#10b981' }}
              >
                {approving ? 'Approving…' : '✓ Approve Card Design'}
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: data.cardDesignBackUrl ? '1fr 1fr' : '1fr', gap: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <span className="small muted" style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Front Side
              </span>
              <div
                style={{
                  borderRadius: 12,
                  overflow: 'hidden',
                  border: '1px solid var(--border-color, #e5e7eb)',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
                  background: '#f8fafc',
                }}
              >
                <img
                  src={data.cardDesignUrl}
                  alt="Business Card Front"
                  style={{ width: '100%', height: 'auto', display: 'block', maxHeight: 320, objectFit: 'contain' }}
                />
              </div>
            </div>

            {data.cardDesignBackUrl && (
              <div style={{ textAlign: 'center' }}>
                <span className="small muted" style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                  Back Side
                </span>
                <div
                  style={{
                    borderRadius: 12,
                    overflow: 'hidden',
                    border: '1px solid var(--border-color, #e5e7eb)',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
                    background: '#f8fafc',
                  }}
                >
                  <img
                    src={data.cardDesignBackUrl}
                    alt="Business Card Back"
                    style={{ width: '100%', height: 'auto', display: 'block', maxHeight: 320, objectFit: 'contain' }}
                  />
                </div>
              </div>
            )}
          </div>

          {data.adminNote && (
            <div
              style={{
                marginTop: 16,
                padding: '12px 14px',
                borderRadius: 8,
                background: 'var(--bg-subtle, rgba(0,0,0,0.03))',
                fontSize: '0.9rem',
              }}
            >
              <strong style={{ display: 'block', marginBottom: 2 }}>Note from Designer / Admin:</strong>
              <p style={{ margin: 0 }} className="muted">
                {data.adminNote}
              </p>
            </div>
          )}

          {/* DESIGN FEEDBACK / CORRECTIONS THREAD */}
          <div style={{ marginTop: 24, borderTop: '1px solid var(--border-color, #e5e7eb)', paddingTop: 16 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 12 }}>Design Discussion & Feedback</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              {(!data.feedbacks || data.feedbacks.length === 0) && (
                <p className="small muted">No feedback messages yet. Need corrections? Write below.</p>
              )}
              {data.feedbacks?.map((f) => {
                const isMe = f.senderRole === 'staff';
                return (
                  <div
                    key={f.id}
                    style={{
                      alignSelf: isMe ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                      borderRadius: 12,
                      padding: '10px 14px',
                      background: isMe ? 'var(--brand)' : 'var(--bg-subtle, #f1f5f9)',
                      color: isMe ? '#fff' : 'inherit',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.9 }}>
                        {isMe ? 'You (Staff)' : 'Admin / Designer'}
                      </span>
                      <span style={{ fontSize: '0.7rem', opacity: 0.75 }}>
                        {new Date(f.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{f.message}</p>
                  </div>
                );
              })}
            </div>

            {data.status !== 'approved' && (
              <form onSubmit={handleSendFeedback} style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  value={feedbackMsg}
                  onChange={(e) => setFeedbackMsg(e.target.value)}
                  placeholder="Need any change? Type corrections here (e.g. adjust phone number, change title)..."
                  style={{ flex: 1 }}
                />
                <button type="submit" className="btn btn-secondary" disabled={sendingFeedback || !feedbackMsg.trim()}>
                  {sendingFeedback ? 'Sending…' : 'Send Feedback'}
                </button>
              </form>
            )}
          </div>
        </section>
      )}

      {/* FORM SECTION (EDITING OR INITIAL REGISTRATION/DRAFT) */}
      {editing ? (
        <section className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 16px' }}>Business Card & ID Information</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <label className="field">
              <span className="label">Full Name *</span>
              <input
                className="input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full Name as printed on card"
                required
              />
            </label>

            <label className="field">
              <span className="label">Official Email *</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@company.com"
                required
              />
            </label>
          </div>

          {/* MULTI-PHONE NUMBERS */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span className="label" style={{ margin: 0 }}>
                Phone Numbers * <span className="muted">(Can add multiple)</span>
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={addPhone}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px' }}
              >
                <IconPlus style={{ width: 14, height: 14 }} /> Add Phone
              </button>
            </div>
            {phones.map((phone, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  className="input"
                  type="tel"
                  value={phone}
                  onChange={(e) => updatePhone(idx, e.target.value)}
                  placeholder={`Phone ${idx + 1} (e.g. +251 91 123 4567)`}
                  style={{ flex: 1 }}
                />
                {phones.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => removePhone(idx)}
                    title="Remove phone"
                    style={{ color: 'var(--red, #ef4444)' }}
                  >
                    <IconTrash style={{ width: 16, height: 16 }} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* MULTI-JOB POSITIONS */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span className="label" style={{ margin: 0 }}>
                Positions / Titles * <span className="muted">(Can add multiple)</span>
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={addPosition}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px' }}
              >
                <IconPlus style={{ width: 14, height: 14 }} /> Add Position
              </button>
            </div>
            {positions.map((pos, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  className="input"
                  value={pos}
                  onChange={(e) => updatePosition(idx, e.target.value)}
                  placeholder={`Position ${idx + 1} (e.g. Senior Sales Agent, Property Advisor)`}
                  style={{ flex: 1 }}
                />
                {positions.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => removePosition(idx)}
                    title="Remove position"
                    style={{ color: 'var(--red, #ef4444)' }}
                  >
                    <IconTrash style={{ width: 16, height: 16 }} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
            <label className="field">
              <span className="label">Department / Unit</span>
              <input
                className="input"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Residential Real Estate"
              />
            </label>

            <label className="field">
              <span className="label">Company / Branch Name</span>
              <input
                className="input"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Head Office / Bole Branch"
              />
            </label>
          </div>

          <label className="field" style={{ marginTop: 14 }}>
            <span className="label">Office Address</span>
            <input
              className="input"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Mega House, 4th Floor, Addis Ababa"
            />
          </label>

          {/* ID / PORTRAIT PHOTO */}
          <div style={{ marginTop: 14 }}>
            <span className="label">Profile / ID Card Photo (Optional)</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 6 }}>
              {photoUrl ? (
                <div style={{ position: 'relative' }}>
                  <img
                    src={photoUrl}
                    alt="ID Preview"
                    style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover', border: '1px solid var(--border-color)' }}
                  />
                  <button
                    type="button"
                    onClick={() => setPhotoUrl(null)}
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      background: 'rgba(0,0,0,0.7)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '50%',
                      width: 20,
                      height: 20,
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 10,
                    background: 'var(--bg-subtle, #f1f5f9)',
                    display: 'grid',
                    placeItems: 'center',
                    border: '1px dashed var(--border-color)',
                  }}
                >
                  <IconUser style={{ width: 28, height: 28, opacity: 0.4 }} />
                </div>
              )}
              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                <IconImage style={{ width: 14, height: 14, marginRight: 6 }} />
                {photoUrl ? 'Change Photo' : 'Upload ID Photo'}
                <input type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} />
              </label>
            </div>
          </div>

          <label className="field" style={{ marginTop: 14 }}>
            <span className="label">Special Instructions or Notes for Card Designer</span>
            <textarea
              className="input"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any requests for the designer (e.g. 'Add QR code to back', 'Include Telegram username')..."
            />
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            {data.status !== 'draft' && (
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => handleSaveInfo(false)} disabled={busy}>
              Save Draft
            </button>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => handleSaveInfo(true)} disabled={busy}>
              {busy ? 'Submitting…' : 'Submit for Card Design'}
            </button>
          </div>
        </section>
      ) : (
        /* READ-ONLY SUMMARY SECTION */
        <section className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 16px' }}>Your Registered Information</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div>
              <span className="small muted" style={{ display: 'block' }}>
                Full Name
              </span>
              <strong style={{ fontSize: '1rem' }}>{data.fullName}</strong>
            </div>

            <div>
              <span className="small muted" style={{ display: 'block' }}>
                Work Email
              </span>
              <span>{data.email}</span>
            </div>

            <div>
              <span className="small muted" style={{ display: 'block' }}>
                Phone Number(s)
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {data.phones?.map((p, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <IconPhone style={{ width: 13, height: 13, opacity: 0.6 }} /> {p}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <span className="small muted" style={{ display: 'block' }}>
                Position(s) / Title(s)
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                {data.positions?.map((pos, i) => (
                  <span
                    key={i}
                    style={{
                      background: 'var(--bg-subtle, rgba(0,0,0,0.06))',
                      padding: '2px 8px',
                      borderRadius: 6,
                      fontSize: '0.85rem',
                      fontWeight: 500,
                    }}
                  >
                    {pos}
                  </span>
                ))}
              </div>
            </div>

            {data.department && (
              <div>
                <span className="small muted" style={{ display: 'block' }}>
                  Department
                </span>
                <span>{data.department}</span>
              </div>
            )}

            {data.company && (
              <div>
                <span className="small muted" style={{ display: 'block' }}>
                  Company / Branch
                </span>
                <span>{data.company}</span>
              </div>
            )}

            {data.address && (
              <div style={{ gridColumn: '1 / -1' }}>
                <span className="small muted" style={{ display: 'block' }}>
                  Office Address
                </span>
                <span>{data.address}</span>
              </div>
            )}
          </div>

          {!data.cardDesignUrl && (
            <div
              style={{
                marginTop: 20,
                padding: '14px 16px',
                borderRadius: 10,
                background: 'var(--bg-subtle, rgba(0,0,0,0.04))',
                textAlign: 'center',
              }}
            >
              <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
                ⏳ <strong>Design in progress!</strong> Your info has been submitted. The admin/designer will upload your business card design here for your review and approval.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

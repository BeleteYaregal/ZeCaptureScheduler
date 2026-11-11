'use client';
import { FormEvent, useState } from 'react';
import { useAuth } from '@/components/Auth';
import { IconCheck, IconImage, IconPhone, IconPlus, IconSearch, IconTrash, IconUser, IconX } from '@/components/Icons';
import { Empty, ErrorBox, Loading, Notice, Sheet, useToast } from '@/components/ui';
import { api, useFetch } from '@/lib/api';
import { useBrand } from '@/lib/brand';
import type { CardSubmissionView } from '@/lib/types';

function statusPill(status: string) {
  switch (status) {
    case 'approved':
      return <span className="status-pill status-done">Approved</span>;
    case 'card_sent':
      return <span className="status-pill" style={{ background: 'var(--brand)', color: '#fff' }}>Sent to Staff</span>;
    case 'revision_requested':
      return <span className="status-pill" style={{ background: 'var(--amber, #f59e0b)', color: '#fff' }}>Feedback / Revisions</span>;
    case 'submitted':
      return <span className="status-pill status-planned">Needs Card Design</span>;
    case 'draft':
    default:
      return <span className="status-pill status-requested">Draft Info</span>;
  }
}

export default function AdminCardsPage() {
  const { user } = useAuth();
  const { brand } = useBrand();
  const toast = useToast();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const queryUrl = `/api/card/submissions?status=${statusFilter}${search ? `&search=${encodeURIComponent(search)}` : ''}`;
  const { data, error, loading, reload } = useFetch<{
    items: CardSubmissionView[];
    counts: { total: number; draft: number; submitted: number; card_sent: number; revision_requested: number; approved: number };
  }>(user?.role === 'admin' ? queryUrl : null);

  const selectedSub = useFetch<CardSubmissionView>(selectedId ? `/api/card/submissions/${selectedId}` : null);

  // Send design form state
  const [frontImage, setFrontImage] = useState<string>('');
  const [backImage, setBackImage] = useState<string>('');
  const [adminNote, setAdminNote] = useState<string>('');
  const [sendingDesign, setSendingDesign] = useState(false);

  // Admin reply form state
  const [replyMsg, setReplyMsg] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  if (user?.role !== 'admin') {
    return <Notice kind="error">Only administrators can manage staff business cards.</Notice>;
  }

  function openSubmission(sub: CardSubmissionView) {
    setSelectedId(sub.id);
    setFrontImage(sub.cardDesignUrl || '');
    setBackImage(sub.cardDesignBackUrl || '');
    setAdminNote(sub.adminNote || '');
  }

  function closeSubmission() {
    setSelectedId(null);
    setFrontImage('');
    setBackImage('');
    setAdminNote('');
    setReplyMsg('');
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>, isBack = false) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) {
      toast('Card design file must be under 1.5MB', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      if (isBack) setBackImage(result);
      else setFrontImage(result);
    };
    reader.readAsDataURL(file);
  }

  async function handleSendDesign(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    if (!frontImage) {
      toast('Please upload or provide front card design image', 'error');
      return;
    }
    setSendingDesign(true);
    try {
      await api(`/api/card/submissions/${selectedId}/send-design`, {
        method: 'POST',
        body: {
          cardDesignUrl: frontImage,
          cardDesignBackUrl: backImage || null,
          adminNote: adminNote.trim() || null,
        },
      });
      toast('Card design sent to staff member!', 'ok');
      selectedSub.reload();
      reload();
    } catch (err: any) {
      toast(err.message || 'Could not send design', 'error');
    } finally {
      setSendingDesign(false);
    }
  }

  async function handleSendReply(e: FormEvent) {
    e.preventDefault();
    if (!selectedId || !replyMsg.trim()) return;
    setSendingReply(true);
    try {
      await api(`/api/card/submissions/${selectedId}/feedback`, {
        method: 'POST',
        body: { message: replyMsg.trim() },
      });
      toast('Reply sent to staff member!', 'ok');
      setReplyMsg('');
      selectedSub.reload();
    } catch (err: any) {
      toast(err.message || 'Could not send reply', 'error');
    } finally {
      setSendingReply(false);
    }
  }

  async function handleMarkApproved(subId: number) {
    try {
      await api(`/api/card/submissions/${subId}/status`, {
        method: 'PATCH',
        body: { status: 'approved' },
      });
      toast('Card marked as approved!', 'ok');
      selectedSub.reload();
      reload();
    } catch (err: any) {
      toast(err.message || 'Could not update status', 'error');
    }
  }

  async function handleDelete(subId: number) {
    if (!confirm('Are you sure you want to delete this staff card submission?')) return;
    try {
      await api(`/api/card/submissions/${subId}`, { method: 'DELETE' });
      toast('Submission deleted', 'ok');
      closeSubmission();
      reload();
    } catch (err: any) {
      toast(err.message || 'Could not delete', 'error');
    }
  }

  const counts = data?.counts || { total: 0, draft: 0, submitted: 0, card_sent: 0, revision_requested: 0, approved: 0 };
  const items = data?.items || [];

  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      <div className="page-head" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1 className="title">Business Card Submissions</h1>
          <p className="subtitle">Collect staff info, send customized card designs, and manage approvals.</p>
        </div>
      </div>

      {/* METRIC CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
        <button
          type="button"
          className="card"
          onClick={() => setStatusFilter('all')}
          style={{
            padding: '12px 14px',
            textAlign: 'left',
            cursor: 'pointer',
            border: statusFilter === 'all' ? '2px solid var(--brand)' : '1px solid var(--border-color)',
          }}
        >
          <span className="small muted">Total Staff</span>
          <strong style={{ fontSize: '1.4rem', display: 'block', marginTop: 2 }}>{counts.total}</strong>
        </button>

        <button
          type="button"
          className="card"
          onClick={() => setStatusFilter('submitted')}
          style={{
            padding: '12px 14px',
            textAlign: 'left',
            cursor: 'pointer',
            border: statusFilter === 'submitted' ? '2px solid var(--brand)' : '1px solid var(--border-color)',
          }}
        >
          <span className="small" style={{ color: 'var(--blue, #2563eb)' }}>
            Needs Design
          </span>
          <strong style={{ fontSize: '1.4rem', display: 'block', marginTop: 2 }}>{counts.submitted}</strong>
        </button>

        <button
          type="button"
          className="card"
          onClick={() => setStatusFilter('revision_requested')}
          style={{
            padding: '12px 14px',
            textAlign: 'left',
            cursor: 'pointer',
            border: statusFilter === 'revision_requested' ? '2px solid var(--amber, #f59e0b)' : '1px solid var(--border-color)',
          }}
        >
          <span className="small" style={{ color: 'var(--amber, #f59e0b)' }}>
            Feedback / Changes
          </span>
          <strong style={{ fontSize: '1.4rem', display: 'block', marginTop: 2 }}>{counts.revision_requested}</strong>
        </button>

        <button
          type="button"
          className="card"
          onClick={() => setStatusFilter('card_sent')}
          style={{
            padding: '12px 14px',
            textAlign: 'left',
            cursor: 'pointer',
            border: statusFilter === 'card_sent' ? '2px solid var(--brand)' : '1px solid var(--border-color)',
          }}
        >
          <span className="small muted">In Review</span>
          <strong style={{ fontSize: '1.4rem', display: 'block', marginTop: 2 }}>{counts.card_sent}</strong>
        </button>

        <button
          type="button"
          className="card"
          onClick={() => setStatusFilter('approved')}
          style={{
            padding: '12px 14px',
            textAlign: 'left',
            cursor: 'pointer',
            border: statusFilter === 'approved' ? '2px solid #10b981' : '1px solid var(--border-color)',
          }}
        >
          <span className="small" style={{ color: '#10b981' }}>
            Approved
          </span>
          <strong style={{ fontSize: '1.4rem', display: 'block', marginTop: 2 }}>{counts.approved}</strong>
        </button>
      </div>

      {/* SEARCH AND FILTER BAR */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="input-icon" style={{ flex: 1, minWidth: 220 }}>
          <IconSearch />
          <input
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by staff name, email, phone, or title..."
          />
        </div>
      </div>

      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}

      {!loading && !error && items.length === 0 && (
        <Empty
          title="No Card Submissions Found"
          text={
            search || statusFilter !== 'all'
              ? 'No staff members match the selected filter.'
              : 'No staff submissions yet. Staff can register and submit their business card info.'
          }
        />
      )}

      {/* SUBMISSION LIST */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((sub) => (
          <div
            key={sub.id}
            className="card"
            onClick={() => openSubmission(sub)}
            style={{
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'border-color 0.15s ease',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
              {sub.photoUrl ? (
                <img
                  src={sub.photoUrl}
                  alt={sub.fullName}
                  style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
                />
              ) : (
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: 'var(--bg-subtle, rgba(0,0,0,0.05))',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <IconUser style={{ width: 22, height: 22, opacity: 0.5 }} />
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong style={{ fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {sub.fullName}
                  </strong>
                  {statusPill(sub.status)}
                </div>
                <div className="small muted" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: 2 }}>
                  <span>{sub.email}</span>
                  {sub.phones && sub.phones.length > 0 && <span>• {sub.phones.join(', ')}</span>}
                  {sub.positions && sub.positions.length > 0 && (
                    <span style={{ fontWeight: 500, color: 'var(--text-strong)' }}>• {sub.positions.join(', ')}</span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <span className="small muted">
                {sub.updatedAt ? new Date(sub.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
              </span>
              <button type="button" className="btn btn-secondary btn-sm">
                View & Design →
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* DETAIL & DESIGN MODAL / SHEET */}
      {selectedId && selectedSub.data && (
        <Sheet
          title={`${selectedSub.data.fullName} — Business Card`}
          onClose={closeSubmission}
        >
          <div style={{ padding: '0 4px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* STATUS HEADER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="small muted">Current Status:</span>
                {statusPill(selectedSub.data.status)}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {selectedSub.data.status !== 'approved' && selectedSub.data.cardDesignUrl && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ background: '#10b981', color: '#fff' }}
                    onClick={() => handleMarkApproved(selectedId)}
                  >
                    ✓ Mark as Approved
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleDelete(selectedId)}
                  style={{ color: 'var(--red, #ef4444)' }}
                >
                  Delete
                </button>
              </div>
            </div>

            {/* STAFF INFO DETAILS */}
            <div
              style={{
                background: 'var(--bg-subtle, rgba(0,0,0,0.03))',
                borderRadius: 12,
                padding: '14px 16px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 12,
              }}
            >
              <div>
                <span className="small muted" style={{ display: 'block' }}>
                  Full Name
                </span>
                <strong>{selectedSub.data.fullName}</strong>
              </div>
              <div>
                <span className="small muted" style={{ display: 'block' }}>
                  Work Email
                </span>
                <span>{selectedSub.data.email}</span>
              </div>
              <div>
                <span className="small muted" style={{ display: 'block' }}>
                  Phone Numbers ({selectedSub.data.phones.length})
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {selectedSub.data.phones.map((p, i) => (
                    <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
                      <IconPhone style={{ width: 12, height: 12 }} /> {p}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <span className="small muted" style={{ display: 'block' }}>
                  Position(s) / Titles ({selectedSub.data.positions.length})
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {selectedSub.data.positions.map((pos, i) => (
                    <span
                      key={i}
                      style={{
                        background: 'var(--brand-muted, rgba(37,99,235,0.1))',
                        color: 'var(--brand)',
                        padding: '1px 7px',
                        borderRadius: 6,
                        fontSize: '0.85rem',
                        fontWeight: 600,
                      }}
                    >
                      {pos}
                    </span>
                  ))}
                </div>
              </div>
              {selectedSub.data.department && (
                <div>
                  <span className="small muted" style={{ display: 'block' }}>
                    Department
                  </span>
                  <span>{selectedSub.data.department}</span>
                </div>
              )}
              {selectedSub.data.company && (
                <div>
                  <span className="small muted" style={{ display: 'block' }}>
                    Company / Branch
                  </span>
                  <span>{selectedSub.data.company}</span>
                </div>
              )}
              {selectedSub.data.address && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <span className="small muted" style={{ display: 'block' }}>
                    Office Address
                  </span>
                  <span>{selectedSub.data.address}</span>
                </div>
              )}
              {selectedSub.data.notes && (
                <div style={{ gridColumn: '1 / -1', background: 'rgba(0,0,0,0.03)', padding: 8, borderRadius: 8 }}>
                  <span className="small muted" style={{ display: 'block', fontWeight: 600 }}>
                    Staff Instructions / Notes:
                  </span>
                  <p style={{ margin: '2px 0 0', fontSize: '0.9rem' }}>{selectedSub.data.notes}</p>
                </div>
              )}
              {selectedSub.data.photoUrl && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <span className="small muted" style={{ display: 'block', marginBottom: 4 }}>
                    Uploaded ID Photo
                  </span>
                  <img
                    src={selectedSub.data.photoUrl}
                    alt="Staff ID Photo"
                    style={{ width: 80, height: 80, borderRadius: 10, objectFit: 'cover', border: '1px solid var(--border-color)' }}
                  />
                </div>
              )}
            </div>

            {/* SEND / UPDATE BUSINESS CARD DESIGN FORM */}
            <form onSubmit={handleSendDesign} className="card" style={{ padding: 18, border: '1px solid var(--border-color)' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: '0 0 12px' }}>
                {selectedSub.data.cardDesignUrl ? 'Update Business Card Design' : 'Upload & Send Business Card Design'}
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {/* FRONT DESIGN */}
                <div>
                  <span className="label">Front Side Design *</span>
                  {frontImage ? (
                    <div style={{ position: 'relative', marginBottom: 8 }}>
                      <img
                        src={frontImage}
                        alt="Front Design"
                        style={{
                          width: '100%',
                          maxHeight: 180,
                          objectFit: 'contain',
                          borderRadius: 8,
                          border: '1px solid var(--border-color)',
                          background: '#f8fafc',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setFrontImage('')}
                        style={{
                          position: 'absolute',
                          top: 4,
                          right: 4,
                          background: 'rgba(0,0,0,0.65)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 4,
                          padding: '2px 6px',
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                  <label className="btn btn-secondary btn-block" style={{ cursor: 'pointer', textAlign: 'center' }}>
                    <IconImage style={{ width: 16, height: 16, marginRight: 6 }} />
                    {frontImage ? 'Change Front Image' : 'Upload Front Image'}
                    <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, false)} style={{ display: 'none' }} />
                  </label>
                </div>

                {/* BACK DESIGN */}
                <div>
                  <span className="label">Back Side Design (Optional)</span>
                  {backImage ? (
                    <div style={{ position: 'relative', marginBottom: 8 }}>
                      <img
                        src={backImage}
                        alt="Back Design"
                        style={{
                          width: '100%',
                          maxHeight: 180,
                          objectFit: 'contain',
                          borderRadius: 8,
                          border: '1px solid var(--border-color)',
                          background: '#f8fafc',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setBackImage('')}
                        style={{
                          position: 'absolute',
                          top: 4,
                          right: 4,
                          background: 'rgba(0,0,0,0.65)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 4,
                          padding: '2px 6px',
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                  <label className="btn btn-secondary btn-block" style={{ cursor: 'pointer', textAlign: 'center' }}>
                    <IconImage style={{ width: 16, height: 16, marginRight: 6 }} />
                    {backImage ? 'Change Back Image' : 'Upload Back Image'}
                    <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, true)} style={{ display: 'none' }} />
                  </label>
                </div>
              </div>

              <label className="field" style={{ marginTop: 14 }}>
                <span className="label">Note to Staff (Optional)</span>
                <input
                  className="input"
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="e.g. Here is your initial design. Please verify the contact details."
                />
              </label>

              <button
                type="submit"
                className="btn btn-primary btn-block btn-lg"
                disabled={sendingDesign || !frontImage}
                style={{ marginTop: 14 }}
              >
                {sendingDesign ? 'Sending…' : selectedSub.data.cardDesignUrl ? 'Send Updated Design to Staff' : 'Send Card Design to Staff'}
              </button>
            </form>

            {/* FEEDBACK & DISCUSSION THREAD */}
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: '0 0 10px' }}>Staff Feedback & Revision Messages</h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                {(!selectedSub.data.feedbacks || selectedSub.data.feedbacks.length === 0) && (
                  <p className="small muted">No feedback messages recorded yet.</p>
                )}
                {selectedSub.data.feedbacks?.map((f) => {
                  const isStaff = f.senderRole === 'staff';
                  return (
                    <div
                      key={f.id}
                      style={{
                        alignSelf: isStaff ? 'flex-start' : 'flex-end',
                        maxWidth: '85%',
                        borderRadius: 12,
                        padding: '10px 14px',
                        background: isStaff ? 'var(--bg-subtle, #f1f5f9)' : 'var(--brand)',
                        color: isStaff ? 'inherit' : '#fff',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{isStaff ? 'Staff Member' : 'Admin'}</span>
                        <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>
                          {new Date(f.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{f.message}</p>
                    </div>
                  );
                })}
              </div>

              <form onSubmit={handleSendReply} style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  value={replyMsg}
                  onChange={(e) => setReplyMsg(e.target.value)}
                  placeholder="Send a reply or revision note to staff member..."
                  style={{ flex: 1 }}
                />
                <button type="submit" className="btn btn-secondary" disabled={sendingReply || !replyMsg.trim()}>
                  {sendingReply ? 'Sending…' : 'Reply'}
                </button>
              </form>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

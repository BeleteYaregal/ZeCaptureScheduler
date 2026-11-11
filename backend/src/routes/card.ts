import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth';
import { HttpError, wrap } from '../http';
import { CardFeedback, CardSubmission, Notification, User } from '../models';
import { audit, notify } from '../services/log';

export const cardRouter = Router();

function safeJsonArray(val: string | null | undefined): string[] {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed.map((x) => String(x).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function formatSubmission(sub: CardSubmission, feedbacks: CardFeedback[] = []) {
  return {
    id: sub.id,
    userId: sub.userId,
    fullName: sub.fullName,
    email: sub.email,
    phones: safeJsonArray(sub.phones),
    positions: safeJsonArray(sub.positions),
    department: sub.department,
    company: sub.company,
    address: sub.address,
    notes: sub.notes,
    photoUrl: sub.photoUrl,
    cardDesignUrl: sub.cardDesignUrl,
    cardDesignBackUrl: sub.cardDesignBackUrl,
    adminNote: sub.adminNote,
    status: sub.status,
    approvedAt: sub.approvedAt,
    createdAt: sub.createdAt,
    updatedAt: sub.updatedAt,
    feedbacks: feedbacks.map((f) => ({
      id: f.id,
      submissionId: f.submissionId,
      userId: f.userId,
      senderRole: f.senderRole,
      message: f.message,
      createdAt: f.createdAt,
    })),
  };
}

async function notifyAdmins(title: string, body: string) {
  const admins = await User.findAll({ where: { role: 'admin', active: true } });
  const ids = admins.map((a) => a.id);
  if (ids.length) {
    await notify(ids, title, body);
  }
}

/** Get the currently logged-in user's card submission + feedback history. */
cardRouter.get(
  '/my-submission',
  requireAuth,
  wrap(async (req, res) => {
    const user = req.user!;
    let sub = await CardSubmission.findOne({ where: { userId: user.id } });
    if (!sub) {
      sub = await CardSubmission.create({
        userId: user.id,
        fullName: user.name,
        email: user.username.includes('@') ? user.username : '',
        phones: JSON.stringify(user.phone ? [user.phone] : []),
        positions: JSON.stringify(['Sales Representative']),
        status: 'draft',
      });
    }

    const feedbacks = await CardFeedback.findAll({
      where: { submissionId: sub.id },
      order: [['createdAt', 'ASC']],
    });

    res.json(formatSubmission(sub, feedbacks));
  })
);

/** Staff updates their card / ID information or submits it for design. */
cardRouter.post(
  '/my-submission',
  requireAuth,
  wrap(async (req, res) => {
    const user = req.user!;
    const body = z
      .object({
        fullName: z.string().trim().min(2, 'Name is required').max(120),
        email: z.string().trim().email('Valid email is required').max(150),
        phones: z.array(z.string().trim().min(1)).min(1, 'At least one phone number is required'),
        positions: z.array(z.string().trim().min(1)).min(1, 'At least one position is required'),
        department: z.string().trim().max(100).optional().nullable(),
        company: z.string().trim().max(100).optional().nullable(),
        address: z.string().trim().max(250).optional().nullable(),
        notes: z.string().trim().max(1000).optional().nullable(),
        photoUrl: z.string().max(800_000).optional().nullable(),
        submit: z.boolean().optional(),
      })
      .parse(req.body);

    let sub = await CardSubmission.findOne({ where: { userId: user.id } });
    const isNew = !sub;

    if (!sub) {
      sub = CardSubmission.build({ userId: user.id });
    }

    sub.fullName = body.fullName;
    sub.email = body.email;
    sub.phones = JSON.stringify(body.phones.filter(Boolean));
    sub.positions = JSON.stringify(body.positions.filter(Boolean));
    sub.department = body.department || null;
    sub.company = body.company || null;
    sub.address = body.address || null;
    sub.notes = body.notes || null;
    if (body.photoUrl !== undefined) {
      sub.photoUrl = body.photoUrl;
    }

    const wasDraft = sub.status === 'draft';
    if (body.submit && (sub.status === 'draft' || sub.status === 'revision_requested')) {
      sub.status = 'submitted';
    }

    await sub.save();

    if (body.submit && wasDraft) {
      await notifyAdmins(
        `Card Info Submitted: ${sub.fullName}`,
        `${sub.fullName} submitted their business card info. Ready for card design!`
      );
      await audit(user.id, 'card.submitted', 'card_submission', sub.id, { fullName: sub.fullName });
    }

    const feedbacks = await CardFeedback.findAll({
      where: { submissionId: sub.id },
      order: [['createdAt', 'ASC']],
    });

    res.json(formatSubmission(sub, feedbacks));
  })
);

/** Staff sends feedback / correction request regarding the card design. */
cardRouter.post(
  '/my-submission/feedback',
  requireAuth,
  wrap(async (req, res) => {
    const user = req.user!;
    const body = z.object({ message: z.string().trim().min(1, 'Message cannot be empty').max(2000) }).parse(req.body);

    const sub = await CardSubmission.findOne({ where: { userId: user.id } });
    if (!sub) throw new HttpError(404, 'Submission not found');

    const feedback = await CardFeedback.create({
      submissionId: sub.id,
      userId: user.id,
      senderRole: 'staff',
      message: body.message,
    });

    sub.status = 'revision_requested';
    await sub.save();

    await notifyAdmins(
      `Feedback from ${sub.fullName}`,
      `${sub.fullName} requested revisions on their card design: "${body.message.slice(0, 100)}"`
    );
    await audit(user.id, 'card.feedback', 'card_submission', sub.id, { message: body.message });

    const feedbacks = await CardFeedback.findAll({
      where: { submissionId: sub.id },
      order: [['createdAt', 'ASC']],
    });

    res.json(formatSubmission(sub, feedbacks));
  })
);

/** Staff approves the card design. */
cardRouter.post(
  '/my-submission/approve',
  requireAuth,
  wrap(async (req, res) => {
    const user = req.user!;
    const sub = await CardSubmission.findOne({ where: { userId: user.id } });
    if (!sub) throw new HttpError(404, 'Submission not found');

    if (!sub.cardDesignUrl) {
      throw new HttpError(400, 'Cannot approve before a card design has been sent');
    }

    sub.status = 'approved';
    sub.approvedAt = new Date();
    await sub.save();

    await CardFeedback.create({
      submissionId: sub.id,
      userId: user.id,
      senderRole: 'staff',
      message: 'Card design approved! Looks great.',
    });

    await notifyAdmins(
      `Card Approved: ${sub.fullName}`,
      `${sub.fullName} has approved their business card design.`
    );
    await audit(user.id, 'card.approved', 'card_submission', sub.id);

    const feedbacks = await CardFeedback.findAll({
      where: { submissionId: sub.id },
      order: [['createdAt', 'ASC']],
    });

    res.json(formatSubmission(sub, feedbacks));
  })
);

/* ========================================================================== */
/* ADMIN ROUTES                                                               */
/* ========================================================================== */

/** Admin: List all card submissions with filtering and search. */
cardRouter.get(
  '/submissions',
  requireAuth,
  requireRole('admin'),
  wrap(async (req, res) => {
    const status = req.query.status as string | undefined;
    const search = (req.query.search as string | undefined)?.trim().toLowerCase();

    const where: any = {};
    if (status && status !== 'all') {
      where.status = status;
    }

    const items = await CardSubmission.findAll({
      where,
      order: [['updatedAt', 'DESC']],
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'username', 'phone', 'role'] }],
    });

    let results = items;
    if (search) {
      results = results.filter((item) => {
        const nameMatch = item.fullName.toLowerCase().includes(search);
        const emailMatch = item.email.toLowerCase().includes(search);
        const phoneMatch = item.phones.toLowerCase().includes(search);
        const posMatch = item.positions.toLowerCase().includes(search);
        return nameMatch || emailMatch || phoneMatch || posMatch;
      });
    }

    const formatted = results.map((item) => ({
      id: item.id,
      userId: item.userId,
      fullName: item.fullName,
      email: item.email,
      phones: safeJsonArray(item.phones),
      positions: safeJsonArray(item.positions),
      department: item.department,
      company: item.company,
      address: item.address,
      notes: item.notes,
      photoUrl: item.photoUrl,
      cardDesignUrl: item.cardDesignUrl,
      cardDesignBackUrl: item.cardDesignBackUrl,
      adminNote: item.adminNote,
      status: item.status,
      approvedAt: item.approvedAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      user: (item as any).user,
    }));

    res.json({
      items: formatted,
      counts: {
        total: items.length,
        draft: items.filter((i) => i.status === 'draft').length,
        submitted: items.filter((i) => i.status === 'submitted').length,
        card_sent: items.filter((i) => i.status === 'card_sent').length,
        revision_requested: items.filter((i) => i.status === 'revision_requested').length,
        approved: items.filter((i) => i.status === 'approved').length,
      },
    });
  })
);

/** Admin: Get single card submission with full feedback history. */
cardRouter.get(
  '/submissions/:id',
  requireAuth,
  requireRole('admin'),
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const sub = await CardSubmission.findByPk(id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'username', 'phone', 'role'] }],
    });
    if (!sub) throw new HttpError(404, 'Submission not found');

    const feedbacks = await CardFeedback.findAll({
      where: { submissionId: sub.id },
      order: [['createdAt', 'ASC']],
    });

    res.json({
      ...formatSubmission(sub, feedbacks),
      user: (sub as any).user,
    });
  })
);

/** Admin: Send or update card design to staff. */
cardRouter.post(
  '/submissions/:id/send-design',
  requireAuth,
  requireRole('admin'),
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const body = z
      .object({
        cardDesignUrl: z.string().min(1, 'Card design image or URL is required').max(1_500_000),
        cardDesignBackUrl: z.string().max(1_500_000).optional().nullable(),
        adminNote: z.string().max(1000).optional().nullable(),
      })
      .parse(req.body);

    const sub = await CardSubmission.findByPk(id);
    if (!sub) throw new HttpError(404, 'Submission not found');

    sub.cardDesignUrl = body.cardDesignUrl;
    if (body.cardDesignBackUrl !== undefined) {
      sub.cardDesignBackUrl = body.cardDesignBackUrl;
    }
    if (body.adminNote !== undefined) {
      sub.adminNote = body.adminNote;
    }
    sub.status = 'card_sent';
    await sub.save();

    await CardFeedback.create({
      submissionId: sub.id,
      userId: req.user!.id,
      senderRole: 'admin',
      message: body.adminNote ? `Admin sent business card design: "${body.adminNote}"` : 'Admin sent updated business card design for review.',
    });

    await notify(
      [sub.userId],
      'Your Business Card Design is Ready!',
      body.adminNote || 'The admin has sent your business card design. Please review and send feedback or approve.'
    );

    await audit(req.user!.id, 'card.design_sent', 'card_submission', sub.id, { staffUserId: sub.userId });

    const feedbacks = await CardFeedback.findAll({
      where: { submissionId: sub.id },
      order: [['createdAt', 'ASC']],
    });

    res.json(formatSubmission(sub, feedbacks));
  })
);

/** Admin: Send feedback or reply to staff. */
cardRouter.post(
  '/submissions/:id/feedback',
  requireAuth,
  requireRole('admin'),
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const body = z.object({ message: z.string().trim().min(1, 'Message is required').max(2000) }).parse(req.body);

    const sub = await CardSubmission.findByPk(id);
    if (!sub) throw new HttpError(404, 'Submission not found');

    await CardFeedback.create({
      submissionId: sub.id,
      userId: req.user!.id,
      senderRole: 'admin',
      message: body.message,
    });

    await notify([sub.userId], 'Message Regarding Your Business Card', body.message);
    await audit(req.user!.id, 'card.admin_feedback', 'card_submission', sub.id, { message: body.message });

    const feedbacks = await CardFeedback.findAll({
      where: { submissionId: sub.id },
      order: [['createdAt', 'ASC']],
    });

    res.json(formatSubmission(sub, feedbacks));
  })
);

/** Admin: Update submission status. */
cardRouter.patch(
  '/submissions/:id/status',
  requireAuth,
  requireRole('admin'),
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const body = z
      .object({
        status: z.enum(['draft', 'submitted', 'card_sent', 'revision_requested', 'approved']),
      })
      .parse(req.body);

    const sub = await CardSubmission.findByPk(id);
    if (!sub) throw new HttpError(404, 'Submission not found');

    sub.status = body.status;
    if (body.status === 'approved' && !sub.approvedAt) {
      sub.approvedAt = new Date();
    }
    await sub.save();

    await audit(req.user!.id, 'card.status_change', 'card_submission', sub.id, { status: body.status });

    const feedbacks = await CardFeedback.findAll({
      where: { submissionId: sub.id },
      order: [['createdAt', 'ASC']],
    });

    res.json(formatSubmission(sub, feedbacks));
  })
);

/** Admin: Delete submission. */
cardRouter.delete(
  '/submissions/:id',
  requireAuth,
  requireRole('admin'),
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const sub = await CardSubmission.findByPk(id);
    if (!sub) throw new HttpError(404, 'Submission not found');

    await CardFeedback.destroy({ where: { submissionId: sub.id } });
    await sub.destroy();

    await audit(req.user!.id, 'card.delete', 'card_submission', id);
    res.json({ ok: true });
  })
);

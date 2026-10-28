import { Router } from 'express';
import { Op } from 'sequelize';
import { requireAuth, requireRole } from '../auth';
import { config } from '../config';
import { todayIn } from '../dates';
import { wrap } from '../http';
import { Booking, CaptureDay, Week } from '../models';
import {
  addBooking,
  autoPlan,
  cancelDay,
  generateWeek,
  getWeekView,
  moveBooking,
  publishWeek,
  removeBooking,
  rescheduleBooking,
  savePlan,
  setBookingStatus,
  setDayType,
  setVideographer,
  setEditing,
  shiftBooking,
  swapBookings,
} from '../services/weeks';

export const weeksRouter = Router();
weeksRouter.use(requireAuth);

const id = (v: string) => Number(v);

// Anyone signed in can read; the service scopes what each role may see.
weeksRouter.get(
  '/weeks/:weekStart',
  wrap(async (req, res) => {
    res.json(await getWeekView(req.params.weekStart, req.user!));
  })
);

weeksRouter.put(
  '/weeks/:weekStart/plan',
  requireRole('admin'),
  wrap(async (req, res) => {
    res.json(await savePlan(req.user!, req.params.weekStart, req.body));
  })
);

weeksRouter.put('/days/:date', requireRole('admin'), wrap(async (req, res) => res.json(await setDayType(req.user!, req.params.date, req.body))));
weeksRouter.put('/videographer', requireRole('admin'), wrap(async (req, res) => res.json(await setVideographer(req.user!, req.body))));

weeksRouter.post(
  '/weeks/auto',
  requireRole('admin'),
  wrap(async (req, res) => {
    res.json(await autoPlan(req.user!, req.body));
  })
);

weeksRouter.post(
  '/weeks/:weekStart/generate',
  requireRole('admin'),
  wrap(async (req, res) => {
    res.json(await generateWeek(req.user!, req.params.weekStart));
  })
);

weeksRouter.post(
  '/weeks/:weekStart/publish',
  requireRole('admin'),
  wrap(async (req, res) => {
    res.json(await publishWeek(req.user!, req.params.weekStart));
  })
);

// Manual adjustments (admin)
weeksRouter.post('/bookings', requireRole('admin'), wrap(async (req, res) => res.status(201).json(await addBooking(req.user!, req.body))));
weeksRouter.post('/bookings/swap', requireRole('admin'), wrap(async (req, res) => res.json(await swapBookings(req.user!, req.body))));
weeksRouter.patch('/bookings/:id/move', requireRole('admin'), wrap(async (req, res) => res.json(await moveBooking(req.user!, id(req.params.id), req.body))));
weeksRouter.post('/bookings/:id/shift', requireRole('admin'), wrap(async (req, res) => res.json(await shiftBooking(req.user!, id(req.params.id), req.body))));
weeksRouter.delete('/bookings/:id', requireRole('admin'), wrap(async (req, res) => res.json(await removeBooking(req.user!, id(req.params.id)))));
weeksRouter.post('/days/:id/cancel', requireRole('admin'), wrap(async (req, res) => res.json(await cancelDay(req.user!, id(req.params.id), req.body))));

// Status (admin or the assigned videographer; checked in the service)
weeksRouter.patch('/bookings/:id/editing', requireRole('admin', 'videographer'), wrap(async (req, res) => res.json(await setEditing(req.user!, id(req.params.id), req.body))));
weeksRouter.patch('/bookings/:id/status', requireRole('admin', 'videographer'), wrap(async (req, res) => res.json(await setBookingStatus(req.user!, id(req.params.id), req.body))));
weeksRouter.post('/bookings/:id/reschedule', requireRole('admin', 'videographer'), wrap(async (req, res) => res.json(await rescheduleBooking(req.user!, id(req.params.id)))));

// Salesperson's next capture (home screen hero card)
weeksRouter.get(
  '/me/next',
  wrap(async (req, res) => {
    if (req.user!.role !== 'sales') return res.json({ booking: null });
    const today = todayIn(config.timezone);
    const rows = await Booking.findAll({
      where: { salesId: req.user!.id, status: 'planned' },
      include: [{ model: CaptureDay, as: 'day', required: true, where: { status: 'active', date: { [Op.gte]: today } } }],
    });
    const published = await Week.findAll({ where: { status: 'published', weekStart: { [Op.in]: [...new Set(rows.map((r) => r.day!.weekStart))] } } });
    const ok = new Set(published.map((w) => w.weekStart));
    const best = rows
      .filter((r) => ok.has(r.day!.weekStart))
      .sort((a, b) => a.day!.date.localeCompare(b.day!.date))[0];
    res.json({ booking: best ? { id: best.id, date: best.day!.date, startTime: best.startTime } : null });
  })
);

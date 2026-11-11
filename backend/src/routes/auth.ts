import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { loginFailed, loginOk, loginThrottle, requireAuth, signToken } from '../auth';
import { HttpError, wrap } from '../http';
import { CardSubmission, Notification, User } from '../models';
import { audit } from '../services/log';

export const authRouter = Router();

export const publicUser = (u: User) => ({
  id: u.id,
  name: u.name,
  username: u.username,
  role: u.role,
  phone: u.phone,
  supervisorId: u.supervisorId,
});

authRouter.post(
  '/register',
  wrap(async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
        username: z.string().trim().min(3, 'Username must be at least 3 characters').max(40),
        password: z.string().min(6, 'Password must be at least 6 characters').max(100),
        email: z.string().trim().email('Invalid email address').max(120),
        phone: z.string().trim().max(40).optional(),
        positions: z.array(z.string().trim()).optional(),
      })
      .parse(req.body);

    const username = body.username.toLowerCase();
    const existing = await User.findOne({ where: { username } });
    if (existing) {
      throw new HttpError(409, 'Username is already taken', 'USERNAME_TAKEN');
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await User.create({
      name: body.name,
      username,
      passwordHash,
      role: 'sales',
      phone: body.phone || null,
      active: true,
    });

    const phones = body.phone ? [body.phone] : [];
    const positions = body.positions && body.positions.length > 0 ? body.positions : ['Sales'];

    await CardSubmission.create({
      userId: user.id,
      fullName: body.name,
      email: body.email,
      phones: JSON.stringify(phones),
      positions: JSON.stringify(positions),
      status: 'draft',
    });

    await audit(user.id, 'auth.register', 'user', user.id);
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  })
);

authRouter.post(
  '/login',
  wrap(async (req, res) => {
    const body = z.object({ username: z.string().min(1).max(60), password: z.string().min(1).max(200) }).parse(req.body);
    const username = body.username.trim().toLowerCase();
    const key = `${req.ip}:${username}`;
    loginThrottle(key);
    const user = await User.findOne({ where: { username } });
    const ok = user && user.active && (await bcrypt.compare(body.password, user.passwordHash));
    if (!user || !ok) {
      loginFailed(key);
      throw new HttpError(401, 'Wrong username or password', 'BAD_LOGIN');
    }
    loginOk(key);
    await audit(user.id, 'auth.login', 'user', user.id);
    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

authRouter.get(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const unread = await Notification.count({ where: { userId: req.user!.id, read: false } });
    res.json({ user: publicUser(req.user!), unread });
  })
);

authRouter.post(
  '/change-password',
  requireAuth,
  wrap(async (req, res) => {
    const body = z.object({ current: z.string().min(1), next: z.string().min(6).max(100) }).parse(req.body);
    const user = req.user!;
    if (!(await bcrypt.compare(body.current, user.passwordHash))) {
      throw new HttpError(403, 'Current password is wrong', 'BAD_PASSWORD');
    }
    user.passwordHash = await bcrypt.hash(body.next, 10);
    await user.save();
    await audit(user.id, 'auth.password', 'user', user.id);
    res.json({ ok: true });
  })
);

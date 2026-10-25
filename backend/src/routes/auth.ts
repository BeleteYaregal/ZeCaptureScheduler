import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { loginFailed, loginOk, loginThrottle, requireAuth, signToken } from '../auth';
import { HttpError, wrap } from '../http';
import { Notification, User } from '../models';
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

import jwt from 'jsonwebtoken';
import type { RequestHandler } from 'express';
import { config } from './config';
import { HttpError } from './http';
import { Role, User } from './models';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export function signToken(u: User): string {
  return jwt.sign({ sub: u.id, role: u.role }, config.jwtSecret, { expiresIn: '30d' });
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new HttpError(401, 'Please sign in', 'UNAUTHENTICATED');
    let payload: any;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw new HttpError(401, 'Your session expired, please sign in again', 'UNAUTHENTICATED');
    }
    const user = await User.findByPk(Number(payload.sub));
    if (!user || !user.active) throw new HttpError(401, 'Account is not active', 'UNAUTHENTICATED');
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, 'You do not have permission to do that', 'FORBIDDEN'));
    }
    next();
  };

// Tiny in-memory login throttle: 10 failed attempts / 15 minutes per ip+username.
const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 15 * 60 * 1000;
export function loginThrottle(key: string): void {
  const now = Date.now();
  const a = attempts.get(key);
  if (a && now - a.first < WINDOW_MS && a.count >= 10) {
    throw new HttpError(429, 'Too many attempts. Try again in a few minutes.', 'THROTTLED');
  }
}
export function loginFailed(key: string): void {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || now - a.first >= WINDOW_MS) attempts.set(key, { count: 1, first: now });
  else a.count += 1;
}
export function loginOk(key: string): void {
  attempts.delete(key);
}

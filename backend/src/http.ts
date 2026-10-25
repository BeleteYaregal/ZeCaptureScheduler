import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const msg = err.issues.map((i) => (i.path.length ? i.path.join('.') + ': ' : '') + i.message).join('; ');
    return res.status(400).json({ error: msg, code: 'VALIDATION' });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err?.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ error: 'That already exists', code: 'DUPLICATE' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body', code: 'VALIDATION' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
}

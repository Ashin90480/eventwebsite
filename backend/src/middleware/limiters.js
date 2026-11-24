import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const make = (windowMs, max, message) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => env.NODE_ENV === 'test',
    handler: (_req, res) =>
      res.status(429).json({ error: { code: 'RATE_LIMITED', message } }),
  });

export const apiLimiter = make(60 * 1000, 300, 'Too many requests. Please slow down.');
export const loginLimiter = make(15 * 60 * 1000, 10, 'Too many sign-in attempts. Try again in 15 minutes.');
// Students on one campus network share an IP, so this is deliberately generous.
export const publicWriteLimiter = make(15 * 60 * 1000, 60, 'Too many requests from this network. Try again shortly.');

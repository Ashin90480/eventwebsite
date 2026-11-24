import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { demoEnabled, env } from '../config/env.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/limiters.js';
import { Coordinator } from '../models/index.js';
import { AppError } from '../utils/helpers.js';

const router = Router();
const view = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role });

// Compared against when the email is unknown so response time doesn't reveal valid accounts.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

router.get('/config', (_req, res) => res.json({ demoLogin: demoEnabled }));

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await Coordinator.findOne({ email });
  const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
  if (!user || !user.active || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
  res.json({ token: signToken(user), user: view(user) });
});

// Not registered at all in production.
if (demoEnabled) {
  router.post('/demo-login', loginLimiter, async (_req, res) => {
    const user = await Coordinator.findOne({ email: 'demo@eventqr.local' });
    if (!user) throw new AppError(404, 'NO_DEMO', 'Demo account not found. Run `npm run seed` first.');
    res.json({ token: signToken(user), user: view(user) });
  });
}

router.post('/logout', (_req, res) => res.json({ ok: true })); // JWT is stateless; client discards it

router.get('/me', requireAuth, (req, res) => res.json({ user: view(req.user) }));

router.put('/password', requireAuth, async (req, res) => {
  const body = z
    .object({ currentPassword: z.string().min(1), newPassword: z.string().min(10, 'New password must be at least 10 characters').max(200) })
    .parse(req.body);
  if (!(await bcrypt.compare(body.currentPassword, req.user.passwordHash))) {
    throw new AppError(400, 'WRONG_PASSWORD', 'Current password is incorrect.');
  }
  req.user.passwordHash = await bcrypt.hash(body.newPassword, 12);
  await req.user.save();
  res.json({ ok: true });
});

export default router;

import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { clientOrigins } from './config/env.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/error.js';
import { apiLimiter } from './middleware/limiters.js';
import authRouter from './routes/auth.js';
import dashboardRouter from './routes/dashboard.js';
import eventsRouter from './routes/events.js';
import publicRouter from './routes/public.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render sits behind a proxy; needed for correct rate-limit IPs
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: clientOrigins, exposedHeaders: ['Content-Disposition'] }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.use('/api', apiLimiter);
  app.use('/api/auth', authRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/dashboard', requireAuth, dashboardRouter);
  app.use('/api/events', requireAuth, eventsRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

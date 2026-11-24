import 'dotenv/config';
import { z } from 'zod';

const flag = z.string().optional().transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(5000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  QR_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'QR_ENCRYPTION_KEY must be exactly 64 hex characters'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  PUBLIC_APP_URL: z.string().optional(),
  EVENT_TZ_OFFSET: z.string().default('+05:30'),
  EVENT_TIMEZONE: z.string().default('Asia/Kolkata'),
  ENABLE_DEMO_LOGIN: flag,
  DEMO_PASSWORD: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_SECURE: flag,
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().optional(),
});

// Treat empty strings (e.g. "SMTP_HOST=") as unset.
const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''));
const parsed = schema.safeParse(raw);
if (!parsed.success) {
  const msg = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${msg}`);
}

export const env = parsed.data;
export const clientOrigins = env.CLIENT_ORIGIN.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
export const publicAppUrl = (env.PUBLIC_APP_URL || clientOrigins[0] || 'http://localhost:5173').replace(/\/$/, '');
export const demoEnabled = env.ENABLE_DEMO_LOGIN && env.NODE_ENV !== 'production';
export const mailConfigured = Boolean(env.SMTP_HOST);

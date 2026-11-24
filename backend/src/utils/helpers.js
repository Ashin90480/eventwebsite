import crypto from 'node:crypto';

export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const normEmail = (e) => String(e || '').trim().toLowerCase();

export function pageParams(q, { max = 100, def = 25 } = {}) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(max, Math.max(1, parseInt(q.limit, 10) || def));
  return { page, limit, skip: (page - 1) * limit };
}

// No 0/O/1/I/L so codes are easy to read out loud.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function randomCode(len) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
export const newRegistrationId = () => `EQ-${randomCode(6)}`;
export const newTicketCode = () => crypto.randomBytes(24).toString('base64url');

export function makeSlug(name) {
  const base =
    String(name)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'event';
  return `${base}-${randomCode(4).toLowerCase()}`;
}

export function computeStatus(ev, now = new Date()) {
  if (ev.statusOverride === 'draft') return 'draft';
  if (ev.statusOverride === 'cancelled') return 'cancelled';
  if (now < ev.startAt) return 'upcoming';
  if (now <= ev.endAt) return 'ongoing';
  return 'completed';
}

/** Neutralise spreadsheet formula injection in exported cells. */
export function safeCell(v) {
  if (typeof v !== 'string') return v;
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

export const safeFilename = (s) =>
  String(s || 'export').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'export';

import crypto from 'node:crypto';
import { env } from '../config/env.js';

const PREFIX = 'EVENTQR1:';
const FORMAT = /^EVENTQR1:[A-Za-z0-9_-]{43}$/;

export const generateToken = () => PREFIX + crypto.randomBytes(32).toString('base64url');
export const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
export const isWellFormed = (t) => typeof t === 'string' && FORMAT.test(t);

const key = () => Buffer.from(env.QR_ENCRYPTION_KEY, 'hex');

/** AES-256-GCM. Output: iv.tag.ciphertext (base64url). */
export function encryptToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString('base64url')).join('.');
}

export function decryptToken(stored) {
  const [iv, tag, ct] = stored.split('.').map((p) => Buffer.from(p, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}

export function newQr() {
  const token = generateToken();
  return { token, qrTokenHash: hashToken(token), qrTokenCipher: encryptToken(token) };
}

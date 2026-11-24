import { Router } from 'express';
import mongoose from 'mongoose';
import QRCode from 'qrcode';
import { z } from 'zod';
import { EventRegistration, REG_STATUSES, Student } from '../models/index.js';
import { deliverTicket, queueTicket } from '../services/mailer.js';
import { createRegistration, removeRegistration, setStatus, upsertStudent } from '../services/registrations.js';
import { distinctMeta, getRoster, getRosterRow } from '../services/roster.js';
import { audit } from '../utils/audit.js';
import { AppError, normEmail, pageParams, safeFilename } from '../utils/helpers.js';
import { decryptToken, newQr } from '../utils/qrToken.js';

const router = Router();

const phone = z
  .string()
  .trim()
  .max(20)
  .refine((v) => !v || /^\+?[0-9 ()-]{7,20}$/.test(v), 'Phone number looks invalid')
  .default('');

const participantSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(200),
  phone,
  department: z.string().trim().max(100).default(''),
  academicYear: z.string().trim().max(30).default(''),
  rollNo: z.string().trim().max(50).default(''),
});

async function loadReg(req) {
  const { rid } = req.params;
  if (!mongoose.isValidObjectId(rid)) throw new AppError(404, 'NOT_FOUND', 'Participant not found');
  const reg = await EventRegistration.findOne({ _id: rid, eventId: req.event._id });
  if (!reg) throw new AppError(404, 'NOT_FOUND', 'Participant not found');
  return reg;
}

/* ---------- roster ---------- */

router.get('/', async (req, res) => {
  const { page, limit } = pageParams(req.query);
  const q = req.query;
  const status = REG_STATUSES.includes(q.status) ? q.status : undefined;
  const data = await getRoster(req.event._id, {
    search: q.search,
    department: q.department,
    academicYear: q.academicYear,
    attendance: q.attendance,
    status,
    sort: q.sort,
    dir: q.dir,
    page,
    limit,
  });
  res.json(data);
});

router.get('/meta', async (req, res) => res.json(await distinctMeta(req.event._id)));

router.post('/', async (req, res) => {
  const body = participantSchema.extend({ sendEmail: z.boolean().default(true) }).parse(req.body);
  const student = await upsertStudent(req.event.coordinatorId, body);
  const reg = await createRegistration({ event: req.event, student, source: 'manual' });
  await audit(req, req.event, 'registration.add', `${student.name} (${reg.registrationId})`);
  if (body.sendEmail) queueTicket(reg._id);
  res.status(201).json({ registration: await getRosterRow(req.event._id, reg._id) });
});

router.get('/:rid', async (req, res) => {
  const reg = await loadReg(req);
  res.json({ registration: await getRosterRow(req.event._id, reg._id) });
});

router.put('/:rid', async (req, res) => {
  const reg = await loadReg(req);
  const body = participantSchema.partial().parse(req.body);
  const student = await Student.findById(reg.studentId);
  if (body.email && normEmail(body.email) !== student.email) {
    const clash = await Student.findOne({ coordinatorId: student.coordinatorId, email: normEmail(body.email) });
    if (clash) throw new AppError(409, 'EMAIL_IN_USE', 'Another participant already uses that email.');
    student.email = normEmail(body.email);
  }
  for (const k of ['name', 'phone', 'department', 'academicYear', 'rollNo']) {
    if (body[k] !== undefined) student[k] = body[k];
  }
  await student.save();
  await audit(req, req.event, 'registration.edit', `${student.name} (${reg.registrationId})`);
  res.json({ registration: await getRosterRow(req.event._id, reg._id) });
});

router.delete('/:rid', async (req, res) => {
  const reg = await loadReg(req);
  const student = await Student.findById(reg.studentId);
  await removeRegistration(req.event._id, reg);
  await audit(req, req.event, 'registration.remove', `${student?.name || 'Unknown'} (${reg.registrationId})`);
  res.json({ ok: true });
});

/* ---------- approval / waitlist / status ---------- */

router.patch('/:rid/status', async (req, res) => {
  const reg = await loadReg(req);
  const body = z.object({ status: z.enum(REG_STATUSES), force: z.boolean().default(false) }).parse(req.body);
  const from = reg.status;
  await setStatus(req.event._id, reg, body.status, { force: body.force });
  const student = await Student.findById(reg.studentId);
  await audit(req, req.event, 'registration.status', `${student?.name} (${reg.registrationId}): ${from} → ${body.status}`);
  res.json({ registration: await getRosterRow(req.event._id, reg._id) });
});

/** Bulk approve / reject / etc. Skips people who can't move (e.g. no seat left). */
router.post('/bulk-status', async (req, res) => {
  const body = z
    .object({ ids: z.array(z.string()).min(1).max(500), status: z.enum(REG_STATUSES), force: z.boolean().default(false) })
    .parse(req.body);
  const ids = body.ids.filter((i) => mongoose.isValidObjectId(i));
  const regs = await EventRegistration.find({ _id: { $in: ids }, eventId: req.event._id }).sort({ createdAt: 1 });
  let changed = 0;
  let skipped = 0;
  for (const reg of regs) {
    try {
      await setStatus(req.event._id, reg, body.status, { force: body.force });
      changed++;
    } catch (err) {
      if (err instanceof AppError) skipped++;
      else throw err;
    }
  }
  await audit(req, req.event, 'registration.bulk_status', `${changed} → ${body.status}${skipped ? `, ${skipped} skipped` : ''}`);
  res.json({ changed, skipped });
});

router.post('/:rid/resend', async (req, res) => {
  const reg = await loadReg(req);
  if (reg.status !== 'registered') throw new AppError(409, 'NOT_CONFIRMED', 'Only confirmed participants get a ticket.');
  if (reg.qrRevoked) throw new AppError(409, 'QR_REVOKED', 'This QR code is revoked. Regenerate it first.');
  const result = await deliverTicket(reg._id);
  await audit(req, req.event, 'registration.resend', `${reg.registrationId}: ${result}`);
  res.json({ emailStatus: result });
});

/* ---------- QR for one participant ---------- */

router.get('/:rid/qr', async (req, res) => {
  const reg = await loadReg(req);
  if (reg.qrRevoked) throw new AppError(409, 'QR_REVOKED', 'This QR code has been revoked.');
  const png = await QRCode.toBuffer(decryptToken(reg.qrTokenCipher), { width: 480, margin: 2, errorCorrectionLevel: 'M' });
  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', 'private, no-store');
  if (req.query.download) {
    res.set('Content-Disposition', `attachment; filename="${safeFilename(reg.registrationId)}.png"`);
  }
  res.send(png);
});

router.post('/:rid/qr/regenerate', async (req, res) => {
  const reg = await loadReg(req);
  const qr = newQr();
  reg.qrTokenHash = qr.qrTokenHash;
  reg.qrTokenCipher = qr.qrTokenCipher;
  reg.qrRevoked = false;
  await reg.save();
  await audit(req, req.event, 'qr.regenerate', reg.registrationId);
  if (req.body?.sendEmail) queueTicket(reg._id);
  res.json({ registration: await getRosterRow(req.event._id, reg._id) });
});

router.post('/:rid/qr/revoke', async (req, res) => {
  const reg = await loadReg(req);
  reg.qrRevoked = true;
  await reg.save();
  await audit(req, req.event, 'qr.revoke', reg.registrationId);
  res.json({ registration: await getRosterRow(req.event._id, reg._id) });
});

/* ---------- import ---------- */

const importSchema = z.object({
  rows: z.array(z.record(z.any())).min(1, 'No rows to import').max(5000, 'Import up to 5000 rows at a time'),
  commit: z.boolean().default(false),
  sendEmails: z.boolean().default(false),
});

export async function importHandler(req, res) {
  const { rows, commit, sendEmails } = importSchema.parse(req.body);
  const event = req.event;

  const existingRows = await EventRegistration.find({ eventId: event._id }).populate('studentId', 'email').lean();
  const existing = new Set(existingRows.map((r) => r.studentId?.email).filter(Boolean));

  const seen = new Set();
  const results = rows.map((raw, index) => {
    const candidate = {
      name: String(raw.name ?? '').trim(),
      email: normEmail(raw.email),
      phone: String(raw.phone ?? '').trim(),
      department: String(raw.department ?? '').trim(),
      academicYear: String(raw.academicYear ?? '').trim(),
      rollNo: String(raw.rollNo ?? '').trim(),
    };
    const parsed = participantSchema.safeParse(candidate);
    if (!parsed.success) {
      return {
        index,
        status: 'invalid',
        row: candidate,
        errors: parsed.error.issues.map((i) => ({ field: i.path[0], message: i.message })),
      };
    }
    const row = parsed.data;
    if (existing.has(row.email)) return { index, status: 'exists', row, errors: [{ field: 'email', message: 'Already registered for this event' }] };
    if (seen.has(row.email)) return { index, status: 'duplicate', row, errors: [{ field: 'email', message: 'Duplicate email in this file' }] };
    seen.add(row.email);
    return { index, status: 'valid', row, errors: [] };
  });

  const summary = { total: rows.length, valid: 0, invalid: 0, duplicate: 0, exists: 0 };
  for (const r of results) summary[r.status]++;

  if (!commit) return res.json({ summary, rows: results });

  let created = 0;
  for (const r of results.filter((x) => x.status === 'valid')) {
    try {
      const student = await upsertStudent(event.coordinatorId, r.row);
      const reg = await createRegistration({ event, student, source: 'import' });
      created++;
      if (sendEmails) queueTicket(reg._id);
    } catch (err) {
      if (err instanceof AppError && err.code === 'ALREADY_REGISTERED') {
        r.status = 'exists';
        summary.valid--;
        summary.exists++;
      } else throw err;
    }
  }
  await audit(req, event, 'registration.import', `${created} imported`, { ...summary, created });
  res.json({ summary: { ...summary, created }, rows: results });
}

export default router;

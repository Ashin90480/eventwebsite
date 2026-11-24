import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Attendance, EventRegistration, Student } from '../models/index.js';
import { getRoster } from '../services/roster.js';
import { audit } from '../utils/audit.js';
import { AppError, pageParams } from '../utils/helpers.js';
import { hashToken, isWellFormed } from '../utils/qrToken.js';

const router = Router();

async function personOf(reg) {
  const s = await Student.findById(reg.studentId).lean();
  return {
    id: reg._id,
    registrationId: reg.registrationId,
    name: s?.name || '',
    department: s?.department || '',
    academicYear: s?.academicYear || '',
    rollNo: s?.rollNo || '',
  };
}

/**
 * Mark present exactly once. The unique index on eventRegistrationId is the real guard:
 * simultaneous scans race on insert and only one wins.
 * Returns { att, created } or throws ALREADY_PRESENT.
 */
async function markPresent(event, reg, { method, markedByName, reason = '' }) {
  try {
    const att = await Attendance.create({
      eventId: event._id,
      eventRegistrationId: reg._id,
      status: 'present',
      method,
      markedByName,
      reason,
      checkInAt: new Date(),
    });
    return att;
  } catch (err) {
    if (err.code !== 11000) throw err;
    // A record exists. If it was corrected to "absent", re-scanning flips it back; otherwise it's a duplicate.
    const flipped = await Attendance.findOneAndUpdate(
      { eventRegistrationId: reg._id, status: 'absent' },
      { $set: { status: 'present', method, markedByName, reason, checkInAt: new Date() } },
      { new: true },
    );
    if (flipped) return flipped;
    const existing = await Attendance.findOne({ eventRegistrationId: reg._id });
    throw new AppError(409, 'ALREADY_PRESENT', 'Already checked in.', {
      person: await personOf(reg),
      checkInAt: existing?.checkInAt,
    });
  }
}

router.put('/state', async (req, res) => {
  const { open } = z.object({ open: z.boolean() }).parse(req.body);
  req.event.attendanceOpen = open;
  await req.event.save();
  await audit(req, req.event, open ? 'attendance.open' : 'attendance.close');
  res.json({ attendanceOpen: req.event.attendanceOpen });
});

router.post('/scan', async (req, res) => {
  const { token } = z.object({ token: z.string().max(200) }).parse(req.body);
  const trimmed = token.trim();
  if (!isWellFormed(trimmed)) throw new AppError(400, 'INVALID_QR', 'This is not an EventQR code.');

  const reg = await EventRegistration.findOne({ qrTokenHash: hashToken(trimmed) });
  if (!reg) throw new AppError(400, 'INVALID_QR', 'Unrecognised QR code.');
  if (!reg.eventId.equals(req.event._id)) {
    throw new AppError(409, 'WRONG_EVENT', 'This QR code is for a different event.');
  }
  const person = await personOf(reg);
  if (reg.qrRevoked) throw new AppError(403, 'QR_REVOKED', 'This QR code has been revoked.', { person });
  if (reg.status !== 'registered') {
    throw new AppError(403, 'NOT_CONFIRMED', `Registration is ${reg.status}, not confirmed.`, { person });
  }
  if (!req.event.attendanceOpen) throw new AppError(403, 'ATTENDANCE_CLOSED', 'Attendance is closed. Open it to start scanning.');

  const att = await markPresent(req.event, reg, { method: 'qr', markedByName: req.user.name });
  res.status(201).json({ result: 'success', registration: person, checkInAt: att.checkInAt });
});

router.post('/manual', async (req, res) => {
  const body = z
    .object({
      registrationDbId: z.string().optional(),
      registrationId: z.string().trim().max(20).optional(),
      reason: z.string().trim().max(300).default(''),
    })
    .refine((b) => b.registrationDbId || b.registrationId, 'Provide registrationDbId or registrationId')
    .parse(req.body);

  const filter = { eventId: req.event._id };
  if (body.registrationDbId) {
    if (!mongoose.isValidObjectId(body.registrationDbId)) throw new AppError(404, 'NOT_FOUND', 'Participant not found');
    filter._id = body.registrationDbId;
  } else filter.registrationId = body.registrationId.toUpperCase();

  const reg = await EventRegistration.findOne(filter);
  if (!reg) throw new AppError(404, 'NOT_FOUND', 'Participant not found');
  if (reg.status !== 'registered') {
    throw new AppError(409, 'NOT_CONFIRMED', `Registration is ${reg.status}. Approve it before marking attendance.`);
  }
  const att = await markPresent(req.event, reg, { method: 'manual', markedByName: req.user.name, reason: body.reason });
  await audit(req, req.event, 'attendance.manual', `${reg.registrationId}${body.reason ? ` — ${body.reason}` : ''}`);
  res.status(201).json({ result: 'success', registration: await personOf(reg), checkInAt: att.checkInAt });
});

router.get('/', async (req, res) => {
  const { page, limit } = pageParams(req.query, { max: 200, def: 50 });
  const q = req.query;
  res.json(
    await getRoster(req.event._id, {
      status: 'registered',
      search: q.search,
      department: q.department,
      academicYear: q.academicYear,
      attendance: q.attendance,
      sort: q.sort || 'checkInAt',
      dir: q.dir || 'desc',
      page,
      limit,
    }),
  );
});

router.get('/summary', async (req, res) => {
  const registered = await EventRegistration.countDocuments({ eventId: req.event._id, status: 'registered' });
  const regIds = await EventRegistration.find({ eventId: req.event._id, status: 'registered' }).distinct('_id');
  const present = await Attendance.countDocuments({ eventRegistrationId: { $in: regIds }, status: 'present' });
  res.json({
    registered,
    present,
    absent: registered - present,
    rate: registered ? Math.round((present / registered) * 1000) / 10 : 0,
    attendanceOpen: req.event.attendanceOpen,
  });
});

router.patch('/:attendanceId', async (req, res) => {
  const { attendanceId } = req.params;
  if (!mongoose.isValidObjectId(attendanceId)) throw new AppError(404, 'NOT_FOUND', 'Attendance record not found');
  const body = z
    .object({ status: z.enum(['present', 'absent']), reason: z.string().trim().min(3, 'A reason is required for corrections').max(300) })
    .parse(req.body);
  const att = await Attendance.findOne({ _id: attendanceId, eventId: req.event._id });
  if (!att) throw new AppError(404, 'NOT_FOUND', 'Attendance record not found');
  const from = att.status;
  att.status = body.status;
  att.reason = body.reason;
  att.markedByName = req.user.name;
  att.method = 'manual';
  if (body.status === 'present' && from !== 'present') att.checkInAt = new Date();
  await att.save();
  const reg = await EventRegistration.findById(att.eventRegistrationId);
  await audit(req, req.event, 'attendance.correct', `${reg?.registrationId}: ${from} → ${body.status} — ${body.reason}`);
  res.json({ attendance: { id: att._id, status: att.status, reason: att.reason } });
});

export default router;

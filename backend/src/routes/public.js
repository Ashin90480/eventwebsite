import { Router } from 'express';
import QRCode from 'qrcode';
import { z } from 'zod';
import { env, mailConfigured } from '../config/env.js';
import { publicWriteLimiter } from '../middleware/limiters.js';
import { Attendance, Event, EventRegistration, Student } from '../models/index.js';
import { deliverTicket, queueTicket } from '../services/mailer.js';
import { createRegistration, registrationState, setStatus, upsertStudent } from '../services/registrations.js';
import { audit } from '../utils/audit.js';
import { AppError, computeStatus, normEmail } from '../utils/helpers.js';
import { decryptToken } from '../utils/qrToken.js';

/**
 * Public (no login) endpoints used by students: the registration form and their ticket.
 * Nothing here exposes other participants or coordinator data.
 */
const router = Router();

const CLOSED_MESSAGES = {
  not_published: 'This event is not open for registration.',
  cancelled: 'This event has been cancelled.',
  ended: 'This event has already ended.',
  closed: 'Registration for this event is closed.',
  deadline_passed: 'The registration deadline has passed.',
  full: 'This event is full.',
};

async function findPublicEvent(slug) {
  const ev = await Event.findOne({ slug: String(slug).slice(0, 80) });
  if (!ev || ev.statusOverride === 'draft') throw new AppError(404, 'NOT_FOUND', 'Event not found');
  return ev;
}

function publicEventView(ev) {
  const st = registrationState(ev);
  const r = ev.registration;
  return {
    name: ev.name,
    description: ev.description,
    venue: ev.venue,
    startAt: ev.startAt,
    endAt: ev.endAt,
    posterUrl: ev.posterUrl,
    status: computeStatus(ev),
    registrationDeadline: ev.registrationDeadline,
    registration: {
      open: st.open,
      closedReason: st.closedReason,
      closedMessage: st.closedReason ? CLOSED_MESSAGES[st.closedReason] : null,
      full: st.full,
      waitlisting: st.waitlisting,
      seatsLeft: st.seatsLeft,
      requireApproval: r.requireApproval,
      fields: r.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required, options: f.options })),
    },
  };
}

router.get('/events/:slug', async (req, res) => {
  res.json({ event: publicEventView(await findPublicEvent(req.params.slug)) });
});

const phone = z
  .string()
  .trim()
  .max(20)
  .refine((v) => !v || /^\+?[0-9 ()-]{7,20}$/.test(v), 'Phone number looks invalid')
  .default('');

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your full name').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(200),
  phone,
  department: z.string().trim().min(1, 'Department is required').max(100),
  academicYear: z.string().trim().min(1, 'Year is required').max(30),
  rollNo: z.string().trim().max(50).default(''),
  answers: z.record(z.string().max(500)).default({}),
  website: z.string().optional(), // honeypot: real people never see or fill this
});

function cleanAnswers(fields, answers) {
  const out = {};
  for (const f of fields) {
    const v = String(answers[f.key] ?? '').trim();
    if (f.type === 'checkbox') {
      if (f.required && v !== 'true') throw new AppError(400, 'VALIDATION', `${f.label}: please tick this box to continue`);
      out[f.key] = v === 'true' ? 'true' : 'false';
      continue;
    }
    if (!v) {
      if (f.required) throw new AppError(400, 'VALIDATION', `${f.label} is required`);
      continue;
    }
    if (f.type === 'select' && !f.options.includes(v)) throw new AppError(400, 'VALIDATION', `${f.label}: choose one of the listed options`);
    out[f.key] = v;
  }
  return out;
}

const OUTCOME_MESSAGES = {
  registered: "You're registered! Your QR ticket is below.",
  pending: 'Thanks! Your registration is waiting for the organiser to approve it.',
  waitlisted: "The event is full, so you're on the waiting list. We'll confirm you if a seat opens up.",
};

router.post('/events/:slug/register', publicWriteLimiter, async (req, res) => {
  const body = registerSchema.parse(req.body);
  const ev = await findPublicEvent(req.params.slug);

  if (body.website) {
    // Bot trap: pretend it worked, store nothing.
    return res.status(201).json({ status: 'registered', registrationId: 'EQ-000000', ticketCode: null, message: OUTCOME_MESSAGES.registered });
  }

  const st = registrationState(ev);
  if (!st.open) throw new AppError(403, 'REGISTRATION_CLOSED', CLOSED_MESSAGES[st.closedReason], { reason: st.closedReason });

  const answers = cleanAnswers(ev.registration.fields, body.answers);
  const student = await upsertStudent(ev.coordinatorId, body);
  const reg = await createRegistration({ event: ev, student, source: 'public', answers, mode: 'public' });

  await audit(null, ev, 'registration.public', `${student.name} (${reg.registrationId}) → ${reg.status}`);
  if (reg.status === 'registered') queueTicket(reg._id);

  res.status(201).json({
    status: reg.status,
    registrationId: reg.registrationId,
    ticketCode: reg.ticketCode,
    emailing: reg.status === 'registered' && mailConfigured,
    message: ev.registration.confirmationMessage && reg.status === 'registered'
      ? `${OUTCOME_MESSAGES.registered} ${ev.registration.confirmationMessage}`
      : OUTCOME_MESSAGES[reg.status],
  });
});

/** "I lost my ticket": always answers the same way so it can't be used to probe who is registered. */
router.post('/events/:slug/resend', publicWriteLimiter, async (req, res) => {
  const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(req.body);
  const ev = await findPublicEvent(req.params.slug);
  const student = await Student.findOne({ coordinatorId: ev.coordinatorId, email: normEmail(email) });
  if (student) {
    const reg = await EventRegistration.findOne({ eventId: ev._id, studentId: student._id, status: 'registered', qrRevoked: false });
    if (reg) setImmediate(() => deliverTicket(reg._id).catch(() => {}));
  }
  res.json({ ok: true, message: 'If that email is registered and confirmed, we have sent the ticket again.' });
});

/* ---------- ticket page (access = knowing the unguessable link) ---------- */

async function findTicket(code) {
  const reg = await EventRegistration.findOne({ ticketCode: String(code).slice(0, 80) });
  if (!reg) throw new AppError(404, 'NOT_FOUND', 'Ticket not found');
  const [ev, student] = await Promise.all([Event.findById(reg.eventId), Student.findById(reg.studentId)]);
  if (!ev || !student) throw new AppError(404, 'NOT_FOUND', 'Ticket not found');
  return { reg, ev, student };
}

router.get('/tickets/:code', async (req, res) => {
  const { reg, ev, student } = await findTicket(req.params.code);
  const att = await Attendance.findOne({ eventRegistrationId: reg._id, status: 'present' }).lean();
  const canShowQr = reg.status === 'registered' && !reg.qrRevoked;
  res.json({
    ticket: {
      registrationId: reg.registrationId,
      status: reg.status,
      qrRevoked: reg.qrRevoked,
      name: student.name,
      email: student.email,
      department: student.department,
      academicYear: student.academicYear,
      checkedInAt: att?.checkInAt || null,
      qrDataUrl: canShowQr ? await QRCode.toDataURL(decryptToken(reg.qrTokenCipher), { width: 480, margin: 2, errorCorrectionLevel: 'M' }) : null,
      canCancel: ['registered', 'pending', 'waitlisted'].includes(reg.status) && !att && computeStatus(ev) !== 'completed',
      event: {
        name: ev.name,
        venue: ev.venue,
        startAt: ev.startAt,
        endAt: ev.endAt,
        posterUrl: ev.posterUrl,
        status: computeStatus(ev),
        whatsappGroupUrl: reg.status === 'registered' ? ev.whatsappGroupUrl : '',
        slug: ev.slug,
      },
    },
  });
});

router.post('/tickets/:code/cancel', publicWriteLimiter, async (req, res) => {
  const { reg, ev, student } = await findTicket(req.params.code);
  const att = await Attendance.findOne({ eventRegistrationId: reg._id, status: 'present' });
  if (att) throw new AppError(409, 'ALREADY_CHECKED_IN', 'You are already checked in, so this registration can no longer be cancelled.');
  if (computeStatus(ev) === 'completed') throw new AppError(409, 'EVENT_ENDED', 'This event has already ended.');
  if (!['registered', 'pending', 'waitlisted'].includes(reg.status)) {
    throw new AppError(409, 'NOT_CANCELLABLE', `This registration is already ${reg.status}.`);
  }
  await setStatus(ev._id, reg, 'cancelled');
  await audit(null, ev, 'registration.cancelled_by_participant', `${student.name} (${reg.registrationId})`);
  res.json({ ok: true, status: 'cancelled' });
});

const icsText = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/[,;]/g, (m) => `\\${m}`).replace(/\r?\n/g, '\\n');
const icsDate = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

router.get('/tickets/:code/calendar.ics', async (req, res) => {
  const { reg, ev } = await findTicket(req.params.code);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EventQR//Ticket//EN',
    'BEGIN:VEVENT',
    `UID:${reg.registrationId}@eventqr`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(ev.startAt)}`,
    `DTEND:${icsDate(ev.endAt)}`,
    `SUMMARY:${icsText(ev.name)}`,
    `LOCATION:${icsText(ev.venue)}`,
    `DESCRIPTION:${icsText(`Registration ID ${reg.registrationId}`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="event.ics"');
  res.send(lines.join('\r\n'));
});

export default router;

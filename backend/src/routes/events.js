import { Router } from 'express';
import { z } from 'zod';
import { loadEvent } from '../middleware/auth.js';
import { Attendance, AuditLog, Event, EventRegistration } from '../models/index.js';
import { countsFor, serializeEvent } from '../services/eventView.js';
import { promoteWaitlist } from '../services/registrations.js';
import { audit } from '../utils/audit.js';
import { AppError, escapeRegex, makeSlug, pageParams } from '../utils/helpers.js';
import attendanceRouter from './attendance.js';
import reportsRouter from './reports.js';
import registrationsRouter, { importHandler } from './registrations.js';
import { qrRouter } from './qr.js';

const router = Router();

const optDate = z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.date().nullable());
const optUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => !v || /^https?:\/\//i.test(v), 'Must start with http:// or https://');

const fieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,29}$/, 'Field key must be lowercase letters, digits or _'),
  label: z.string().trim().min(1).max(100),
  type: z.enum(['text', 'textarea', 'select', 'checkbox']).default('text'),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
});

const registrationSchema = z
  .object({
    open: z.boolean(),
    capacity: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int().min(1).max(100000).nullable()),
    waitlist: z.boolean(),
    requireApproval: z.boolean(),
    confirmationMessage: z.string().trim().max(500),
    fields: z.array(fieldSchema).max(10),
  })
  .partial();

const eventSchema = z.object({
  name: z.string().trim().min(3, 'Name must be at least 3 characters').max(150),
  description: z.string().trim().max(5000).default(''),
  venue: z.string().trim().max(200).default(''),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  registrationDeadline: optDate.optional(),
  status: z.enum(['auto', 'draft', 'cancelled']).default('auto'),
  posterUrl: optUrl.default(''),
  whatsappGroupUrl: optUrl.default(''),
  registration: registrationSchema.optional(),
});

function checkDates(d) {
  if (Number.isNaN(+d.startAt) || Number.isNaN(+d.endAt)) throw new AppError(400, 'VALIDATION', 'Invalid start or end time.');
  if (d.endAt <= d.startAt) throw new AppError(400, 'VALIDATION', 'The event must end after it starts.');
  if (d.registrationDeadline && d.registrationDeadline > d.endAt) {
    throw new AppError(400, 'VALIDATION', 'The registration deadline must be before the event ends.');
  }
  const keys = (d.registration?.fields || []).map((f) => f.key);
  if (new Set(keys).size !== keys.length) throw new AppError(400, 'VALIDATION', 'Custom field keys must be unique.');
  for (const f of d.registration?.fields || []) {
    if (f.type === 'select' && f.options.length < 2) {
      throw new AppError(400, 'VALIDATION', `"${f.label}" needs at least two options.`);
    }
  }
}

function applyRegistration(ev, reg = {}) {
  for (const k of ['open', 'capacity', 'waitlist', 'requireApproval', 'confirmationMessage', 'fields']) {
    if (reg[k] !== undefined) ev.registration[k] = reg[k];
  }
}

/* ---------- list / create ---------- */

router.get('/', async (req, res) => {
  const { page, limit, skip } = pageParams(req.query, { def: 12 });
  const q = req.user.role === 'admin' ? {} : { coordinatorId: req.user._id };
  const search = String(req.query.search || '').trim().slice(0, 100);
  if (search) q.name = { $regex: escapeRegex(search), $options: 'i' };

  const now = new Date();
  const st = String(req.query.status || '');
  if (st === 'draft' || st === 'cancelled') q.statusOverride = st;
  else if (st === 'upcoming') Object.assign(q, { statusOverride: null, startAt: { $gt: now } });
  else if (st === 'ongoing') Object.assign(q, { statusOverride: null, startAt: { $lte: now }, endAt: { $gte: now } });
  else if (st === 'completed') Object.assign(q, { statusOverride: null, endAt: { $lt: now } });

  const sortKey = { name: 'name', createdAt: 'createdAt' }[req.query.sort] || 'startAt';
  const sort = { [sortKey]: req.query.dir === 'asc' ? 1 : -1 };

  const [total, docs] = await Promise.all([Event.countDocuments(q), Event.find(q).sort(sort).skip(skip).limit(limit)]);
  const counts = await countsFor(docs.map((d) => d._id));
  res.json({
    items: docs.map((d) => serializeEvent(d, counts.get(String(d._id)))),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});

router.post('/', async (req, res) => {
  const data = eventSchema.parse(req.body);
  checkDates(data);
  const ev = new Event({
    coordinatorId: req.user._id,
    name: data.name,
    description: data.description,
    venue: data.venue,
    startAt: data.startAt,
    endAt: data.endAt,
    registrationDeadline: data.registrationDeadline ?? null,
    statusOverride: data.status === 'auto' ? null : data.status,
    posterUrl: data.posterUrl,
    whatsappGroupUrl: data.whatsappGroupUrl,
    slug: makeSlug(data.name),
  });
  applyRegistration(ev, data.registration);
  await ev.save();
  await audit(req, ev, 'event.create', ev.name);
  res.status(201).json({ event: serializeEvent(ev, (await countsFor([ev._id])).get(String(ev._id))) });
});

/* ---------- one event ---------- */

router.get('/:eventId', loadEvent, async (req, res) => {
  const counts = await countsFor([req.event._id]);
  res.json({ event: serializeEvent(req.event, counts.get(String(req.event._id))) });
});

router.put('/:eventId', loadEvent, async (req, res) => {
  const ev = req.event;
  const patch = eventSchema.partial().parse(req.body);
  const merged = {
    startAt: patch.startAt ?? ev.startAt,
    endAt: patch.endAt ?? ev.endAt,
    registrationDeadline: patch.registrationDeadline !== undefined ? patch.registrationDeadline : ev.registrationDeadline,
    registration: patch.registration,
  };
  checkDates(merged);

  const prevCap = ev.registration.capacity;
  const prevApproval = ev.registration.requireApproval;
  for (const k of ['name', 'description', 'venue', 'startAt', 'endAt', 'posterUrl', 'whatsappGroupUrl']) {
    if (patch[k] !== undefined) ev[k] = patch[k];
  }
  if (patch.registrationDeadline !== undefined) ev.registrationDeadline = patch.registrationDeadline;
  if (patch.status !== undefined) ev.statusOverride = patch.status === 'auto' ? null : patch.status;
  if (!ev.slug) ev.slug = makeSlug(ev.name);
  applyRegistration(ev, patch.registration);
  await ev.save();
  await audit(req, ev, 'event.update', ev.name);

  // More seats (or no limit any more) → let waitlisted people in.
  if (ev.registration.capacity !== prevCap || ev.registration.requireApproval !== prevApproval) {
    await promoteWaitlist(ev._id);
  }
  const fresh = await Event.findById(ev._id);
  res.json({ event: serializeEvent(fresh, (await countsFor([ev._id])).get(String(ev._id))) });
});

router.delete('/:eventId', loadEvent, async (req, res) => {
  const id = req.event._id;
  // Children first so a partial failure never leaves orphans pointing at a missing event.
  await Attendance.deleteMany({ eventId: id });
  await EventRegistration.deleteMany({ eventId: id });
  await AuditLog.deleteMany({ eventId: id });
  await Event.deleteOne({ _id: id });
  res.json({ ok: true });
});

router.get('/:eventId/audit', loadEvent, async (req, res) => {
  const items = await AuditLog.find({ eventId: req.event._id }).sort({ at: -1 }).limit(100).lean();
  res.json({
    items: items.map((a) => ({ id: a._id, action: a.action, detail: a.detail, actor: a.actorName, at: a.at, meta: a.meta })),
  });
});

router.post('/:eventId/import', loadEvent, importHandler);
router.use('/:eventId/registrations', loadEvent, registrationsRouter);
router.use('/:eventId/attendance', loadEvent, attendanceRouter);
router.use('/:eventId/reports', loadEvent, reportsRouter);
router.use('/:eventId', loadEvent, qrRouter);

export default router;

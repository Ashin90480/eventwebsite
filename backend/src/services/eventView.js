import { publicAppUrl } from '../config/env.js';
import { Attendance, EventRegistration } from '../models/index.js';
import { computeStatus } from '../utils/helpers.js';
import { registrationState } from './registrations.js';

const EMPTY = { registered: 0, pending: 0, waitlisted: 0, rejected: 0, cancelled: 0, present: 0 };

/** Registration + attendance counts for a set of events, keyed by event id. */
export async function countsFor(eventIds) {
  const out = new Map(eventIds.map((id) => [String(id), { ...EMPTY }]));
  if (!eventIds.length) return out;
  const [byStatus, present] = await Promise.all([
    EventRegistration.aggregate([
      { $match: { eventId: { $in: eventIds } } },
      { $group: { _id: { e: '$eventId', s: '$status' }, n: { $sum: 1 } } },
    ]),
    Attendance.aggregate([
      { $match: { eventId: { $in: eventIds }, status: 'present' } },
      { $group: { _id: '$eventId', n: { $sum: 1 } } },
    ]),
  ]);
  for (const r of byStatus) out.get(String(r._id.e))[r._id.s] = r.n;
  for (const r of present) out.get(String(r._id)).present = r.n;
  return out;
}

export function serializeEvent(ev, counts) {
  const r = ev.registration || {};
  return {
    id: ev._id,
    coordinatorId: ev.coordinatorId,
    name: ev.name,
    description: ev.description,
    venue: ev.venue,
    startAt: ev.startAt,
    endAt: ev.endAt,
    registrationDeadline: ev.registrationDeadline,
    status: computeStatus(ev),
    attendanceOpen: ev.attendanceOpen,
    posterUrl: ev.posterUrl,
    whatsappGroupUrl: ev.whatsappGroupUrl,
    slug: ev.slug,
    publicUrl: ev.slug ? `${publicAppUrl}/register/${ev.slug}` : null,
    seatsTaken: ev.seatsTaken,
    registration: {
      open: r.open !== false,
      capacity: r.capacity || null,
      waitlist: r.waitlist !== false,
      requireApproval: Boolean(r.requireApproval),
      confirmationMessage: r.confirmationMessage || '',
      fields: (r.fields || []).map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        options: f.options,
      })),
    },
    registrationState: registrationState(ev),
    counts: counts || undefined,
    createdAt: ev.createdAt,
  };
}

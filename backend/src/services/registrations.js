import { Attendance, Event, EventRegistration, SEAT_STATUSES, Student } from '../models/index.js';
import { AppError, computeStatus, newRegistrationId, newTicketCode, normEmail } from '../utils/helpers.js';
import { newQr } from '../utils/qrToken.js';
import { queueTicket } from './mailer.js';

const holdsSeat = (s) => SEAT_STATUSES.includes(s);

/** Is public registration possible right now, and if not, why not? */
export function registrationState(ev, now = new Date()) {
  const status = computeStatus(ev, now);
  const r = ev.registration || {};
  const cap = r.capacity || null;
  const full = Boolean(cap && ev.seatsTaken >= cap);
  let closedReason = null;
  if (status === 'draft') closedReason = 'not_published';
  else if (status === 'cancelled') closedReason = 'cancelled';
  else if (status === 'completed') closedReason = 'ended';
  else if (r.open === false) closedReason = 'closed';
  else if (ev.registrationDeadline && now > ev.registrationDeadline) closedReason = 'deadline_passed';
  else if (full && !r.waitlist) closedReason = 'full';
  return {
    open: !closedReason,
    closedReason,
    full,
    waitlisting: full && Boolean(r.waitlist),
    seatsLeft: cap ? Math.max(0, cap - ev.seatsTaken) : null,
  };
}

/* ---------- seats: atomic single-document counters, no transactions needed ---------- */

async function claimSeat(eventId, capacity, force = false) {
  if (!capacity || force) {
    await Event.updateOne({ _id: eventId }, { $inc: { seatsTaken: 1 } });
    return true;
  }
  const r = await Event.updateOne({ _id: eventId, seatsTaken: { $lt: capacity } }, { $inc: { seatsTaken: 1 } });
  return r.modifiedCount === 1;
}

const releaseSeat = (eventId) =>
  Event.updateOne({ _id: eventId, seatsTaken: { $gt: 0 } }, { $inc: { seatsTaken: -1 } });

/** Re-derive the seat counter from the registrations (repair tool). */
export async function recountSeats(eventId) {
  const n = await EventRegistration.countDocuments({ eventId, status: { $in: SEAT_STATUSES } });
  await Event.updateOne({ _id: eventId }, { $set: { seatsTaken: n } });
  return n;
}

/** Move waitlisted people into freed seats, first come first served. */
export async function promoteWaitlist(eventId) {
  for (let i = 0; i < 1000; i++) {
    const ev = await Event.findById(eventId);
    if (!ev) return;
    if (!(await claimSeat(ev._id, ev.registration?.capacity))) return;
    const next = await EventRegistration.findOneAndUpdate(
      { eventId, status: 'waitlisted' },
      { $set: { status: ev.registration?.requireApproval ? 'pending' : 'registered' } },
      { sort: { createdAt: 1 }, new: true },
    );
    if (!next) {
      await releaseSeat(ev._id);
      return;
    }
    if (next.status === 'registered') queueTicket(next._id);
  }
}

/* ---------- participants ---------- */

export async function upsertStudent(coordinatorId, data) {
  const email = normEmail(data.email);
  const set = { name: data.name };
  for (const k of ['phone', 'department', 'academicYear', 'rollNo']) {
    if (data[k] !== undefined && data[k] !== '') set[k] = data[k];
  }
  const run = () =>
    Student.findOneAndUpdate({ coordinatorId, email }, { $set: set }, { upsert: true, new: true, setDefaultsOnInsert: true });
  try {
    return await run();
  } catch (err) {
    if (err.code === 11000) return run(); // concurrent first-time upsert
    throw err;
  }
}

/**
 * mode 'public': honours capacity, waitlist and approval rules.
 * mode 'staff' : coordinator additions/imports always get a seat (capacity is a guide, not a wall).
 */
export async function createRegistration({ event, student, source, answers = {}, mode = 'staff', status: wanted }) {
  const existing = await EventRegistration.findOne({ eventId: event._id, studentId: student._id });
  if (existing) {
    throw new AppError(409, 'ALREADY_REGISTERED', 'This email is already registered for this event.', {
      status: existing.status,
    });
  }

  const cap = event.registration?.capacity || null;
  let status;
  let seat = false;
  if (mode === 'public') {
    if (await claimSeat(event._id, cap)) {
      seat = true;
      status = event.registration?.requireApproval ? 'pending' : 'registered';
    } else if (event.registration?.waitlist) {
      status = 'waitlisted';
    } else {
      throw new AppError(409, 'EVENT_FULL', 'Sorry, this event is full.');
    }
  } else {
    status = wanted || 'registered';
    if (holdsSeat(status)) {
      await claimSeat(event._id, cap, true);
      seat = true;
    }
  }

  const qr = newQr();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await EventRegistration.create({
        eventId: event._id,
        studentId: student._id,
        registrationId: newRegistrationId(),
        status,
        source,
        answers,
        qrTokenHash: qr.qrTokenHash,
        qrTokenCipher: qr.qrTokenCipher,
        ticketCode: newTicketCode(),
      });
    } catch (err) {
      if (err.code === 11000 && err.keyPattern?.registrationId) continue; // id collision, retry
      if (seat) await releaseSeat(event._id);
      if (err.code === 11000 && err.keyPattern?.studentId) {
        throw new AppError(409, 'ALREADY_REGISTERED', 'This email is already registered for this event.');
      }
      throw err;
    }
  }
  if (seat) await releaseSeat(event._id);
  throw new Error('Could not allocate a registration id');
}

/**
 * Change a registration's status, keeping the seat counter, waitlist and ticket e-mail consistent.
 * Gaining a seat when the event is full requires force=true (coordinator override).
 */
export async function setStatus(eventId, reg, newStatus, { force = false } = {}) {
  const ev = await Event.findById(eventId);
  const before = reg.status;
  if (before === newStatus) return reg;
  const had = holdsSeat(before);
  const will = holdsSeat(newStatus);

  if (!had && will && !(await claimSeat(ev._id, ev.registration?.capacity, force))) {
    throw new AppError(409, 'EVENT_FULL', 'No seats left. Raise the capacity or use "Approve anyway".');
  }
  if (had && !will) await releaseSeat(ev._id);

  reg.status = newStatus;
  await reg.save();

  if (had && !will) await promoteWaitlist(ev._id);
  if (newStatus === 'registered') queueTicket(reg._id);
  return reg;
}

export async function removeRegistration(eventId, reg) {
  await Attendance.deleteMany({ eventRegistrationId: reg._id });
  await EventRegistration.deleteOne({ _id: reg._id });
  if (holdsSeat(reg.status)) {
    await releaseSeat(eventId);
    await promoteWaitlist(eventId);
  }
}

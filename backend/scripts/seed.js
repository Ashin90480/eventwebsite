/* Development-only demo data. Everything is labelled [DEMO] so it can't be mistaken for real records. */
import bcrypt from 'bcryptjs';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { Attendance, AuditLog, Coordinator, Event, EventRegistration, Student } from '../src/models/index.js';
import { createRegistration, upsertStudent } from '../src/services/registrations.js';
import { makeSlug } from '../src/utils/helpers.js';

if (env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo data in production.');
  process.exit(1);
}

await connectDb(env.MONGODB_URI);
for (const m of [Coordinator, Event, Student, EventRegistration, Attendance]) await m.init();

const email = 'demo@eventqr.local';
const passwordHash = await bcrypt.hash(env.DEMO_PASSWORD || 'Demo@12345', 10);
const coord = await Coordinator.findOneAndUpdate(
  { email },
  { name: '[DEMO] Coordinator', email, passwordHash, role: 'coordinator', active: true },
  { upsert: true, new: true },
);

// Clean any previous demo events for this coordinator.
const old = await Event.find({ coordinatorId: coord._id }).select('_id');
const oldIds = old.map((e) => e._id);
await Attendance.deleteMany({ eventId: { $in: oldIds } });
await EventRegistration.deleteMany({ eventId: { $in: oldIds } });
await AuditLog.deleteMany({ eventId: { $in: oldIds } });
await Event.deleteMany({ _id: { $in: oldIds } });
await Student.deleteMany({ coordinatorId: coord._id });

const DAY = 86400000;
const now = Date.now();
const first = ['Aarav', 'Diya', 'Kabir', 'Meera', 'Rohan', 'Ananya', 'Vihaan', 'Isha', 'Arjun', 'Nisha', 'Sahil', 'Tara', 'Dev', 'Riya', 'Yash', 'Pooja', 'Karan', 'Sneha', 'Neel', 'Kavya'];
const last = ['Nair', 'Menon', 'Pillar', 'Iyer', 'Varma', 'Kurup', 'Thomas', 'George', 'Das', 'Rao'];
const depts = ['Computer Science', 'Electronics', 'Mechanical', 'Civil', 'Electrical'];
const years = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

const person = (i) => ({
  name: `[DEMO] ${first[i % first.length]} ${last[Math.floor(i / first.length) % last.length]}`,
  email: `demo.student${i + 1}@example.com`,
  phone: `98${String(10000000 + i * 137).slice(0, 8)}`,
  department: depts[i % depts.length],
  academicYear: years[i % years.length],
  rollNo: `D${String(1000 + i)}`,
});

async function makeEvent(data) {
  return Event.create({ coordinatorId: coord._id, slug: makeSlug(data.name), ...data });
}

const live = await makeEvent({
  name: '[DEMO] Tech Fest Opening Keynote',
  description: 'Demo event for trying out registration, QR check-in and reports. Not a real event.',
  venue: 'Main Auditorium',
  startAt: new Date(now - 1 * 3600000),
  endAt: new Date(now + 3 * 3600000),
  registrationDeadline: new Date(now - 2 * 3600000),
  attendanceOpen: true,
  registration: {
    open: true,
    capacity: 40,
    waitlist: true,
    requireApproval: false,
    fields: [
      { key: 'tshirt', label: 'T-shirt size', type: 'select', required: false, options: ['S', 'M', 'L', 'XL'] },
      { key: 'diet', label: 'Food preference', type: 'select', required: false, options: ['Veg', 'Non-veg'] },
    ],
  },
});
const upcoming = await makeEvent({
  name: '[DEMO] Robotics Workshop',
  description: 'Hands-on workshop. Registration is open: try the public form from the event page.',
  venue: 'Lab 3',
  startAt: new Date(now + 5 * DAY),
  endAt: new Date(now + 5 * DAY + 4 * 3600000),
  registrationDeadline: new Date(now + 4 * DAY),
  registration: {
    open: true,
    capacity: 5,
    waitlist: true,
    requireApproval: true,
    confirmationMessage: 'Please bring your college ID card.',
    fields: [{ key: 'laptop', label: 'I will bring a laptop', type: 'checkbox', required: false, options: [] }],
  },
});
await makeEvent({
  name: '[DEMO] Alumni Meet (draft)',
  venue: 'Seminar Hall',
  startAt: new Date(now + 20 * DAY),
  endAt: new Date(now + 20 * DAY + 3 * 3600000),
  statusOverride: 'draft',
});

// Live event: 36 confirmed, some already checked in.
const present = new Set([0, 1, 3, 4, 6, 7, 9, 10, 12, 13, 15, 18, 21, 22, 27]);
for (let i = 0; i < 36; i++) {
  const s = await upsertStudent(coord._id, person(i));
  const reg = await createRegistration({ event: live, student: s, source: i % 3 === 0 ? 'public' : 'import' });
  if (present.has(i)) {
    await Attendance.create({
      eventId: live._id,
      eventRegistrationId: reg._id,
      method: i % 5 === 0 ? 'manual' : 'qr',
      markedByName: coord.name,
      checkInAt: new Date(now - (60 - i) * 60000),
    });
  }
}

// Upcoming event: capacity 5, approval required → pending + waitlist examples.
for (let i = 40; i < 48; i++) {
  const s = await upsertStudent(coord._id, person(i));
  const fresh = await Event.findById(upcoming._id);
  await createRegistration({ event: fresh, student: s, source: 'public', mode: 'public' });
}

console.log('Seeded demo data. Sign in with demo@eventqr.local / (DEMO_PASSWORD).');
await disconnectDb();

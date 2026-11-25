import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import * as XLSX from 'xlsx';

let mongod;
let app;
let M; // models
let qr; // qrToken utils
let tokenA;
let tokenB;

const HOUR = 3600000;
const api = (method, path, token) => {
  const r = request(app)[method](path);
  return token ? r.set('Authorization', `Bearer ${token}`) : r;
};

async function login(email, password) {
  const res = await api('post', '/api/auth/login').send({ email, password });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.token;
}

async function makeEvent(token, over = {}) {
  const now = Date.now();
  const res = await api('post', '/api/events', token).send({
    name: 'Test Event',
    venue: 'Hall',
    startAt: new Date(now - HOUR).toISOString(),
    endAt: new Date(now + 3 * HOUR).toISOString(),
    ...over,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.event;
}

let n = 0;
const person = (over = {}) => {
  n++;
  return { name: `Student ${n}`, email: `s${n}@example.com`, department: 'CSE', academicYear: '2nd Year', ...over };
};

async function addParticipant(token, eventId, over = {}) {
  const res = await api('post', `/api/events/${eventId}/registrations`, token).send({ ...person(over), sendEmail: false });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.registration;
}

async function tokenFor(regDbId) {
  const reg = await M.EventRegistration.findById(regDbId);
  return qr.decryptToken(reg.qrTokenCipher);
}

const open = (token, eventId, v = true) => api('put', `/api/events/${eventId}/attendance/state`, token).send({ open: v });
const scan = (token, eventId, t) => api('post', `/api/events/${eventId}/attendance/scan`, token).send({ token: t });

before(async () => {
  mongod = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URI: mongod.getUri(),
    JWT_SECRET: 'j'.repeat(48),
    QR_ENCRYPTION_KEY: 'ab'.repeat(32),
    CLIENT_ORIGIN: 'http://localhost:5173',
    ENABLE_DEMO_LOGIN: 'false',
  });
  delete process.env.SMTP_HOST;
  const { connectDb } = await import('../src/config/db.js');
  await connectDb(process.env.MONGODB_URI);
  M = await import('../src/models/index.js');
  qr = await import('../src/utils/qrToken.js');
  await Promise.all([M.Coordinator, M.Event, M.Student, M.EventRegistration, M.Attendance].map((m) => m.init()));
  const hash = await bcrypt.hash('Password@123', 4);
  await M.Coordinator.create([
    { name: 'Coord A', email: 'a@college.edu', passwordHash: hash },
    { name: 'Coord B', email: 'b@college.edu', passwordHash: hash },
  ]);
  app = (await import('../src/app.js')).createApp();
  tokenA = await login('a@college.edu', 'Password@123');
  tokenB = await login('b@college.edu', 'Password@123');
});

after(async () => {
  const mongoose = (await import('mongoose')).default;
  await mongoose.disconnect();
  await mongod.stop();
});

describe('CORS', () => {
  it('allows the production frontend and configured local origin', async () => {
    for (const origin of ['http://localhost:5173', 'https://eventwebsite-tawny.vercel.app']) {
      const res = await request(app)
        .options('/api/auth/login')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type');
      assert.equal(res.status, 204);
      assert.equal(res.headers['access-control-allow-origin'], origin);
    }
  });

  it('includes the production frontend when NODE_ENV is development', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const { clientOrigins: developmentOrigins } = await import(`../src/config/env.js?dev-cors-test=${Date.now()}`);
      assert.ok(developmentOrigins.includes('https://eventwebsite-tawny.vercel.app'));
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('uses the production frontend for public links instead of localhost', async () => {
    const previous = {
      NODE_ENV: process.env.NODE_ENV,
      CLIENT_ORIGIN: process.env.CLIENT_ORIGIN,
      PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
    };
    try {
      process.env.NODE_ENV = 'production';
      process.env.CLIENT_ORIGIN = 'http://localhost:5173';
      delete process.env.PUBLIC_APP_URL;
      const { publicAppUrl: defaultUrl } = await import(`../src/config/env.js?prod-url-default=${Date.now()}`);
      assert.equal(defaultUrl, 'https://eventwebsite-tawny.vercel.app');

      process.env.PUBLIC_APP_URL = 'http://localhost:5173';
      const { publicAppUrl: localOverrideUrl } = await import(`../src/config/env.js?prod-url-local-override=${Date.now()}`);
      assert.equal(localOverrideUrl, 'https://eventwebsite-tawny.vercel.app');
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});

describe('auth', () => {
  it('rejects wrong credentials and missing tokens', async () => {
    const bad = await api('post', '/api/auth/login').send({ email: 'a@college.edu', password: 'nope' });
    assert.equal(bad.status, 401);
    assert.equal((await api('get', '/api/dashboard')).status, 401);
  });
  it('does not register the demo login when disabled', async () => {
    assert.equal((await api('post', '/api/auth/demo-login')).status, 404);
  });
  it('changes password', async () => {
    const res = await api('put', '/api/auth/password', tokenB).send({ currentPassword: 'Password@123', newPassword: 'Password@123' });
    assert.equal(res.status, 200);
  });
});

describe('events', () => {
  it('creates, edits and computes status', async () => {
    const ev = await makeEvent(tokenA);
    assert.equal(ev.status, 'ongoing');
    assert.ok(ev.slug && ev.publicUrl.includes(ev.slug));
    const upd = await api('put', `/api/events/${ev.id}`, tokenA).send({ name: 'Renamed Event', status: 'cancelled' });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.event.status, 'cancelled');
    const back = await api('put', `/api/events/${ev.id}`, tokenA).send({ status: 'auto' });
    assert.equal(back.body.event.status, 'ongoing');
  });
  it('validates dates', async () => {
    const res = await api('post', '/api/events', tokenA).send({
      name: 'Bad dates',
      startAt: new Date().toISOString(),
      endAt: new Date(Date.now() - HOUR).toISOString(),
    });
    assert.equal(res.status, 400);
  });
  it('hides events from other coordinators (404, same as missing)', async () => {
    const ev = await makeEvent(tokenA);
    assert.equal((await api('get', `/api/events/${ev.id}`, tokenB)).status, 404);
    assert.equal((await api('delete', `/api/events/${ev.id}`, tokenB)).status, 404);
    assert.equal((await api('get', `/api/events/${ev.id}/registrations`, tokenB)).status, 404);
  });
  it('delete cascades registrations and attendance', async () => {
    const ev = await makeEvent(tokenA);
    const r = await addParticipant(tokenA, ev.id);
    await open(tokenA, ev.id);
    assert.equal((await scan(tokenA, ev.id, await tokenFor(r.id))).status, 201);
    assert.equal((await api('delete', `/api/events/${ev.id}`, tokenA)).status, 200);
    assert.equal(await M.EventRegistration.countDocuments({ eventId: ev.id }), 0);
    assert.equal(await M.Attendance.countDocuments({ eventId: ev.id }), 0);
  });
});

describe('import', () => {
  it('previews duplicates/invalid/existing and commits valid rows once', async () => {
    const ev = await makeEvent(tokenA);
    await addParticipant(tokenA, ev.id, { email: 'already@example.com' });
    const rows = [
      { name: 'Good One', email: 'good1@example.com', department: 'ECE' },
      { name: 'Good One Again', email: 'GOOD1@example.com' },
      { name: 'No Email', email: 'not-an-email' },
      { name: 'Existing', email: 'already@example.com' },
      { name: 'Good Two', email: 'good2@example.com' },
    ];
    const prev = await api('post', `/api/events/${ev.id}/import`, tokenA).send({ rows, commit: false });
    assert.equal(prev.status, 200);
    assert.deepEqual(
      { v: prev.body.summary.valid, i: prev.body.summary.invalid, d: prev.body.summary.duplicate, e: prev.body.summary.exists },
      { v: 2, i: 1, d: 1, e: 1 },
    );
    const done = await api('post', `/api/events/${ev.id}/import`, tokenA).send({ rows, commit: true });
    assert.equal(done.body.summary.created, 2);
    const again = await api('post', `/api/events/${ev.id}/import`, tokenA).send({ rows, commit: true });
    assert.equal(again.body.summary.created, 0);
    const list = await api('get', `/api/events/${ev.id}/registrations`, tokenA);
    assert.equal(list.body.total, 3);
  });
  it('prevents duplicate manual registration', async () => {
    const ev = await makeEvent(tokenA);
    const p = person();
    assert.equal((await api('post', `/api/events/${ev.id}/registrations`, tokenA).send(p)).status, 201);
    const dup = await api('post', `/api/events/${ev.id}/registrations`, tokenA).send(p);
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'ALREADY_REGISTERED');
  });
});

describe('QR tokens', () => {
  it('are unique, carry no personal data, and PNGs render', async () => {
    const ev = await makeEvent(tokenA);
    const a = await addParticipant(tokenA, ev.id);
    const b = await addParticipant(tokenA, ev.id);
    const ta = await tokenFor(a.id);
    const tb = await tokenFor(b.id);
    assert.notEqual(ta, tb);
    assert.match(ta, /^EVENTQR1:[A-Za-z0-9_-]{43}$/);
    assert.ok(!ta.includes(a.name) && !ta.includes(ev.id));
    const raw = await M.EventRegistration.findById(a.id).lean();
    assert.equal(raw.qrTokenHash, qr.hashToken(ta));
    assert.ok(!JSON.stringify(raw).includes(ta));
    const png = await api('get', `/api/events/${ev.id}/registrations/${a.id}/qr`, tokenA);
    assert.equal(png.headers['content-type'], 'image/png');
  });
  it('regeneration kills the old code instantly', async () => {
    const ev = await makeEvent(tokenA);
    const r = await addParticipant(tokenA, ev.id);
    await open(tokenA, ev.id);
    const old = await tokenFor(r.id);
    await api('post', `/api/events/${ev.id}/registrations/${r.id}/qr/regenerate`, tokenA).send({});
    assert.equal((await scan(tokenA, ev.id, old)).body.error.code, 'INVALID_QR');
    assert.equal((await scan(tokenA, ev.id, await tokenFor(r.id))).status, 201);
  });
  it('zip lists only active confirmed codes', async () => {
    const ev = await makeEvent(tokenA);
    await addParticipant(tokenA, ev.id);
    const res = await api('get', `/api/events/${ev.id}/qr-codes.zip`, tokenA).buffer().parse((r, cb) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.subarray(0, 2).toString(), 'PK');
  });
});

describe('scanning', () => {
  it('success, then duplicate', async () => {
    const ev = await makeEvent(tokenA);
    const r = await addParticipant(tokenA, ev.id);
    await open(tokenA, ev.id);
    const t = await tokenFor(r.id);
    const ok = await scan(tokenA, ev.id, t);
    assert.equal(ok.status, 201);
    assert.equal(ok.body.registration.name, r.name);
    const dup = await scan(tokenA, ev.id, t);
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'ALREADY_PRESENT');
  });
  it('8 simultaneous scans produce exactly one record', async () => {
    const ev = await makeEvent(tokenA);
    const r = await addParticipant(tokenA, ev.id);
    await open(tokenA, ev.id);
    const t = await tokenFor(r.id);
    const results = await Promise.all(Array.from({ length: 8 }, () => scan(tokenA, ev.id, t)));
    assert.equal(results.filter((x) => x.status === 201).length, 1);
    assert.equal(results.filter((x) => x.status === 409).length, 7);
    assert.equal(await M.Attendance.countDocuments({ eventRegistrationId: r.id }), 1);
  });
  it('rejects invalid, tampered, wrong-event, revoked, unconfirmed and closed', async () => {
    const ev = await makeEvent(tokenA);
    const other = await makeEvent(tokenA);
    const r = await addParticipant(tokenA, ev.id);
    const t = await tokenFor(r.id);
    await open(tokenA, ev.id);

    assert.equal((await scan(tokenA, ev.id, 'hello')).body.error.code, 'INVALID_QR');
    const tampered = t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A');
    assert.equal((await scan(tokenA, ev.id, tampered)).body.error.code, 'INVALID_QR');
    assert.equal((await scan(tokenA, other.id, t)).body.error.code, 'WRONG_EVENT');

    await api('post', `/api/events/${ev.id}/registrations/${r.id}/qr/revoke`, tokenA);
    const rev = await scan(tokenA, ev.id, t);
    assert.equal(rev.status, 403);
    assert.equal(rev.body.error.code, 'QR_REVOKED');
    await api('post', `/api/events/${ev.id}/registrations/${r.id}/qr/regenerate`, tokenA).send({});

    await api('patch', `/api/events/${ev.id}/registrations/${r.id}/status`, tokenA).send({ status: 'pending' });
    assert.equal((await scan(tokenA, ev.id, await tokenFor(r.id))).body.error.code, 'NOT_CONFIRMED');
    await api('patch', `/api/events/${ev.id}/registrations/${r.id}/status`, tokenA).send({ status: 'registered' });

    await open(tokenA, ev.id, false);
    const closed = await scan(tokenA, ev.id, await tokenFor(r.id));
    assert.equal(closed.status, 403);
    assert.equal(closed.body.error.code, 'ATTENDANCE_CLOSED');
  });
});

describe('manual attendance, corrections and audit', () => {
  it('marks manually, corrects with a reason and logs it', async () => {
    const ev = await makeEvent(tokenA);
    const r = await addParticipant(tokenA, ev.id);
    const m = await api('post', `/api/events/${ev.id}/attendance/manual`, tokenA).send({ registrationDbId: r.id, reason: 'Phone died' });
    assert.equal(m.status, 201);
    assert.equal((await api('post', `/api/events/${ev.id}/attendance/manual`, tokenA).send({ registrationDbId: r.id })).status, 409);

    const att = await M.Attendance.findOne({ eventRegistrationId: r.id });
    const noReason = await api('patch', `/api/events/${ev.id}/attendance/${att._id}`, tokenA).send({ status: 'absent' });
    assert.equal(noReason.status, 400);
    const fixed = await api('patch', `/api/events/${ev.id}/attendance/${att._id}`, tokenA).send({ status: 'absent', reason: 'Marked by mistake' });
    assert.equal(fixed.status, 200);

    const summary = await api('get', `/api/events/${ev.id}/attendance/summary`, tokenA);
    assert.equal(summary.body.present, 0);
    const audit = await api('get', `/api/events/${ev.id}/audit`, tokenA);
    assert.ok(audit.body.items.some((a) => a.action === 'attendance.correct'));
    assert.ok(audit.body.items.some((a) => a.action === 'attendance.manual'));
  });
});

describe('reports', () => {
  it('counts match the attendance table; csv and 5-sheet xlsx export', async () => {
    const ev = await makeEvent(tokenA);
    const regs = [];
    for (let i = 0; i < 5; i++) regs.push(await addParticipant(tokenA, ev.id, { department: i < 3 ? 'CSE' : 'ECE' }));
    await open(tokenA, ev.id);
    await scan(tokenA, ev.id, await tokenFor(regs[0].id));
    await scan(tokenA, ev.id, await tokenFor(regs[3].id));

    const sum = (await api('get', `/api/events/${ev.id}/reports/summary`, tokenA)).body.summary;
    const table = (await api('get', `/api/events/${ev.id}/attendance?attendance=present`, tokenA)).body;
    assert.equal(sum.registered, 5);
    assert.equal(sum.present, 2);
    assert.equal(sum.present, table.total);
    assert.equal(sum.absent, 3);
    assert.equal(sum.departments.find((d) => d.department === 'CSE').present, 1);

    const csv = await api('get', `/api/events/${ev.id}/reports/export?format=csv&type=present`, tokenA);
    assert.equal(csv.status, 200);
    assert.equal(csv.text.trim().split('\n').length, 3); // header + 2 present

    const x = await api('get', `/api/events/${ev.id}/reports/export?format=xlsx`, tokenA)
      .buffer()
      .parse((r, cb) => {
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    const wb = XLSX.read(x.body, { type: 'buffer' });
    assert.deepEqual(wb.SheetNames, ['Summary', 'Participants', 'Present', 'Absent', 'Departments']);
  });
  it('neutralises formula injection in exports', async () => {
    const ev = await makeEvent(tokenA);
    await addParticipant(tokenA, ev.id, { name: '=HYPERLINK("http://evil")' });
    const csv = await api('get', `/api/events/${ev.id}/reports/export?format=csv&type=participants`, tokenA);
    assert.ok(csv.text.includes(`"'=HYPERLINK`));
  });
});

describe('public registration', () => {
  const body = (over = {}) => ({ ...person(), answers: {}, ...over });
  const reg = (slug, over) => api('post', `/api/public/events/${slug}/register`).send(body(over));

  it('shows event info without private data and registers a student', async () => {
    const ev = await makeEvent(tokenA, { startAt: new Date(Date.now() + 5 * HOUR).toISOString(), endAt: new Date(Date.now() + 8 * HOUR).toISOString() });
    const info = await api('get', `/api/public/events/${ev.slug}`);
    assert.equal(info.status, 200);
    assert.ok(!JSON.stringify(info.body).includes(ev.coordinatorId));
    assert.equal(info.body.event.registration.open, true);

    const res = await reg(ev.slug);
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'registered');
    assert.ok(res.body.ticketCode && /^EQ-/.test(res.body.registrationId));

    const ticket = await api('get', `/api/public/tickets/${res.body.ticketCode}`);
    assert.equal(ticket.body.ticket.status, 'registered');
    assert.match(ticket.body.ticket.qrDataUrl, /^data:image\/png;base64,/);
    const ics = await api('get', `/api/public/tickets/${res.body.ticketCode}/calendar.ics`);
    assert.match(ics.text, /BEGIN:VCALENDAR/);
  });

  it('blocks duplicates, bad input and drafts', async () => {
    const ev = await makeEvent(tokenA);
    const p = person();
    assert.equal((await reg(ev.slug, p)).status, 201);
    const dup = await reg(ev.slug, p);
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'ALREADY_REGISTERED');
    assert.equal((await reg(ev.slug, { email: 'bad' })).status, 400);
    const draft = await makeEvent(tokenA, { status: 'draft' });
    assert.equal((await api('get', `/api/public/events/${draft.slug}`)).status, 404);
  });

  it('honeypot stores nothing', async () => {
    const ev = await makeEvent(tokenA);
    const res = await reg(ev.slug, { website: 'http://spam' });
    assert.equal(res.status, 201);
    assert.equal(await M.EventRegistration.countDocuments({ eventId: ev.id }), 0);
  });

  it('enforces the deadline and the open/closed switch', async () => {
    const ev = await makeEvent(tokenA, { registrationDeadline: new Date(Date.now() - 1000).toISOString() });
    const late = await reg(ev.slug);
    assert.equal(late.status, 403);
    assert.equal(late.body.error.code, 'REGISTRATION_CLOSED');
    const ev2 = await makeEvent(tokenA, { registration: { open: false } });
    assert.equal((await reg(ev2.slug)).status, 403);
  });

  it('validates custom fields', async () => {
    const ev = await makeEvent(tokenA, {
      registration: {
        fields: [
          { key: 'size', label: 'T-shirt', type: 'select', required: true, options: ['S', 'M'] },
          { key: 'terms', label: 'Accept rules', type: 'checkbox', required: true },
        ],
      },
    });
    assert.equal((await reg(ev.slug, { answers: {} })).status, 400);
    assert.equal((await reg(ev.slug, { answers: { size: 'XXL', terms: 'true' } })).status, 400);
    assert.equal((await reg(ev.slug, { answers: { size: 'M', terms: 'false' } })).status, 400);
    const ok = await reg(ev.slug, { answers: { size: 'M', terms: 'true' } });
    assert.equal(ok.status, 201);
    const list = await api('get', `/api/events/${ev.id}/registrations`, tokenA);
    assert.equal(list.body.items[0].answers.size, 'M');
  });

  it('applies capacity → waitlist, and cancelling promotes the next person', async () => {
    const ev = await makeEvent(tokenA, { registration: { capacity: 2, waitlist: true } });
    const r1 = await reg(ev.slug);
    const r2 = await reg(ev.slug);
    const r3 = await reg(ev.slug);
    assert.deepEqual([r1.body.status, r2.body.status, r3.body.status], ['registered', 'registered', 'waitlisted']);
    assert.equal((await api('get', `/api/public/events/${ev.slug}`)).body.event.registration.seatsLeft, 0);

    // 3rd person can't scan in while waitlisted
    await open(tokenA, ev.id);
    const wl = await M.EventRegistration.findOne({ registrationId: r3.body.registrationId });
    assert.equal((await scan(tokenA, ev.id, qr.decryptToken(wl.qrTokenCipher))).body.error.code, 'NOT_CONFIRMED');

    const cancel = await api('post', `/api/public/tickets/${r1.body.ticketCode}/cancel`);
    assert.equal(cancel.status, 200);
    const promoted = await M.EventRegistration.findOne({ registrationId: r3.body.registrationId });
    assert.equal(promoted.status, 'registered');
    const fresh = await M.Event.findById(ev.id);
    assert.equal(fresh.seatsTaken, 2);
  });

  it('capacity is never exceeded under concurrent sign-ups', async () => {
    const ev = await makeEvent(tokenA, { registration: { capacity: 3, waitlist: false } });
    const results = await Promise.all(Array.from({ length: 10 }, () => reg(ev.slug)));
    assert.equal(results.filter((r) => r.status === 201).length, 3);
    assert.equal(results.filter((r) => r.body?.error?.code === 'EVENT_FULL' || r.body?.error?.code === 'REGISTRATION_CLOSED').length, 7);
    assert.equal(await M.EventRegistration.countDocuments({ eventId: ev.id }), 3);
  });

  it('raising capacity promotes the waitlist', async () => {
    const ev = await makeEvent(tokenA, { registration: { capacity: 1, waitlist: true } });
    await reg(ev.slug);
    const w = await reg(ev.slug);
    assert.equal(w.body.status, 'waitlisted');
    await api('put', `/api/events/${ev.id}`, tokenA).send({ registration: { capacity: 2 } });
    assert.equal((await M.EventRegistration.findOne({ registrationId: w.body.registrationId })).status, 'registered');
  });

  it('approval flow: pending → approve / reject, seats respected', async () => {
    const ev = await makeEvent(tokenA, { registration: { capacity: 1, waitlist: true, requireApproval: true } });
    const a = await reg(ev.slug);
    const b = await reg(ev.slug);
    assert.equal(a.body.status, 'pending');
    assert.equal(b.body.status, 'waitlisted');
    const ra = await M.EventRegistration.findOne({ registrationId: a.body.registrationId });
    const rb = await M.EventRegistration.findOne({ registrationId: b.body.registrationId });

    // Waitlisted → registered is blocked while full…
    const blocked = await api('patch', `/api/events/${ev.id}/registrations/${rb._id}/status`, tokenA).send({ status: 'registered' });
    assert.equal(blocked.status, 409);
    // …unless the coordinator overrides.
    const forced = await api('patch', `/api/events/${ev.id}/registrations/${rb._id}/status`, tokenA).send({ status: 'registered', force: true });
    assert.equal(forced.status, 200);

    const approve = await api('patch', `/api/events/${ev.id}/registrations/${ra._id}/status`, tokenA).send({ status: 'registered' });
    assert.equal(approve.body.registration.status, 'registered');
    const rej = await api('patch', `/api/events/${ev.id}/registrations/${rb._id}/status`, tokenA).send({ status: 'rejected' });
    assert.equal(rej.body.registration.status, 'rejected');
    const e = await M.Event.findById(ev.id);
    assert.equal(e.seatsTaken, 1);
  });

  it('resend never reveals whether an email is registered', async () => {
    const ev = await makeEvent(tokenA);
    const known = await api('post', `/api/public/events/${ev.slug}/resend`).send({ email: 'someone@example.com' });
    const p = person();
    await reg(ev.slug, p);
    const real = await api('post', `/api/public/events/${ev.slug}/resend`).send({ email: p.email });
    assert.deepEqual(known.body, real.body);
  });

  it('ticket pages are unguessable and cancel refuses after check-in', async () => {
    const ev = await makeEvent(tokenA);
    assert.equal((await api('get', '/api/public/tickets/not-a-real-code')).status, 404);
    const r = await reg(ev.slug);
    await open(tokenA, ev.id);
    const row = await M.EventRegistration.findOne({ registrationId: r.body.registrationId });
    await scan(tokenA, ev.id, qr.decryptToken(row.qrTokenCipher));
    const cancel = await api('post', `/api/public/tickets/${r.body.ticketCode}/cancel`);
    assert.equal(cancel.status, 409);
    const t = await api('get', `/api/public/tickets/${r.body.ticketCode}`);
    assert.ok(t.body.ticket.checkedInAt);
  });
});

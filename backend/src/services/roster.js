import { Attendance, EventRegistration, Student } from '../models/index.js';
import { escapeRegex } from '../utils/helpers.js';

const SORTS = {
  name: 's.name',
  department: 's.department',
  academicYear: 's.academicYear',
  registeredAt: 'createdAt',
  registrationId: 'registrationId',
  checkInAt: 'a.checkInAt',
  status: 'status',
};

function basePipeline(eventId, { search, department, academicYear, status, attendance, ids } = {}) {
  const match = { eventId };
  if (status) match.status = Array.isArray(status) ? { $in: status } : status;
  if (ids) match._id = { $in: ids };

  const p = [
    { $match: match },
    { $lookup: { from: Student.collection.name, localField: 'studentId', foreignField: '_id', as: 's' } },
    { $unwind: '$s' },
    { $lookup: { from: Attendance.collection.name, localField: '_id', foreignField: 'eventRegistrationId', as: 'a' } },
    { $addFields: { a: { $first: '$a' } } },
    { $addFields: { attendanceStatus: { $cond: [{ $eq: ['$a.status', 'present'] }, 'present', 'absent'] } } },
  ];

  const and = [];
  if (department) and.push({ 's.department': String(department) });
  if (academicYear) and.push({ 's.academicYear': String(academicYear) });
  if (attendance === 'present' || attendance === 'absent') and.push({ attendanceStatus: attendance });
  if (search) {
    const rx = new RegExp(escapeRegex(String(search).trim().slice(0, 100)), 'i');
    and.push({ $or: [{ 's.name': rx }, { 's.email': rx }, { 's.rollNo': rx }, { 's.phone': rx }, { registrationId: rx }] });
  }
  if (and.length) p.push({ $match: { $and: and } });
  return p;
}

const PROJECT = {
  $project: {
    _id: 0,
    id: '$_id',
    studentId: '$s._id',
    registrationId: 1,
    status: 1,
    source: 1,
    qrRevoked: 1,
    emailStatus: 1,
    registeredAt: '$createdAt',
    answers: 1,
    name: '$s.name',
    email: '$s.email',
    phone: '$s.phone',
    department: '$s.department',
    academicYear: '$s.academicYear',
    rollNo: '$s.rollNo',
    attendanceStatus: 1,
    attendanceId: '$a._id',
    checkInAt: '$a.checkInAt',
    method: '$a.method',
    markedBy: '$a.markedByName',
    reason: '$a.reason',
  },
};

/** The single query behind the participants table, attendance table, reports and exports. */
export async function getRoster(eventId, opts = {}) {
  const { sort = 'name', dir = 'asc', page = 1, limit = 25, all = false } = opts;
  const base = basePipeline(eventId, opts);
  const key = SORTS[sort] || SORTS.name;
  const sortStage = { $sort: { [key]: dir === 'desc' ? -1 : 1, _id: 1 } };
  const collation = { locale: 'en', strength: 2 };

  const [countRes] = await EventRegistration.aggregate([...base, { $count: 'n' }]);
  const total = countRes?.n || 0;

  const pipeline = [...base, sortStage];
  if (!all) pipeline.push({ $skip: (page - 1) * limit }, { $limit: limit });
  pipeline.push(PROJECT);
  const items = await EventRegistration.aggregate(pipeline).collation(collation);
  return { items, total, page, pages: all ? 1 : Math.max(1, Math.ceil(total / limit)) };
}

export async function getRosterRow(eventId, registrationDbId) {
  const { items } = await getRoster(eventId, { ids: [registrationDbId], all: true });
  return items[0] || null;
}

/** Confirmed participants grouped by department and attendance. */
export async function departmentStats(eventId, filters = {}) {
  const rows = await EventRegistration.aggregate([
    ...basePipeline(eventId, { ...filters, status: 'registered' }),
    { $group: { _id: { d: '$s.department', a: '$attendanceStatus' }, n: { $sum: 1 } } },
  ]);
  const map = new Map();
  for (const r of rows) {
    const dept = r._id.d || 'Unspecified';
    const cur = map.get(dept) || { department: dept, registered: 0, present: 0, absent: 0 };
    cur.registered += r.n;
    cur[r._id.a] += r.n;
    map.set(dept, cur);
  }
  return [...map.values()]
    .map((d) => ({ ...d, rate: d.registered ? Math.round((d.present / d.registered) * 1000) / 10 : 0 }))
    .sort((a, b) => b.registered - a.registered || a.department.localeCompare(b.department));
}

export async function distinctMeta(eventId) {
  const rows = await EventRegistration.aggregate([
    { $match: { eventId } },
    { $lookup: { from: Student.collection.name, localField: 'studentId', foreignField: '_id', as: 's' } },
    { $unwind: '$s' },
    { $group: { _id: null, departments: { $addToSet: '$s.department' }, years: { $addToSet: '$s.academicYear' } } },
  ]);
  const clean = (a) => (a || []).filter(Boolean).sort((x, y) => String(x).localeCompare(String(y), 'en', { numeric: true }));
  return { departments: clean(rows[0]?.departments), academicYears: clean(rows[0]?.years) };
}

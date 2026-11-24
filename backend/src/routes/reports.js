import { Router } from 'express';
import { Parser } from 'json2csv';
import * as XLSX from 'xlsx';
import { env } from '../config/env.js';
import { Attendance, EventRegistration } from '../models/index.js';
import { departmentStats, getRoster } from '../services/roster.js';
import { audit } from '../utils/audit.js';
import { AppError, safeCell, safeFilename } from '../utils/helpers.js';

const router = Router();

const filtersOf = (q) => ({ department: q.department || undefined, academicYear: q.academicYear || undefined });

async function summaryOf(event, filters) {
  const departments = await departmentStats(event._id, filters);
  const registered = departments.reduce((n, d) => n + d.registered, 0);
  const present = departments.reduce((n, d) => n + d.present, 0);
  const byStatusRows = await EventRegistration.aggregate([
    { $match: { eventId: event._id } },
    { $group: { _id: '$status', n: { $sum: 1 } } },
  ]);
  const byStatus = Object.fromEntries(byStatusRows.map((r) => [r._id, r.n]));
  const timelineRows = await Attendance.aggregate([
    { $match: { eventId: event._id, status: 'present' } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%dT%H:00', date: '$checkInAt', timezone: env.EVENT_TIMEZONE } },
        n: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return {
    registered,
    present,
    absent: registered - present,
    rate: registered ? Math.round((present / registered) * 1000) / 10 : 0,
    byStatus: { registered: 0, pending: 0, waitlisted: 0, rejected: 0, cancelled: 0, ...byStatus },
    departments,
    timeline: timelineRows.map((r) => ({ hour: r._id, count: r.n })),
  };
}

router.get('/summary', async (req, res) => {
  res.json({ summary: await summaryOf(req.event, filtersOf(req.query)) });
});

const fmt = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { timeZone: env.EVENT_TIMEZONE, dateStyle: 'medium', timeStyle: 'short' }) : '';

function toRows(items, fieldKeys) {
  return items.map((r) => {
    const row = {
      'Registration ID': r.registrationId,
      Name: r.name,
      Email: r.email,
      Phone: r.phone,
      Department: r.department,
      Year: r.academicYear,
      'Roll no.': r.rollNo,
      Status: r.status,
      Attendance: r.status === 'registered' ? r.attendanceStatus : '',
      'Check-in': fmt(r.checkInAt),
      Method: r.method || '',
      'Marked by': r.markedBy || '',
      Registered: fmt(r.registeredAt),
    };
    for (const k of fieldKeys) row[k.label] = r.answers?.[k.key] ?? '';
    for (const key of Object.keys(row)) row[key] = safeCell(row[key]);
    return row;
  });
}

router.get('/export', async (req, res) => {
  const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
  const type = ['participants', 'attendance', 'present', 'absent'].includes(req.query.type) ? req.query.type : 'participants';
  const f = { ...filtersOf(req.query), search: req.query.search || undefined };
  const fields = req.event.registration?.fields || [];
  const base = safeFilename(req.event.name);

  const load = (extra) => getRoster(req.event._id, { ...f, ...extra, all: true, sort: 'name' }).then((r) => r.items);

  if (format === 'csv') {
    const items =
      type === 'participants'
        ? await load({})
        : await load({ status: 'registered', attendance: type === 'present' ? 'present' : type === 'absent' ? 'absent' : undefined });
    const rows = toRows(items, fields);
    if (!rows.length) throw new AppError(404, 'NO_DATA', 'Nothing to export for those filters.');
    const csv = new Parser({ fields: Object.keys(rows[0]) }).parse(rows);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${base}-${type}.csv"`);
    await audit(req, req.event, 'report.export', `csv ${type}`);
    return res.send(`﻿${csv}`); // BOM so Excel opens UTF-8 names correctly
  }

  // xlsx: a 5-sheet workbook
  const [all, present, absent] = await Promise.all([
    load({}),
    load({ status: 'registered', attendance: 'present' }),
    load({ status: 'registered', attendance: 'absent' }),
  ]);
  const summary = await summaryOf(req.event, filtersOf(req.query));
  const wb = XLSX.utils.book_new();
  const add = (name, rows) => {
    const ws = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([['No rows']]);
    if (rows.length) ws['!cols'] = Object.keys(rows[0]).map((k) => ({ wch: Math.max(k.length + 2, 16) }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  add('Summary', [
    { Metric: 'Event', Value: safeCell(req.event.name) },
    { Metric: 'Confirmed participants', Value: summary.registered },
    { Metric: 'Present', Value: summary.present },
    { Metric: 'Absent', Value: summary.absent },
    { Metric: 'Attendance rate (%)', Value: summary.rate },
    { Metric: 'Pending approval', Value: summary.byStatus.pending },
    { Metric: 'Waitlisted', Value: summary.byStatus.waitlisted },
    { Metric: 'Rejected', Value: summary.byStatus.rejected },
    { Metric: 'Cancelled', Value: summary.byStatus.cancelled },
  ]);
  add('Participants', toRows(all, fields));
  add('Present', toRows(present, fields));
  add('Absent', toRows(absent, fields));
  add(
    'Departments',
    summary.departments.map((d) => ({
      Department: safeCell(d.department),
      Registered: d.registered,
      Present: d.present,
      Absent: d.absent,
      'Rate (%)': d.rate,
    })),
  );
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="${base}-report.xlsx"`);
  await audit(req, req.event, 'report.export', 'xlsx');
  res.send(buf);
});

export default router;

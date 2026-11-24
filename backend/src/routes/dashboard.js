import { Router } from 'express';
import { Attendance, Event, EventRegistration } from '../models/index.js';
import { computeStatus } from '../utils/helpers.js';
import { countsFor, serializeEvent } from '../services/eventView.js';

const router = Router();

router.get('/', async (req, res) => {
  const scope = req.user.role === 'admin' ? {} : { coordinatorId: req.user._id };
  const now = new Date();
  const events = await Event.find(scope).sort({ startAt: -1 });
  const ids = events.map((e) => e._id);
  const counts = await countsFor(ids);

  let registrations = 0;
  let checkIns = 0;
  let pendingApprovals = 0;
  let waitlisted = 0;
  for (const c of counts.values()) {
    registrations += c.registered;
    checkIns += c.present;
    pendingApprovals += c.pending;
    waitlisted += c.waitlisted;
  }

  const live = events.filter((e) => !['draft', 'cancelled'].includes(computeStatus(e, now)));
  const upcoming = live
    .filter((e) => e.endAt >= now)
    .sort((a, b) => a.startAt - b.startAt)
    .slice(0, 5)
    .map((e) => serializeEvent(e, counts.get(String(e._id))));
  const recent = events.slice(0, 5).map((e) => serializeEvent(e, counts.get(String(e._id))));

  const eventNames = new Map(events.map((e) => [String(e._id), e.name]));
  const latest = ids.length
    ? await Attendance.find({ eventId: { $in: ids }, status: 'present' }).sort({ checkInAt: -1 }).limit(10).lean()
    : [];
  const regs = await EventRegistration.find({ _id: { $in: latest.map((a) => a.eventRegistrationId) } })
    .populate('studentId', 'name department')
    .lean();
  const byId = new Map(regs.map((r) => [String(r._id), r]));
  const recentCheckIns = latest.map((a) => {
    const r = byId.get(String(a.eventRegistrationId));
    return {
      id: a._id,
      name: r?.studentId?.name || 'Unknown',
      department: r?.studentId?.department || '',
      registrationId: r?.registrationId || '',
      eventId: a.eventId,
      eventName: eventNames.get(String(a.eventId)) || '',
      checkInAt: a.checkInAt,
      method: a.method,
    };
  });

  res.json({
    totals: {
      events: events.length,
      upcoming: live.filter((e) => e.startAt > now).length,
      registrations,
      checkIns,
      attendanceRate: registrations ? Math.round((checkIns / registrations) * 1000) / 10 : 0,
      pendingApprovals,
      waitlisted,
    },
    upcoming,
    recent,
    recentCheckIns,
  });
});

export default router;

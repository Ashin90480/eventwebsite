import { AuditLog } from '../models/index.js';

export async function audit(req, event, action, detail = '', meta) {
  try {
    await AuditLog.create({
      eventId: event._id,
      actorId: req?.user?._id || null,
      actorName: req?.user?.name || 'Participant',
      action,
      detail,
      meta,
    });
  } catch (err) {
    console.error('Audit write failed:', err.message);
  }
}

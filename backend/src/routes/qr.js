import archiver from 'archiver';
import { Router } from 'express';
import QRCode from 'qrcode';
import { EventRegistration, Student } from '../models/index.js';
import { AppError, pageParams, safeFilename } from '../utils/helpers.js';
import { decryptToken } from '../utils/qrToken.js';

export const qrRouter = Router();

/** Paged QR payloads for the grid / printable cards. Only confirmed participants. */
qrRouter.get('/qr-codes', async (req, res) => {
  const { page, limit, skip } = pageParams(req.query, { max: 60, def: 24 });
  const q = { eventId: req.event._id, status: 'registered' };
  const total = await EventRegistration.countDocuments(q);
  const regs = await EventRegistration.find(q).sort({ createdAt: 1 }).skip(skip).limit(limit).lean();
  const students = await Student.find({ _id: { $in: regs.map((r) => r.studentId) } }).lean();
  const byId = new Map(students.map((s) => [String(s._id), s]));

  const items = await Promise.all(
    regs.map(async (r) => {
      const s = byId.get(String(r.studentId)) || {};
      return {
        id: r._id,
        registrationId: r.registrationId,
        name: s.name || '',
        department: s.department || '',
        academicYear: s.academicYear || '',
        qrRevoked: r.qrRevoked,
        dataUrl: r.qrRevoked
          ? null
          : await QRCode.toDataURL(decryptToken(r.qrTokenCipher), { width: 280, margin: 1, errorCorrectionLevel: 'M' }),
      };
    }),
  );
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

/** ZIP of plain QR PNGs for every active, confirmed participant. */
qrRouter.get('/qr-codes.zip', async (req, res) => {
  const regs = await EventRegistration.find({ eventId: req.event._id, status: 'registered', qrRevoked: false })
    .sort({ createdAt: 1 })
    .lean();
  if (!regs.length) throw new AppError(404, 'NO_QR_CODES', 'There are no active QR codes to download.');
  const students = await Student.find({ _id: { $in: regs.map((r) => r.studentId) } }).lean();
  const byId = new Map(students.map((s) => [String(s._id), s]));

  res.set('Content-Type', 'application/zip');
  res.set('Content-Disposition', `attachment; filename="${safeFilename(req.event.name)}-qr-codes.zip"`);
  const zip = archiver('zip', { zlib: { level: 6 } });
  zip.on('error', (err) => {
    console.error(err);
    res.destroy(err);
  });
  zip.pipe(res);
  for (const r of regs) {
    const s = byId.get(String(r.studentId));
    const png = await QRCode.toBuffer(decryptToken(r.qrTokenCipher), { width: 480, margin: 2, errorCorrectionLevel: 'M' });
    zip.append(png, { name: `${r.registrationId}-${safeFilename(s?.name || 'participant')}.png` });
  }
  await zip.finalize();
});

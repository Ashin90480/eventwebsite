import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import { env, mailConfigured, publicAppUrl } from '../config/env.js';
import { Event, EventRegistration, Student } from '../models/index.js';
import { decryptToken } from '../utils/qrToken.js';

let transport;
function getTransport() {
  if (transport) return transport;
  transport = mailConfigured
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT || 587,
        secure: env.SMTP_SECURE,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      })
    : nodemailer.createTransport({ jsonTransport: true });
  return transport;
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const when = (d) =>
  new Date(d).toLocaleString('en-IN', {
    timeZone: env.EVENT_TIMEZONE,
    dateStyle: 'full',
    timeStyle: 'short',
  });

/**
 * E-mails the participant their personal QR ticket. Never throws: the outcome is
 * recorded on the registration (emailStatus) so coordinators can see and resend.
 */
export async function deliverTicket(registrationDbId) {
  try {
    const reg = await EventRegistration.findById(registrationDbId);
    if (!reg || reg.status !== 'registered' || reg.qrRevoked) return 'skipped';
    const [event, student] = await Promise.all([Event.findById(reg.eventId), Student.findById(reg.studentId)]);
    if (!event || !student) return 'skipped';

    const png = await QRCode.toBuffer(decryptToken(reg.qrTokenCipher), { width: 480, margin: 2, errorCorrectionLevel: 'M' });
    const ticketUrl = `${publicAppUrl}/ticket/${reg.ticketCode}`;
    const note = event.registration?.confirmationMessage;

    const text = [
      `Hi ${student.name},`,
      '',
      `You're registered for ${event.name}.`,
      `When: ${when(event.startAt)}`,
      event.venue ? `Where: ${event.venue}` : '',
      `Registration ID: ${reg.registrationId}`,
      note ? `\n${note}` : '',
      '',
      `Show the attached QR code at the entrance. You can also open your ticket any time: ${ticketUrl}`,
    ]
      .filter((l) => l !== '')
      .join('\n');

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;color:#14202B">
  <h2 style="margin:0 0 4px">You're in, ${esc(student.name)}!</h2>
  <p style="margin:0 0 16px;color:#52606D">${esc(event.name)}</p>
  <table style="width:100%;font-size:14px;margin-bottom:16px">
    <tr><td style="color:#52606D;padding:4px 0">When</td><td>${esc(when(event.startAt))}</td></tr>
    ${event.venue ? `<tr><td style="color:#52606D;padding:4px 0">Where</td><td>${esc(event.venue)}</td></tr>` : ''}
    <tr><td style="color:#52606D;padding:4px 0">Registration ID</td><td><b>${esc(reg.registrationId)}</b></td></tr>
  </table>
  ${note ? `<p style="font-size:14px">${esc(note)}</p>` : ''}
  <div style="text-align:center;padding:16px;border:1px solid #E4E7EB;border-radius:12px">
    <img src="cid:ticketqr" width="240" height="240" alt="Your entry QR code" />
    <p style="font-size:12px;color:#52606D;margin:8px 0 0">Show this at the entrance</p>
  </div>
  <p style="text-align:center;margin-top:16px"><a href="${esc(ticketUrl)}" style="background:#0E6B5C;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open my ticket</a></p>
</div>`;

    await getTransport().sendMail({
      from: env.MAIL_FROM || 'EventQR <no-reply@eventqr.local>',
      to: student.email,
      subject: `Your ticket for ${event.name}`,
      text,
      html,
      attachments: [{ filename: `${reg.registrationId}.png`, content: png, cid: 'ticketqr' }],
    });

    const status = mailConfigured ? 'sent' : 'skipped';
    await EventRegistration.updateOne(
      { _id: reg._id },
      { $set: { emailStatus: status, emailSentAt: mailConfigured ? new Date() : null, emailError: '' } },
    );
    return status;
  } catch (err) {
    console.error('Ticket e-mail failed:', err.message);
    await EventRegistration.updateOne(
      { _id: registrationDbId },
      { $set: { emailStatus: 'failed', emailError: String(err.message).slice(0, 200) } },
    ).catch(() => {});
    return 'failed';
  }
}

/** Fire-and-forget wrapper so a slow SMTP server never blocks a registration. */
export function queueTicket(registrationDbId) {
  setImmediate(() => {
    deliverTicket(registrationDbId).catch(() => {});
  });
}

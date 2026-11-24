import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Download, ExternalLink, History, Link2, MapPin, MessageCircle, Pencil, QrCode, ScanLine, Trash2, UserCheck, Users } from 'lucide-react';
import QRCode from 'qrcode';
import { api, errMsg } from '../api.js';
import EventForm from '../components/EventForm.jsx';
import { Badge, Button, Card, ConfirmDialog, CopyButton, ErrorNote, Modal, PageHeader, PageLoader, ProgressBar, Stat, Toggle } from '../components/ui.jsx';
import { useToast } from '../components/toast.jsx';
import { useEvent } from '../eventContext.jsx';
import { EVENT_STATUS, downloadDataUrl, fmtDateTime, fmtRange, timeAgo } from '../format.js';

const CLOSED = {
  not_published: 'Hidden: the event is a draft',
  cancelled: 'Closed: event cancelled',
  ended: 'Closed: event has ended',
  closed: 'Closed by you',
  deadline_passed: 'Closed: deadline passed',
  full: 'Closed: event is full',
};

const ACTION_LABEL = {
  'event.create': 'Event created',
  'event.update': 'Event edited',
  'registration.add': 'Participant added',
  'registration.public': 'Online registration',
  'registration.import': 'Import',
  'registration.status': 'Status changed',
  'registration.bulk_status': 'Bulk status change',
  'registration.remove': 'Participant removed',
  'registration.edit': 'Participant edited',
  'registration.resend': 'Ticket re-sent',
  'registration.cancelled_by_participant': 'Cancelled by participant',
  'attendance.open': 'Attendance opened',
  'attendance.close': 'Attendance closed',
  'attendance.manual': 'Manual check-in',
  'attendance.correct': 'Attendance corrected',
  'qr.regenerate': 'QR regenerated',
  'qr.revoke': 'QR revoked',
  'report.export': 'Report exported',
};

export default function EventDetail() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { event, select, refresh, reloadEvents, failed } = useEvent();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [audit, setAudit] = useState([]);
  const [linkQr, setLinkQr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    select(eventId);
  }, [eventId, select]);

  const ready = event && event.id === eventId;

  useEffect(() => {
    if (!ready) return;
    api.get(`/events/${eventId}/audit`).then((r) => setAudit(r.data.items)).catch(() => {});
  }, [ready, eventId, event?.counts?.registered, event?.attendanceOpen]);

  useEffect(() => {
    if (!ready || !event.publicUrl) return;
    QRCode.toDataURL(event.publicUrl, { width: 360, margin: 2 }).then(setLinkQr).catch(() => {});
  }, [ready, event?.publicUrl]);

  if (failed && !ready) return <ErrorNote onRetry={refresh}>Could not load this event.</ErrorNote>;
  if (!ready) return <PageLoader label="Loading event…" />;

  const c = event.counts || {};
  const r = event.registration;
  const st = event.registrationState;

  async function patch(body, msg) {
    setBusy(true);
    try {
      await api.put(`/events/${event.id}`, body);
      await refresh();
      reloadEvents();
      if (msg) toast.success(msg);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function save(payload) {
    try {
      await api.put(`/events/${event.id}`, payload);
      await refresh();
      reloadEvents();
      toast.success('Event updated');
      setEditing(false);
    } catch (err) {
      throw new Error(errMsg(err));
    }
  }

  async function remove() {
    try {
      await api.delete(`/events/${event.id}`);
      toast.success('Event deleted');
      select('');
      reloadEvents();
      navigate('/events', { replace: true });
    } catch (err) {
      toast.error(errMsg(err));
    }
  }

  async function toggleAttendance(open) {
    setBusy(true);
    try {
      await api.put(`/events/${event.id}/attendance/state`, { open });
      await refresh();
      toast.success(open ? 'Attendance is open. Start scanning!' : 'Attendance closed');
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rise">
      <PageHeader
        back={
          <Link to="/events" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-ink">
            <ArrowLeft className="size-4" /> All events
          </Link>
        }
        title={event.name}
        actions={
          <>
            <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button variant="dangerSoft" icon={Trash2} onClick={() => setDeleting(true)}>
              Delete
            </Button>
          </>
        }
      />

      <Card className="mb-6 overflow-hidden">
        {event.posterUrl && <img src={event.posterUrl} alt="" className="h-44 w-full object-cover sm:h-56" onError={(e) => (e.currentTarget.style.display = 'none')} />}
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={EVENT_STATUS[event.status]?.tone} dot>{EVENT_STATUS[event.status]?.label}</Badge>
            {event.attendanceOpen && <Badge tone="green">Scanning open</Badge>}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
            <span className="flex items-center gap-1.5"><CalendarDays className="size-4 text-slate-400" /> {fmtRange(event.startAt, event.endAt)}</span>
            {event.venue && <span className="flex items-center gap-1.5"><MapPin className="size-4 text-slate-400" /> {event.venue}</span>}
          </div>
          {event.description && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600">{event.description}</p>}
          {event.whatsappGroupUrl && (
            <a href={event.whatsappGroupUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
              <MessageCircle className="size-4" /> WhatsApp group
            </a>
          )}
        </div>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Confirmed" value={c.registered || 0} icon={Users} sub={r.capacity ? `of ${r.capacity} seats` : 'no seat limit'} />
        <Stat label="Checked in" value={c.present || 0} icon={UserCheck} tone="green" />
        <Stat label="Pending approval" value={c.pending || 0} icon={Users} tone="amber" />
        <Stat label="Waitlisted" value={c.waitlisted || 0} icon={Users} tone="blue" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-semibold text-ink"><Link2 className="size-4 text-brand-600" /> Online registration</h2>
              <Badge tone={st.open ? 'green' : 'slate'} dot>{st.open ? (st.waitlisting ? 'Open · waitlist' : 'Open') : 'Closed'}</Badge>
            </div>
            {event.publicUrl ? (
              <div className="grid gap-5 sm:grid-cols-[1fr_9rem]">
                <div className="min-w-0 space-y-4">
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-slate-500">Share this link with students</p>
                    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{event.publicUrl}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <CopyButton text={event.publicUrl} label="Copy link" />
                      <a href={event.publicUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="secondary" icon={ExternalLink}>Open page</Button>
                      </a>
                    </div>
                  </div>
                  <Toggle checked={r.open} disabled={busy} onChange={(v) => patch({ registration: { open: v } }, v ? 'Registration opened' : 'Registration closed')} label="Accept registrations" description={!st.open && st.closedReason ? CLOSED[st.closedReason] : 'Visitors can register right now.'} />
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div><dt className="text-xs text-slate-500">Deadline</dt><dd className="font-medium text-ink">{event.registrationDeadline ? fmtDateTime(event.registrationDeadline) : 'None'}</dd></div>
                    <div><dt className="text-xs text-slate-500">Seats left</dt><dd className="font-medium text-ink">{st.seatsLeft ?? 'Unlimited'}</dd></div>
                    <div><dt className="text-xs text-slate-500">Approval</dt><dd className="font-medium text-ink">{r.requireApproval ? 'Required' : 'Automatic'}</dd></div>
                    <div><dt className="text-xs text-slate-500">Waiting list</dt><dd className="font-medium text-ink">{r.waitlist ? 'On' : 'Off'}</dd></div>
                  </dl>
                  {r.capacity ? <ProgressBar value={event.seatsTaken} max={r.capacity} tone={st.full ? 'amber' : 'brand'} /> : null}
                </div>
                {linkQr && (
                  <div className="text-center">
                    <img src={linkQr} alt="QR code for the registration link" className="mx-auto size-36 rounded-lg border border-slate-200 p-1" />
                    <Button size="sm" variant="ghost" icon={Download} className="mt-2" onClick={() => downloadDataUrl(linkQr, 'registration-link-qr.png')}>
                      Poster QR
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Save the event once to generate its public registration link.</p>
            )}
            {(c.pending > 0 || c.waitlisted > 0) && (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <span>
                  {c.pending > 0 && <b>{c.pending} waiting for approval</b>}
                  {c.pending > 0 && c.waitlisted > 0 && ' · '}
                  {c.waitlisted > 0 && <b>{c.waitlisted} on the waiting list</b>}
                </span>
                <Link to={`/participants?status=${c.pending > 0 ? 'pending' : 'waitlisted'}`}>
                  <Button size="sm" variant="secondary">Review</Button>
                </Link>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-ink"><ScanLine className="size-4 text-brand-600" /> Attendance</h2>
            <Toggle checked={event.attendanceOpen} disabled={busy} onChange={toggleAttendance} label="Scanning is open" description="Turn this on when check-in begins. QR codes are rejected while it is off." />
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/scanner"><Button icon={ScanLine}>Open scanner</Button></Link>
              <Link to="/participants"><Button variant="secondary" icon={Users}>Participants</Button></Link>
              <Link to="/qr-codes"><Button variant="secondary" icon={QrCode}>QR codes</Button></Link>
            </div>
          </Card>
        </div>

        <Card className="lg:col-span-2">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
            <History className="size-4 text-brand-600" />
            <h2 className="font-semibold text-ink">Activity</h2>
          </div>
          {audit.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">Nothing yet.</p>
          ) : (
            <ul className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto">
              {audit.map((a) => (
                <li key={a.id} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-ink">{ACTION_LABEL[a.action] || a.action}</p>
                    <span className="shrink-0 text-xs text-slate-400">{timeAgo(a.at)}</span>
                  </div>
                  {a.detail && <p className="truncate text-xs text-slate-500">{a.detail}</p>}
                  <p className="text-xs text-slate-400">{a.actor}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit event" size="lg">
        <EventForm event={event} onSubmit={save} onCancel={() => setEditing(false)} />
      </Modal>
      <ConfirmDialog
        open={deleting}
        danger
        title="Delete this event?"
        text={`“${event.name}” and all of its registrations and attendance records will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete event"
        onClose={() => setDeleting(false)}
        onConfirm={remove}
      />
    </div>
  );
}

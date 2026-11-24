import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarDays, CalendarPlus, CheckCircle2, Download, Hourglass, ListOrdered, MapPin, MessageCircle, XCircle } from 'lucide-react';
import { api, apiBase, errMsg } from '../api.js';
import { Badge, Button, Card, ConfirmDialog, Logo, PageLoader } from '../components/ui.jsx';
import { downloadDataUrl, fmtDateTime, fmtRange } from '../format.js';

const STATE = {
  registered: { tone: 'green', label: 'Confirmed', note: null },
  pending: { tone: 'amber', label: 'Awaiting approval', note: 'The organiser has not approved your registration yet. This page will show your QR code once they do.' },
  waitlisted: { tone: 'blue', label: 'On the waiting list', note: 'The event is full. If a seat opens up you will be confirmed automatically. Check back on this page.' },
  rejected: { tone: 'red', label: 'Not approved', note: 'Unfortunately your registration was not approved for this event.' },
  cancelled: { tone: 'slate', label: 'Cancelled', note: 'This registration has been cancelled.' },
};

export default function Ticket() {
  const { code } = useParams();
  const [t, setT] = useState(null);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const load = () =>
    api
      .get(`/public/tickets/${code}`)
      .then((r) => setT(r.data.ticket))
      .catch((e) => setError(e.response?.status === 404 ? 'not_found' : errMsg(e)));

  useEffect(() => {
    load();
    // while waiting for approval / a seat, quietly refresh so the QR shows up on its own
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 20000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    if (t) document.title = `Ticket · ${t.event.name}`;
  }, [t]);

  if (error === 'not_found')
    return (
      <Frame>
        <Card className="p-8 text-center">
          <h1 className="text-xl font-bold text-ink">Ticket not found</h1>
          <p className="mt-2 text-sm text-slate-500">This link is not valid. Open the link from your confirmation e-mail.</p>
        </Card>
      </Frame>
    );
  if (error) return <Frame><Card className="p-8 text-center text-sm text-red-700">{error}</Card></Frame>;
  if (!t) return <PageLoader />;

  const s = STATE[t.status] || STATE.registered;
  const live = t.status === 'registered' && !t.qrRevoked && t.qrDataUrl;
  const ended = t.event.status === 'completed' || t.event.status === 'cancelled';

  return (
    <Frame>
      <Card className="rise overflow-hidden shadow-lg">
        <div className="relative bg-gradient-to-br from-brand-700 to-brand-500 px-6 pb-12 pt-6 text-white">
          {t.event.posterUrl && <img src={t.event.posterUrl} alt="" className="absolute inset-0 size-full object-cover opacity-25" onError={(e) => (e.currentTarget.style.display = 'none')} />}
          <div className="relative">
            <Badge tone={s.tone} className="bg-white/95">{s.label}</Badge>
            <h1 className="mt-3 text-2xl font-bold leading-tight tracking-tight">{t.event.name}</h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-white/85"><CalendarDays className="size-4" /> {fmtRange(t.event.startAt, t.event.endAt)}</p>
            {t.event.venue && <p className="mt-1 flex items-center gap-2 text-sm text-white/85"><MapPin className="size-4" /> {t.event.venue}</p>}
          </div>
        </div>

        {/* ticket perforation */}
        <div className="relative -mt-6 flex items-center">
          <span className="-ml-3 size-6 rounded-full bg-slate-100" />
          <span className="mx-2 flex-1 border-t-2 border-dashed border-slate-200" />
          <span className="-mr-3 size-6 rounded-full bg-slate-100" />
        </div>

        <div className="px-6 pb-6 pt-2 text-center">
          {live ? (
            <>
              {t.checkedInAt ? (
                <div className="mx-auto mb-4 flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
                  <CheckCircle2 className="size-4" /> Checked in at {fmtDateTime(t.checkedInAt)}
                </div>
              ) : null}
              <div className="mx-auto w-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <img src={t.qrDataUrl} alt="Your entry QR code" className="size-60 sm:size-64" />
              </div>
              <p className="mt-3 text-xs text-slate-500">Show this code at the entrance. Turn your screen brightness up for faster scanning.</p>
            </>
          ) : (
            <div className="mx-auto my-4 max-w-xs">
              <span className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-slate-100 text-slate-500">
                {t.status === 'pending' ? <Hourglass className="size-6" /> : t.status === 'waitlisted' ? <ListOrdered className="size-6" /> : <XCircle className="size-6" />}
              </span>
              <p className="text-sm text-slate-600">{t.qrRevoked && t.status === 'registered' ? 'This QR code was revoked by the organiser. Please contact them for a new one.' : s.note}</p>
            </div>
          )}

          <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-left">
            <p className="text-base font-bold text-ink">{t.name}</p>
            <p className="text-sm text-slate-500">{[t.department, t.academicYear].filter(Boolean).join(' · ')}</p>
            <p className="mt-1 font-mono text-xs text-slate-400">{t.registrationId}</p>
          </div>

          <div className="mt-5 flex flex-col gap-2">
            {live && <Button icon={Download} onClick={() => downloadDataUrl(t.qrDataUrl, `${t.registrationId}.png`)}>Save QR image</Button>}
            {t.status === 'registered' && (
              <a href={`${apiBase}/public/tickets/${code}/calendar.ics`}><Button variant="secondary" icon={CalendarPlus} className="w-full">Add to calendar</Button></a>
            )}
            {t.event.whatsappGroupUrl && (
              <a href={t.event.whatsappGroupUrl} target="_blank" rel="noopener noreferrer"><Button variant="secondary" icon={MessageCircle} className="w-full">Join the WhatsApp group</Button></a>
            )}
            {t.canCancel && !ended && <Button variant="ghost" onClick={() => setCancelling(true)}>Cancel my registration</Button>}
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={cancelling}
        danger
        title="Cancel your registration?"
        text="Your seat will be released for someone else and this QR code will stop working. You can register again later if seats are available."
        confirmLabel="Yes, cancel"
        onClose={() => setCancelling(false)}
        onConfirm={async () => {
          try {
            await api.post(`/public/tickets/${code}/cancel`);
            setCancelling(false);
            await load();
          } catch (err) {
            setCancelling(false);
            setError(errMsg(err));
          }
        }}
      />
    </Frame>
  );
}

function Frame({ children }) {
  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-md">
        <div className="mb-5 flex justify-center"><Logo /></div>
        {children}
        <p className="mt-6 text-center text-xs text-slate-400">Powered by EventQR</p>
      </div>
    </div>
  );
}

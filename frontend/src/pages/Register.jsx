import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarDays, CalendarPlus, CheckCircle2, Clock, Hourglass, ListOrdered, Lock, MapPin, Ticket, Users } from 'lucide-react';
import { api, apiBase, errCode, errDetails, errMsg } from '../api.js';
import { Badge, Button, Card, Field, Input, Logo, PageLoader, Select, Textarea } from '../components/ui.jsx';
import { DEPARTMENTS, YEARS, fmtDateTime, fmtRange } from '../format.js';

const OUTCOME = {
  registered: { icon: CheckCircle2, tone: 'bg-emerald-100 text-emerald-600', title: "You're registered!" },
  pending: { icon: Hourglass, tone: 'bg-amber-100 text-amber-600', title: 'Request received' },
  waitlisted: { icon: ListOrdered, tone: 'bg-sky-100 text-sky-600', title: "You're on the waiting list" },
};

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-900 via-brand-800 to-slate-100 bg-[length:100%_22rem] bg-no-repeat">
      <div className="mx-auto max-w-2xl px-4 pb-16 pt-6 sm:pt-10">
        <div className="mb-6 flex items-center justify-between">
          <Logo light />
          <span className="flex items-center gap-1.5 text-xs text-white/60"><Lock className="size-3" /> Secure registration</span>
        </div>
        {children}
        <p className="mt-8 text-center text-xs text-slate-400">Powered by EventQR</p>
      </div>
    </div>
  );
}

function Success({ done, event }) {
  const o = OUTCOME[done.status] || OUTCOME.registered;
  const [qr, setQr] = useState('');
  useEffect(() => {
    if (done.status !== 'registered' || !done.ticketCode) return;
    api.get(`/public/tickets/${done.ticketCode}`).then((r) => setQr(r.data.ticket.qrDataUrl || '')).catch(() => {});
  }, [done]);

  return (
    <Card className="rise p-6 text-center sm:p-8">
      <span className={`pop mx-auto mb-4 grid size-16 place-items-center rounded-full ${o.tone}`}><o.icon className="size-8" /></span>
      <h2 className="text-2xl font-bold tracking-tight text-ink">{o.title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">{done.message}</p>
      <p className="mt-3 text-xs text-slate-500">Registration ID <b className="font-mono text-ink">{done.registrationId}</b></p>

      {qr && (
        <div className="mx-auto mt-6 w-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <img src={qr} alt="Your entry QR code" className="size-52" />
          <p className="mt-1 text-xs text-slate-500">Show this at the entrance</p>
        </div>
      )}
      {done.status === 'registered' && done.emailing && <p className="mt-4 text-sm text-slate-500">We are also e-mailing this ticket to you.</p>}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        {done.ticketCode && (
          <Link to={`/ticket/${done.ticketCode}`}>
            <Button icon={Ticket} className="w-full">Open my ticket</Button>
          </Link>
        )}
        {done.status === 'registered' && done.ticketCode && (
          <a href={`${apiBase}/public/tickets/${done.ticketCode}/calendar.ics`}>
            <Button variant="secondary" icon={CalendarPlus} className="w-full">Add to calendar</Button>
          </a>
        )}
      </div>
      <p className="mt-6 text-xs text-slate-400">Save the ticket link. You can come back to it any time{event ? ` for ${event.name}` : ''}.</p>
    </Card>
  );
}

export default function Register() {
  const { slug } = useParams();
  const [event, setEvent] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [f, setF] = useState({ name: '', email: '', phone: '', department: '', academicYear: '', rollNo: '', website: '' });
  const [answers, setAnswers] = useState({});
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [lostOpen, setLostOpen] = useState(false);
  const [lostEmail, setLostEmail] = useState('');
  const [lostMsg, setLostMsg] = useState('');
  const [lostBusy, setLostBusy] = useState(false);

  useEffect(() => {
    api
      .get(`/public/events/${slug}`)
      .then((r) => setEvent(r.data.event))
      .catch((e) => setLoadError(e.response?.status === 404 ? 'not_found' : errMsg(e)));
  }, [slug]);

  useEffect(() => {
    if (event) document.title = `Register · ${event.name}`;
  }, [event]);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const ans = (k, v) => setAnswers((s) => ({ ...s, [k]: v }));

  function validate() {
    const er = {};
    if (f.name.trim().length < 2) er.name = 'Please enter your full name';
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) er.email = 'Enter a valid email address';
    if (f.phone && !/^\+?[0-9 ()-]{7,20}$/.test(f.phone.trim())) er.phone = 'That phone number looks invalid';
    if (!f.department.trim()) er.department = 'Department is required';
    if (!f.academicYear) er.academicYear = 'Choose your year';
    for (const q of event.registration.fields) {
      const v = answers[q.key];
      if (q.required && (q.type === 'checkbox' ? v !== 'true' : !String(v || '').trim())) er[`a_${q.key}`] = q.type === 'checkbox' ? 'Please tick this box' : 'This is required';
    }
    setErrors(er);
    return Object.keys(er).length === 0;
  }

  async function submit(e) {
    e.preventDefault();
    setFormError('');
    if (!validate()) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/public/events/${slug}/register`, {
        name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), department: f.department.trim(), academicYear: f.academicYear, rollNo: f.rollNo.trim(), answers, website: f.website,
      });
      setDone(data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const code = errCode(err);
      if (code === 'ALREADY_REGISTERED') {
        setFormError('This email is already registered for the event. Use “Lost your ticket?” below to get it again.');
        setLostEmail(f.email);
        setLostOpen(true);
      } else if (code === 'REGISTRATION_CLOSED' || code === 'EVENT_FULL') {
        setFormError(errMsg(err));
        api.get(`/public/events/${slug}`).then((r) => setEvent(r.data.event)).catch(() => {});
      } else {
        const d = errDetails(err);
        if (Array.isArray(d)) setErrors(Object.fromEntries(d.map((x) => [x.path, x.message])));
        setFormError(errMsg(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function resend(e) {
    e.preventDefault();
    setLostBusy(true);
    setLostMsg('');
    try {
      const { data } = await api.post(`/public/events/${slug}/resend`, { email: lostEmail.trim() });
      setLostMsg(data.message);
    } catch (err) {
      setLostMsg(errMsg(err));
    } finally {
      setLostBusy(false);
    }
  }

  if (loadError === 'not_found')
    return (
      <Shell>
        <Card className="p-8 text-center">
          <h1 className="text-xl font-bold text-ink">Event not found</h1>
          <p className="mt-2 text-sm text-slate-500">This registration link is not valid. Please check the link you were given.</p>
        </Card>
      </Shell>
    );
  if (loadError) return <Shell><Card className="p-8 text-center text-sm text-red-700">{loadError}</Card></Shell>;
  if (!event) return <PageLoader />;

  const reg = event.registration;
  const closed = !reg.open;

  return (
    <Shell>
      {done ? (
        <Success done={done} event={event} />
      ) : (
        <>
          <Card className="rise mb-5 overflow-hidden">
            {event.posterUrl && <img src={event.posterUrl} alt="" className="h-44 w-full object-cover sm:h-56" onError={(e) => (e.currentTarget.style.display = 'none')} />}
            <div className="p-5 sm:p-6">
              <div className="mb-2 flex flex-wrap gap-2">
                {event.status === 'ongoing' && <Badge tone="green" dot>Happening now</Badge>}
                {reg.open && reg.seatsLeft != null && reg.seatsLeft > 0 && <Badge tone={reg.seatsLeft <= 10 ? 'amber' : 'brand'}><Users className="size-3" /> {reg.seatsLeft} {reg.seatsLeft === 1 ? 'seat' : 'seats'} left</Badge>}
                {reg.open && reg.waitlisting && <Badge tone="blue">Full · waiting list open</Badge>}
                {reg.open && reg.requireApproval && <Badge tone="slate">Approval required</Badge>}
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{event.name}</h1>
              <div className="mt-3 space-y-1.5 text-sm text-slate-600">
                <p className="flex items-center gap-2"><CalendarDays className="size-4 shrink-0 text-brand-600" /> {fmtRange(event.startAt, event.endAt)}</p>
                {event.venue && <p className="flex items-center gap-2"><MapPin className="size-4 shrink-0 text-brand-600" /> {event.venue}</p>}
                {event.registrationDeadline && reg.open && <p className="flex items-center gap-2"><Clock className="size-4 shrink-0 text-brand-600" /> Register by {fmtDateTime(event.registrationDeadline)}</p>}
              </div>
              {event.description && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-600">{event.description}</p>}
            </div>
          </Card>

          {closed ? (
            <Card className="rise p-6 text-center">
              <span className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-slate-100 text-slate-500"><Lock className="size-5" /></span>
              <h2 className="text-lg font-semibold text-ink">Registration is closed</h2>
              <p className="mt-1 text-sm text-slate-500">{reg.closedMessage || 'This event is not accepting registrations.'}</p>
            </Card>
          ) : (
            <Card className="rise p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-ink">{reg.waitlisting ? 'Join the waiting list' : 'Register'}</h2>
              <p className="mb-5 mt-1 text-sm text-slate-500">
                {reg.waitlisting ? 'The event is full. We will confirm you automatically if a seat opens up.' : reg.requireApproval ? 'The organiser will review your request. You will get your QR ticket once approved.' : 'Fill in your details and your QR ticket is e-mailed to you instantly.'}
              </p>
              <form onSubmit={submit} className="space-y-4" noValidate>
                <Field label="Full name" required error={errors.name}><Input value={f.name} onChange={set('name')} autoComplete="name" invalid={!!errors.name} /></Field>
                <Field label="Email" required error={errors.email} hint="Your ticket is sent here."><Input type="email" inputMode="email" value={f.email} onChange={set('email')} autoComplete="email" invalid={!!errors.email} /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Phone" error={errors.phone}><Input type="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" invalid={!!errors.phone} /></Field>
                  <Field label="Roll / registration no."><Input value={f.rollNo} onChange={set('rollNo')} /></Field>
                  <Field label="Department" required error={errors.department}>
                    <Input value={f.department} onChange={set('department')} list="dept-list" invalid={!!errors.department} />
                    <datalist id="dept-list">{DEPARTMENTS.map((d) => <option key={d} value={d} />)}</datalist>
                  </Field>
                  <Field label="Year" required error={errors.academicYear}>
                    <Select value={f.academicYear} onChange={set('academicYear')} invalid={!!errors.academicYear}><option value="">Select…</option>{YEARS.map((y) => <option key={y}>{y}</option>)}</Select>
                  </Field>
                </div>

                {reg.fields.map((q) => (
                  <div key={q.key}>
                    {q.type === 'checkbox' ? (
                      <label className="flex items-start gap-3 text-sm text-slate-700">
                        <input type="checkbox" checked={answers[q.key] === 'true'} onChange={(e) => ans(q.key, e.target.checked ? 'true' : 'false')} className="mt-0.5 size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                        <span>{q.label}{q.required && <span className="text-red-500"> *</span>}{errors[`a_${q.key}`] && <span className="block text-xs text-red-600">{errors[`a_${q.key}`]}</span>}</span>
                      </label>
                    ) : (
                      <Field label={q.label} required={q.required} error={errors[`a_${q.key}`]}>
                        {q.type === 'select' ? (
                          <Select value={answers[q.key] || ''} onChange={(e) => ans(q.key, e.target.value)} invalid={!!errors[`a_${q.key}`]}><option value="">Select…</option>{q.options.map((o) => <option key={o}>{o}</option>)}</Select>
                        ) : q.type === 'textarea' ? (
                          <Textarea value={answers[q.key] || ''} onChange={(e) => ans(q.key, e.target.value)} maxLength={500} invalid={!!errors[`a_${q.key}`]} />
                        ) : (
                          <Input value={answers[q.key] || ''} onChange={(e) => ans(q.key, e.target.value)} maxLength={500} invalid={!!errors[`a_${q.key}`]} />
                        )}
                      </Field>
                    )}
                  </div>
                ))}

                {/* honeypot: hidden from people, irresistible to bots */}
                <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                  <label>Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} /></label>
                </div>

                {formError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
                <Button type="submit" size="lg" className="w-full" loading={busy}>{reg.waitlisting ? 'Join waiting list' : reg.requireApproval ? 'Request a seat' : 'Register & get my ticket'}</Button>
              </form>
            </Card>
          )}

          <div className="mt-5 text-center">
            <button onClick={() => setLostOpen((v) => !v)} className="text-sm font-medium text-brand-700 hover:underline">Already registered? Lost your ticket?</button>
            {lostOpen && (
              <Card className="rise mx-auto mt-3 max-w-md p-4 text-left">
                <form onSubmit={resend} className="space-y-3">
                  <Field label="Email you registered with"><Input type="email" value={lostEmail} onChange={(e) => setLostEmail(e.target.value)} required /></Field>
                  <Button type="submit" variant="secondary" className="w-full" loading={lostBusy}>Send my ticket again</Button>
                  {lostMsg && <p role="status" className="text-sm text-slate-600">{lostMsg}</p>}
                </form>
              </Card>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}

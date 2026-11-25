import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Check, Eye, Mail, MessageCircle, Plus, Search, Trash2, Upload, UserPlus, Users, X } from 'lucide-react';
import { api, download, errCode, errMsg } from '../api.js';
import EventGate from '../components/EventGate.jsx';
import ImportWizard from '../components/ImportWizard.jsx';
import QrImage from '../components/QrImage.jsx';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorNote, Field, IconButton, Input, Modal, PageHeader, Pagination, Select, Skeleton } from '../components/ui.jsx';
import { useToast } from '../components/toast.jsx';
import { useEvent } from '../eventContext.jsx';
import { REG_STATUS, YEARS, fmtDateTime, waLink } from '../format.js';

const TABS = [
  ['', 'All'],
  ['registered', 'Confirmed'],
  ['pending', 'Pending'],
  ['waitlisted', 'Waitlisted'],
  ['rejected', 'Rejected'],
  ['cancelled', 'Cancelled'],
];

const EMAIL_LABEL = { sent: ['green', 'E-mailed'], failed: ['red', 'E-mail failed'], skipped: ['slate', 'Not e-mailed'], none: ['slate', '—'] };

/* ---------- add / edit form ---------- */
function ParticipantForm({ initial, onSubmit, onCancel, submitLabel, showEmailOption }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', department: '', academicYear: '', rollNo: '', ...initial });
  const [sendEmail, setSendEmail] = useState(true);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    const er = {};
    if (f.name.trim().length < 2) er.name = 'Enter the full name';
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) er.email = 'Enter a valid email';
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit({ ...f, name: f.name.trim(), email: f.email.trim(), sendEmail });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required error={errors.name}><Input value={f.name} onChange={set('name')} invalid={!!errors.name} autoFocus /></Field>
        <Field label="Email" required error={errors.email}><Input type="email" value={f.email} onChange={set('email')} invalid={!!errors.email} /></Field>
        <Field label="Phone"><Input type="tel" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Roll no."><Input value={f.rollNo} onChange={set('rollNo')} /></Field>
        <Field label="Department"><Input value={f.department} onChange={set('department')} /></Field>
        <Field label="Year">
          <Select value={f.academicYear} onChange={set('academicYear')}>
            <option value="">—</option>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            {f.academicYear && !YEARS.includes(f.academicYear) && <option value={f.academicYear}>{f.academicYear}</option>}
          </Select>
        </Field>
      </div>
      {showEmailOption && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
          E-mail their QR ticket now
        </label>
      )}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="submit" loading={busy}>{submitLabel}</Button>
      </div>
    </form>
  );
}

/* ---------- one participant ---------- */
function ParticipantModal({ rid, event, onClose, onChanged, changeStatus }) {
  const toast = useToast();
  const [row, setRow] = useState(null);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [qrVersion, setQrVersion] = useState(0);
  const [busy, setBusy] = useState('');
  const [loadError, setLoadError] = useState('');
  const base = `/events/${event.id}/registrations/${rid}`;

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const { data } = await api.get(base, { timeout: 15000 });
      setRow(data.registration);
    } catch (err) {
      setLoadError(errMsg(err));
    }
  }, [base]);
  useEffect(() => { load(); }, [load]);

  async function run(name, fn, okMsg) {
    setBusy(name);
    try {
      await fn();
      if (okMsg) toast.success(okMsg);
      await load();
      onChanged();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy('');
    }
  }

  const act = async (status) => {
    const ok = await changeStatus(row, status);
    if (ok) await load();
  };

  const answers = Object.entries(row?.answers || {});
  const fieldLabel = (k) => event.registration.fields.find((f) => f.key === k)?.label || k;
  const wa = row ? waLink(row.phone, `Hi ${row.name}, regarding ${event.name}: `) : null;

  return (
    <>
      <Modal open onClose={onClose} title={row ? row.name : 'Participant'} size="lg">
        {row && loadError && <ErrorNote onRetry={load}>{loadError}</ErrorNote>}
        {!row ? (
          loadError ? <ErrorNote onRetry={load}>{loadError}</ErrorNote> : <div className="space-y-3"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-40" /></div>
        ) : editing ? (
          <ParticipantForm
            initial={row}
            submitLabel="Save changes"
            onCancel={() => setEditing(false)}
            onSubmit={async (b) => {
              await api.put(base, { name: b.name, email: b.email, phone: b.phone, department: b.department, academicYear: b.academicYear, rollNo: b.rollNo });
              toast.success('Participant updated');
              setEditing(false);
              await load();
              onChanged();
            }}
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-[1fr_15rem]">
            <div className="min-w-0 space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={REG_STATUS[row.status]?.tone} dot>{REG_STATUS[row.status]?.label}</Badge>
                <span className="font-mono text-xs text-slate-500">{row.registrationId}</span>
                {row.status === 'registered' && <Badge tone={row.attendanceStatus === 'present' ? 'green' : 'slate'}>{row.attendanceStatus === 'present' ? 'Checked in' : 'Not checked in'}</Badge>}
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div className="col-span-2 min-w-0"><dt className="text-xs text-slate-500">Email</dt><dd className="truncate font-medium text-ink">{row.email}</dd></div>
                <div><dt className="text-xs text-slate-500">Phone</dt><dd className="font-medium text-ink">{row.phone || '—'}</dd></div>
                <div><dt className="text-xs text-slate-500">Roll no.</dt><dd className="font-medium text-ink">{row.rollNo || '—'}</dd></div>
                <div><dt className="text-xs text-slate-500">Department</dt><dd className="font-medium text-ink">{row.department || '—'}</dd></div>
                <div><dt className="text-xs text-slate-500">Year</dt><dd className="font-medium text-ink">{row.academicYear || '—'}</dd></div>
                <div><dt className="text-xs text-slate-500">Registered</dt><dd className="font-medium text-ink">{fmtDateTime(row.registeredAt)} <span className="font-normal text-slate-400">({row.source})</span></dd></div>
                {row.checkInAt && row.attendanceStatus === 'present' && <div><dt className="text-xs text-slate-500">Checked in</dt><dd className="font-medium text-ink">{fmtDateTime(row.checkInAt)}</dd></div>}
              </dl>
              {answers.length > 0 && (
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Answers</p>
                  <dl className="space-y-2 text-sm">
                    {answers.map(([k, v]) => (
                      <div key={k}><dt className="text-xs text-slate-500">{fieldLabel(k)}</dt><dd className="font-medium text-ink">{v === 'true' ? 'Yes' : v === 'false' ? 'No' : v}</dd></div>
                    ))}
                  </dl>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {row.status !== 'registered' && <Button size="sm" icon={Check} onClick={() => act('registered')}>Approve</Button>}
                {row.status === 'registered' && <Button size="sm" variant="secondary" onClick={() => act('pending')}>Move to pending</Button>}
                {row.status !== 'waitlisted' && row.status !== 'registered' && <Button size="sm" variant="secondary" onClick={() => act('waitlisted')}>Waitlist</Button>}
                {row.status !== 'rejected' && <Button size="sm" variant="dangerSoft" icon={X} onClick={() => act('rejected')}>Reject</Button>}
                {row.status !== 'cancelled' && <Button size="sm" variant="ghost" onClick={() => act('cancelled')}>Mark cancelled</Button>}
              </div>
              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit details</Button>
                {wa && <a href={wa} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="secondary" icon={MessageCircle}>WhatsApp</Button></a>}
                <Button size="sm" variant="dangerSoft" icon={Trash2} onClick={() => setRemoving(true)}>Remove</Button>
              </div>
            </div>

            <div className="text-center">
              {row.status === 'registered' && !row.qrRevoked ? (
                <>
                  <QrImage eventId={event.id} registrationId={rid} version={qrVersion} className="mx-auto size-52" />
                  <div className="mt-3 flex flex-col gap-2">
                    <Button size="sm" variant="secondary" icon={Mail} loading={busy === 'mail'} onClick={() => run('mail', async () => { const r = await api.post(`${base}/resend`); if (r.data.emailStatus === 'skipped') toast.info('Mail server is not configured. Nothing was sent.'); }, 'Ticket e-mail queued')}>
                      {row.emailStatus === 'sent' ? 'Re-send ticket' : 'E-mail ticket'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => download(`${base}/qr`, { download: 1 }, `${row.registrationId}.png`).catch((e) => toast.error(errMsg(e)))}>Download PNG</Button>
                    <Button size="sm" variant="ghost" loading={busy === 'regen'} onClick={() => run('regen', async () => { await api.post(`${base}/qr/regenerate`, {}); setQrVersion((v) => v + 1); }, 'New QR created. The old one no longer works.')}>Regenerate QR</Button>
                    <Button size="sm" variant="ghost" loading={busy === 'revoke'} onClick={() => run('revoke', () => api.post(`${base}/qr/revoke`), 'QR revoked')}>Revoke QR</Button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{(EMAIL_LABEL[row.emailStatus] || EMAIL_LABEL.none)[1]}</p>
                </>
              ) : row.qrRevoked ? (
                <div className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
                  This QR is revoked.
                  <Button size="sm" className="mt-3 w-full" loading={busy === 'regen'} onClick={() => run('regen', () => api.post(`${base}/qr/regenerate`, {}), 'New QR created')}>Create a new one</Button>
                </div>
              ) : (
                <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">The QR ticket is issued once the registration is <b>confirmed</b>.</div>
              )}
            </div>
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={removing}
        danger
        title="Remove participant?"
        text={`${row?.name || 'This person'} will be removed from this event along with their QR code and attendance record.`}
        confirmLabel="Remove"
        onClose={() => setRemoving(false)}
        onConfirm={async () => {
          try {
            await api.delete(base);
            toast.success('Participant removed');
            setRemoving(false);
            onChanged();
            onClose();
          } catch (err) {
            toast.error(errMsg(err));
          }
        }}
      />
    </>
  );
}

/* ---------- page ---------- */
function StudentsInner() {
  const { event, refresh } = useEvent();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [dept, setDept] = useState('');
  const [year, setYear] = useState('');
  const [attendance, setAttendance] = useState('');
  const status = params.get('status') || '';
  const [sort, setSort] = useState('registeredAt');
  const [dir, setDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [meta, setMeta] = useState({ departments: [], academicYears: [] });
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [force, setForce] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setPage(1); setSelected(new Set()); }, [debounced, dept, year, attendance, status, sort, dir]);

  const load = useCallback(() => setLoadAttempt((n) => n + 1), []);
  useEffect(() => {
    let active = true;
    setError('');
    setLoading(true);
    const timeout = window.setTimeout(() => {
      if (!active) return;
      setError('Participants are taking too long to load. Check your connection and try again.');
      setLoading(false);
    }, 15000);

    api
      .get(`/events/${event.id}/registrations`, { params: { search: debounced || undefined, department: dept || undefined, academicYear: year || undefined, attendance: attendance || undefined, status: status || undefined, sort, dir, page, limit: 25 } })
      .then((r) => {
        if (!active) return;
        setData(r.data);
        setError('');
      })
      .catch((e) => {
        if (active) setError(errMsg(e));
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [event.id, debounced, dept, year, attendance, status, sort, dir, page, loadAttempt]);
  useEffect(() => {
    api.get(`/events/${event.id}/registrations/meta`).then((r) => setMeta(r.data)).catch(() => {});
  }, [event.id, data?.total]);

  const changed = useCallback(() => { load(); refresh(); }, [load, refresh]);

  async function changeStatus(row, newStatus, forced = false) {
    try {
      await api.patch(`/events/${event.id}/registrations/${row.id}/status`, { status: newStatus, force: forced });
      toast.success(`${row.name}: ${REG_STATUS[newStatus].label.toLowerCase()}`);
      changed();
      return true;
    } catch (err) {
      if (errCode(err) === 'EVENT_FULL' && !forced) setForce({ row, status: newStatus });
      else toast.error(errMsg(err));
      return false;
    }
  }

  async function bulk(newStatus) {
    try {
      const { data: r } = await api.post(`/events/${event.id}/registrations/bulk-status`, { ids: [...selected], status: newStatus });
      toast.success(`${r.changed} updated${r.skipped ? `, ${r.skipped} skipped (no seats left)` : ''}`);
      setSelected(new Set());
      changed();
    } catch (err) {
      toast.error(errMsg(err));
    }
  }

  const sortBy = (k) => {
    if (sort === k) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(k); setDir('asc'); }
  };
  const Th = ({ k, children, className = '' }) => (
    <th className={`px-3 py-3 font-medium ${className}`}>
      <button onClick={() => sortBy(k)} className="inline-flex items-center gap-1 hover:text-ink">
        {children}
        {sort === k && (dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  );

  const c = event.counts || {};
  const tabCount = { '': (c.registered || 0) + (c.pending || 0) + (c.waitlisted || 0) + (c.rejected || 0) + (c.cancelled || 0), registered: c.registered, pending: c.pending, waitlisted: c.waitlisted, rejected: c.rejected, cancelled: c.cancelled };
  const allOnPage = useMemo(() => data?.items?.length > 0 && data.items.every((r) => selected.has(r.id)), [data, selected]);
  const toggleAll = () => setSelected(allOnPage ? new Set() : new Set(data.items.map((r) => r.id)));
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const filtered = Boolean(debounced || dept || year || attendance);

  return (
    <div className="rise">
      <PageHeader
        title="Participants"
        subtitle={event.name}
        actions={
          <>
            <Button variant="secondary" icon={Upload} onClick={() => setImporting(true)}>Import</Button>
            <Button icon={UserPlus} onClick={() => setAdding(true)}>Add participant</Button>
          </>
        }
      />

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 ring-1 ring-slate-200" role="tablist">
        {TABS.map(([v, l]) => (
          <button key={v} role="tab" aria-selected={status === v} onClick={() => setParams(v ? { status: v } : {}, { replace: true })} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${status === v ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            {l}
            <span className={`rounded-full px-1.5 text-xs tabular-nums ${status === v ? 'bg-white/20' : 'bg-slate-100 text-slate-500'} ${v === 'pending' && c.pending > 0 && status !== v ? 'bg-amber-100 text-amber-800' : ''}`}>{tabCount[v] || 0}</span>
          </button>
        ))}
      </div>

      <Card className="mb-4 p-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_11rem_9rem_9rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, roll no. or ID…" className="pl-9" aria-label="Search participants" />
          </div>
          <Select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department"><option value="">All departments</option>{meta.departments.map((d) => <option key={d}>{d}</option>)}</Select>
          <Select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year"><option value="">All years</option>{meta.academicYears.map((d) => <option key={d}>{d}</option>)}</Select>
          <Select value={attendance} onChange={(e) => setAttendance(e.target.value)} aria-label="Attendance"><option value="">Any attendance</option><option value="present">Present</option><option value="absent">Not present</option></Select>
        </div>
      </Card>

      {selected.size > 0 && (
        <div className="rise sticky top-14 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-lg lg:top-3">
          <b>{selected.size} selected</b>
          <span className="flex-1" />
          <Button size="sm" icon={Check} onClick={() => bulk('registered')}>Approve</Button>
          <Button size="sm" variant="danger" icon={X} onClick={() => bulk('rejected')}>Reject</Button>
          <Button size="sm" variant="secondary" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {error && <ErrorNote onRetry={load}>{error}</ErrorNote>}
      {!data && loading && <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14" />)}</div>}

      {data && data.items.length === 0 && (
        <Card>
          <EmptyState
            icon={Users}
            title={filtered || status ? 'No participants match' : 'No participants yet'}
            text={filtered || status ? 'Try clearing a filter.' : 'Share the registration link, add people one by one, or import a sheet.'}
            action={!filtered && !status && <div className="flex gap-2"><Button icon={Plus} onClick={() => setAdding(true)}>Add participant</Button><Button variant="secondary" icon={Upload} onClick={() => setImporting(true)}>Import</Button></div>}
          />
        </Card>
      )}

      {data && data.items.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-3"><input type="checkbox" checked={allOnPage} onChange={toggleAll} aria-label="Select all on this page" className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" /></th>
                  <Th k="name">Participant</Th>
                  <Th k="department">Department</Th>
                  <Th k="status">Status</Th>
                  <th className="px-3 py-3 font-medium">Attendance</th>
                  <Th k="registeredAt">Registered</Th>
                  <th className="px-3 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((r) => {
                  const wa = waLink(r.phone, `Hi ${r.name}, regarding ${event.name}: `);
                  return (
                    <tr key={r.id} className={`transition hover:bg-slate-50/70 ${selected.has(r.id) ? 'bg-brand-50/50' : ''}`}>
                      <td className="px-3 py-3"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.name}`} className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" /></td>
                      <td className="max-w-[16rem] px-3 py-3">
                        <button onClick={() => setOpenId(r.id)} className="block max-w-full text-left">
                          <p className="truncate font-semibold text-ink hover:text-brand-700">{r.name}</p>
                          <p className="truncate text-xs text-slate-500">{r.email}</p>
                        </button>
                        <p className="font-mono text-[11px] text-slate-400">{r.registrationId}</p>
                      </td>
                      <td className="px-3 py-3 text-slate-600"><p>{r.department || '—'}</p><p className="text-xs text-slate-400">{r.academicYear}</p></td>
                      <td className="px-3 py-3"><Badge tone={REG_STATUS[r.status]?.tone}>{REG_STATUS[r.status]?.label}</Badge></td>
                      <td className="px-3 py-3">
                        {r.status === 'registered' ? (r.attendanceStatus === 'present' ? <Badge tone="green" dot>Present</Badge> : <span className="text-xs text-slate-400">Not yet</span>) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">{fmtDateTime(r.registeredAt)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-0.5">
                          {(r.status === 'pending' || r.status === 'waitlisted' || r.status === 'rejected') && <IconButton icon={Check} tone="green" label="Approve" onClick={() => changeStatus(r, 'registered')} />}
                          {r.status === 'pending' && <IconButton icon={X} tone="red" label="Reject" onClick={() => changeStatus(r, 'rejected')} />}
                          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" title="WhatsApp" aria-label="WhatsApp" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-ink"><MessageCircle className="size-4" /></a>}
                          <IconButton icon={Eye} label="View details" onClick={() => setOpenId(r.id)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 px-4 py-3">
            <Pagination page={data.page} pages={data.pages} total={data.total} label="participants" onChange={setPage} />
          </div>
        </Card>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add participant">
        <ParticipantForm
          showEmailOption
          submitLabel="Add participant"
          onCancel={() => setAdding(false)}
          onSubmit={async (b) => {
            await api.post(`/events/${event.id}/registrations`, b);
            toast.success('Participant added with a personal QR code');
            setAdding(false);
            changed();
          }}
        />
      </Modal>
      <ImportWizard open={importing} onClose={() => setImporting(false)} event={event} onDone={changed} />
      {openId && <ParticipantModal rid={openId} event={event} onClose={() => setOpenId(null)} onChanged={changed} changeStatus={changeStatus} />}
      <ConfirmDialog
        open={Boolean(force)}
        title="The event is full"
        text={`There are no seats left. Confirm ${force?.row?.name || 'this person'} anyway? The seat count will go over the limit.`}
        confirmLabel="Approve anyway"
        onClose={() => setForce(null)}
        onConfirm={async () => {
          const f = force;
          setForce(null);
          await changeStatus(f.row, f.status, true);
        }}
      />
    </div>
  );
}

export default function Students() {
  return (
    <EventGate title="Participants">
      <StudentsInner />
    </EventGate>
  );
}

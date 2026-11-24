import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { CheckCircle2, FileSpreadsheet, RefreshCw, Upload } from 'lucide-react';
import { api, errMsg } from '../api.js';
import { Badge, Button, Input, Modal, Select } from './ui.jsx';

const TARGETS = [
  ['name', 'Name', true, /^(full ?|student ?|participant )?name$|name/i],
  ['email', 'Email', true, /e-?mail/i],
  ['phone', 'Phone', false, /phone|mobile|contact|whats ?app/i],
  ['department', 'Department', false, /dep(t|artment)|branch|course|stream/i],
  ['academicYear', 'Year', false, /year|semester|sem\b|class/i],
  ['rollNo', 'Roll no.', false, /roll|reg(istration)?\.? ?(no|number)|usn|admission|enrol/i],
];

const MAX_BYTES = 5 * 1024 * 1024;

function autoMap(headers) {
  const used = new Set();
  const map = {};
  for (const [key, , , rx] of TARGETS) {
    // exact-ish matches first, then looser
    let idx = headers.findIndex((h, i) => !used.has(i) && rx.test(String(h)) && !(key === 'name' && /user|file|e-?mail/i.test(String(h))));
    if (idx < 0) idx = -1;
    if (idx >= 0) used.add(idx);
    map[key] = idx;
  }
  return map;
}

const STATUS = {
  valid: { label: 'Ready', tone: 'green' },
  invalid: { label: 'Needs fixing', tone: 'red' },
  duplicate: { label: 'Duplicate in file', tone: 'amber' },
  exists: { label: 'Already registered', tone: 'slate' },
};

export default function ImportWizard({ open, onClose, event, onDone }) {
  const fileRef = useRef(null);
  const [step, setStep] = useState('file'); // file | map | review | done
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [body, setBody] = useState([]);
  const [map, setMap] = useState({});
  const [rows, setRows] = useState([]);
  const [results, setResults] = useState({}); // original index -> {status, errors}
  const [dirty, setDirty] = useState(false);
  const [sendEmails, setSendEmails] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(0);

  const reset = () => {
    setStep('file'); setFileName(''); setHeaders([]); setBody([]); setMap({}); setRows([]); setResults({});
    setDirty(false); setError(''); setCreated(0); setBusy(false);
  };
  const close = () => {
    reset();
    onClose();
  };

  async function pick(file) {
    setError('');
    if (!file) return;
    if (file.size > MAX_BYTES) return setError('That file is larger than 5 MB.');
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const all = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, blankrows: false });
      if (all.length < 2) return setError('The file needs a header row and at least one data row.');
      const head = all[0].map((h) => String(h).trim());
      const data = all.slice(1).filter((r) => r.some((c) => String(c).trim() !== ''));
      if (data.length > 5000) return setError('Please import up to 5000 rows at a time.');
      setFileName(file.name);
      setHeaders(head);
      setBody(data);
      setMap(autoMap(head));
      setStep('map');
    } catch {
      setError('Could not read that file. Use a CSV or Excel (.xlsx) export.');
    }
  }

  const missing = TARGETS.filter(([k, , req]) => req && (map[k] ?? -1) < 0).map(([, l]) => l);

  async function check(list) {
    setBusy(true);
    setError('');
    try {
      const active = list.map((r, i) => [r, i]).filter(([r]) => !r.skip);
      if (active.length === 0) {
        setResults({});
        setDirty(false);
        return;
      }
      const { data } = await api.post(`/events/${event.id}/import`, {
        rows: active.map(([r]) => ({ name: r.name, email: r.email, phone: r.phone, department: r.department, academicYear: r.academicYear, rollNo: r.rollNo })),
        commit: false,
      });
      const out = {};
      for (const res of data.rows) out[active[res.index][1]] = { status: res.status, errors: res.errors };
      setResults(out);
      setDirty(false);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function toReview() {
    const list = body.map((r) => {
      const o = { skip: false };
      for (const [k] of TARGETS) o[k] = (map[k] ?? -1) >= 0 ? String(r[map[k]] ?? '').trim() : '';
      return o;
    });
    setRows(list);
    setStep('review');
    await check(list);
  }

  const edit = (i, patch) => {
    setRows((l) => l.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const counts = useMemo(() => {
    const c = { valid: 0, invalid: 0, duplicate: 0, exists: 0, skipped: 0 };
    rows.forEach((r, i) => {
      if (r.skip) c.skipped++;
      else if (results[i]) c[results[i].status]++;
    });
    return c;
  }, [rows, results]);

  async function commit() {
    setBusy(true);
    setError('');
    try {
      const active = rows.filter((r) => !r.skip);
      const { data } = await api.post(`/events/${event.id}/import`, {
        rows: active.map((r) => ({ name: r.name, email: r.email, phone: r.phone, department: r.department, academicYear: r.academicYear, rollNo: r.rollNo })),
        commit: true,
        sendEmails,
      });
      setCreated(data.summary.created || 0);
      setStep('done');
      onDone?.();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const shown = useMemo(() => {
    const idx = rows.map((_, i) => i);
    idx.sort((a, b) => Number((results[a]?.status === 'valid') || rows[a].skip) - Number((results[b]?.status === 'valid') || rows[b].skip));
    return idx.slice(0, 300);
  }, [rows, results]);

  const footer =
    step === 'map' ? (
      <>
        <Button variant="secondary" onClick={() => setStep('file')}>Back</Button>
        <Button onClick={toReview} disabled={missing.length > 0}>Review {body.length} rows</Button>
      </>
    ) : step === 'review' ? (
      <>
        <Button variant="secondary" onClick={() => setStep('map')} disabled={busy}>Back</Button>
        {dirty && <Button variant="soft" icon={RefreshCw} onClick={() => check(rows)} loading={busy}>Re-check</Button>}
        <Button onClick={commit} loading={busy} disabled={dirty || counts.valid === 0}>
          Import {counts.valid} {counts.valid === 1 ? 'participant' : 'participants'}
        </Button>
      </>
    ) : step === 'done' ? (
      <Button onClick={close}>Close</Button>
    ) : null;

  return (
    <Modal open={open} onClose={close} title="Import participants" size="xl" footer={footer}>
      {step === 'file' && (
        <div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pick(e.dataTransfer.files?.[0]);
            }}
            className="flex w-full flex-col items-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center transition hover:border-brand-400 hover:bg-brand-50/40"
          >
            <span className="mb-3 grid size-14 place-items-center rounded-2xl bg-white text-brand-600 shadow-sm"><Upload className="size-6" /></span>
            <span className="font-semibold text-ink">Choose a CSV or Excel file</span>
            <span className="mt-1 text-sm text-slate-500">or drop it here. Works with a downloaded Google Forms response sheet.</span>
          </button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <p className="mt-4 text-xs text-slate-500">The first row must contain column headers. Rows already registered for this event are skipped, so re-importing is safe.</p>
        </div>
      )}

      {step === 'map' && (
        <div>
          <p className="mb-4 flex items-center gap-2 text-sm text-slate-600"><FileSpreadsheet className="size-4 text-brand-600" /> <b className="text-ink">{fileName}</b> · {body.length} rows</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {TARGETS.map(([k, label, req]) => (
              <label key={k} className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">{label}{req && <span className="text-red-500"> *</span>}</span>
                <Select value={map[k] ?? -1} onChange={(e) => setMap((m) => ({ ...m, [k]: Number(e.target.value) }))}>
                  <option value={-1}>— not in file —</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                  ))}
                </Select>
              </label>
            ))}
          </div>
          {missing.length > 0 && <p className="mt-4 text-sm text-amber-700">Choose a column for: {missing.join(', ')}.</p>}
          <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500"><tr>{headers.map((h, i) => <th key={i} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {body.slice(0, 3).map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">{headers.map((_, j) => <td key={j} className="max-w-[10rem] truncate px-3 py-1.5 text-slate-600">{String(r[j] ?? '')}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge tone="green">{counts.valid} ready</Badge>
            {counts.invalid > 0 && <Badge tone="red">{counts.invalid} need fixing</Badge>}
            {counts.duplicate > 0 && <Badge tone="amber">{counts.duplicate} duplicate</Badge>}
            {counts.exists > 0 && <Badge tone="slate">{counts.exists} already registered</Badge>}
            {counts.skipped > 0 && <Badge tone="slate">{counts.skipped} skipped</Badge>}
            {busy && <span className="text-xs text-slate-500">Checking…</span>}
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Name</th><th className="px-3 py-2 font-medium">Email</th><th className="px-3 py-2 font-medium">Dept · Year</th><th className="px-3 py-2" /></tr>
              </thead>
              <tbody>
                {shown.map((i) => {
                  const r = rows[i];
                  const res = results[i];
                  const s = r.skip ? { label: 'Skipped', tone: 'slate' } : res ? STATUS[res.status] : { label: '…', tone: 'slate' };
                  const fixable = !r.skip && res && res.status !== 'valid';
                  return (
                    <tr key={i} className={`border-t border-slate-100 align-top ${r.skip ? 'opacity-50' : ''}`}>
                      <td className="px-3 py-2">
                        <Badge tone={s.tone}>{s.label}</Badge>
                        {!r.skip && res?.errors?.map((e, k) => <p key={k} className="mt-1 text-xs text-red-600">{e.message}</p>)}
                      </td>
                      <td className="px-3 py-2">{fixable ? <Input value={r.name} onChange={(e) => edit(i, { name: e.target.value })} className="py-1.5" aria-label="Name" /> : r.name}</td>
                      <td className="px-3 py-2">{fixable ? <Input value={r.email} onChange={(e) => edit(i, { email: e.target.value })} className="py-1.5" aria-label="Email" /> : r.email}</td>
                      <td className="px-3 py-2 text-slate-500">{[r.department, r.academicYear].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="ghost" onClick={() => edit(i, { skip: !r.skip })}>{r.skip ? 'Include' : 'Skip'}</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length > shown.length && <p className="mt-2 text-xs text-slate-500">Showing the first {shown.length} rows that need attention. All {rows.length} rows will be processed.</p>}
          <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={sendEmails} onChange={(e) => setSendEmails(e.target.checked)} className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
            E-mail each new participant their QR ticket
          </label>
          {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-col items-center py-10 text-center">
          <span className="pop mb-4 grid size-16 place-items-center rounded-full bg-emerald-100 text-emerald-600"><CheckCircle2 className="size-8" /></span>
          <h3 className="text-lg font-semibold text-ink">{created} {created === 1 ? 'participant' : 'participants'} imported</h3>
          <p className="mt-1 max-w-sm text-sm text-slate-500">Each one now has a personal QR code{sendEmails ? ' and is being e-mailed their ticket' : ''}.</p>
        </div>
      )}
    </Modal>
  );
}

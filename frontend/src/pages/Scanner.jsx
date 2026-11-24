import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { AlertTriangle, Camera, CameraOff, CheckCircle2, Search, SwitchCamera, UserCheck, XCircle } from 'lucide-react';
import { api, errCode, errMsg } from '../api.js';
import EventGate from '../components/EventGate.jsx';
import { Badge, Button, Card, Input, PageHeader, Toggle } from '../components/ui.jsx';
import { useToast } from '../components/toast.jsx';
import { useEvent } from '../eventContext.jsx';
import { fmtTime } from '../format.js';

const TONE = {
  success: { box: 'border-emerald-300 bg-emerald-50', icon: CheckCircle2, ic: 'text-emerald-600', title: 'text-emerald-900' },
  duplicate: { box: 'border-amber-300 bg-amber-50', icon: AlertTriangle, ic: 'text-amber-600', title: 'text-amber-900' },
  error: { box: 'border-red-300 bg-red-50', icon: XCircle, ic: 'text-red-600', title: 'text-red-900' },
};

function feedback(kind) {
  try {
    if (navigator.vibrate) navigator.vibrate(kind === 'success' ? 80 : [120, 60, 120]);
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = kind === 'success' ? 880 : 220;
    g.gain.value = 0.08;
    o.start();
    o.stop(ctx.currentTime + (kind === 'success' ? 0.12 : 0.3));
    setTimeout(() => ctx.close(), 500);
  } catch { /* sound is optional */ }
}

function ScannerInner() {
  const { event, refresh } = useEvent();
  const toast = useToast();
  const [cameras, setCameras] = useState([]);
  const [camIndex, setCamIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [camError, setCamError] = useState('');
  const [result, setResult] = useState(null);
  const [recent, setRecent] = useState([]);
  const [summary, setSummary] = useState(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null);
  const [toggling, setToggling] = useState(false);

  const scannerRef = useRef(null);
  const busy = useRef(false);
  const last = useRef({ token: '', at: 0 });
  const handler = useRef(() => {});
  const resultTimer = useRef(null);

  const loadSummary = useCallback(() => {
    api.get(`/events/${event.id}/attendance/summary`).then((r) => setSummary(r.data)).catch(() => {});
  }, [event.id]);
  useEffect(loadSummary, [loadSummary]);

  const show = useCallback((r) => {
    setResult(r);
    clearTimeout(resultTimer.current);
    resultTimer.current = setTimeout(() => setResult(null), r.kind === 'success' ? 4000 : 6000);
  }, []);

  handler.current = async (text) => {
    const now = Date.now();
    if (busy.current) return;
    if (last.current.token === text && now - last.current.at < 3500) return; // same code still in frame
    busy.current = true;
    last.current = { token: text, at: now };
    try {
      const { data } = await api.post(`/events/${event.id}/attendance/scan`, { token: text });
      feedback('success');
      show({ kind: 'success', title: 'Checked in', person: data.registration, text: 'Welcome!' });
      setRecent((l) => [{ id: now, name: data.registration.name, time: new Date(), ok: true }, ...l].slice(0, 8));
    } catch (err) {
      const code = errCode(err);
      const e = err.response?.data?.error;
      const person = e?.details?.person;
      feedback('error');
      if (code === 'ALREADY_PRESENT') {
        show({ kind: 'duplicate', title: 'Already checked in', person, text: e.details?.checkInAt ? `First scanned at ${fmtTime(e.details.checkInAt)}` : '' });
        setRecent((l) => [{ id: now, name: person?.name || 'Duplicate', time: new Date(), ok: false, note: 'duplicate' }, ...l].slice(0, 8));
      } else {
        show({ kind: 'error', title: { INVALID_QR: 'Invalid QR code', WRONG_EVENT: 'Wrong event', QR_REVOKED: 'QR revoked', NOT_CONFIRMED: 'Not confirmed', ATTENDANCE_CLOSED: 'Attendance is closed' }[code] || 'Scan failed', person, text: errMsg(err) });
        setRecent((l) => [{ id: now, name: person?.name || 'Rejected scan', time: new Date(), ok: false, note: code }, ...l].slice(0, 8));
        if (code === 'ATTENDANCE_CLOSED') refresh();
      }
    } finally {
      busy.current = false;
      loadSummary();
    }
  };

  const stop = useCallback(async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (s) {
      try { await s.stop(); } catch { /* already stopped */ }
      try { s.clear(); } catch { /* ignore */ }
    }
    setRunning(false);
  }, []);

  const start = useCallback(
    async (index = camIndex) => {
      setCamError('');
      setStarting(true);
      try {
        await stop();
        const list = cameras.length ? cameras : await Html5Qrcode.getCameras();
        setCameras(list);
        const s = new Html5Qrcode('qr-reader', { verbose: false });
        scannerRef.current = s;
        const cfg = list[index] ? { deviceId: { exact: list[index].id } } : { facingMode: 'environment' };
        await s.start(
          cfg,
          { fps: 10, qrbox: (w, h) => { const m = Math.floor(Math.min(w, h) * 0.72); return { width: m, height: m }; } },
          (t) => handler.current(t),
          () => {},
        );
        setRunning(true);
      } catch (err) {
        scannerRef.current = null;
        const msg = String(err?.message || err);
        setCamError(/permission|denied|notallowed/i.test(msg) ? 'Camera access was blocked. Allow the camera in your browser settings and try again.' : /secure|https/i.test(msg) ? 'The camera only works on https:// pages.' : /not ?found|no camera|requested device/i.test(msg) ? 'No camera was found on this device.' : `Could not start the camera. ${msg}`);
      } finally {
        setStarting(false);
      }
    },
    [camIndex, cameras, stop],
  );

  useEffect(() => () => { stop(); clearTimeout(resultTimer.current); }, [stop]);

  async function switchCamera() {
    if (cameras.length < 2) return;
    const next = (camIndex + 1) % cameras.length;
    setCamIndex(next);
    await start(next);
  }

  async function toggleOpen(v) {
    setToggling(true);
    try {
      await api.put(`/events/${event.id}/attendance/state`, { open: v });
      await refresh();
      loadSummary();
      toast.success(v ? 'Attendance is open' : 'Attendance closed');
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setToggling(false);
    }
  }

  // manual lookup
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setFound(null); return undefined; }
    const t = setTimeout(() => {
      api.get(`/events/${event.id}/registrations`, { params: { search: term, status: 'registered', limit: 6, sort: 'name' } }).then((r) => setFound(r.data.items)).catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, event.id]);

  async function markManual(row) {
    try {
      await api.post(`/events/${event.id}/attendance/manual`, { registrationDbId: row.id, reason: 'Manual check-in at the door' });
      toast.success(`${row.name} marked present`);
      setRecent((l) => [{ id: Date.now(), name: row.name, time: new Date(), ok: true, note: 'manual' }, ...l].slice(0, 8));
      setQ('');
      setFound(null);
      loadSummary();
    } catch (err) {
      toast[errCode(err) === 'ALREADY_PRESENT' ? 'info' : 'error'](errCode(err) === 'ALREADY_PRESENT' ? `${row.name} is already checked in` : errMsg(err));
      setFound((l) => l);
    }
  }

  const open = event.attendanceOpen;
  const tone = result && TONE[result.kind];

  return (
    <div className="rise mx-auto max-w-5xl">
      <PageHeader title="Scanner" subtitle={event.name} />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4">
          <Card className="p-4">
            <Toggle checked={open} disabled={toggling} onChange={toggleOpen} label={open ? 'Attendance is open' : 'Attendance is closed'} description={open ? 'Scanned codes are being accepted.' : 'Turn on to start accepting scans.'} />
          </Card>

          <Card className="overflow-hidden">
            <div className="relative bg-ink">
              <div id="qr-reader" className={running ? 'min-h-[16rem]' : 'hidden'} />
              {running && <div className="pointer-events-none absolute inset-x-[14%] top-0 bottom-0"><div className="scanline absolute inset-x-0 h-0.5 bg-brand-400/80 shadow-[0_0_12px_2px] shadow-brand-400/60" /></div>}
              {!running && (
                <div className="grid min-h-[16rem] place-items-center px-6 py-10 text-center text-white">
                  <div>
                    <span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-white/10">{camError ? <CameraOff className="size-7 text-red-300" /> : <Camera className="size-7 text-brand-200" />}</span>
                    <p className="font-semibold">{camError ? 'Camera unavailable' : 'Ready to scan'}</p>
                    <p className="mx-auto mt-1 max-w-xs text-sm text-white/60">{camError || 'Point the camera at a participant’s QR code. Works on a phone or laptop.'}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 p-3">
              {running ? <Button variant="secondary" onClick={stop}>Stop camera</Button> : <Button icon={Camera} loading={starting} onClick={() => start()}>{camError ? 'Try again' : 'Start camera'}</Button>}
              {running && cameras.length > 1 && <Button variant="secondary" icon={SwitchCamera} onClick={switchCamera}>Switch camera</Button>}
              {!open && <Badge tone="amber">Attendance is closed. Scans will be rejected.</Badge>}
            </div>
          </Card>

          {result && (
            <div role="status" aria-live="assertive" className={`pop flex items-start gap-4 rounded-2xl border-2 p-5 ${tone.box}`}>
              <tone.icon className={`size-10 shrink-0 ${tone.ic}`} />
              <div className="min-w-0">
                <p className={`text-xl font-bold ${tone.title}`}>{result.title}</p>
                {result.person && (
                  <>
                    <p className="mt-1 truncate text-lg font-semibold text-ink">{result.person.name}</p>
                    <p className="text-sm text-slate-600">{[result.person.department, result.person.academicYear].filter(Boolean).join(' · ')}</p>
                    <p className="font-mono text-xs text-slate-500">{result.person.registrationId}</p>
                  </>
                )}
                {result.text && <p className="mt-1 text-sm text-slate-700">{result.text}</p>}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              ['Present', summary?.present, 'text-emerald-600'],
              ['Remaining', summary?.absent, 'text-ink'],
              ['Rate', summary ? `${summary.rate}%` : undefined, 'text-brand-600'],
            ].map(([l, v, c]) => (
              <Card key={l} className="p-3 text-center">
                <p className={`text-2xl font-bold tabular-nums ${c}`}>{v ?? '–'}</p>
                <p className="text-xs text-slate-500">{l}</p>
              </Card>
            ))}
          </div>

          <Card className="p-4">
            <h2 className="mb-1 flex items-center gap-2 font-semibold text-ink"><UserCheck className="size-4 text-brand-600" /> Manual check-in</h2>
            <p className="mb-3 text-xs text-slate-500">Lost phone or damaged code? Find the person and mark them present.</p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, e-mail or ID…" className="pl-9" aria-label="Find a participant" />
            </div>
            {found && (
              <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {found.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">No confirmed participant found.</li>}
                {found.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{r.name}</p>
                      <p className="truncate text-xs text-slate-500">{r.registrationId} · {r.department || r.email}</p>
                    </div>
                    {r.attendanceStatus === 'present' ? <Badge tone="green">Present</Badge> : <Button size="sm" onClick={() => markManual(r)}>Mark present</Button>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <div className="border-b border-slate-100 px-4 py-3"><h2 className="font-semibold text-ink">This session</h2></div>
            {recent.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Scans will appear here.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                    {r.ok ? <CheckCircle2 className="size-4 shrink-0 text-emerald-500" /> : <XCircle className="size-4 shrink-0 text-amber-500" />}
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{r.name}{r.note && <span className="ml-1.5 text-xs text-slate-400">({r.note})</span>}</span>
                    <span className="text-xs text-slate-400">{fmtTime(r.time)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function Scanner() {
  return (
    <EventGate title="Scanner">
      <ScannerInner />
    </EventGate>
  );
}

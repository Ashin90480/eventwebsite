import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Download, FileSpreadsheet, Pencil } from 'lucide-react';
import { api, download, errMsg } from '../api.js';
import EventGate from '../components/EventGate.jsx';
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Modal, PageHeader, Pagination, ProgressBar, Select, Skeleton, Stat, Textarea } from '../components/ui.jsx';
import { useToast } from '../components/toast.jsx';
import { useEvent } from '../eventContext.jsx';
import { fmtDateTime } from '../format.js';
import { CheckCircle2, ListOrdered, Users, XCircle } from 'lucide-react';

const EXPORTS = [
  ['participants', 'All participants'],
  ['attendance', 'Attendance (confirmed)'],
  ['present', 'Present only'],
  ['absent', 'Absent only'],
];

function Timeline({ points }) {
  if (!points.length) return <p className="py-6 text-center text-sm text-slate-500">No check-ins recorded yet.</p>;
  const max = Math.max(...points.map((p) => p.count));
  return (
    <div className="flex h-40 items-end gap-2 overflow-x-auto pb-6 pt-2">
      {points.map((p) => (
        <div key={p.hour} className="relative flex h-full min-w-[2.5rem] flex-1 flex-col justify-end">
          <span className="mb-1 text-center text-xs font-semibold tabular-nums text-ink">{p.count}</span>
          <div className="rounded-t-md bg-brand-500" style={{ height: `${Math.max(6, (p.count / max) * 100)}%` }} title={`${p.count} check-ins`} />
          <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] text-slate-500">{p.hour.slice(11, 13)}:00</span>
        </div>
      ))}
    </div>
  );
}

function ReportsInner() {
  const { event, refresh } = useEvent();
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [dept, setDept] = useState('');
  const [year, setYear] = useState('');
  const [meta, setMeta] = useState({ departments: [], academicYears: [] });
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState('');
  const [log, setLog] = useState(null);
  const [logFilter, setLogFilter] = useState('');
  const [logPage, setLogPage] = useState(1);
  const [fix, setFix] = useState(null);
  const [fixStatus, setFixStatus] = useState('absent');
  const [fixReason, setFixReason] = useState('');
  const [fixBusy, setFixBusy] = useState(false);

  useEffect(() => {
    api.get(`/events/${event.id}/registrations/meta`).then((r) => setMeta(r.data)).catch(() => {});
  }, [event.id]);

  const loadSummary = useCallback(() => {
    setError('');
    api
      .get(`/events/${event.id}/reports/summary`, { params: { department: dept || undefined, academicYear: year || undefined } })
      .then((r) => setSummary(r.data.summary))
      .catch((e) => setError(errMsg(e)));
  }, [event.id, dept, year]);
  useEffect(loadSummary, [loadSummary]);

  const loadLog = useCallback(() => {
    api
      .get(`/events/${event.id}/attendance`, { params: { department: dept || undefined, academicYear: year || undefined, attendance: logFilter || undefined, page: logPage, limit: 25 } })
      .then((r) => setLog(r.data))
      .catch((e) => setError(errMsg(e)));
  }, [event.id, dept, year, logFilter, logPage]);
  useEffect(() => { if (tab === 'log') loadLog(); }, [tab, loadLog]);
  useEffect(() => setLogPage(1), [dept, year, logFilter]);

  async function exportFile(format, type) {
    const key = `${format}-${type}`;
    setExporting(key);
    try {
      await download(`/events/${event.id}/reports/export`, { format, type, department: dept || undefined, academicYear: year || undefined }, `report.${format}`);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setExporting('');
    }
  }

  async function saveFix() {
    if (fixReason.trim().length < 3) return toast.error('Please give a short reason.');
    setFixBusy(true);
    try {
      await api.patch(`/events/${event.id}/attendance/${fix.attendanceId}`, { status: fixStatus, reason: fixReason.trim() });
      toast.success('Attendance corrected and logged');
      setFix(null);
      loadLog();
      loadSummary();
      refresh();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setFixBusy(false);
    }
  }

  const s = summary;
  const filters = (
    <div className="mb-5 flex flex-wrap gap-3">
      <Select value={dept} onChange={(e) => setDept(e.target.value)} className="w-48" aria-label="Department"><option value="">All departments</option>{meta.departments.map((d) => <option key={d}>{d}</option>)}</Select>
      <Select value={year} onChange={(e) => setYear(e.target.value)} className="w-40" aria-label="Year"><option value="">All years</option>{meta.academicYears.map((d) => <option key={d}>{d}</option>)}</Select>
    </div>
  );

  return (
    <div className="rise">
      <PageHeader title="Reports" subtitle={event.name} />

      <div className="mb-5 inline-flex gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200" role="tablist">
        {[['overview', 'Overview'], ['log', 'Attendance log'], ['export', 'Export']].map(([v, l]) => (
          <button key={v} role="tab" aria-selected={tab === v} onClick={() => setTab(v)} className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${tab === v ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{l}</button>
        ))}
      </div>

      {error && <ErrorNote onRetry={loadSummary}>{error}</ErrorNote>}

      {tab === 'overview' && (
        <>
          {filters}
          {!s ? (
            <div className="grid gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Stat label="Confirmed" value={s.registered} icon={Users} />
                <Stat label="Present" value={s.present} icon={CheckCircle2} tone="green" />
                <Stat label="Absent" value={s.absent} icon={XCircle} tone="slate" />
                <Stat label="Attendance rate" value={`${s.rate}%`} icon={BarChart3} tone="blue" />
              </div>
              {(s.byStatus.pending > 0 || s.byStatus.waitlisted > 0 || s.byStatus.rejected > 0 || s.byStatus.cancelled > 0) && (
                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  <ListOrdered className="size-4 text-slate-400" /> Not counted above:
                  {s.byStatus.pending > 0 && <Badge tone="amber">{s.byStatus.pending} pending</Badge>}
                  {s.byStatus.waitlisted > 0 && <Badge tone="blue">{s.byStatus.waitlisted} waitlisted</Badge>}
                  {s.byStatus.rejected > 0 && <Badge tone="red">{s.byStatus.rejected} rejected</Badge>}
                  {s.byStatus.cancelled > 0 && <Badge tone="slate">{s.byStatus.cancelled} cancelled</Badge>}
                </div>
              )}

              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <Card className="p-5">
                  <h2 className="mb-4 font-semibold text-ink">By department</h2>
                  {s.departments.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No confirmed participants yet.</p> : (
                    <ul className="space-y-4">
                      {s.departments.map((d) => (
                        <li key={d.department}>
                          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                            <span className="truncate font-medium text-ink">{d.department}</span>
                            <span className="shrink-0 text-xs tabular-nums text-slate-500">{d.present}/{d.registered} · {d.rate}%</span>
                          </div>
                          <ProgressBar value={d.present} max={d.registered} />
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
                <Card className="p-5">
                  <h2 className="mb-1 font-semibold text-ink">Check-ins by hour</h2>
                  <Timeline points={s.timeline} />
                </Card>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'log' && (
        <>
          <div className="mb-5 flex flex-wrap gap-3">
            <Select value={logFilter} onChange={(e) => setLogFilter(e.target.value)} className="w-40" aria-label="Attendance"><option value="">Everyone</option><option value="present">Present</option><option value="absent">Not present</option></Select>
            <Select value={dept} onChange={(e) => setDept(e.target.value)} className="w-48" aria-label="Department"><option value="">All departments</option>{meta.departments.map((d) => <option key={d}>{d}</option>)}</Select>
            <Select value={year} onChange={(e) => setYear(e.target.value)} className="w-40" aria-label="Year"><option value="">All years</option>{meta.academicYears.map((d) => <option key={d}>{d}</option>)}</Select>
          </div>
          {!log ? <Skeleton className="h-64" /> : log.items.length === 0 ? (
            <Card><EmptyState icon={Users} title="Nothing to show" text="No confirmed participants match these filters." /></Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[46rem] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                    <tr><th className="px-4 py-3 font-medium">Participant</th><th className="px-3 py-3 font-medium">Department</th><th className="px-3 py-3 font-medium">Attendance</th><th className="px-3 py-3 font-medium">Checked in</th><th className="px-3 py-3 font-medium">Method</th><th className="px-3 py-3" /></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {log.items.map((r) => (
                      <tr key={r.id}>
                        <td className="px-4 py-3"><p className="font-medium text-ink">{r.name}</p><p className="font-mono text-[11px] text-slate-400">{r.registrationId}</p></td>
                        <td className="px-3 py-3 text-slate-600">{r.department || '—'}</td>
                        <td className="px-3 py-3">{r.attendanceStatus === 'present' ? <Badge tone="green" dot>Present</Badge> : <Badge tone="slate">{r.attendanceId ? 'Absent (corrected)' : 'Absent'}</Badge>}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">{r.checkInAt && r.attendanceStatus === 'present' ? fmtDateTime(r.checkInAt) : '—'}</td>
                        <td className="px-3 py-3 text-xs text-slate-500">{r.attendanceId ? <>{r.method}{r.markedBy ? ` · ${r.markedBy}` : ''}{r.reason && <p className="max-w-[14rem] truncate text-slate-400" title={r.reason}>“{r.reason}”</p>}</> : '—'}</td>
                        <td className="px-3 py-2 text-right">
                          {r.attendanceId && <Button size="sm" variant="ghost" icon={Pencil} onClick={() => { setFix(r); setFixStatus(r.attendanceStatus === 'present' ? 'absent' : 'present'); setFixReason(''); }}>Correct</Button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-slate-100 px-4 py-3"><Pagination page={log.page} pages={log.pages} total={log.total} label="participants" onChange={setLogPage} /></div>
            </Card>
          )}
        </>
      )}

      {tab === 'export' && (
        <>
          {filters}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-1 flex items-center gap-2 font-semibold text-ink"><FileSpreadsheet className="size-4 text-brand-600" /> Excel workbook</h2>
              <p className="mb-4 text-sm text-slate-500">Five sheets: Summary, Participants, Present, Absent and Departments.</p>
              <Button icon={Download} loading={exporting === 'xlsx-participants'} onClick={() => exportFile('xlsx', 'participants')}>Download .xlsx</Button>
            </Card>
            <Card className="p-5">
              <h2 className="mb-1 flex items-center gap-2 font-semibold text-ink"><Download className="size-4 text-brand-600" /> CSV</h2>
              <p className="mb-4 text-sm text-slate-500">Plain lists that open anywhere. Custom question answers are included.</p>
              <div className="flex flex-wrap gap-2">
                {EXPORTS.map(([t, l]) => (
                  <Button key={t} size="sm" variant="secondary" loading={exporting === `csv-${t}`} onClick={() => exportFile('csv', t)}>{l}</Button>
                ))}
              </div>
            </Card>
          </div>
          {(dept || year) && <p className="mt-4 text-xs text-slate-500">Exports use the department and year filters above.</p>}
        </>
      )}

      <Modal
        open={Boolean(fix)}
        onClose={() => setFix(null)}
        title="Correct attendance"
        size="sm"
        footer={<><Button variant="secondary" onClick={() => setFix(null)} disabled={fixBusy}>Cancel</Button><Button onClick={saveFix} loading={fixBusy}>Save correction</Button></>}
      >
        {fix && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600"><b className="text-ink">{fix.name}</b> ({fix.registrationId})</p>
            <Field label="Mark as"><Select value={fixStatus} onChange={(e) => setFixStatus(e.target.value)}><option value="present">Present</option><option value="absent">Absent</option></Select></Field>
            <Field label="Reason" required hint="Recorded in the event’s activity log."><Textarea value={fixReason} onChange={(e) => setFixReason(e.target.value)} rows={2} maxLength={300} /></Field>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function Reports() {
  return (
    <EventGate title="Reports">
      <ReportsInner />
    </EventGate>
  );
}

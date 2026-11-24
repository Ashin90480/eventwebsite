import { useCallback, useEffect, useState } from 'react';
import { Download, FileArchive, Printer, QrCode } from 'lucide-react';
import { api, download, errMsg } from '../api.js';
import EventGate from '../components/EventGate.jsx';
import { Badge, Button, Card, EmptyState, ErrorNote, PageHeader, Pagination, Skeleton } from '../components/ui.jsx';
import { useToast } from '../components/toast.jsx';
import { useEvent } from '../eventContext.jsx';
import { downloadDataUrl, fmtRange } from '../format.js';

function QrCard({ q, event }) {
  return (
    <div className="break-inside-avoid rounded-xl border border-slate-200 bg-white p-3 text-center print:rounded-none print:border-slate-400">
      <p className="mb-2 truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{event.name}</p>
      {q.dataUrl ? <img src={q.dataUrl} alt={`QR code for ${q.name}`} className="mx-auto aspect-square w-full max-w-[11rem]" /> : <div className="mx-auto grid aspect-square w-full max-w-[11rem] place-items-center rounded bg-red-50 text-xs text-red-700">Revoked</div>}
      <p className="mt-2 truncate text-sm font-bold text-ink">{q.name}</p>
      <p className="truncate text-xs text-slate-500">{[q.department, q.academicYear].filter(Boolean).join(' · ') || ' '}</p>
      <p className="mt-0.5 font-mono text-[11px] text-slate-400">{q.registrationId}</p>
      {q.dataUrl && (
        <button onClick={() => downloadDataUrl(q.dataUrl, `${q.registrationId}.png`)} className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 print:hidden">
          <Download className="size-3" /> PNG
        </button>
      )}
    </div>
  );
}

function QRInner() {
  const { event } = useEvent();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [all, setAll] = useState(null); // full list while printing
  const [error, setError] = useState('');
  const [zipping, setZipping] = useState(false);
  const [preparing, setPreparing] = useState(false);

  const load = useCallback(() => {
    setError('');
    api
      .get(`/events/${event.id}/qr-codes`, { params: { page, limit: 24 } })
      .then((r) => setData(r.data))
      .catch((e) => setError(errMsg(e)));
  }, [event.id, page]);
  useEffect(load, [load]);

  useEffect(() => {
    const done = () => setAll(null);
    window.addEventListener('afterprint', done);
    return () => window.removeEventListener('afterprint', done);
  }, []);

  async function printAll() {
    setPreparing(true);
    try {
      const items = [];
      for (let p = 1, pages = 1; p <= pages; p++) {
        const { data: r } = await api.get(`/events/${event.id}/qr-codes`, { params: { page: p, limit: 60 } });
        items.push(...r.items);
        pages = r.pages;
      }
      setAll(items);
      setTimeout(() => window.print(), 500);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setPreparing(false);
    }
  }

  async function zip() {
    setZipping(true);
    try {
      await download(`/events/${event.id}/qr-codes.zip`, undefined, 'qr-codes.zip');
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setZipping(false);
    }
  }

  const items = all || data?.items || [];

  return (
    <div className="rise">
      <div className="print:hidden">
        <PageHeader
          title="QR codes"
          subtitle={`${event.name} · confirmed participants only`}
          actions={
            <>
              <Button variant="secondary" icon={FileArchive} loading={zipping} onClick={zip}>Download ZIP</Button>
              <Button icon={Printer} loading={preparing} onClick={printAll} disabled={!data?.total}>Print all cards</Button>
            </>
          }
        />
        <p className="mb-5 text-sm text-slate-500">QR tickets are e-mailed automatically after registration. Use this page to print cards for people without e-mail or to hand out at the door.</p>
        {error && <ErrorNote onRetry={load}>{error}</ErrorNote>}
      </div>

      <div className="mb-4 hidden print:block">
        <h1 className="text-lg font-bold">{event.name}</h1>
        <p className="text-sm text-slate-600">{fmtRange(event.startAt, event.endAt)}{event.venue ? ` · ${event.venue}` : ''}</p>
      </div>

      {!data && !error && <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-56" />)}</div>}
      {data && data.total === 0 && (
        <Card className="print:hidden">
          <EmptyState icon={QrCode} title="No QR codes yet" text="QR codes appear here once participants are confirmed." />
        </Card>
      )}
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3 print:gap-2">
          {items.map((q) => <QrCard key={q.id} q={q} event={event} />)}
        </div>
      )}
      {data && !all && (
        <div className="mt-6 print:hidden">
          <Pagination page={data.page} pages={data.pages} total={data.total} label="codes" onChange={setPage} />
        </div>
      )}
      {data?.items?.some((q) => q.qrRevoked) && <p className="mt-4 print:hidden"><Badge tone="red">Revoked codes cannot be scanned</Badge></p>}
    </div>
  );
}

export default function QRCodes() {
  return (
    <EventGate title="QR codes">
      <QRInner />
    </EventGate>
  );
}

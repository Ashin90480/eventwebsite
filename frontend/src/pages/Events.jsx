import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarDays, Clock, Link2, MapPin, Plus, Search } from 'lucide-react';
import { api, errMsg } from '../api.js';
import EventForm from '../components/EventForm.jsx';
import { Badge, Button, Card, CopyButton, EmptyState, ErrorNote, Input, Modal, PageHeader, Pagination, ProgressBar, Select, Skeleton } from '../components/ui.jsx';
import { useToast } from '../components/toast.jsx';
import { useEvent } from '../eventContext.jsx';
import { EVENT_STATUS, fmtDateTime, publicRegistrationUrl } from '../format.js';

const FILTERS = [
  ['', 'All'],
  ['upcoming', 'Upcoming'],
  ['ongoing', 'Live now'],
  ['completed', 'Completed'],
  ['draft', 'Drafts'],
  ['cancelled', 'Cancelled'],
];

function EventCard({ e, onOpen }) {
  const c = e.counts || {};
  const r = e.registrationState || {};
  const registrationUrl = publicRegistrationUrl(e);
  return (
    <Card className="group flex flex-col overflow-hidden transition hover:border-brand-200 hover:shadow-md">
      <button onClick={() => onOpen(e.id)} className="flex flex-1 flex-col text-left">
        <div className="relative h-28 bg-gradient-to-br from-brand-700 via-brand-600 to-brand-400">
          {e.posterUrl && <img src={e.posterUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" onError={(ev) => (ev.currentTarget.style.display = 'none')} />}
          <div className="absolute inset-0 bg-gradient-to-t from-ink/60 to-transparent" />
          <div className="absolute left-3 top-3">
            <Badge tone={EVENT_STATUS[e.status]?.tone} className="bg-white/95">
              {EVENT_STATUS[e.status]?.label}
            </Badge>
          </div>
        </div>
        <div className="flex flex-1 flex-col p-4">
          <h3 className="line-clamp-2 font-semibold leading-snug text-ink">{e.name}</h3>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <Clock className="size-3.5 shrink-0" /> {fmtDateTime(e.startAt)}
          </p>
          {e.venue && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <MapPin className="size-3.5 shrink-0" /> <span className="truncate">{e.venue}</span>
            </p>
          )}
          <div className="mt-4 flex-1" />
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="text-slate-500">
              <b className="text-ink">{c.registered || 0}</b> confirmed{e.registration?.capacity ? ` / ${e.registration.capacity} seats` : ''}
            </span>
            <span className="text-slate-500">{c.present || 0} in</span>
          </div>
          <ProgressBar value={c.registered || 0} max={e.registration?.capacity || c.registered || 1} tone={r.full ? 'amber' : 'brand'} />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {c.pending > 0 && <Badge tone="amber">{c.pending} to approve</Badge>}
            {c.waitlisted > 0 && <Badge tone="blue">{c.waitlisted} waitlisted</Badge>}
            {r.open ? <Badge tone="green" dot>Registration open</Badge> : <Badge tone="slate">Registration closed</Badge>}
          </div>
        </div>
      </button>
      {registrationUrl && (
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-2">
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
            <Link2 className="size-3.5 shrink-0" /> <span className="truncate">Registration link</span>
          </span>
          <CopyButton text={registrationUrl} label="Copy" variant="ghost" />
        </div>
      )}
    </Card>
  );
}

export default function Events() {
  const navigate = useNavigate();
  const toast = useToast();
  const { select, reloadEvents } = useEvent();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(params.get('new') === '1');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [debounced, status]);

  useEffect(() => {
    let active = true;
    setError('');
    setLoading(true);
    const timeout = window.setTimeout(() => {
      if (!active) return;
      setError('Events are taking too long to load. Check your connection and try again.');
      setLoading(false);
    }, 15000);

    api
      .get('/events', { params: { search: debounced || undefined, status: status || undefined, page, limit: 12 } })
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
  }, [debounced, status, page, loadAttempt]);

  const open = (id) => {
    select(id);
    navigate(`/events/${id}`);
  };

  async function create(payload) {
    try {
      const { data: res } = await api.post('/events', payload);
      toast.success('Event created. Share the registration link to start collecting sign-ups.');
      setCreating(false);
      setParams({}, { replace: true });
      reloadEvents();
      open(res.event.id);
    } catch (err) {
      throw new Error(errMsg(err));
    }
  }

  return (
    <div className="rise">
      <PageHeader title="Events" subtitle="Create events, share registration links and track attendance." actions={<Button icon={Plus} onClick={() => setCreating(true)}>New event</Button>} />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search events…" className="pl-9" aria-label="Search events" />
        </div>
        <div className="hidden gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200 md:flex" role="tablist">
          {FILTERS.map(([v, l]) => (
            <button key={v} role="tab" aria-selected={status === v} onClick={() => setStatus(v)} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${status === v ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {l}
            </button>
          ))}
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40 md:hidden" aria-label="Filter by status">
          {FILTERS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </div>

      {error && <ErrorNote onRetry={() => setLoadAttempt((n) => n + 1)}>{error}</ErrorNote>}
      {loading && !data && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      )}
      {data && data.items.length === 0 && (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title={debounced || status ? 'No events match' : 'No events yet'}
            text={debounced || status ? 'Try a different search or filter.' : 'Create your first event to get a shareable registration page.'}
            action={!debounced && !status && <Button icon={Plus} onClick={() => setCreating(true)}>Create event</Button>}
          />
        </Card>
      )}
      {data && data.items.length > 0 && (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((e) => (
              <EventCard key={e.id} e={e} onOpen={open} />
            ))}
          </div>
          <div className="mt-6">
            <Pagination page={data.page} pages={data.pages} total={data.total} label="events" onChange={setPage} />
          </div>
        </>
      )}

      <Modal
        open={creating}
        onClose={() => {
          setCreating(false);
          setParams({}, { replace: true });
        }}
        title="New event"
        size="lg"
      >
        <EventForm onSubmit={create} onCancel={() => setCreating(false)} submitLabel="Create event" />
      </Modal>
    </div>
  );
}

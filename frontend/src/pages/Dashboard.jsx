import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Clock, ListOrdered, Plus, TrendingUp, UserCheck, Users } from 'lucide-react';
import { api, errMsg } from '../api.js';
import { Badge, Button, Card, EmptyState, ErrorNote, PageHeader, ProgressBar, Skeleton, Stat } from '../components/ui.jsx';
import { useAuth } from '../auth.jsx';
import { useEvent } from '../eventContext.jsx';
import { EVENT_STATUS, fmtDateTime, timeAgo } from '../format.js';

function EventRow({ e, onOpen }) {
  const c = e.counts || {};
  return (
    <button onClick={() => onOpen(e.id)} className="flex w-full items-center gap-4 px-4 py-3 text-left transition hover:bg-slate-50">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink">{e.name}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
          <Clock className="size-3.5" /> {fmtDateTime(e.startAt)}
        </p>
      </div>
      <div className="hidden w-28 sm:block">
        <p className="mb-1 text-right text-xs text-slate-500 tabular-nums">
          {c.present || 0}/{c.registered || 0} in
        </p>
        <ProgressBar value={c.present || 0} max={c.registered || 0} />
      </div>
      <Badge tone={EVENT_STATUS[e.status]?.tone}>{EVENT_STATUS[e.status]?.label}</Badge>
    </button>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { select } = useEvent();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    api
      .get('/dashboard')
      .then((r) => setData(r.data))
      .catch((e) => setError(errMsg(e)));
  };
  useEffect(load, []);

  const open = (id) => {
    select(id);
    navigate(`/events/${id}`);
  };
  const t = data?.totals;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="rise">
      <PageHeader
        title={`${greet}, ${(user?.name || '').split(' ')[0] || 'there'}`}
        subtitle="Here is what is happening across your events."
        actions={
          <Link to="/events?new=1">
            <Button icon={Plus}>New event</Button>
          </Link>
        }
      />
      {error && <ErrorNote onRetry={load}>{error}</ErrorNote>}

      {!data && !error ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Events" value={t.events} sub={`${t.upcoming} upcoming`} icon={CalendarDays} />
              <Stat label="Confirmed registrations" value={t.registrations} icon={Users} tone="blue" />
              <Stat label="Checked in" value={t.checkIns} sub={`${t.attendanceRate}% attendance`} icon={UserCheck} tone="green" />
              <Stat label="Waiting for you" value={t.pendingApprovals + t.waitlisted} sub={`${t.pendingApprovals} to approve · ${t.waitlisted} waitlisted`} icon={ListOrdered} tone="amber" />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-5">
              <Card className="lg:col-span-3">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <h2 className="font-semibold text-ink">Upcoming and live</h2>
                  <Link to="/events" className="text-sm font-medium text-brand-700 hover:underline">
                    All events
                  </Link>
                </div>
                {data.upcoming.length === 0 ? (
                  <EmptyState icon={CalendarDays} title="Nothing scheduled" text="Create an event and share its registration link." action={<Link to="/events?new=1"><Button icon={Plus}>Create event</Button></Link>} />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {data.upcoming.map((e) => (
                      <EventRow key={e.id} e={e} onOpen={open} />
                    ))}
                  </div>
                )}
              </Card>

              <Card className="lg:col-span-2">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h2 className="font-semibold text-ink">Recent check-ins</h2>
                </div>
                {data.recentCheckIns.length === 0 ? (
                  <EmptyState icon={TrendingUp} title="No check-ins yet" text="Scanned attendance will show up here." />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {data.recentCheckIns.map((c) => (
                      <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                        <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{c.name}</p>
                          <p className="truncate text-xs text-slate-500">{c.eventName}</p>
                        </div>
                        <span className="shrink-0 text-xs text-slate-400">{timeAgo(c.checkInAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            {data.recent.length > 0 && (
              <Card className="mt-6">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h2 className="font-semibold text-ink">Recently created</h2>
                </div>
                <div className="divide-y divide-slate-100">
                  {data.recent.map((e) => (
                    <EventRow key={e.id} e={e} onOpen={open} />
                  ))}
                </div>
              </Card>
            )}
          </>
        )
      )}
    </div>
  );
}

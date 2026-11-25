import { Link } from 'react-router-dom';
import { CalendarDays, Plus } from 'lucide-react';
import { useEvent } from '../eventContext.jsx';
import { EVENT_STATUS, fmtDateTime } from '../format.js';
import { Badge, Button, Card, EmptyState, ErrorNote, PageHeader, PageLoader } from './ui.jsx';

/** Wraps pages that need a selected event; shows a picker instead when none is chosen. */
export default function EventGate({ children, title }) {
  const { eventId, event, events, eventsLoading, eventsError, loading, failed, select, refresh, reloadEvents } = useEvent();

  if (eventId && failed && !event) return <ErrorNote onRetry={refresh}>Could not load this event.</ErrorNote>;
  if (eventId && (loading || !event)) return <PageLoader label="Loading event…" />;
  if (event) return children;
  if (eventsLoading && events.length === 0) return <PageLoader label="Loading your events…" />;

  return (
    <div className="rise">
      <PageHeader title={title || 'Choose an event'} subtitle="Pick the event you want to work on." />
      {eventsError && <div className="mb-4"><ErrorNote onRetry={reloadEvents}>{eventsError}</ErrorNote></div>}
      {events.length === 0 && !eventsError ? (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title="No events yet"
            text="Create your first event to start collecting registrations."
            action={
              <Link to="/events?new=1">
                <Button icon={Plus}>Create event</Button>
              </Link>
            }
          />
        </Card>
      ) : events.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {events.map((e) => (
            <button key={e.id} onClick={() => select(e.id)} className="text-left">
              <Card className="p-4 transition hover:border-brand-300 hover:shadow">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-ink">{e.name}</p>
                  <Badge tone={EVENT_STATUS[e.status]?.tone}>{EVENT_STATUS[e.status]?.label}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-500">{fmtDateTime(e.startAt)}</p>
              </Card>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, errMsg } from './api.js';

const Ctx = createContext(null);
const KEY = 'eventqr_event';
const read = () => {
  try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
};

/** Holds the event the coordinator is currently working on (persisted across reloads). */
export function EventProvider({ children }) {
  const [eventId, setEventId] = useState(read);
  const [event, setEvent] = useState(null);
  const [failed, setFailed] = useState(false);
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState('');

  const select = useCallback((id) => {
    try { id ? localStorage.setItem(KEY, id) : localStorage.removeItem(KEY); } catch { /* ignore */ }
    setEvent((cur) => (cur && cur.id === id ? cur : null));
    setFailed(false);
    setEventId(id || '');
  }, []);

  const refresh = useCallback(async () => {
    if (!eventId) { setEvent(null); return null; }
    try {
      const { data } = await api.get(`/events/${eventId}`, { timeout: 15000 });
      setEvent(data.event);
      setFailed(false);
      return data.event;
    } catch (err) {
      if (err.response?.status === 404) select('');
      else setFailed(true);
      return null;
    }
  }, [eventId, select]);

  const reloadEvents = useCallback(async () => {
    setEventsLoading(true);
    setEventsError('');
    try {
      const { data } = await api.get('/events', { params: { limit: 100, sort: 'startAt' }, timeout: 15000 });
      setEvents(data.items);
    } catch (err) {
      setEventsError(errMsg(err));
    } finally {
      setEventsLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { reloadEvents(); }, [reloadEvents]);

  const value = useMemo(
    () => ({ eventId, event, events, eventsLoading, eventsError, failed, loading: Boolean(eventId) && !event && !failed, select, refresh, reloadEvents, setEvent }),
    [eventId, event, events, eventsLoading, eventsError, failed, select, refresh, reloadEvents],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useEvent = () => useContext(Ctx);

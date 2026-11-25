const base = { day: 'numeric', month: 'short', year: 'numeric' };

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', base) : '—');
export const fmtTime = (d) =>
  d ? new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).replace(/\s?(am|pm)/i, (m) => m.toLowerCase()) : '';
export const fmtDateTime = (d) => (d ? `${fmtDate(d)}, ${fmtTime(d)}` : '—');

export function fmtRange(start, end) {
  if (!start) return '—';
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const day = s.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  if (e && s.toDateString() === e.toDateString()) return `${day} · ${fmtTime(s)} – ${fmtTime(e)}`;
  return e ? `${fmtDateTime(s)} → ${fmtDateTime(e)}` : `${day} · ${fmtTime(s)}`;
}

export function timeAgo(d) {
  if (!d) return '';
  const sec = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (sec < 45) return 'just now';
  if (sec < 3600) return `${Math.round(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)} h ago`;
  return fmtDate(d);
}

const pad = (n) => String(n).padStart(2, '0');
/** ISO → value for <input type="datetime-local"> in the browser's zone */
export function toInput(d) {
  if (!d) return '';
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}
export const fromInput = (v) => (v ? new Date(v).toISOString() : null);

export const EVENT_STATUS = {
  upcoming: { label: 'Upcoming', tone: 'blue' },
  ongoing: { label: 'Live now', tone: 'green' },
  completed: { label: 'Completed', tone: 'slate' },
  draft: { label: 'Draft', tone: 'amber' },
  cancelled: { label: 'Cancelled', tone: 'red' },
};

export const REG_STATUS = {
  registered: { label: 'Confirmed', tone: 'green' },
  pending: { label: 'Pending approval', tone: 'amber' },
  waitlisted: { label: 'Waitlisted', tone: 'blue' },
  rejected: { label: 'Rejected', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
};

export const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year', 'PG', 'Other'];
export const DEPARTMENTS = [
  'Computer Science', 'Information Technology', 'Electronics', 'Electrical', 'Mechanical', 'Civil', 'Chemical', 'Management', 'Science', 'Arts',
];

export function waLink(phone, text) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10) d = `91${d}`;
  if (d.length < 11) return null;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function downloadDataUrl(url, name) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const pluralize = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function publicRegistrationUrl(event) {
  if (!event?.slug) return event?.publicUrl || '';
  const fallback = new URL(`/register/${encodeURIComponent(event.slug)}`, window.location.origin).href;
  if (!event.publicUrl) return fallback;
  try {
    const host = new URL(event.publicUrl).hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost')) return fallback;
  } catch {
    return fallback;
  }
  return event.publicUrl;
}

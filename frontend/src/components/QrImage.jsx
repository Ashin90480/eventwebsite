import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Loader2 } from 'lucide-react';

/** Authenticated QR PNG: fetched with the JWT and shown from a blob URL. */
export default function QrImage({ eventId, registrationId, version = 0, className = 'size-56' }) {
  const [src, setSrc] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let url = '';
    let cancelled = false;
    setSrc('');
    setError(false);
    api
      .get(`/events/${eventId}/registrations/${registrationId}/qr`, { responseType: 'blob' })
      .then((r) => {
        if (cancelled) return;
        url = URL.createObjectURL(r.data);
        setSrc(url);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [eventId, registrationId, version]);

  if (error) return <div className={`${className} grid place-items-center rounded-xl bg-slate-100 text-xs text-slate-500`}>QR unavailable</div>;
  if (!src)
    return (
      <div className={`${className} grid place-items-center rounded-xl bg-slate-50`}>
        <Loader2 className="size-5 animate-spin text-slate-400" />
      </div>
    );
  return <img src={src} alt="Participant QR code" className={`${className} rounded-xl border border-slate-200 bg-white p-1`} />;
}

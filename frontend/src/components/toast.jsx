import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

const Ctx = createContext(null);

const STYLE = {
  success: { icon: CheckCircle2, cls: 'border-emerald-200 bg-emerald-50 text-emerald-900', ic: 'text-emerald-600' },
  error: { icon: AlertTriangle, cls: 'border-red-200 bg-red-50 text-red-900', ic: 'text-red-600' },
  info: { icon: Info, cls: 'border-slate-200 bg-white text-ink', ic: 'text-brand-600' },
};

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const seq = useRef(0);

  const dismiss = useCallback((id) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (kind, text) => {
      const id = ++seq.current;
      setItems((l) => [...l.slice(-3), { id, kind, text }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 3800);
    },
    [dismiss],
  );

  const api = useMemo(
    () => ({
      success: (t) => push('success', t),
      error: (t) => push('error', t),
      info: (t) => push('info', t),
    }),
    [push],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3 print:hidden" aria-live="polite">
        {items.map((t) => {
          const s = STYLE[t.kind];
          const Icon = s.icon;
          return (
            <div key={t.id} className={`rise pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${s.cls}`}>
              <Icon className={`mt-0.5 size-4 shrink-0 ${s.ic}`} />
              <p className="flex-1">{t.text}</p>
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-current/60 hover:text-current">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

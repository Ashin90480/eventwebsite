import { forwardRef, useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, Inbox, Loader2, X } from 'lucide-react';

export const cx = (...a) => a.filter(Boolean).join(' ');

/* ---------- buttons ---------- */
const BTN = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
  secondary: 'bg-white text-ink border border-slate-300 hover:bg-slate-50',
  soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  dangerSoft: 'bg-red-50 text-red-700 hover:bg-red-100',
};
const SIZE = { sm: 'px-2.5 py-1.5 text-xs gap-1.5', md: 'px-4 py-2.5 text-sm gap-2', lg: 'px-5 py-3 text-base gap-2' };

export function Button({ variant = 'primary', size = 'md', loading = false, icon: Icon, className, children, disabled, type = 'button', ...rest }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center rounded-lg font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
        BTN[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon ? <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} /> : null}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, className, tone = 'slate', ...rest }) {
  const tones = {
    slate: 'text-slate-500 hover:bg-slate-100 hover:text-ink',
    green: 'text-emerald-600 hover:bg-emerald-50',
    red: 'text-red-500 hover:bg-red-50',
  };
  return (
    <button type="button" title={label} aria-label={label} className={cx('rounded-lg p-2 transition disabled:opacity-40', tones[tone], className)} {...rest}>
      <Icon className="size-4" />
    </button>
  );
}

/* ---------- form fields ---------- */
const FIELD =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-ink placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 disabled:text-slate-500';

export const Input = forwardRef(function Input({ className, invalid, ...p }, ref) {
  return <input ref={ref} className={cx(FIELD, invalid && 'border-red-400 focus:border-red-500 focus:ring-red-500/20', className)} {...p} />;
});
export const Textarea = forwardRef(function Textarea({ className, invalid, ...p }, ref) {
  return <textarea ref={ref} rows={3} className={cx(FIELD, invalid && 'border-red-400', className)} {...p} />;
});
export const Select = forwardRef(function Select({ className, invalid, children, ...p }, ref) {
  return (
    <select ref={ref} className={cx(FIELD, 'pr-8', invalid && 'border-red-400', className)} {...p}>
      {children}
    </select>
  );
});

export function Field({ label, hint, error, required, children, className }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50',
          checked ? 'bg-brand-600' : 'bg-slate-300',
        )}
      >
        <span className={cx('inline-block size-5 rounded-full bg-white shadow transition', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

/* ---------- surfaces ---------- */
export function Card({ className, children, ...p }) {
  return (
    <div className={cx('rounded-2xl border border-slate-200 bg-white shadow-sm', className)} {...p}>
      {children}
    </div>
  );
}

const TONES = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  brand: 'bg-brand-50 text-brand-700 ring-brand-600/20',
};
export function Badge({ tone = 'slate', children, className, dot }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', TONES[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back}
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.7rem]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const STAT_TONES = {
  brand: 'bg-brand-50 text-brand-600',
  blue: 'bg-sky-50 text-sky-600',
  amber: 'bg-amber-50 text-amber-600',
  green: 'bg-emerald-50 text-emerald-600',
  slate: 'bg-slate-100 text-slate-500',
};
export function Stat({ label, value, icon: Icon, tone = 'brand', sub, to }) {
  const body = (
    <Card className={cx('flex items-center gap-4 p-4', to && 'transition hover:border-brand-200 hover:shadow')}>
      {Icon && (
        <div className={cx('grid size-11 shrink-0 place-items-center rounded-xl', STAT_TONES[tone])}>
          <Icon className="size-5" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none tracking-tight text-ink tabular-nums">{value}</p>
        <p className="mt-1 truncate text-xs font-medium text-slate-500">{label}</p>
        {sub && <p className="truncate text-xs text-slate-400">{sub}</p>}
      </div>
    </Card>
  );
  return body;
}

export function EmptyState({ icon: Icon = Inbox, title, text, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon className="size-7" />
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ className }) {
  return <Loader2 className={cx('size-5 animate-spin text-brand-600', className)} />;
}
export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="grid min-h-[40vh] place-items-center text-sm text-slate-500">
      <div className="flex items-center gap-3">
        <Spinner />
        {label}
      </div>
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={cx('animate-pulse rounded-lg bg-slate-200/70', className)} />;
}

export function ErrorNote({ children, onRetry }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <span>{children}</span>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/* ---------- overlays ---------- */
export function Modal({ open, onClose, title, children, size = 'md', footer, fullScreenOnMobile = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  const W = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' }[size];
  const mobileHeight = fullScreenOnMobile ? 'h-[100dvh] max-h-[100dvh] rounded-none' : 'max-h-[92vh] rounded-t-2xl';
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4 print:hidden" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cx('rise relative flex w-full flex-col bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-2xl', mobileHeight, W)}>
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 rounded-b-2xl border-t border-slate-200 bg-slate-50 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, text, confirmLabel = 'Confirm', danger, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={run} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{text}</p>
    </Modal>
  );
}

export function Pagination({ page, pages, onChange, total, label = 'items' }) {
  if (!pages || pages <= 1) return total != null ? <p className="px-1 text-xs text-slate-500">{total} {label}</p> : null;
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <p className="text-xs text-slate-500">{total != null ? `${total} ${label} · ` : ''}Page {page} of {pages}</p>
      <div className="flex gap-1">
        <Button variant="secondary" size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page" />
        <Button variant="secondary" size="sm" icon={ChevronRight} disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page" />
      </div>
    </div>
  );
}

export function CopyButton({ text, label = 'Copy', size = 'sm', variant = 'secondary' }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant={variant}
      size={size}
      icon={done ? Check : Copy}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const t = document.createElement('textarea');
          t.value = text;
          document.body.appendChild(t);
          t.select();
          document.execCommand('copy');
          t.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1800);
      }}
    >
      {done ? 'Copied' : label}
    </Button>
  );
}

export function ProgressBar({ value, max, tone = 'brand' }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const bar = { brand: 'bg-brand-500', amber: 'bg-amber-500', red: 'bg-red-500' }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-all', bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Logo({ light = false, size = 'md' }) {
  const box = size === 'lg' ? 'size-11' : 'size-9';
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className={cx('grid place-items-center rounded-xl bg-brand-600', box)}>
        <svg viewBox="0 0 32 32" className="size-5" aria-hidden="true">
          <path d="M7 7h7v7H7zM18 7h7v7h-7zM7 18h7v7H7zM18 18h3v3h-3zM22 22h3v3h-3z" fill="white" />
        </svg>
      </span>
      <span className={cx('text-lg font-bold tracking-tight', light ? 'text-white' : 'text-ink')}>EventQR</span>
    </span>
  );
}

import { useState } from 'react';
import { Mail, Server, ShieldCheck } from 'lucide-react';
import { api, apiBase, errMsg } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Button, Card, Field, Input, PageHeader } from '../components/ui.jsx';
import { useToast } from '../components/toast.jsx';

export default function Settings() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (next.length < 10) return setError('New password must be at least 10 characters.');
    if (next !== again) return setError('The new passwords do not match.');
    setBusy(true);
    try {
      await api.put('/auth/password', { currentPassword: cur, newPassword: next });
      toast.success('Password changed');
      setCur('');
      setNext('');
      setAgain('');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rise mx-auto max-w-2xl">
      <PageHeader title="Settings" subtitle="Your account and system information." />

      <Card className="mb-6 p-5">
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-ink"><ShieldCheck className="size-4 text-brand-600" /> Account</h2>
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-slate-500">Name</dt><dd className="font-medium text-ink">{user?.name}</dd></div>
          <div className="min-w-0"><dt className="text-xs text-slate-500">Email</dt><dd className="truncate font-medium text-ink">{user?.email}</dd></div>
          <div><dt className="text-xs text-slate-500">Role</dt><dd className="font-medium capitalize text-ink">{user?.role}</dd></div>
        </dl>
      </Card>

      <Card className="mb-6 p-5">
        <h2 className="mb-4 font-semibold text-ink">Change password</h2>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Current password"><Input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New password" hint="At least 10 characters"><Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required /></Field>
            <Field label="Repeat new password"><Input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required /></Field>
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button type="submit" loading={busy}>Update password</Button>
        </form>
      </Card>

      <Card className="mb-6 p-5">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-ink"><Mail className="size-4 text-brand-600" /> Ticket e-mails</h2>
        <p className="text-sm text-slate-600">
          QR tickets are e-mailed automatically after registration when SMTP is configured on the server (<code className="rounded bg-slate-100 px-1 py-0.5 text-xs">SMTP_HOST</code>, <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">SMTP_USER</code>, <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">SMTP_PASS</code>, <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">MAIL_FROM</code>). Without it, students still see their ticket on screen and you can download QR codes yourself. The Participants page shows each person’s e-mail status and lets you re-send.
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-ink"><Server className="size-4 text-brand-600" /> This app</h2>
        <p className="text-sm text-slate-600">API: <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{apiBase}</code></p>
        <div className="mt-4"><Button variant="secondary" onClick={logout}>Sign out</Button></div>
      </Card>
    </div>
  );
}

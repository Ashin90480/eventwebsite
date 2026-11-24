import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, QrCode, ScanLine, Ticket } from 'lucide-react';
import { api, errMsg } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Button, Field, Input, Logo } from '../components/ui.jsx';

const POINTS = [
  { icon: Ticket, title: 'Self-service registration', text: 'Share one link. Students sign up and get their QR ticket by e-mail.' },
  { icon: ScanLine, title: 'Scan attendance from any phone', text: 'Each QR works once. Duplicates and fakes are caught instantly.' },
  { icon: QrCode, title: 'Reports in one click', text: 'Department-wise numbers, CSV and Excel exports.' },
];

export default function Login() {
  const { user, login, demoLogin } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    api.get('/auth/config').then((r) => setDemo(Boolean(r.data.demoLogin))).catch(() => {});
  }, []);

  if (user) return <Navigate to={loc.state?.from || '/'} replace />;

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate(loc.state?.from || '/', { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function tryDemo() {
    setError('');
    setBusy(true);
    try {
      await demoLogin();
      navigate('/', { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-brand-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-brand-500/20 blur-3xl" />
        <Logo light size="lg" />
        <div className="relative max-w-md">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">Run campus events without the paperwork.</h1>
          <p className="mt-4 text-lg text-white/70">Registration, QR tickets, live attendance and reports, in one place.</p>
          <ul className="mt-10 space-y-6">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10">
                  <Icon className="size-5 text-brand-200" />
                </span>
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="text-sm text-white/60">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative flex items-center gap-2 text-sm text-white/50">
          <CheckCircle2 className="size-4" /> Each QR code is single-use and verified on the server.
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="rise w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo size="lg" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-ink">Welcome back</h2>
          <p className="mt-1 text-sm text-slate-500">Sign in to manage your events.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <Field label="Email">
              <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@college.edu" required autoFocus />
            </Field>
            <Field label="Password">
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              Sign in
            </Button>
          </form>

          {demo && (
            <div className="mt-6 border-t border-slate-200 pt-6">
              <Button variant="secondary" className="w-full" onClick={tryDemo} disabled={busy}>
                Use demo account
              </Button>
              <p className="mt-2 text-center text-xs text-slate-400">Development only. Run “npm run seed” first.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

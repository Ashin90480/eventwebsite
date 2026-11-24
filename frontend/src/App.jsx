import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { EventProvider } from './eventContext.jsx';
import Layout from './components/Layout.jsx';
import { PageLoader } from './components/ui.jsx';

// Route-level code splitting keeps the first load small.
const Login = lazy(() => import('./pages/Login.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Events = lazy(() => import('./pages/Events.jsx'));
const EventDetail = lazy(() => import('./pages/EventDetail.jsx'));
const Students = lazy(() => import('./pages/Students.jsx'));
const QRCodes = lazy(() => import('./pages/QRCodes.jsx'));
const Scanner = lazy(() => import('./pages/Scanner.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const Ticket = lazy(() => import('./pages/Ticket.jsx'));

function Protected() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <PageLoader label="Signing you in…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return (
    <EventProvider>
      <Layout />
    </EventProvider>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* public: no sign-in needed */}
        <Route path="/register/:slug" element={<Register />} />
        <Route path="/ticket/:code" element={<Ticket />} />
        <Route path="/login" element={<Login />} />

        <Route element={<Protected />}>
          <Route index element={<Dashboard />} />
          <Route path="events" element={<Events />} />
          <Route path="events/:eventId" element={<EventDetail />} />
          <Route path="participants" element={<Students />} />
          <Route path="qr-codes" element={<QRCodes />} />
          <Route path="scanner" element={<Scanner />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

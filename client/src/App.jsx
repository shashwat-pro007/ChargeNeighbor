import { useState } from 'react';
import { Link, Route, Routes, useNavigate } from 'react-router-dom';
import { Layout } from './components/Layout.jsx';
import { Alert, Button, ButtonLink, Spinner } from './components/ui.jsx';
import { useApp } from './context/AppContext.jsx';
import { api } from './lib/api.js';
import Home from './pages/Home.jsx';
import HowItWorks from './pages/HowItWorks.jsx';
import Search from './pages/Search.jsx';
import ListingDetail from './pages/ListingDetail.jsx';
import Login from './pages/Login.jsx';
import BookingDetail from './pages/BookingDetail.jsx';
import BookingsList from './pages/BookingsList.jsx';
import Account from './pages/Account.jsx';
import Policies from './pages/Policies.jsx';
import Help from './pages/Help.jsx';
import NotFound from './pages/NotFound.jsx';
import HostDashboard from './pages/host/HostDashboard.jsx';
import ListingEditor from './pages/host/ListingEditor.jsx';
import HostBookings from './pages/host/HostBookings.jsx';
import AdminConsole from './pages/admin/AdminConsole.jsx';

function LoadingScreen() {
  return (
    <div className="container" style={{ padding: '90px 20px', display: 'grid', placeItems: 'center' }}>
      <Spinner label="Loading ChargeNeighbor" />
    </div>
  );
}

function AccessDenied({ title, message, cta }) {
  return (
    <div className="page">
      <div className="container page-narrow">
        <div className="card card--pad center">
          <h1 style={{ fontSize: '1.45rem' }}>{title}</h1>
          <p className="muted" style={{ marginTop: 10 }}>{message}</p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 20 }}>
            {cta ?? <ButtonLink to="/login">Sign in</ButtonLink>}
            <Link to="/" className="btn btn--secondary btn--md">
              Back home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function RequireAuth({ children }) {
  const { session } = useApp();
  if (session.loading) return <LoadingScreen />;
  if (!session.user) {
    return (
      <AccessDenied
        title="Sign in to continue"
        message="Bookings, hosting tools and your account are tied to a verified phone number."
      />
    );
  }
  return children;
}

function RequireHost({ children }) {
  const { session, isHost } = useApp();
  if (session.loading) return <LoadingScreen />;
  if (!session.user) {
    return (
      <AccessDenied
        title="Sign in to host your charger"
        message="Host tools need a verified phone number and a host account."
      />
    );
  }
  if (!isHost) return <EnableHosting />;
  return children;
}

function EnableHosting() {
  const { refreshSession } = useApp();
  const navigate = useNavigate();
  const [state, setState] = useState({ busy: false, error: null });

  const enable = async () => {
    setState({ busy: true, error: null });
    try {
      await api.post('/me/host');
      await refreshSession();
      navigate('/host/listings/new');
    } catch (error) {
      setState({ busy: false, error });
    }
  };

  return (
    <div className="page">
      <div className="container page-narrow">
        <div className="card card--pad">
          <h1 style={{ fontSize: '1.45rem' }}>Enable hosting on your account</h1>
          <p className="muted" style={{ marginTop: 10 }}>
            Hosting is free to enable and does not change how you book chargers as a driver. You can list a
            charger, set your own price and availability, and pause the listing at any time.
          </p>
          {state.error && (
            <div style={{ marginTop: 14 }}>
              <Alert tone="danger">{state.error.message}</Alert>
            </div>
          )}
          <div className="row" style={{ marginTop: 20 }}>
            <Button variant="primary" onClick={enable} loading={state.busy}>
              Enable hosting
            </Button>
            <Link to="/policies/hosts" className="btn btn--secondary btn--md">
              Read host rules
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function RequireAdmin({ children }) {
  const { session, isAdmin } = useApp();
  if (session.loading) return <LoadingScreen />;
  if (!session.user || !isAdmin) {
    return (
      <AccessDenied
        title="Admin access only"
        message="Listing review and support tools are limited to ChargeNeighbor staff accounts."
      />
    );
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="search" element={<Search />} />
        <Route path="chargers/:id" element={<ListingDetail />} />
        <Route path="how-it-works" element={<HowItWorks />} />
        <Route path="policies" element={<Policies />} />
        <Route path="policies/:slug" element={<Policies />} />
        <Route path="help" element={<Help />} />
        <Route path="login" element={<Login />} />

        <Route
          path="bookings"
          element={
            <RequireAuth>
              <BookingsList />
            </RequireAuth>
          }
        />
        <Route
          path="bookings/:ref"
          element={
            <RequireAuth>
              <BookingDetail />
            </RequireAuth>
          }
        />
        <Route
          path="account"
          element={
            <RequireAuth>
              <Account />
            </RequireAuth>
          }
        />

        <Route
          path="host"
          element={
            <RequireHost>
              <HostDashboard />
            </RequireHost>
          }
        />
        <Route
          path="host/bookings"
          element={
            <RequireHost>
              <HostBookings />
            </RequireHost>
          }
        />
        <Route
          path="host/listings/new"
          element={
            <RequireHost>
              <ListingEditor />
            </RequireHost>
          }
        />
        <Route
          path="host/listings/:id"
          element={
            <RequireHost>
              <ListingEditor />
            </RequireHost>
          }
        />

        <Route
          path="admin"
          element={
            <RequireAdmin>
              <AdminConsole />
            </RequireAdmin>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

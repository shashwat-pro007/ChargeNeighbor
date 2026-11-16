import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChargerCard } from '../components/ChargerCard.jsx';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Field,
  Icon,
  Input,
  Modal,
  Select,
  Skeleton,
} from '../components/ui.jsx';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';
import { dayOnly } from '../lib/format.js';

const CONNECTORS = ['Type 2', 'CCS2', 'CHAdeMO', 'Type 1', 'Bharat AC-001', 'Bharat DC-001'];

export default function Account() {
  const { session, refreshSession, signOut, toast, meta } = useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const wantsPassword = searchParams.get('setup') === 'password';

  const [profile, setProfile] = useState({ name: session.user?.name ?? '', email: session.user?.email ?? '' });
  const [profileState, setProfileState] = useState({ busy: false, error: null });
  const [vehicles, setVehicles] = useState({ loading: true, error: null, items: [] });
  const [vehicleForm, setVehicleForm] = useState({ makeModel: '', connector: 'Type 2', batteryKwh: '', label: '' });
  const [vehicleState, setVehicleState] = useState({ busy: false, error: null });
  const [saved, setSaved] = useState({ loading: true, error: null, items: [] });
  const [notifications, setNotifications] = useState({ loading: true, items: [] });
  const hasPassword = Boolean(session.user?.hasPassword);
  const [loginForm, setLoginForm] = useState({
    loginId: session.user?.loginId ?? '',
    currentPassword: '',
    password: '',
    confirm: '',
  });
  const [loginState, setLoginState] = useState({ busy: false, error: null, saved: false });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteState, setDeleteState] = useState({ busy: false, error: null });

  const loadVehicles = useCallback(() => {
    api
      .get('/me/vehicles')
      .then((data) => setVehicles({ loading: false, error: null, items: data.vehicles }))
      .catch((error) => setVehicles({ loading: false, error, items: [] }));
  }, []);

  const loadSaved = useCallback(() => {
    api
      .get('/me/saved')
      .then((data) => setSaved({ loading: false, error: null, items: data.saved }))
      .catch((error) => setSaved({ loading: false, error, items: [] }));
  }, []);

  const loadNotifications = useCallback(() => {
    api
      .get('/me/notifications')
      .then((data) => setNotifications({ loading: false, items: data.notifications }))
      .catch(() => setNotifications({ loading: false, items: [] }));
  }, []);

  useEffect(() => {
    loadVehicles();
    loadSaved();
    loadNotifications();
  }, [loadVehicles, loadSaved, loadNotifications]);

  const saveProfile = async (event) => {
    event.preventDefault();
    setProfileState({ busy: true, error: null });
    try {
      await api.patch('/me', {
        name: profile.name.trim(),
        email: profile.email.trim() || null,
      });
      await refreshSession();
      setProfileState({ busy: false, error: null });
      toast('Profile updated.');
    } catch (error) {
      setProfileState({ busy: false, error });
    }
  };

  const saveSignInDetails = async (event) => {
    event.preventDefault();
    if (loginForm.password !== loginForm.confirm) {
      setLoginState({
        busy: false,
        saved: false,
        error: { message: 'The two passwords do not match. Type the same password in both boxes.' },
      });
      return;
    }

    setLoginState({ busy: true, error: null, saved: false });
    try {
      const data = await api.post('/auth/id/set', {
        loginId: loginForm.loginId.trim(),
        password: loginForm.password,
        currentPassword: hasPassword ? loginForm.currentPassword : undefined,
      });
      await refreshSession();
      setLoginForm((current) => ({
        ...current,
        loginId: data.user?.loginId ?? current.loginId,
        currentPassword: '',
        password: '',
        confirm: '',
      }));
      setLoginState({ busy: false, error: null, saved: true });
      toast(hasPassword ? 'Sign-in details updated.' : 'Password set. You can sign in with your login ID now.');
    } catch (error) {
      setLoginState({ busy: false, error, saved: false });
    }
  };

  const addVehicle = async (event) => {
    event.preventDefault();
    setVehicleState({ busy: true, error: null });
    try {
      await api.post('/me/vehicles', {
        makeModel: vehicleForm.makeModel.trim(),
        connector: vehicleForm.connector,
        batteryKwh: vehicleForm.batteryKwh ? Number(vehicleForm.batteryKwh) : null,
        label: vehicleForm.label.trim() || undefined,
      });
      setVehicleForm({ makeModel: '', connector: vehicleForm.connector, batteryKwh: '', label: '' });
      setVehicleState({ busy: false, error: null });
      toast('Vehicle saved.');
      loadVehicles();
    } catch (error) {
      setVehicleState({ busy: false, error });
    }
  };

  const removeVehicle = async (id) => {
    try {
      await api.del(`/me/vehicles/${id}`);
      loadVehicles();
      toast('Vehicle removed.', 'info');
    } catch (error) {
      toast(error.message, 'danger');
    }
  };

  const markAllRead = async () => {
    try {
      await api.post('/me/notifications/read-all');
      loadNotifications();
    } catch (error) {
      toast(error.message, 'danger');
    }
  };

  return (
    <div className="dash">
      <div className="container" style={{ maxWidth: 900 }}>
        <div className="dash-head">
          <div>
            <h1>Account</h1>
            <p className="muted small" style={{ marginTop: 6 }}>
              {session.user?.phone} ·{' '}
              {session.user?.roles?.map((role) => (
                <Badge key={role} tone={role === 'admin' ? 'warn' : 'neutral'}>{role}</Badge>
              ))}
            </p>
          </div>
          <div className="row">
            <ButtonLink to="/host" variant="secondary" size="sm">
              Host dashboard
            </ButtonLink>
            <ButtonLink to="/bookings" variant="primary" size="sm">
              My bookings
            </ButtonLink>
          </div>
        </div>

        <div className="stack-lg">
          <Card className="card--pad">
            <h2 style={{ fontSize: '1.02rem', marginBottom: 14 }}>Profile</h2>
            {profileState.error && (
              <div style={{ marginBottom: 12 }}>
                <Alert tone="danger">{profileState.error.message}</Alert>
              </div>
            )}
            <form className="form-grid" onSubmit={saveProfile}>
              <Field
                label="Display name"
                htmlFor="name"
                error={profileState.error?.fieldError('name')}
                hint="Shared with the other party on a booking."
              >
                <Input
                  id="name"
                  value={profile.name}
                  onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Your name"
                />
              </Field>
              <Field
                label="Email (optional)"
                htmlFor="email"
                error={profileState.error?.fieldError('email')}
                hint="Used for receipts when email delivery is enabled."
              >
                <Input
                  id="email"
                  type="email"
                  value={profile.email}
                  onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))}
                  placeholder="you@example.com"
                />
              </Field>
              <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
                <Button type="submit" variant="primary" size="sm" loading={profileState.busy}>
                  Save profile
                </Button>
                <span className="tiny muted">
                  Phone number {session.user?.phoneVerified ? 'verified' : 'not verified'}.
                </span>
              </div>
            </form>
          </Card>

          <Card className="card--pad" id="sign-in-details">
            <div className="panel__head">
              <div>
                <h2 style={{ fontSize: '1.02rem' }}>Sign-in details</h2>
                <p className="tiny muted">
                  Your phone number always works. A login ID and password let you skip the code.
                </p>
              </div>
              <Badge tone={hasPassword ? 'success' : 'neutral'}>
                {hasPassword ? 'Password on' : 'Phone only'}
              </Badge>
            </div>

            {wantsPassword && !hasPassword && (
              <div style={{ marginBottom: 12 }}>
                <Alert tone="info" title="Sign in without waiting for a code">
                  Choose a login ID and password below. You can still sign in with your phone number any time.
                </Alert>
              </div>
            )}

            {loginState.error && (
              <div style={{ marginBottom: 12 }}>
                <Alert tone="danger">{loginState.error.message}</Alert>
              </div>
            )}

            {loginState.saved && (
              <div style={{ marginBottom: 12 }}>
                <Alert tone="success" title="Saved">
                  Sign in at the login page with the <strong>Login ID</strong> tab.{' '}
                  {session.user?.loginId && <>Your login ID is <strong>{session.user.loginId}</strong>.</>}
                </Alert>
              </div>
            )}

            <form className="form-grid" onSubmit={saveSignInDetails}>
              <Field
                label="Login ID"
                htmlFor="loginId"
                error={loginState.error?.fieldError('loginId')}
                hint="4–20 characters: letters, numbers, dot or underscore, starting with a letter."
                required
              >
                <Input
                  id="loginId"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoComplete="username"
                  value={loginForm.loginId}
                  onChange={(event) =>
                    setLoginForm((current) => ({ ...current, loginId: event.target.value }))
                  }
                  placeholder="ananya.rao"
                  required
                />
              </Field>

              {hasPassword && (
                <Field
                  label="Current password"
                  htmlFor="currentPassword"
                  error={loginState.error?.fieldError('currentPassword')}
                  hint="Needed to change an existing password."
                  required
                >
                  <Input
                    id="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    value={loginForm.currentPassword}
                    onChange={(event) =>
                      setLoginForm((current) => ({ ...current, currentPassword: event.target.value }))
                    }
                    required
                  />
                </Field>
              )}

              <Field
                label={hasPassword ? 'New password' : 'Password'}
                htmlFor="newPassword"
                error={loginState.error?.fieldError('password')}
                hint={`At least ${meta?.credentials?.passwordMin ?? 8} characters, with a letter and a number.`}
                required
              >
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  value={loginForm.password}
                  onChange={(event) =>
                    setLoginForm((current) => ({ ...current, password: event.target.value }))
                  }
                  required
                />
              </Field>

              <Field label="Confirm password" htmlFor="confirmPassword" required>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={loginForm.confirm}
                  onChange={(event) =>
                    setLoginForm((current) => ({ ...current, confirm: event.target.value }))
                  }
                  required
                />
              </Field>

              <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
                <Button type="submit" variant="primary" size="sm" loading={loginState.busy}>
                  {hasPassword ? 'Update sign-in details' : 'Save login ID and password'}
                </Button>
                <span className="tiny muted">
                  Forgot the password? Sign in with your phone number, then set a new one here.
                </span>
              </div>
            </form>
          </Card>

          <Card className="card--pad">
            <div className="panel__head">
              <div>
                <h2 style={{ fontSize: '1.02rem' }}>Vehicle</h2>
                <p className="tiny muted">Used to check connector compatibility before booking.</p>
              </div>
            </div>

            {vehicles.loading ? (
              <Skeleton height={60} radius={12} />
            ) : vehicles.items.length === 0 ? (
              <p className="small muted">No vehicle saved yet. Add one to speed up bookings.</p>
            ) : (
              <div className="stack">
                {vehicles.items.map((vehicle) => (
                  <div className="list-row" key={vehicle.id}>
                    <span className="spec-block__label" style={{ margin: 0 }}>
                      <Icon name="car" size={18} />
                    </span>
                    <div className="list-row__main">
                      <div className="list-row__title">
                        {vehicle.makeModel} {vehicle.label ? `· ${vehicle.label}` : ''}
                      </div>
                      <div className="list-row__sub">
                        {vehicle.connector}
                        {vehicle.batteryKwh ? ` · ${vehicle.batteryKwh} kWh` : ''}
                        {vehicle.efficiency ? ` · ${vehicle.efficiency} Wh/km` : ''}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeVehicle(vehicle.id)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <hr className="divider" />

            <form className="form-grid" onSubmit={addVehicle}>
              <Field
                label="Make and model"
                htmlFor="makeModel"
                error={vehicleState.error?.fieldError('makeModel')}
              >
                <Input
                  id="makeModel"
                  value={vehicleForm.makeModel}
                  onChange={(event) =>
                    setVehicleForm((current) => ({ ...current, makeModel: event.target.value }))
                  }
                  placeholder="Tata Nexon EV"
                  required
                />
              </Field>
              <Field label="Connector" htmlFor="connector">
                <Select
                  id="connector"
                  value={vehicleForm.connector}
                  onChange={(event) =>
                    setVehicleForm((current) => ({ ...current, connector: event.target.value }))
                  }
                >
                  {CONNECTORS.map((connector) => (
                    <option key={connector}>{connector}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Battery (kWh, optional)" htmlFor="battery">
                <Input
                  id="battery"
                  type="number"
                  min="5"
                  max="200"
                  value={vehicleForm.batteryKwh}
                  onChange={(event) =>
                    setVehicleForm((current) => ({ ...current, batteryKwh: event.target.value }))
                  }
                  placeholder="40"
                />
              </Field>
              <Field label="Nickname (optional)" htmlFor="label">
                <Input
                  id="label"
                  value={vehicleForm.label}
                  onChange={(event) => setVehicleForm((current) => ({ ...current, label: event.target.value }))}
                  placeholder="Family car"
                />
              </Field>
              <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
                <Button type="submit" variant="primary" size="sm" loading={vehicleState.busy}>
                  Add vehicle
                </Button>
                {vehicleState.error && !vehicleState.error.details?.length && (
                  <span className="small" style={{ color: 'var(--danger)' }}>{vehicleState.error.message}</span>
                )}
              </div>
            </form>
          </Card>

          <Card className="card--pad">
            <div className="panel__head">
              <h2 style={{ fontSize: '1.02rem' }}>Saved chargers</h2>
              <Link to="/search" className="link-button">
                Find more
              </Link>
            </div>
            {saved.loading ? (
              <Skeleton height={80} radius={12} />
            ) : saved.items.length === 0 ? (
              <EmptyState
                icon="star"
                title="No saved chargers"
                description="Tap Save on a charger to keep it here for later."
              />
            ) : (
              <div className="listing-grid">
                {saved.items.map((listing) => (
                  <ChargerCard key={listing.id} listing={listing} />
                ))}
              </div>
            )}
          </Card>

          <Card className="card--pad">
            <div className="panel__head">
              <h2 style={{ fontSize: '1.02rem' }}>Notifications</h2>
              <Button variant="ghost" size="sm" onClick={markAllRead}>
                Mark all read
              </Button>
            </div>
            {notifications.loading ? (
              <Skeleton height={60} radius={12} />
            ) : notifications.items.length === 0 ? (
              <p className="small muted">No notifications yet.</p>
            ) : (
              <div className="stack">
                {notifications.items.slice(0, 12).map((item) => (
                  <div className="list-row" key={item.id} style={{ alignItems: 'flex-start' }}>
                    <div className="list-row__main">
                      <div className="list-row__title">
                        {!item.read && <span style={{ color: 'var(--green)' }}>● </span>}
                        {item.title}
                      </div>
                      {item.body && <div className="list-row__sub">{item.body}</div>}
                      <div className="tiny muted" style={{ marginTop: 2 }}>{dayOnly(item.createdAt)}</div>
                    </div>
                    {item.link && (
                      <Link className="link-button" to={item.link}>
                        Open
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="card--pad">
            <h2 style={{ fontSize: '1.02rem', marginBottom: 8 }}>Privacy &amp; data</h2>
            <p className="small muted" style={{ maxWidth: '68ch' }}>
              Deleting your account removes your profile, vehicle details, saved chargers and unread
              notifications, releases your phone number, and hides any listings you host. Booking records
              are retained in anonymised form because they are financial records.
            </p>
            <div className="row row--wrap" style={{ marginTop: 14 }}>
              <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
                Delete my account
              </Button>
              <Link className="btn btn--ghost btn--sm" to="/policies/privacy">
                Privacy policy
              </Link>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete your account?"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setDeleteOpen(false)}>
              Keep account
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={deleteState.busy}
              disabled={deleteConfirm !== 'DELETE'}
              onClick={async () => {
                setDeleteState({ busy: true, error: null });
                try {
                  await api.del('/auth/account', { confirm: 'DELETE' });
                  await signOut();
                  navigate('/');
                } catch (error) {
                  setDeleteState({ busy: false, error });
                }
              }}
            >
              Delete account
            </Button>
          </>
        }
      >
        <div className="stack">
          {deleteState.error && <Alert tone="danger">{deleteState.error.message}</Alert>}
          <Alert tone="warn" title="This cannot be undone">
            Type DELETE to confirm. Active bookings must be cancelled first.
          </Alert>
          <Field label="Confirm">
            <Input value={deleteConfirm} onChange={(event) => setDeleteConfirm(event.target.value)} placeholder="DELETE" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Skeleton,
  Tabs,
} from '../../components/ui.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../lib/api.js';
import { bookingStatusTone, dayOnly, durationLabel, money, timeOnly, titleCase } from '../../lib/format.js';

const TABS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
  { value: 'all', label: 'All' },
];

export default function HostBookings() {
  const { meta, toast } = useApp();
  const [scope, setScope] = useState('upcoming');
  const [state, setState] = useState({ loading: true, error: null, bookings: [] });
  const [busyRef, setBusyRef] = useState(null);

  const load = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }));
    api
      .get(`/bookings/me?role=host&scope=${scope}`)
      .then((data) => setState({ loading: false, error: null, bookings: data.bookings }))
      .catch((error) => setState({ loading: false, error, bookings: [] }));
  }, [scope]);

  useEffect(load, [load]);

  const complete = async (booking) => {
    setBusyRef(booking.ref);
    try {
      await api.post(`/bookings/${booking.ref}/complete`);
      toast('Session marked complete.');
      load();
    } catch (error) {
      toast(error.message, 'danger');
    } finally {
      setBusyRef(null);
    }
  };

  return (
    <div className="dash">
      <div className="container" style={{ maxWidth: 960 }}>
        <div className="dash-head">
          <div>
            <Link className="link-button" to="/host">
              ← Host dashboard
            </Link>
            <h1 style={{ marginTop: 8 }}>Host bookings</h1>
            <p className="muted small" style={{ marginTop: 6 }}>
              Sessions at your chargers. Your earning is the host rate; the platform fee is separate.
            </p>
          </div>
          <ButtonLink to="/host" variant="secondary" size="sm">
            Manage listings
          </ButtonLink>
        </div>

        <Tabs tabs={TABS} value={scope} onChange={setScope} />

        <div style={{ marginTop: 20 }}>
          {state.error ? (
            <Alert tone="danger" title="Could not load bookings">
              {state.error.message}
              <div style={{ marginTop: 10 }}>
                <Button variant="secondary" size="sm" onClick={load}>
                  Try again
                </Button>
              </div>
            </Alert>
          ) : state.loading ? (
            <div className="stack">
              <Skeleton height={96} radius={14} />
              <Skeleton height={96} radius={14} />
            </div>
          ) : state.bookings.length === 0 ? (
            <EmptyState
              icon="calendar"
              title="No bookings here"
              description="When a driver books one of your chargers it shows up here with the address and check-in code."
              action={<ButtonLink to="/host" variant="primary" size="sm">Review your listings</ButtonLink>}
            />
          ) : (
            <div className="stack">
              {state.bookings.map((booking) => (
                <Card className="card--pad" key={booking.id}>
                  <div className="row row--wrap" style={{ gap: 14, alignItems: 'flex-start' }}>
                    <div className="grow" style={{ minWidth: 220 }}>
                      <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                        <Badge tone={bookingStatusTone(booking.status)}>{titleCase(booking.status)}</Badge>
                        <span className="tiny muted tabular">{booking.ref}</span>
                      </div>
                      <h3 style={{ fontSize: '1rem' }}>
                        <Link to={`/bookings/${booking.ref}`}>{booking.listing?.title}</Link>
                      </h3>
                      <p className="small muted" style={{ marginTop: 4 }}>
                        {dayOnly(booking.startAt, booking.timezone)} · {timeOnly(booking.startAt, booking.timezone)} –{' '}
                        {timeOnly(booking.endAt, booking.timezone)} · {durationLabel(booking.durationMin)}
                      </p>
                      <p className="tiny muted" style={{ marginTop: 2 }}>
                        Driver {booking.driver?.name || 'ChargeNeighbor driver'} ·{' '}
                        {booking.privateDetails?.addressLine}
                      </p>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div className="strong tabular">{money(booking.subtotal, booking.currency)}</div>
                      <div className="tiny muted">
                        earning · fee {money(booking.fee, booking.currency)}
                      </div>
                      {booking.payment?.status === 'DUE_AT_SESSION' && (
                        <div className="tiny" style={{ color: 'var(--warn)', marginTop: 2 }}>
                          collect at session
                        </div>
                      )}
                    </div>

                    <div className="row" style={{ gap: 6 }}>
                      <Link className="btn btn--secondary btn--sm" to={`/bookings/${booking.ref}`}>
                        Open
                      </Link>
                      {['CONFIRMED', 'IN_PROGRESS'].includes(booking.status) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={busyRef === booking.ref}
                          onClick={() => complete(booking)}
                        >
                          Complete
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <Card className="card--pad" style={{ marginTop: 22 }}>
          <p className="small muted">
            Payouts are not automated in this release. Your dashboard shows gross earning and the platform
            fee per session so a manual settlement can be reconciled. Cancellation and no-show rules apply
            as published in the{' '}
            <Link className="link-button" to="/policies/cancellation">
              cancellation policy
            </Link>
            . Grace period: {meta?.bookingRules?.gracePeriodMinutes ?? 15} minutes.
          </p>
        </Card>
      </div>
    </div>
  );
}

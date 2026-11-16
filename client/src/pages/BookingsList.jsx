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
} from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { bookingStatusTone, dayOnly, durationLabel, money, timeOnly, titleCase } from '../lib/format.js';

const TABS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
  { value: 'all', label: 'All' },
];

export default function BookingsList() {
  const [scope, setScope] = useState('upcoming');
  const [state, setState] = useState({ loading: true, error: null, bookings: [] });

  const load = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }));
    api
      .get(`/bookings/me?role=driver&scope=${scope}`)
      .then((data) => setState({ loading: false, error: null, bookings: data.bookings }))
      .catch((error) => setState({ loading: false, error, bookings: [] }));
  }, [scope]);

  useEffect(load, [load]);

  return (
    <div className="dash">
      <div className="container" style={{ maxWidth: 900 }}>
        <div className="dash-head">
          <div>
            <h1>My bookings</h1>
            <p className="muted small" style={{ marginTop: 6 }}>
              Charging sessions you have booked with hosts.
            </p>
          </div>
          <ButtonLink to="/search" variant="primary" size="sm">
            Find a charger
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
              title={scope === 'upcoming' ? 'No upcoming sessions' : 'Nothing here yet'}
              description={
                scope === 'upcoming'
                  ? 'When you book a charger it appears here with the address, check-in code and price.'
                  : 'Completed and cancelled sessions will be listed here.'
              }
              action={<ButtonLink to="/search" variant="primary" size="sm">Browse chargers</ButtonLink>}
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
                      <Link to={`/bookings/${booking.ref}`}>
                        <h3 style={{ fontSize: '1rem' }}>{booking.listing?.title ?? 'Charging session'}</h3>
                      </Link>
                      <p className="small muted" style={{ marginTop: 4 }}>
                        {dayOnly(booking.startAt, booking.timezone)} · {timeOnly(booking.startAt, booking.timezone)} –{' '}
                        {timeOnly(booking.endAt, booking.timezone)} · {durationLabel(booking.durationMin)}
                      </p>
                      <p className="tiny muted" style={{ marginTop: 2 }}>
                        {booking.listing?.area}, {booking.listing?.city}
                        {booking.driver !== booking.host && booking.host?.name ? ` · Host ${booking.host.name}` : ''}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="strong tabular">{money(booking.total, booking.currency)}</div>
                      <div className="tiny muted">{titleCase(booking.payment?.status ?? '—')}</div>
                      <Link className="link-button" to={`/bookings/${booking.ref}`} style={{ marginTop: 6 }}>
                        Open
                      </Link>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

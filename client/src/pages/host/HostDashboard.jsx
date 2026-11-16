import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Icon,
  Skeleton,
} from '../../components/ui.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../lib/api.js';
import { dayOnly, listingStatusTone, money, timeOnly, titleCase } from '../../lib/format.js';

export default function HostDashboard() {
  const { toast } = useApp();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }));
    api
      .get('/host/summary')
      .then((data) => setState({ loading: false, error: null, data }))
      .catch((error) => setState({ loading: false, error, data: null }));
  }, []);

  useEffect(load, [load]);

  const act = async (listing, action) => {
    setBusyId(listing.id);
    try {
      if (action === 'submit') await api.post(`/host/listings/${listing.id}/submit`);
      if (action === 'pause') await api.post(`/host/listings/${listing.id}/pause`, { paused: true });
      if (action === 'resume') await api.post(`/host/listings/${listing.id}/pause`, { paused: false });
      if (action === 'delete') await api.del(`/host/listings/${listing.id}`);
      toast(`Listing ${action === 'delete' ? 'deleted' : 'updated'}.`);
      load();
    } catch (error) {
      toast(error.message, 'danger');
    } finally {
      setBusyId(null);
    }
  };

  if (state.loading) {
    return (
      <div className="dash">
        <div className="container">
          <Skeleton height={30} width="30%" />
          <div style={{ height: 18 }} />
          <div className="stat-grid">
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} height={92} radius={14} />
            ))}
          </div>
          <Skeleton height={200} radius={20} />
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="dash">
        <div className="container page-narrow">
          <Alert tone="danger" title="Could not load your host dashboard">
            {state.error.message}
            <div style={{ marginTop: 10 }}>
              <Button variant="secondary" size="sm" onClick={load}>
                Try again
              </Button>
            </div>
          </Alert>
        </div>
      </div>
    );
  }

  const { listings, earnings, upcoming, statusCounts, disputes } = state.data;
  const live = listings.filter((listing) => listing.status === 'approved');

  return (
    <div className="dash">
      <div className="container">
        <div className="dash-head">
          <div>
            <h1>Host dashboard</h1>
            <p className="muted small" style={{ marginTop: 6 }}>
              {live.length} live listing{live.length === 1 ? '' : 's'} ·{' '}
              {earnings.sessions} completed session{earnings.sessions === 1 ? '' : 's'}
            </p>
          </div>
          <div className="row">
            <ButtonLink to="/host/bookings" variant="secondary" size="sm">
              Bookings
            </ButtonLink>
            <ButtonLink to="/host/listings/new" variant="primary" size="sm">
              <Icon name="plus" size={14} /> Add a charger
            </ButtonLink>
          </div>
        </div>

        {disputes > 0 && (
          <div style={{ marginBottom: 18 }}>
            <Alert tone="warn" title={`${disputes} booking(s) under review`}>
              Support is reviewing a reported session. Keep an eye on your bookings page.
            </Alert>
          </div>
        )}

        <div className="stat-grid">
          <div className="stat">
            <div className="stat__label">Net earnings</div>
            <div className="stat__value tabular">{money(earnings.net, earnings.currency)}</div>
            <div className="stat__hint">
              {earnings.platformFeePercent}% platform fee already excluded
            </div>
          </div>
          <div className="stat">
            <div className="stat__label">Completed sessions</div>
            <div className="stat__value tabular">{earnings.sessions}</div>
            <div className="stat__hint">Sessions marked complete</div>
          </div>
          <div className="stat">
            <div className="stat__label">Live listings</div>
            <div className="stat__value tabular">{live.length}</div>
            <div className="stat__hint">
              {statusCounts.pending ? `${statusCounts.pending} waiting for review` : 'Nothing pending review'}
            </div>
          </div>
          <div className="stat">
            <div className="stat__label">Upcoming bookings</div>
            <div className="stat__value tabular">{upcoming.length}</div>
            <div className="stat__hint">Next 5 confirmed sessions</div>
          </div>
        </div>

        <div className="stack-lg">
          <Card className="panel">
            <div className="panel__head">
              <h2>Your listings</h2>
              <ButtonLink to="/host/listings/new" variant="secondary" size="sm">
                Add charger
              </ButtonLink>
            </div>

            {listings.length === 0 ? (
              <EmptyState
                icon="home"
                title="No chargers listed yet"
                description="Add your charger, describe the parking and set your availability. Listings go live after a quick review."
                action={
                  <ButtonLink to="/host/listings/new" variant="primary" size="md">
                    Create your first listing
                  </ButtonLink>
                }
              />
            ) : (
              <div className="stack">
                {listings.map((listing) => (
                  <div className="list-row" key={listing.id}>
                    {listing.photos?.[0]?.url ? (
                      <img className="thumb" src={listing.photos[0].url} alt="" />
                    ) : (
                      <div className="thumb" style={{ display: 'grid', placeItems: 'center', color: 'var(--terracotta)' }}>
                        <Icon name="plug" size={20} />
                      </div>
                    )}

                    <div className="list-row__main">
                      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                        <span className="list-row__title">{listing.title}</span>
                        <Badge tone={listingStatusTone(listing.status)}>{titleCase(listing.status)}</Badge>
                      </div>
                      <div className="list-row__sub">
                        {listing.area}, {listing.city} · {listing.connector} · {listing.powerKw} kW ·{' '}
                        {money(listing.pricePerHour, listing.currency)}/hr
                      </div>
                      {listing.status === 'rejected' && listing.rejectionReason && (
                        <div className="tiny" style={{ color: 'var(--danger)', marginTop: 4 }}>
                          Rejected: {listing.rejectionReason}
                        </div>
                      )}
                      {listing.status === 'pending' && (
                        <div className="tiny muted" style={{ marginTop: 4 }}>
                          Waiting for an admin to approve it. Nothing else is needed from you — it appears
                          in driver search as soon as it is approved, usually within one working day.
                        </div>
                      )}
                    </div>

                    <div className="row row--wrap" style={{ gap: 6 }}>
                      <ButtonLink to={`/host/listings/${listing.id}`} variant="secondary" size="sm">
                        Edit
                      </ButtonLink>
                      {['draft', 'rejected'].includes(listing.status) && (
                        <Button
                          variant="primary"
                          size="sm"
                          loading={busyId === listing.id}
                          onClick={() => act(listing, 'submit')}
                        >
                          Submit
                        </Button>
                      )}
                      {listing.status === 'approved' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={busyId === listing.id}
                          onClick={() => act(listing, 'pause')}
                        >
                          Pause
                        </Button>
                      )}
                      {listing.status === 'paused' && (
                        <Button
                          variant="primary"
                          size="sm"
                          loading={busyId === listing.id}
                          onClick={() => act(listing, 'resume')}
                        >
                          Resume
                        </Button>
                      )}
                      <Link className="btn btn--ghost btn--sm" to={`/chargers/${listing.id}`}>
                        Preview
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="panel">
            <div className="panel__head">
              <h2>Upcoming sessions</h2>
              <ButtonLink to="/host/bookings" variant="ghost" size="sm">
                All bookings
              </ButtonLink>
            </div>
            {upcoming.length === 0 ? (
              <p className="small muted">
                No confirmed sessions yet. Listings that are live and priced competitively appear in
                searches near your area.
              </p>
            ) : (
              <div className="stack">
                {upcoming.map((booking) => (
                  <div className="list-row" key={booking.id}>
                    <div className="list-row__main">
                      <div className="list-row__title tabular">{booking.ref}</div>
                      <div className="list-row__sub">
                        {dayOnly(booking.startAt)} · {timeOnly(booking.startAt)} – {timeOnly(booking.endAt)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="strong tabular">{money(booking.subtotal, earnings.currency)}</div>
                      <div className="tiny muted">your earning</div>
                    </div>
                    <Link className="link-button" to={`/bookings/${booking.ref}`}>
                      Open
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="panel">
            <h2 style={{ fontSize: '1.02rem', marginBottom: 10 }}>Before you publish</h2>
            <ul className="checklist">
              {[
                'You have permission from the property owner or household to offer charging.',
                'The charger is installed safely with working protection, and the cable is in good condition.',
                'Your photos show the actual charger and the parking space.',
                'Your availability windows are realistic — pause the listing when you cannot host.',
                'Your house rules are clear about parking, arrival and supervision.',
              ].map((item) => (
                <li key={item}>
                  <span className="checklist__mark checklist__mark--done">
                    <Icon name="check" size={11} />
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="row" style={{ marginTop: 14 }}>
              <Link className="link-button" to="/policies/hosts">
                Read the host rules <Icon name="arrow" size={14} />
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Skeleton,
  Tabs,
  Textarea,
} from '../../components/ui.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../lib/api.js';
import { bookingStatusTone, dayOnly, money, titleCase } from '../../lib/format.js';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'queue', label: 'Review queue' },
  { value: 'reports', label: 'Reports' },
  { value: 'bookings', label: 'Bookings' },
  { value: 'users', label: 'Users' },
];

export default function AdminConsole() {
  const { toast } = useApp();
  const [tab, setTab] = useState('overview');
  const [metrics, setMetrics] = useState({ loading: true, data: null, error: null });
  const [queue, setQueue] = useState({ loading: true, items: [], error: null });
  const [reports, setReports] = useState({ loading: true, items: [], error: null });
  const [users, setUsers] = useState({ loading: false, items: [], error: null, query: '' });
  const [bookings, setBookings] = useState({ loading: false, items: [], error: null, query: '' });
  const [busy, setBusy] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [resolution, setResolution] = useState({ id: null, text: '' });

  const loadMetrics = useCallback(() => {
    api
      .get('/admin/summary')
      .then((data) => setMetrics({ loading: false, data, error: null }))
      .catch((error) => setMetrics({ loading: false, data: null, error }));
  }, []);

  const loadQueue = useCallback(() => {
    setQueue((current) => ({ ...current, loading: true }));
    api
      .get('/admin/review-queue?status=pending')
      .then((data) => setQueue({ loading: false, items: data.listings, error: null }))
      .catch((error) => setQueue({ loading: false, items: [], error }));
  }, []);

  const loadReports = useCallback(() => {
    api
      .get('/admin/reports')
      .then((data) => setReports({ loading: false, items: data.reports, error: null }))
      .catch((error) => setReports({ loading: false, items: [], error }));
  }, []);

  useEffect(() => {
    loadMetrics();
    loadQueue();
    loadReports();
  }, [loadMetrics, loadQueue, loadReports]);

  const review = async (listing, decision, reason) => {
    setBusy(listing.id);
    try {
      await api.post(`/admin/listings/${listing.id}/review`, { decision, reason });
      toast(decision === 'approve' ? 'Listing approved and live.' : 'Listing rejected.');
      setRejectTarget(null);
      setRejectReason('');
      loadQueue();
      loadMetrics();
    } catch (error) {
      toast(error.message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  const resolveReport = async (report, status) => {
    setBusy(report.id);
    try {
      await api.post(`/admin/reports/${report.id}/resolve`, {
        status,
        resolution: resolution.id === report.id ? resolution.text.trim() || undefined : undefined,
      });
      toast('Report updated.');
      setResolution({ id: null, text: '' });
      loadReports();
    } catch (error) {
      toast(error.message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  const searchUsers = async (query) => {
    setUsers((current) => ({ ...current, loading: true, query }));
    try {
      const data = await api.get(`/admin/users?q=${encodeURIComponent(query)}`);
      setUsers({ loading: false, items: data.users, error: null, query });
    } catch (error) {
      setUsers({ loading: false, items: [], error, query });
    }
  };

  const searchBookings = async (query) => {
    setBookings((current) => ({ ...current, loading: true, query }));
    try {
      const data = await api.get(`/admin/bookings?q=${encodeURIComponent(query)}`);
      setBookings({ loading: false, items: data.bookings, error: null, query });
    } catch (error) {
      setBookings({ loading: false, items: [], error, query });
    }
  };

  const setUserStatus = async (user, status) => {
    setBusy(user.id);
    try {
      await api.post(`/admin/users/${user.id}/status`, { status });
      toast(`Account ${status === 'suspended' ? 'suspended' : 'reactivated'}.`);
      searchUsers(users.query);
    } catch (error) {
      toast(error.message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="dash">
      <div className="container">
        <div className="dash-head">
          <div>
            <h1>Admin console</h1>
            <p className="muted small" style={{ marginTop: 6 }}>
              Listing review, reports and account actions. Sensitive actions are recorded in the audit log.
            </p>
          </div>
          <Badge tone="warn">Staff only</Badge>
        </div>

        <Tabs
          tabs={TABS.map((item) =>
            item.value === 'queue'
              ? { ...item, count: queue.items.length }
              : item.value === 'reports'
                ? { ...item, count: reports.items.filter((r) => r.status !== 'RESOLVED').length }
                : item,
          )}
          value={tab}
          onChange={setTab}
        />

        <div style={{ marginTop: 22 }}>
          {tab === 'overview' && (
            metrics.loading ? (
              <Skeleton height={120} radius={16} />
            ) : metrics.error ? (
              <Alert tone="danger" title="Could not load metrics">{metrics.error.message}</Alert>
            ) : (
              <div className="stat-grid">
                {[
                  { label: 'Active users', value: metrics.data.metrics.users },
                  { label: 'Live listings', value: metrics.data.metrics.live_listings },
                  { label: 'Awaiting review', value: metrics.data.metrics.pending_listings },
                  { label: 'Active bookings', value: metrics.data.metrics.active_bookings },
                  { label: 'Open reports', value: metrics.data.metrics.open_reports },
                  {
                    label: 'Booking value',
                    value: money(metrics.data.metrics.booking_value, metrics.data.currency),
                  },
                ].map((stat) => (
                  <div className="stat" key={stat.label}>
                    <div className="stat__label">{stat.label}</div>
                    <div className="stat__value tabular">{stat.value}</div>
                  </div>
                ))}
              </div>
            )
          )}

          {tab === 'queue' && (
            queue.loading ? (
              <Skeleton height={160} radius={16} />
            ) : queue.error ? (
              <Alert tone="danger" title="Could not load the queue">{queue.error.message}</Alert>
            ) : queue.items.length === 0 ? (
              <EmptyState icon="check" title="Review queue is empty" description="No listings are waiting for approval." />
            ) : (
              <div className="stack">
                {queue.items.map((listing) => (
                  <Card className="card--pad" key={listing.id}>
                    <div className="row row--wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
                      {listing.photos?.[0] ? (
                        <img className="thumb" src={listing.photos[0]} alt="" style={{ width: 120, height: 88 }} />
                      ) : (
                        <div className="thumb" style={{ width: 120, height: 88 }} />
                      )}
                      <div className="grow" style={{ minWidth: 240 }}>
                        <h3 style={{ fontSize: '1rem' }}>{listing.title}</h3>
                        <p className="small muted" style={{ marginTop: 4 }}>
                          {listing.area}, {listing.city} · {listing.connector} · {listing.powerKw} kW ·{' '}
                          {money(listing.pricePerHour)}/hr
                        </p>
                        <p className="small" style={{ marginTop: 6, maxWidth: '60ch' }}>{listing.description}</p>
                        <p className="tiny muted" style={{ marginTop: 6 }}>
                          Private address: {listing.addressLine} · Host {listing.host.name || listing.host.phone} ·
                          submitted {dayOnly(listing.submittedAt)}
                        </p>
                        <div className="row row--wrap" style={{ marginTop: 10 }}>
                          {listing.photos.slice(1).map((url) => (
                            <img key={url} src={url} alt="" style={{ width: 62, height: 46, objectFit: 'cover', borderRadius: 8 }} />
                          ))}
                        </div>
                      </div>
                      <div className="row row--wrap">
                        <Button
                          variant="primary"
                          size="sm"
                          loading={busy === listing.id}
                          onClick={() => review(listing, 'approve')}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            setRejectTarget(listing);
                            setRejectReason('');
                          }}
                        >
                          Reject
                        </Button>
                        <Link className="btn btn--ghost btn--sm" to={`/chargers/${listing.id}`}>
                          Preview
                        </Link>
                      </div>
                    </div>

                    {rejectTarget?.id === listing.id && (
                      <div style={{ marginTop: 14 }}>
                        <Field label="Reason for rejection" hint="The host sees this, so be specific and kind.">
                          <Textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
                        </Field>
                        <div className="row" style={{ marginTop: 8 }}>
                          <Button
                            variant="danger"
                            size="sm"
                            loading={busy === listing.id}
                            disabled={!rejectReason.trim()}
                            onClick={() => review(listing, 'reject', rejectReason.trim())}
                          >
                            Confirm rejection
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setRejectTarget(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )
          )}

          {tab === 'reports' && (
            reports.loading ? (
              <Skeleton height={120} radius={16} />
            ) : reports.items.length === 0 ? (
              <EmptyState icon="check" title="No reports" description="Nothing has been reported yet." />
            ) : (
              <div className="stack">
                {reports.items.map((report) => (
                  <Card className="card--pad" key={report.id}>
                    <div className="row row--between row--wrap" style={{ gap: 10 }}>
                      <div>
                        <div className="row" style={{ gap: 8 }}>
                          <Badge tone={report.status === 'RESOLVED' ? 'success' : report.status === 'REVIEWING' ? 'info' : 'warn'}>
                            {titleCase(report.status)}
                          </Badge>
                          <strong className="small">{report.category}</strong>
                          <span className="tiny muted">
                            {report.targetType} · {dayOnly(report.createdAt)}
                          </span>
                        </div>
                        <p className="small" style={{ marginTop: 8, maxWidth: '70ch' }}>{report.details}</p>
                        <p className="tiny muted" style={{ marginTop: 6 }}>
                          Reported by {report.reporter.name || 'account'} ({report.reporter.phone})
                          {report.targetType === 'booking' && report.targetId ? (
                            <>
                              {' '}·{' '}
                              <Link className="link-button" to={`/bookings/${report.targetId}`}>
                                open booking
                              </Link>
                            </>
                          ) : null}
                        </p>
                        {report.resolution && (
                          <p className="small" style={{ marginTop: 6, color: 'var(--green-dark)' }}>
                            Resolution: {report.resolution}
                          </p>
                        )}
                      </div>
                      <div className="row row--wrap">
                        {report.status !== 'RESOLVED' && (
                          <>
                            <Button variant="secondary" size="sm" loading={busy === report.id} onClick={() => resolveReport(report, 'REVIEWING')}>
                              Mark reviewing
                            </Button>
                            <Button variant="primary" size="sm" loading={busy === report.id} onClick={() => resolveReport(report, 'RESOLVED')}>
                              Resolve
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    {report.status !== 'RESOLVED' && (
                      <div style={{ marginTop: 12 }}>
                        <Field label="Resolution note (optional)" hint="Shared with the reporter when resolved.">
                          <Input
                            value={resolution.id === report.id ? resolution.text : ''}
                            onChange={(event) => setResolution({ id: report.id, text: event.target.value })}
                            placeholder="Refund issued / listing paused / no action needed"
                          />
                        </Field>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )
          )}

          {tab === 'bookings' && (
            <div className="stack">
              <Card className="card--pad">
                <form
                  className="row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    searchBookings(event.currentTarget.elements.query.value);
                  }}
                >
                  <Input name="query" placeholder="Booking reference" style={{ maxWidth: 320 }} />
                  <Button type="submit" variant="primary" size="sm" loading={bookings.loading}>
                    Search
                  </Button>
                </form>
              </Card>

              {bookings.error && <Alert tone="danger">{bookings.error.message}</Alert>}

              {bookings.items.length > 0 && (
                <Card className="card--pad">
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Ref</th>
                          <th>Status</th>
                          <th>Start</th>
                          <th>Total</th>
                          <th>Driver</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {bookings.items.map((booking) => (
                          <tr key={booking.id}>
                            <td className="tabular">{booking.ref}</td>
                            <td><Badge tone={bookingStatusTone(booking.status)}>{titleCase(booking.status)}</Badge></td>
                            <td>{dayOnly(booking.startAt)}</td>
                            <td className="tabular">{money(booking.total, booking.currency)}</td>
                            <td>{booking.driver?.name || '—'}</td>
                            <td>
                              <Link className="link-button" to={`/bookings/${booking.ref}`}>
                                Open
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>
          )}

          {tab === 'users' && (
            <div className="stack">
              <Card className="card--pad">
                <form
                  className="row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    searchUsers(event.currentTarget.elements.query.value);
                  }}
                >
                  <Input name="query" placeholder="Phone number or name" style={{ maxWidth: 320 }} />
                  <Button type="submit" variant="primary" size="sm" loading={users.loading}>
                    Search
                  </Button>
                </form>
              </Card>

              {users.error && <Alert tone="danger">{users.error.message}</Alert>}

              {users.items.length > 0 && (
                <Card className="card--pad">
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Phone</th>
                          <th>Roles</th>
                          <th>Status</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {users.items.map((user) => (
                          <tr key={user.id}>
                            <td>{user.name || '—'}</td>
                            <td className="tabular">{user.phone}</td>
                            <td>{user.roles.join(', ')}</td>
                            <td>
                              <Badge tone={user.status === 'active' ? 'success' : 'danger'}>
                                {titleCase(user.status)}
                              </Badge>
                            </td>
                            <td>
                              <Button
                                variant={user.status === 'active' ? 'danger' : 'secondary'}
                                size="sm"
                                loading={busy === user.id}
                                onClick={() => setUserStatus(user, user.status === 'active' ? 'suspended' : 'active')}
                              >
                                {user.status === 'active' ? 'Suspend' : 'Reactivate'}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CopyButton,
  Field,
  Icon,
  Modal,
  Select,
  Skeleton,
  Textarea,
} from '../components/ui.jsx';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';
import { bookingStatusTone, dayOnly, durationLabel, money, timeOnly, titleCase } from '../lib/format.js';

const REPORT_CATEGORIES = [
  'Unsafe charger or wiring',
  'Charger not available',
  'Address or access problem',
  'Unfair treatment',
  'Payment or refund issue',
  'No-show',
  'Other',
];

function refundPreview(startAt, cancellation) {
  if (!startAt || !cancellation) return null;
  const hours = (new Date(startAt).getTime() - Date.now()) / 3_600_000;
  if (hours >= cancellation.freeUntilHours) return { percent: 100, hours };
  if (hours >= cancellation.partialUntilHours) return { percent: cancellation.partialRefundPercent, hours };
  return { percent: 0, hours };
}

export default function BookingDetail() {
  const { ref } = useParams();
  const navigate = useNavigate();
  const { meta, session, toast } = useApp();

  const [state, setState] = useState({ loading: true, error: null, booking: null, cancellation: null });
  const [action, setAction] = useState({ busy: false, error: null });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [checkin, setCheckin] = useState({ open: false, code: '', error: null, busy: false });
  const [review, setReview] = useState({ rating: 5, comment: '', busy: false, error: null });
  const [report, setReport] = useState({ open: false, category: REPORT_CATEGORIES[0], details: '', busy: false, error: null });

  const load = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }));
    api
      .get(`/bookings/${ref}`)
      .then((data) => setState({ loading: false, error: null, booking: data.booking, cancellation: data.cancellation }))
      .catch((error) => setState({ loading: false, error, booking: null, cancellation: null }));
  }, [ref]);

  useEffect(load, [load]);

  const booking = state.booking;
  const preview = useMemo(
    () => (booking ? refundPreview(booking.startAt, meta?.cancellation) : null),
    [booking, meta],
  );

  const runAction = async (fn, successMessage) => {
    setAction({ busy: true, error: null });
    try {
      await fn();
      setAction({ busy: false, error: null });
      if (successMessage) toast(successMessage);
      load();
      return true;
    } catch (error) {
      setAction({ busy: false, error });
      return false;
    }
  };

  if (state.loading) {
    return (
      <div className="page">
        <div className="container" style={{ maxWidth: 860 }}>
          <Skeleton height={28} width="40%" />
          <div style={{ height: 18 }} />
          <Skeleton height={220} radius={20} />
        </div>
      </div>
    );
  }

  if (state.error || !booking) {
    return (
      <div className="page">
        <div className="container page-narrow">
          <Card className="card--pad center">
            <h1 style={{ fontSize: '1.35rem' }}>Booking not found</h1>
            <p className="muted" style={{ marginTop: 8 }}>
              {state.error?.message || 'This booking may have been removed, or it belongs to another account.'}
            </p>
            <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
              <ButtonLink to="/bookings">My bookings</ButtonLink>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const isDriver = booking.viewerRole === 'driver';
  const address = booking.privateDetails;
  const mapsHref = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        address.addressLine ? `${address.addressLine}, ${booking.listing?.city ?? ''}` : `${address.lat},${address.lng}`,
      )}`
    : null;

  return (
    <div className="dash">
      <div className="container" style={{ maxWidth: 960 }}>
        <div className="row row--between row--wrap" style={{ marginBottom: 18 }}>
          <div>
            <button type="button" className="link-button" onClick={() => navigate('/bookings')}>
              <Icon name="arrow" size={14} style={{ transform: 'rotate(180deg)' }} /> All bookings
            </button>
            <h1 style={{ marginTop: 8 }}>{booking.listing?.title ?? 'Charging session'}</h1>
            <p className="small muted" style={{ marginTop: 4 }}>
              Booking <strong className="tabular">{booking.ref}</strong> · {dayOnly(booking.startAt, booking.timezone)},{' '}
              {timeOnly(booking.startAt, booking.timezone)} – {timeOnly(booking.endAt, booking.timezone)} (
              {durationLabel(booking.durationMin)})
            </p>
          </div>
          <Badge tone={bookingStatusTone(booking.status)}>{titleCase(booking.status)}</Badge>
        </div>

        {action.error && (
          <div style={{ marginBottom: 16 }}>
            <Alert tone="danger" title="That did not work">{action.error.message}</Alert>
          </div>
        )}

        {booking.status === 'CANCELLED' && (
          <div style={{ marginBottom: 16 }}>
            <Alert tone="info" title="This booking was cancelled">
              Cancelled by the {booking.cancelledBy || 'user'}.
              {booking.refundPercent > 0
                ? ` ${booking.refundPercent}% refund applies${
                    booking.refundAmount > 0 ? ` (${money(booking.refundAmount, booking.currency)})` : ''
                  }.`
                : ' No refund applies under the cancellation policy.'}
              {booking.cancelReason ? ` Reason: ${booking.cancelReason}` : ''}
            </Alert>
          </div>
        )}

        {booking.status === 'CONFIRMED' && booking.payment?.status === 'DUE_AT_SESSION' && (
          <div style={{ marginBottom: 16 }}>
            <Alert tone="warn" title="Payment due at the session">
              No online payment was taken. Settle {money(booking.total, booking.currency)} with the host
              when you arrive, or the platform can collect it once a payment provider is connected.
            </Alert>
          </div>
        )}

        <div className="stack-lg">
          <Card className="card--pad">
            <h2 style={{ fontSize: '1.02rem', marginBottom: 14 }}>Session</h2>
            <div className="spec-grid">
              <div className="spec-block">
                <div className="spec-block__label">Date</div>
                <div className="spec-block__value">{dayOnly(booking.startAt, booking.timezone)}</div>
              </div>
              <div className="spec-block">
                <div className="spec-block__label">Window</div>
                <div className="spec-block__value">
                  {timeOnly(booking.startAt, booking.timezone)} – {timeOnly(booking.endAt, booking.timezone)}
                </div>
              </div>
              <div className="spec-block">
                <div className="spec-block__label">Duration</div>
                <div className="spec-block__value">{durationLabel(booking.durationMin)}</div>
              </div>
              <div className="spec-block">
                <div className="spec-block__label">Connector</div>
                <div className="spec-block__value">
                  {booking.listing?.connector} · {booking.listing?.powerKw} kW
                </div>
              </div>
              <div className="spec-block">
                <div className="spec-block__label">{isDriver ? 'Host' : 'Driver'}</div>
                <div className="spec-block__value">
                  {isDriver ? booking.host?.name || 'ChargeNeighbor host' : booking.driver?.name || 'Driver'}
                </div>
              </div>
              <div className="spec-block">
                <div className="spec-block__label">Payment</div>
                <div className="spec-block__value small">
                  {booking.payment ? titleCase(booking.payment.status) : 'Not recorded'}
                  {booking.payment?.mode === 'offline' && <span className="muted"> · offline</span>}
                </div>
              </div>
            </div>
          </Card>

          <Card className="card--pad">
            <h2 style={{ fontSize: '1.02rem', marginBottom: 12 }}>
              {address ? 'Where to go' : 'Address privacy'}
            </h2>

            {address ? (
              <div className="stack">
                <div>
                  <div className="field__label">Address</div>
                  <p className="strong">{address.addressLine}</p>
                  <p className="small muted">
                    {booking.listing?.area}, {booking.listing?.city}
                    {address.pincode ? ` ${address.pincode}` : ''}
                  </p>
                </div>
                {address.accessNotes && (
                  <div>
                    <div className="field__label">Arrival notes from the host</div>
                    <p className="small" style={{ whiteSpace: 'pre-line' }}>{address.accessNotes}</p>
                  </div>
                )}
                {mapsHref && (
                  <a className="btn btn--secondary btn--sm" href={mapsHref} target="_blank" rel="noreferrer">
                    <Icon name="pin" size={14} /> Open directions
                  </a>
                )}
              </div>
            ) : (
              <p className="small muted">
                The exact address is shared once a booking is confirmed. This booking is{' '}
                {titleCase(booking.status).toLowerCase()}, so the host address stays private.
              </p>
            )}

            {isDriver && ['CONFIRMED', 'IN_PROGRESS'].includes(booking.status) && booking.checkinCode && (
              <>
                <hr className="divider" />
                <div className="row row--between row--wrap" style={{ gap: 14 }}>
                  <div>
                    <div className="field__label">Check-in code</div>
                    <p className="tiny muted">Show this to the host, or use it to start your session.</p>
                  </div>
                  <div className="row">
                    <span className="code-box">{booking.checkinCode}</span>
                    <CopyButton value={booking.checkinCode} label="Copy code" />
                  </div>
                </div>
                {booking.status === 'CONFIRMED' && (
                  <div style={{ marginTop: 14 }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setCheckin((current) => ({ ...current, open: true }))}
                    >
                      <Icon name="bolt" size={14} /> Start session
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card>

          <Card className="card--pad">
            <h2 style={{ fontSize: '1.02rem', marginBottom: 12 }}>Price</h2>
            <div className="stack">
              <div className="price-line">
                <span>
                  {money(booking.listing?.pricePerHour ?? 0, booking.currency)} × {durationLabel(booking.durationMin)}
                </span>
                <span className="tabular">{money(booking.subtotal, booking.currency)}</span>
              </div>
              <div className="price-line">
                <span>Platform fee</span>
                <span className="tabular">{money(booking.fee, booking.currency)}</span>
              </div>
              <div className="price-line price-line--total">
                <span>Total</span>
                <span className="tabular">{money(booking.total, booking.currency)}</span>
              </div>
              {booking.refundPercent > 0 && (
                <div className="price-line">
                  <span>Refund recorded ({booking.refundPercent}%)</span>
                  <span className="tabular">{money(booking.refundAmount, booking.currency)}</span>
                </div>
              )}
            </div>
          </Card>

          <Card className="card--pad">
            <h2 style={{ fontSize: '1.02rem', marginBottom: 12 }}>Actions</h2>
            <div className="row row--wrap" style={{ gap: 10 }}>
              {booking.canCancel && (
                <Button variant="secondary" size="sm" onClick={() => setCancelOpen(true)}>
                  Cancel booking
                </Button>
              )}
              {['CONFIRMED', 'IN_PROGRESS'].includes(booking.status) && (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={action.busy}
                  onClick={() => runAction(() => api.post(`/bookings/${booking.ref}/complete`), 'Session marked complete.')}
                >
                  <Icon name="check" size={14} /> Mark session complete
                </Button>
              )}
              {!isDriver && booking.status === 'CONFIRMED' && (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={action.busy}
                  onClick={() => runAction(() => api.post(`/bookings/${booking.ref}/no-show`), 'Booking marked as no-show.')}
                >
                  Mark no-show
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setReport((current) => ({ ...current, open: true }))}>
                <Icon name="alert" size={14} /> Report an issue
              </Button>
              <Link className="btn btn--ghost btn--sm" to="/policies/cancellation">
                Cancellation policy
              </Link>
            </div>

            {preview && booking.canCancel && (
              <p className="tiny muted" style={{ marginTop: 12 }}>
                Right now: {preview.percent}% refund if you cancel{' '}
                {preview.hours >= 0 ? `(${Math.floor(preview.hours)}h before the start)` : '(session already started)'}.
              </p>
            )}
          </Card>

          {booking.status === 'COMPLETED' && isDriver && (
            <Card className="card--pad">
              <h2 style={{ fontSize: '1.02rem', marginBottom: 12 }}>Review this session</h2>
              {booking.review ? (
                <div className="row" style={{ gap: 8 }}>
                  <span className="row" style={{ gap: 2, color: 'var(--terracotta)' }}>
                    {Array.from({ length: booking.review.rating }).map((_, index) => (
                      <Icon key={index} name="star" size={14} />
                    ))}
                  </span>
                  <span className="small muted">{booking.review.comment || 'Rated'}</span>
                </div>
              ) : (
                <div className="stack">
                  {review.error && <Alert tone="danger">{review.error.message}</Alert>}
                  <Field label="Rating">
                    <div className="row" style={{ gap: 6 }}>
                      {[1, 2, 3, 4, 5].map((value) => (
                        <button
                          key={value}
                          type="button"
                          className={`chip ${review.rating === value ? 'chip--active' : ''}`}
                          onClick={() => setReview((current) => ({ ...current, rating: value }))}
                          aria-pressed={review.rating === value}
                        >
                          {value} ★
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field
                    label="Comment"
                    hint="Describe the charging visit. Do not include addresses or personal details."
                  >
                    <Textarea
                      value={review.comment}
                      onChange={(event) => setReview((current) => ({ ...current, comment: event.target.value }))}
                      placeholder="Charger worked as described, easy parking…"
                    />
                  </Field>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={review.busy}
                    onClick={async () => {
                      setReview((current) => ({ ...current, busy: true, error: null }));
                      try {
                        await api.post(`/bookings/${booking.ref}/review`, {
                          rating: review.rating,
                          comment: review.comment.trim() || undefined,
                        });
                        toast('Thanks for the review.');
                        load();
                      } catch (error) {
                        setReview((current) => ({ ...current, busy: false, error }));
                      }
                    }}
                  >
                    Submit review
                  </Button>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Cancel */}
      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this booking?"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setCancelOpen(false)}>
              Keep booking
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={action.busy}
              onClick={async () => {
                const ok = await runAction(
                  () =>
                    api.post(`/bookings/${booking.ref}/cancel`, {
                      reason: cancelReason.trim() || undefined,
                    }),
                  'Booking cancelled.',
                );
                if (ok) setCancelOpen(false);
              }}
            >
              Cancel booking
            </Button>
          </>
        }
      >
        <div className="stack">
          <Alert tone={preview?.percent === 0 ? 'warn' : 'info'} title={`${preview?.percent ?? 0}% refund applies now`}>
            {preview?.percent === 100
              ? 'You are inside the free cancellation window.'
              : preview?.percent === 0
                ? 'The free cancellation window has passed for this session.'
                : 'You are inside the partial refund window.'}
            {booking.payment?.mode === 'offline' && ' No online payment was collected, so nothing is refunded through the platform.'}
          </Alert>
          <Field label="Reason (optional)" hint="Shared with the host to help them plan.">
            <Textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} />
          </Field>
        </div>
      </Modal>

      {/* Check-in */}
      <Modal
        open={checkin.open}
        onClose={() => setCheckin((current) => ({ ...current, open: false }))}
        title="Start your session"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setCheckin((current) => ({ ...current, open: false }))}>
              Close
            </Button>
            <Button
              variant="ev"
              size="sm"
              loading={checkin.busy}
              onClick={async () => {
                setCheckin((current) => ({ ...current, busy: true, error: null }));
                try {
                  await api.post(`/bookings/${booking.ref}/checkin`, { code: checkin.code });
                  toast('Session started. Enjoy your charge.');
                  setCheckin({ open: false, code: '', error: null, busy: false });
                  load();
                } catch (error) {
                  setCheckin((current) => ({ ...current, busy: false, error }));
                }
              }}
            >
              Check in
            </Button>
          </>
        }
      >
        <div className="stack">
          <p className="small muted">
            Check-in opens 30 minutes before your session. Enter the code from this booking to record
            that you have arrived.
          </p>
          {checkin.error && <Alert tone="danger">{checkin.error.message}</Alert>}
          <Field label="Check-in code">
            <input
              className="input otp-input"
              inputMode="numeric"
              maxLength={6}
              value={checkin.code}
              onChange={(event) =>
                setCheckin((current) => ({ ...current, code: event.target.value.replace(/\D/g, '') }))
              }
            />
          </Field>
        </div>
      </Modal>

      {/* Report */}
      <Modal
        open={report.open}
        onClose={() => setReport((current) => ({ ...current, open: false }))}
        title="Report an issue"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setReport((current) => ({ ...current, open: false }))}>
              Close
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={report.busy}
              disabled={report.details.trim().length < 20}
              onClick={async () => {
                setReport((current) => ({ ...current, busy: true, error: null }));
                try {
                  await api.post('/reports', {
                    targetType: 'booking',
                    targetId: booking.id,
                    category: report.category,
                    details: report.details,
                  });
                  toast('Report sent to support.');
                  setReport((current) => ({ ...current, open: false, busy: false, details: '' }));
                } catch (error) {
                  setReport((current) => ({ ...current, busy: false, error }));
                }
              }}
            >
              Send report
            </Button>
          </>
        }
      >
        <div className="stack">
          {report.error && <Alert tone="danger">{report.error.message}</Alert>}
          <Field label="Category">
            <Select
              value={report.category}
              onChange={(event) => setReport((current) => ({ ...current, category: event.target.value }))}
            >
              {REPORT_CATEGORIES.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </Select>
          </Field>
          <Field label="What happened?" hint="At least a couple of sentences. Support reads this with the booking record.">
            <Textarea
              value={report.details}
              onChange={(event) => setReport((current) => ({ ...current, details: event.target.value }))}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  Field,
  Icon,
  Modal,
  Select,
  Skeleton,
  Textarea,
} from '../components/ui.jsx';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';
import { dayOnly, durationLabel, money, timeOnly } from '../lib/format.js';

const REPORT_CATEGORIES = [
  'Unsafe charger or wiring',
  'Charger not available',
  'Listing inaccurate',
  'Address or access problem',
  'Unfair treatment',
  'Other',
];

function durationOptions(min, max) {
  const base = [60, 90, 120, 180, 240, 300, 360, 480, 600];
  const values = new Set([min, ...base.filter((value) => value >= min && value <= max)]);
  return [...values].filter((value) => value >= min && value <= max).sort((a, b) => a - b);
}

export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { session, meta, toast } = useApp();

  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [selectedDay, setSelectedDay] = useState(null);
  const [durationMin, setDurationMin] = useState(null);
  const [slots, setSlots] = useState({ loading: false, error: null, data: null });
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [booking, setBooking] = useState({ submitting: false, error: null });
  const [saved, setSaved] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [report, setReport] = useState({ category: REPORT_CATEGORIES[0], details: '', state: 'idle', error: null });

  const load = useCallback(() => {
    setState({ loading: true, error: null, data: null });
    api
      .get(`/listings/${id}`)
      .then((data) => {
        setState({ loading: false, error: null, data });
        setSaved(Boolean(data.saved));
        setDurationMin((current) => current ?? data.listing.minDurationMin);
        const firstDay = data.days?.find((day) => day.slotCount > 0) ?? data.days?.[0];
        setSelectedDay((current) => current ?? firstDay?.date ?? null);
      })
      .catch((error) => setState({ loading: false, error, data: null }));
  }, [id]);

  useEffect(load, [load]);

  useEffect(() => {
    if (!selectedDay || !durationMin || !state.data) return undefined;
    let active = true;
    setSlots((current) => ({ ...current, loading: true, error: null }));
    setSelectedSlot(null);

    api
      .get(`/listings/${id}/availability?date=${selectedDay}&durationMin=${durationMin}`)
      .then((data) => {
        if (!active) return;
        setSlots({ loading: false, error: null, data });
      })
      .catch((error) => {
        if (active) setSlots({ loading: false, error, data: null });
      });

    return () => {
      active = false;
    };
  }, [id, selectedDay, durationMin, state.data]);

  const listing = state.data?.listing;

  const price = useMemo(() => {
    if (!listing || !durationMin) return null;
    const subtotal = Math.round(((listing.pricePerHour * durationMin) / 60) * 100) / 100;
    const feePercent = meta?.platformFeePercent ?? 8;
    const fee = Math.round(subtotal * feePercent) / 100;
    return { subtotal, fee, total: Math.round((subtotal + fee) * 100) / 100, feePercent };
  }, [listing, durationMin, meta]);

  const reserve = async () => {
    if (!selectedSlot) return;
    if (!session.user) {
      navigate(`/login?redirect=${encodeURIComponent(`/chargers/${id}`)}`);
      return;
    }
    setBooking({ submitting: true, error: null });
    try {
      const data = await api.post('/bookings', {
        listingId: id,
        startAt: selectedSlot.startAt,
        durationMin,
      });
      toast('Charging session booked.');
      navigate(`/bookings/${data.booking.ref}`);
    } catch (error) {
      setBooking({ submitting: false, error });
      if (error.status === 409) {
        // Slot was taken between rendering and confirming: refresh the grid.
        setSlots((current) => ({ ...current, loading: true }));
        api
          .get(`/listings/${id}/availability?date=${selectedDay}&durationMin=${durationMin}`)
          .then((data) => setSlots({ loading: false, error: null, data }))
          .catch((refreshError) => setSlots({ loading: false, error: refreshError, data: null }));
      }
    }
  };

  const toggleSaved = async () => {
    if (!session.user) {
      navigate(`/login?redirect=${encodeURIComponent(`/chargers/${id}`)}`);
      return;
    }
    try {
      if (saved) {
        await api.del(`/me/saved/${id}`);
        setSaved(false);
        toast('Removed from saved chargers.', 'info');
      } else {
        await api.post(`/me/saved/${id}`);
        setSaved(true);
        toast('Saved for later.');
      }
    } catch (error) {
      toast(error.message, 'danger');
    }
  };

  const submitReport = async () => {
    setReport((current) => ({ ...current, state: 'loading', error: null }));
    try {
      await api.post('/reports', {
        targetType: 'listing',
        targetId: id,
        category: report.category,
        details: report.details,
      });
      setReport({ category: REPORT_CATEGORIES[0], details: '', state: 'sent', error: null });
      toast('Report sent to support.');
    } catch (error) {
      setReport((current) => ({ ...current, state: 'idle', error }));
    }
  };

  if (state.loading) {
    return (
      <div className="container" style={{ padding: '32px 20px 64px' }}>
        <Skeleton height={340} radius={20} />
        <div className="detail-layout">
          <div className="stack-lg">
            <Skeleton height={32} width="60%" />
            <Skeleton height={16} width="40%" />
            <Skeleton height={120} radius={14} />
            <Skeleton height={180} radius={14} />
          </div>
          <Skeleton height={360} radius={20} />
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="page">
        <div className="container page-narrow">
          <Card className="card--pad center">
            <h1 style={{ fontSize: '1.35rem' }}>This charger is not available</h1>
            <p className="muted" style={{ marginTop: 8 }}>{state.error.message}</p>
            <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
              <ButtonLink to="/search">Browse other chargers</ButtonLink>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const days = state.data.days ?? [];
  const slotsData = slots.data;
  const durationChoices = durationOptions(listing.minDurationMin, listing.maxDurationMin);

  return (
    <div className="container">
      <div className="detail-layout">
        <div className="stack-lg">
          <div className="gallery">
            {listing.photos.length > 0 ? (
              <>
                <img className="gallery__main" src={listing.photos[0].url} alt={`${listing.title} — charger`} />
                {listing.photos.slice(1, 3).map((photo) => (
                  <img key={photo.id} src={photo.url} alt="" loading="lazy" />
                ))}
              </>
            ) : (
              <div className="gallery__empty">
                <Icon name="camera" size={28} />
                <span>The host has not added a photo yet.</span>
              </div>
            )}
          </div>

          <div>
            <div className="detail-head">
              <div>
                <h1 className="detail-title">{listing.title}</h1>
                <div className="detail-loc">
                  <Icon name="pin" size={15} />
                  {listing.area}, {listing.city}
                  <span className="muted">· approximate location only</span>
                </div>
              </div>
              <div className="row">
                <Button variant="secondary" size="sm" onClick={toggleSaved}>
                  <Icon name="star" size={14} /> {saved ? 'Saved' : 'Save'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setReportOpen(true)}>
                  Report listing
                </Button>
              </div>
            </div>

            <div className="row row--wrap" style={{ marginTop: 14 }}>
              <Badge tone="success" title="Charger details, photos and rules were checked by our team.">
                Reviewed listing
              </Badge>
              <Badge tone={listing.host?.phoneVerified ? 'info' : 'warn'}>
                {listing.host?.phoneVerified ? 'Host phone verified' : 'Host phone not verified'}
              </Badge>
              {listing.rating.count > 0 ? (
                <Badge tone="neutral">
                  <Icon name="star" size={11} /> {listing.rating.average} · {listing.rating.count} review
                  {listing.rating.count === 1 ? '' : 's'}
                </Badge>
              ) : (
                <Badge tone="outline">No reviews yet</Badge>
              )}
            </div>
          </div>

          <Card className="card--pad">
            <h2 style={{ fontSize: '1.05rem', marginBottom: 14 }}>Charger &amp; parking</h2>
            <div className="spec-grid">
              <div className="spec-block">
                <div className="spec-block__label">Connector</div>
                <div className="spec-block__value">{listing.connector}</div>
              </div>
              <div className="spec-block">
                <div className="spec-block__label">Rated power</div>
                <div className="spec-block__value">
                  {listing.powerKw} kW · {listing.currentType}
                </div>
              </div>
              <div className="spec-block">
                <div className="spec-block__label">Session length</div>
                <div className="spec-block__value">
                  {durationLabel(listing.minDurationMin)} – {durationLabel(listing.maxDurationMin)}
                </div>
              </div>
              <div className="spec-block">
                <div className="spec-block__label">Host rate</div>
                <div className="spec-block__value">{money(listing.pricePerHour, listing.currency)} / hour</div>
              </div>
              {listing.parkingType && (
                <div className="spec-block">
                  <div className="spec-block__label">Parking</div>
                  <div className="spec-block__value">{listing.parkingType}</div>
                </div>
              )}
              <div className="spec-block">
                <div className="spec-block__label">Host</div>
                <div className="spec-block__value">{listing.host?.displayName}</div>
              </div>
            </div>

            {listing.amenities.length > 0 && (
              <div className="row row--wrap" style={{ marginTop: 14 }}>
                {listing.amenities.map((amenity) => (
                  <span className="spec" key={amenity}>
                    <Icon name="check" size={11} /> {amenity}
                  </span>
                ))}
              </div>
            )}

            {listing.description && (
              <p className="muted" style={{ marginTop: 16, fontSize: '0.93rem', lineHeight: 1.65 }}>
                {listing.description}
              </p>
            )}
          </Card>

          <Card className="card--pad">
            <h2 style={{ fontSize: '1.05rem', marginBottom: 12 }}>House rules</h2>
            {listing.houseRules.length > 0 ? (
              <ul className="rule-list">
                {listing.houseRules.map((rule) => (
                  <li key={rule}>
                    <Icon name="check" size={14} /> {rule}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">
                The host has not added specific rules. Standard conduct applies: arrive within your
                window, park only in the described space, and leave the area clean.
              </p>
            )}

            <hr className="divider" />

            <h3 style={{ fontSize: '0.95rem', marginBottom: 8 }}>Address &amp; access</h3>
            <p className="small muted">
              <Icon name="pin" size={13} /> Exact address, arrival notes and a booking-specific check-in
              code are revealed after you book. Access codes are never shown on this public page.
            </p>
          </Card>

          <Card className="card--pad">
            <h2 style={{ fontSize: '1.05rem', marginBottom: 10 }}>Cancellation &amp; arrival terms</h2>
            <ul className="rule-list">
              <li>
                <Icon name="check" size={14} /> Free cancellation up to {meta?.cancellation?.freeUntilHours ?? 12}{' '}
                hours before the session.
              </li>
              <li>
                <Icon name="check" size={14} />{' '}
                {meta?.cancellation?.partialRefundPercent ?? 50}% refund between{' '}
                {meta?.cancellation?.partialUntilHours ?? 2} and {meta?.cancellation?.freeUntilHours ?? 12}{' '}
                hours before the start.
              </li>
              <li>
                <Icon name="check" size={14} /> Full refund if the host cancels or the charger cannot be used.
              </li>
              <li>
                <Icon name="info" size={14} /> The slot is held for{' '}
                {meta?.bookingRules?.gracePeriodMinutes ?? 15} minutes after the start time.
              </li>
            </ul>
            <div style={{ marginTop: 12 }}>
              <Link className="link-button" to="/policies/cancellation">
                Full cancellation policy <Icon name="arrow" size={14} />
              </Link>
            </div>
          </Card>

          <Card className="card--pad">
            <h2 style={{ fontSize: '1.05rem', marginBottom: 12 }}>Reviews</h2>
            {state.data.reviews.length === 0 ? (
              <p className="small muted">
                No reviews yet. Only drivers who completed a session here can review this charger.
              </p>
            ) : (
              <div className="stack">
                {state.data.reviews.map((review) => (
                  <div key={review.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <strong className="small">{review.author}</strong>
                      <span className="row" style={{ gap: 2, color: 'var(--terracotta)' }}>
                        {Array.from({ length: review.rating }).map((_, index) => (
                          <Icon key={index} name="star" size={11} />
                        ))}
                      </span>
                      <span className="tiny muted">{dayOnly(review.createdAt)}</span>
                    </div>
                    {review.comment && <p className="small muted" style={{ marginTop: 4 }}>{review.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <aside className="card booking-panel">
          <div>
            <div className="row row--between">
              <span className="small muted">From</span>
              <span style={{ fontWeight: 700, fontSize: '1.15rem' }}>
                {money(listing.pricePerHour, listing.currency)}
                <span className="small muted" style={{ fontWeight: 500 }}> /hour</span>
              </span>
            </div>
          </div>

          <div>
            <Field label="Session length" htmlFor="duration">
              <Select
                id="duration"
                value={durationMin ?? ''}
                onChange={(event) => setDurationMin(Number(event.target.value))}
              >
                {durationChoices.map((value) => (
                  <option key={value} value={value}>
                    {durationLabel(value)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div>
            <div className="field__label" style={{ marginBottom: 8 }}>Pick a day</div>
            <div className="day-strip">
              {days.map((day) => (
                <button
                  type="button"
                  key={day.date}
                  className={`day-chip ${selectedDay === day.date ? 'day-chip--active' : ''}`}
                  onClick={() => setSelectedDay(day.date)}
                  disabled={day.slotCount === 0}
                  title={
                    day.slotCount === 0
                      ? day.reason === 'BLOCKED_DATE'
                        ? 'Host blocked this date'
                        : 'No free slots'
                      : `${day.slotCount} free start times`
                  }
                >
                  <span>{dayOnly(`${day.date}T06:00:00`, listing.timezone).split(',')[0]}</span>
                  <strong>
                    {dayOnly(`${day.date}T06:00:00`, listing.timezone).split(' ').slice(1).join(' ')}
                  </strong>
                  <span className="tiny">{day.slotCount > 0 ? `${day.slotCount} open` : '—'}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="row row--between" style={{ marginBottom: 8 }}>
              <span className="field__label">Start time</span>
              {slotsData && (
                <span className="tiny muted">{slotsData.timezone?.replace('_', ' ')}</span>
              )}
            </div>

            {slots.loading ? (
              <div className="slot-grid">
                {[0, 1, 2, 3, 4, 5].map((key) => (
                  <Skeleton key={key} height={34} radius={9} />
                ))}
              </div>
            ) : slots.error ? (
              <Alert tone="danger" title="Could not load slots">
                {slots.error.message}
              </Alert>
            ) : slotsData?.slots?.length ? (
              <div className="slot-grid">
                {slotsData.slots.map((slot) => (
                  <button
                    type="button"
                    key={slot.startAt}
                    className={`slot ${selectedSlot?.startAt === slot.startAt ? 'slot--active' : ''}`}
                    onClick={() => setSelectedSlot(slot)}
                  >
                    {timeOnly(slot.startAt, listing.timezone)}
                  </button>
                ))}
              </div>
            ) : (
              <Alert tone="info">
                {slotsData?.reason === 'BLOCKED_DATE'
                  ? 'The host has blocked this date.'
                  : 'No free start times for this day and length. Try another day or a shorter session.'}
              </Alert>
            )}
          </div>

          {price && (
            <div className="stack">
              <div className="price-line">
                <span>
                  {money(listing.pricePerHour, listing.currency)} × {durationLabel(durationMin)}
                </span>
                <span className="tabular">{money(price.subtotal, listing.currency)}</span>
              </div>
              <div className="price-line">
                <span>Platform fee ({price.feePercent}%)</span>
                <span className="tabular">{money(price.fee, listing.currency)}</span>
              </div>
              <div className="price-line price-line--total">
                <span>Total</span>
                <span className="tabular">{money(price.total, listing.currency)}</span>
              </div>
              {meta?.paymentsMode === 'offline' && (
                <p className="tiny muted">
                  Online payment is not connected yet: the booking is confirmed and payment is marked
                  due at the session.
                </p>
              )}
            </div>
          )}

          {booking.error && (
            <Alert tone="danger" title="Booking not completed">
              {booking.error.message}
              {booking.error.details?.length > 0 && (
                <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {booking.error.details.map((detail) => (
                    <li key={detail.field}>{detail.message}</li>
                  ))}
                </ul>
              )}
            </Alert>
          )}

          <Button
            variant="ev"
            size="lg"
            block
            onClick={reserve}
            loading={booking.submitting}
            disabled={!selectedSlot}
          >
            {session.user ? 'Reserve charger' : 'Sign in to reserve'}
          </Button>

          <p className="tiny muted center">
            You will see the exact address after confirmation. No charge is taken at this step.
          </p>
        </aside>
      </div>

      <Modal
        open={reportOpen}
        onClose={() => {
          setReportOpen(false);
          setReport((current) => ({ ...current, state: 'idle', error: null }));
        }}
        title="Report this listing"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setReportOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={submitReport}
              loading={report.state === 'loading'}
              disabled={report.details.trim().length < 20}
            >
              Send report
            </Button>
          </>
        }
      >
        {!session.user ? (
          <Alert tone="info" title="Sign in to report">
            Reports need an account so support can follow up with you.{' '}
            <Link to={`/login?redirect=${encodeURIComponent(`/chargers/${id}`)}`} className="link-button">
              Sign in
            </Link>
          </Alert>
        ) : report.state === 'sent' ? (
          <Alert tone="success" title="Report received">
            Support will review this listing. You can track the outcome from the Help page.
          </Alert>
        ) : (
          <div className="stack">
            {report.error && <Alert tone="danger">{report.error.message}</Alert>}
            <Field label="What is the problem?" htmlFor="report-category">
              <Select
                id="report-category"
                value={report.category}
                onChange={(event) => setReport((current) => ({ ...current, category: event.target.value }))}
              >
                {REPORT_CATEGORIES.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </Select>
            </Field>
            <Field
              label="What happened?"
              hint="At least a couple of sentences. Do not include anyone's private address or phone number."
              error={report.error?.fieldError('details')}
            >
              <Textarea
                value={report.details}
                onChange={(event) => setReport((current) => ({ ...current, details: event.target.value }))}
                placeholder="Describe the issue with this listing…"
              />
            </Field>
          </div>
        )}
      </Modal>

      {listing.privateDetails && (
        <div className="container" style={{ paddingBottom: 40 }}>
          <Alert tone="info" title="Your listing">
            You are viewing your own listing. Public visitors see only the neighbourhood.
          </Alert>
        </div>
      )}
    </div>
  );
}

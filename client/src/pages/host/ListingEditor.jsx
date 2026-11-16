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
  Input,
  Select,
  Skeleton,
  Textarea,
} from '../../components/ui.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../lib/api.js';
import { dateInputValue, listingStatusTone, titleCase } from '../../lib/format.js';

const CONNECTORS = ['Type 2', 'CCS2', 'CHAdeMO', 'Type 1', 'Bharat AC-001', 'Bharat DC-001'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const AMENITIES = [
  'Restroom',
  'Water',
  'Covered parking',
  'Waiting area',
  'Accessible',
  'Well lit',
  'CCTV',
  'Overnight charging',
];

const EMPTY_FORM = {
  title: '',
  description: '',
  addressLine: '',
  area: '',
  city: '',
  pincode: '',
  lat: '',
  lng: '',
  connector: 'Type 2',
  powerKw: '7.4',
  currentType: 'AC',
  pricePerHour: '120',
  minDurationMin: '60',
  maxDurationMin: '480',
  houseRules: '',
  accessNotes: '',
  parkingType: 'Private driveway',
  amenities: [],
};

const toForm = (listing) => ({
  title: listing.title ?? '',
  description: listing.description ?? '',
  addressLine: listing.privateDetails?.addressLine ?? '',
  area: listing.area ?? '',
  city: listing.city ?? '',
  pincode: listing.privateDetails?.pincode ?? '',
  lat: String(listing.privateDetails?.lat ?? ''),
  lng: String(listing.privateDetails?.lng ?? ''),
  connector: listing.connector ?? 'Type 2',
  powerKw: String(listing.powerKw ?? ''),
  currentType: listing.currentType ?? 'AC',
  pricePerHour: String(listing.pricePerHour ?? ''),
  minDurationMin: String(listing.minDurationMin ?? 60),
  maxDurationMin: String(listing.maxDurationMin ?? 480),
  houseRules: (listing.houseRules ?? []).join('\n'),
  accessNotes: listing.privateDetails?.accessNotes ?? '',
  parkingType: listing.parkingType ?? '',
  amenities: listing.amenities ?? [],
});

export default function ListingEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast, meta } = useApp();

  const isNew = !id;
  const [state, setState] = useState({ loading: !isNew, error: null, listing: null });
  const [form, setForm] = useState(EMPTY_FORM);
  const [save, setSave] = useState({ busy: false, error: null });
  const [submitState, setSubmitState] = useState({ busy: false, error: null });
  const [photoState, setPhotoState] = useState({ busy: false, error: null });
  const [rules, setRules] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [availability, setAvailability] = useState({ busy: false, error: null, saved: false });
  const [geo, setGeo] = useState({ busy: false, error: null });

  const load = useCallback(() => {
    if (isNew) return;
    setState({ loading: true, error: null, listing: null });
    api
      .get('/host/listings')
      .then((data) => {
        const listing = data.listings.find((item) => item.id === id);
        if (!listing) {
          setState({ loading: false, error: { message: 'That listing is not on your account.' }, listing: null });
          return;
        }
        setState({ loading: false, error: null, listing });
        setForm(toForm(listing));
      })
      .catch((error) => setState({ loading: false, error, listing: null }));

    api
      .get(`/host/listings/${id}/availability`)
      .then((data) => {
        setRules(data.rules);
        setExceptions(data.exceptions);
      })
      .catch(() => {
        setRules([]);
        setExceptions([]);
      });
  }, [id, isNew]);

  useEffect(load, [load]);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const payload = useMemo(
    () => ({
      title: form.title.trim(),
      description: form.description.trim(),
      addressLine: form.addressLine.trim(),
      area: form.area.trim(),
      city: form.city.trim(),
      pincode: form.pincode.trim(),
      lat: form.lat === '' ? undefined : Number(form.lat),
      lng: form.lng === '' ? undefined : Number(form.lng),
      connector: form.connector,
      powerKw: form.powerKw === '' ? undefined : Number(form.powerKw),
      currentType: form.currentType,
      pricePerHour: form.pricePerHour === '' ? undefined : Number(form.pricePerHour),
      minDurationMin: Number(form.minDurationMin),
      maxDurationMin: Number(form.maxDurationMin),
      houseRules: form.houseRules
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      accessNotes: form.accessNotes.trim(),
      parkingType: form.parkingType.trim(),
      amenities: form.amenities,
    }),
    [form],
  );

  const persist = async ({ silent = false } = {}) => {
    setSave({ busy: true, error: null });
    try {
      if (isNew) {
        const data = await api.post('/host/listings', payload);
        if (!silent) toast('Draft saved. Add photos and availability next.');
        navigate(`/host/listings/${data.listing.id}`, { replace: true });
      } else {
        const data = await api.patch(`/host/listings/${id}`, payload);
        setState((current) => ({ ...current, listing: data.listing }));
        setSave({ busy: false, error: null });
        if (!silent) toast(data.message || 'Listing saved.');
      }
    } catch (error) {
      setSave({ busy: false, error });
    }
  };

  const submitForReview = async () => {
    setSubmitState({ busy: true, error: null });
    try {
      await api.patch(`/host/listings/${id}`, payload);
      await api.post(`/host/listings/${id}/submit`);
      toast('Submitted for review.');
      load();
    } catch (error) {
      setSubmitState({ busy: false, error });
      return;
    }
    setSubmitState({ busy: false, error: null });
  };

  const uploadPhoto = async (file) => {
    if (!file) return;
    setPhotoState({ busy: true, error: null });
    const body = new FormData();
    body.append('photo', file);
    try {
      const data = await api.upload(`/host/listings/${id}/photos`, body);
      setState((current) => ({ ...current, listing: data.listing }));
      setPhotoState({ busy: false, error: null });
      toast('Photo added.');
    } catch (error) {
      setPhotoState({ busy: false, error });
    }
  };

  const removePhoto = async (photoId) => {
    setPhotoState({ busy: true, error: null });
    try {
      const data = await api.del(`/host/listings/${id}/photos/${photoId}`);
      setState((current) => ({ ...current, listing: data.listing }));
      setPhotoState({ busy: false, error: null });
    } catch (error) {
      setPhotoState({ busy: false, error });
    }
  };

  const saveAvailability = async () => {
    setAvailability({ busy: true, error: null, saved: false });
    try {
      await api.put(`/host/listings/${id}/availability`, {
        rules: rules.map((rule) => ({
          weekday: rule.weekday,
          startTime: rule.startTime,
          endTime: rule.endTime,
        })),
        exceptions,
      });
      setAvailability({ busy: false, error: null, saved: true });
      toast('Availability saved.');
    } catch (error) {
      setAvailability({ busy: false, error, saved: false });
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setGeo({ busy: false, error: 'This browser cannot read your location. Enter coordinates manually.' });
      return;
    }
    setGeo({ busy: true, error: null });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        update('lat', position.coords.latitude.toFixed(6));
        update('lng', position.coords.longitude.toFixed(6));
        setGeo({ busy: false, error: null });
      },
      () => setGeo({ busy: false, error: 'Location permission was denied. Enter coordinates manually.' }),
      { timeout: 9000 },
    );
  };

  if (state.loading) {
    return (
      <div className="dash">
        <div className="container" style={{ maxWidth: 900 }}>
          <Skeleton height={30} width="40%" />
          <div style={{ height: 18 }} />
          <Skeleton height={340} radius={20} />
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="dash">
        <div className="container page-narrow">
          <Alert tone="danger" title="Listing unavailable">
            {state.error.message}
            <div style={{ marginTop: 10 }}>
              <ButtonLink to="/host" variant="secondary" size="sm">
                Back to dashboard
              </ButtonLink>
            </div>
          </Alert>
        </div>
      </div>
    );
  }

  const listing = state.listing;
  const fieldError = (key) => save.error?.fieldError(key);

  // The same rules the API enforces before it accepts a submission, so a host
  // can see what is missing instead of being told after clicking.
  const descriptionMin = meta?.listingRules?.descriptionMin ?? 30;
  const descriptionLength = form.description.trim().length;
  const photoCount = listing?.photos?.length ?? 0;
  const checks = [
    {
      key: 'description',
      done: descriptionLength >= descriptionMin,
      label:
        descriptionLength >= descriptionMin
          ? 'Description written'
          : `Description — ${descriptionLength} of ${descriptionMin} characters`,
      hint: 'A couple of sentences about the charger, the parking and anything a driver should know.',
    },
    {
      key: 'photos',
      done: photoCount > 0,
      label: photoCount > 0 ? `${photoCount} photo${photoCount === 1 ? '' : 's'} added` : 'No photo yet',
      hint: 'At least one clear photo of the charger and the parking space.',
    },
    {
      key: 'availability',
      done: rules.length > 0,
      label:
        rules.length > 0
          ? `${rules.length} weekly window${rules.length === 1 ? '' : 's'} set`
          : 'No availability yet',
      hint: 'Drivers can only book inside the windows you set.',
    },
    {
      key: 'accessNotes',
      done: form.accessNotes.trim().length > 0,
      label: 'Arrival notes',
      hint: 'How to find the charger and get in, shown after a booking is confirmed.',
    },
  ];
  const readyForReview = checks.every((check) => check.done);

  return (
    <div className="dash">
      <div className="container" style={{ maxWidth: 960 }}>
        <div className="dash-head">
          <div>
            <Link className="link-button" to="/host">
              <Icon name="arrow" size={14} style={{ transform: 'rotate(180deg)' }} /> Host dashboard
            </Link>
            <h1 style={{ marginTop: 8 }}>{isNew ? 'Add a charger' : form.title || 'Edit listing'}</h1>
            {listing && (
              <div className="row" style={{ marginTop: 8 }}>
                <Badge tone={listingStatusTone(listing.status)}>{titleCase(listing.status)}</Badge>
                <span className="tiny muted">
                  {listing.status === 'approved'
                    ? 'Live and searchable. Material edits send it back for review.'
                    : listing.status === 'pending'
                      ? 'Waiting for review.'
                      : listing.status === 'rejected'
                        ? 'Fix the notes below, then resubmit.'
                        : listing.status === 'paused'
                          ? 'Paused — hidden from search.'
                          : 'Draft — not visible to drivers.'}
                </span>
              </div>
            )}
          </div>
          <div className="row row--wrap">
            {listing && (
              <ButtonLink to={`/chargers/${listing.id}`} variant="secondary" size="sm">
                Preview
              </ButtonLink>
            )}
            <Button variant="primary" size="sm" loading={save.busy} onClick={() => persist()}>
              {isNew ? 'Save draft' : 'Save changes'}
            </Button>
          </div>
        </div>

        {save.error && (
          <div style={{ marginBottom: 16 }}>
            <Alert tone="danger" title="Could not save">
              {save.error.message}
              {save.error.details?.length > 0 && (
                <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {save.error.details.map((detail) => (
                    <li key={detail.field}>{detail.message}</li>
                  ))}
                </ul>
              )}
            </Alert>
          </div>
        )}

        {listing?.status === 'rejected' && listing.rejectionReason && (
          <div style={{ marginBottom: 16 }}>
            <Alert tone="warn" title="Why this was not approved">{listing.rejectionReason}</Alert>
          </div>
        )}

        <div className="stack-lg">
          <Card className="card--pad">
            <h2 style={{ fontSize: '1.02rem', marginBottom: 14 }}>The listing</h2>
            <div className="form-grid">
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Listing title" error={fieldError('title')} required>
                  <Input
                    value={form.title}
                    onChange={(event) => update('title', event.target.value)}
                    placeholder="Private driveway charger"
                    maxLength={90}
                  />
                </Field>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field
                  label="Description"
                  hint={`${descriptionLength}/${descriptionMin} characters minimum. Mention the charger, the parking and anything a driver should know.`}
                  error={fieldError('description')}
                >
                  <Textarea
                    value={form.description}
                    onChange={(event) => update('description', event.target.value)}
                    placeholder="7.4 kW Type 2 charger on the left side of the driveway. The gate stays open in the evening…"
                  />
                </Field>
              </div>
              <Field label="Neighbourhood (public)" error={fieldError('area')} required>
                <Input
                  value={form.area}
                  onChange={(event) => update('area', event.target.value)}
                  placeholder="Indiranagar"
                />
              </Field>
              <Field label="City" error={fieldError('city')} required>
                <Input value={form.city} onChange={(event) => update('city', event.target.value)} placeholder="Bengaluru" />
              </Field>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field
                  label="Full street address (private)"
                  hint="Shown to a driver only after a booking is confirmed."
                  error={fieldError('addressLine')}
                  required
                >
                  <Input
                    value={form.addressLine}
                    onChange={(event) => update('addressLine', event.target.value)}
                    placeholder="House / flat, street, landmark"
                  />
                </Field>
              </div>
              <Field label="Pincode (private)" error={fieldError('pincode')}>
                <Input value={form.pincode} onChange={(event) => update('pincode', event.target.value)} placeholder="560038" />
              </Field>
              <Field label="Parking type" error={fieldError('parkingType')}>
                <Input
                  value={form.parkingType}
                  onChange={(event) => update('parkingType', event.target.value)}
                  placeholder="Private driveway"
                />
              </Field>
            </div>

            <hr className="divider" />

            <div className="row row--between row--wrap" style={{ marginBottom: 8 }}>
              <div>
                <div className="field__label">Location on the map</div>
                <p className="tiny muted">
                  Drivers see a shifted pin. These exact coordinates are used only after a booking is confirmed.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={useMyLocation} loading={geo.busy}>
                <Icon name="pin" size={14} /> Use my current location
              </Button>
            </div>
            {geo.error && <Alert tone="warn">{geo.error}</Alert>}
            <div className="form-grid" style={{ marginTop: 10 }}>
              <Field label="Latitude" error={fieldError('lat')} hint="e.g. 12.9716">
                <Input value={form.lat} onChange={(event) => update('lat', event.target.value)} inputMode="decimal" />
              </Field>
              <Field label="Longitude" error={fieldError('lng')} hint="e.g. 77.6412">
                <Input value={form.lng} onChange={(event) => update('lng', event.target.value)} inputMode="decimal" />
              </Field>
            </div>
          </Card>

          <Card className="card--pad">
            <h2 style={{ fontSize: '1.02rem', marginBottom: 14 }}>Charger &amp; pricing</h2>
            <div className="form-grid">
              <Field label="Connector" error={fieldError('connector')} required>
                <Select value={form.connector} onChange={(event) => update('connector', event.target.value)}>
                  {CONNECTORS.map((connector) => (
                    <option key={connector}>{connector}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Current type" error={fieldError('currentType')} required>
                <Select value={form.currentType} onChange={(event) => update('currentType', event.target.value)}>
                  <option value="AC">AC</option>
                  <option value="DC">DC</option>
                </Select>
              </Field>
              <Field label="Rated power (kW)" error={fieldError('powerKw')} required>
                <Input
                  type="number"
                  step="0.1"
                  min="1"
                  max="350"
                  value={form.powerKw}
                  onChange={(event) => update('powerKw', event.target.value)}
                />
              </Field>
              <Field
                label="Price per hour"
                error={fieldError('pricePerHour')}
                hint="Before the platform fee, which is added for the driver."
                required
              >
                <Input
                  type="number"
                  min="1"
                  value={form.pricePerHour}
                  onChange={(event) => update('pricePerHour', event.target.value)}
                />
              </Field>
              <Field label="Shortest session (minutes)" error={fieldError('minDurationMin')} required>
                <Input
                  type="number"
                  min="30"
                  step="15"
                  value={form.minDurationMin}
                  onChange={(event) => update('minDurationMin', event.target.value)}
                />
              </Field>
              <Field label="Longest session (minutes)" error={fieldError('maxDurationMin')} required>
                <Input
                  type="number"
                  min="30"
                  step="15"
                  value={form.maxDurationMin}
                  onChange={(event) => update('maxDurationMin', event.target.value)}
                />
              </Field>
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="field__label" style={{ marginBottom: 8 }}>Amenities (only what you really offer)</div>
              <div className="row row--wrap">
                {AMENITIES.map((amenity) => {
                  const active = form.amenities.includes(amenity);
                  return (
                    <button
                      type="button"
                      key={amenity}
                      className={`chip ${active ? 'chip--active' : ''}`}
                      onClick={() =>
                        update(
                          'amenities',
                          active
                            ? form.amenities.filter((item) => item !== amenity)
                            : [...form.amenities, amenity],
                        )
                      }
                      aria-pressed={active}
                    >
                      {amenity}
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>

          <Card className="card--pad">
            <h2 style={{ fontSize: '1.02rem', marginBottom: 14 }}>Rules &amp; access</h2>
            <Field label="House rules" hint="One rule per line. Keep them about parking, noise, arrival and supervision.">
              <Textarea
                value={form.houseRules}
                onChange={(event) => update('houseRules', event.target.value)}
                placeholder={'Park only in the marked driveway bay\nKeep the gate closed after entry\nNo smoking on the property'}
              />
            </Field>
            <div style={{ marginTop: 14 }}>
              <Field
                label="Arrival notes (private)"
                hint="Shown to a driver after their booking is confirmed. Do not put a reusable door code here."
                error={fieldError('accessNotes')}
              >
                <Textarea
                  value={form.accessNotes}
                  onChange={(event) => update('accessNotes', event.target.value)}
                  placeholder="Ring the bell at the left gate and mention your booking reference…"
                />
              </Field>
            </div>
          </Card>

          <Card className="card--pad">
            <div className="panel__head">
              <div>
                <h2 style={{ fontSize: '1.02rem' }}>Photos</h2>
                <p className="tiny muted">Real photos of the charger and the space. Up to 8, JPEG/PNG/WebP.</p>
              </div>
              {!isNew && (
                <label className="btn btn--secondary btn--sm" style={{ cursor: 'pointer' }}>
                  <Icon name="camera" size={14} />
                  {photoState.busy ? 'Uploading…' : 'Add photo'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    disabled={photoState.busy}
                    onChange={(event) => {
                      uploadPhoto(event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>

            {isNew && <Alert tone="info">Save the draft first, then you can upload photos.</Alert>}
            {photoState.error && (
              <div style={{ marginBottom: 12 }}>
                <Alert tone="danger">{photoState.error.message}</Alert>
              </div>
            )}

            {listing?.photos?.length ? (
              <div className="photo-strip">
                {listing.photos.map((photo) => (
                  <div className="photo-thumb" key={photo.id}>
                    <img src={photo.url} alt="" />
                    <button type="button" onClick={() => removePhoto(photo.id)} aria-label="Remove photo">
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="small muted">No photos yet. A listing needs at least one before review.</p>
            )}
          </Card>

          <Card className="card--pad">
            <div className="panel__head">
              <div>
                <h2 style={{ fontSize: '1.02rem' }}>Weekly availability</h2>
                <p className="tiny muted">
                  Times are in the listing timezone. Slots are generated from these windows.
                </p>
              </div>
              <div className="row">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isNew}
                  onClick={() =>
                    setRules((current) => [
                      ...current,
                      { weekday: 1, startTime: '09:00', endTime: '18:00', tempId: Date.now() },
                    ])
                  }
                >
                  <Icon name="plus" size={13} /> Add window
                </Button>
                <Button variant="primary" size="sm" loading={availability.busy} disabled={isNew} onClick={saveAvailability}>
                  Save availability
                </Button>
              </div>
            </div>

            {availability.error && (
              <div style={{ marginBottom: 12 }}>
                <Alert tone="danger">{availability.error.message}</Alert>
              </div>
            )}

            {isNew ? (
              <p className="small muted">Save the draft first to set availability.</p>
            ) : rules.length === 0 ? (
              <Alert tone="info">
                No windows yet. A driver cannot book until at least one weekly window exists.
              </Alert>
            ) : (
              <div className="availability-grid">
                {rules.map((rule, index) => (
                  <div className="availability-row" key={rule.id ?? rule.tempId ?? index}>
                    <Select
                      value={rule.weekday}
                      onChange={(event) =>
                        setRules((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, weekday: Number(event.target.value) } : item,
                          ),
                        )
                      }
                      aria-label="Day of week"
                    >
                      {WEEKDAYS.map((day, dayIndex) => (
                        <option key={day} value={dayIndex}>
                          {day}
                        </option>
                      ))}
                    </Select>
                    <Input
                      type="time"
                      value={rule.startTime}
                      onChange={(event) =>
                        setRules((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, startTime: event.target.value } : item,
                          ),
                        )
                      }
                      aria-label="Start time"
                    />
                    <Input
                      type="time"
                      value={rule.endTime}
                      onChange={(event) =>
                        setRules((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, endTime: event.target.value } : item,
                          ),
                        )
                      }
                      aria-label="End time"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRules((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <hr className="divider" />

            <div className="row row--between row--wrap" style={{ marginBottom: 10 }}>
              <div>
                <div className="field__label">Blocked dates</div>
                <p className="tiny muted">Use this when the charger or the space is unavailable for a day.</p>
              </div>
              <div className="row">
                <Input
                  type="date"
                  min={dateInputValue()}
                  id="blocked-date"
                  style={{ width: 'auto' }}
                  aria-label="Date to block"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isNew}
                  onClick={() => {
                    const input = document.getElementById('blocked-date');
                    const value = input?.value;
                    if (!value) return;
                    if (exceptions.some((item) => item.date === value)) return;
                    setExceptions((current) => [...current, { date: value, isBlocked: true }]);
                    if (input) input.value = '';
                  }}
                >
                  Block
                </Button>
              </div>
            </div>

            {exceptions.length === 0 ? (
              <p className="small muted">No blocked dates.</p>
            ) : (
              <div className="row row--wrap">
                {exceptions.map((exception) => (
                  <span className="spec" key={exception.date}>
                    {exception.date}
                    <button
                      type="button"
                      className="icon-button"
                      style={{ width: 18, height: 18 }}
                      onClick={() =>
                        setExceptions((current) => current.filter((item) => item.date !== exception.date))
                      }
                      aria-label={`Remove ${exception.date}`}
                    >
                      <Icon name="close" size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Card>

          <Card className="card--pad">
            <div className="row row--between row--wrap" style={{ gap: 16 }}>
              <div>
                <h2 style={{ fontSize: '1.02rem' }}>Ready for review?</h2>
                <p className="small muted" style={{ marginTop: 4, maxWidth: '56ch' }}>
                  {isNew
                    ? 'Save the draft first. Review needs a description, at least one photo, one availability window and arrival notes.'
                    : 'Submitting sends the listing to our team. Nothing appears in search until it is approved.'}
                </p>
              </div>
              <div className="row row--wrap">
                <Button variant="secondary" size="sm" loading={save.busy} onClick={() => persist()} disabled={isNew}>
                  Save changes
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={submitState.busy}
                  disabled={
                    isNew || !readyForReview || !['draft', 'rejected', 'paused'].includes(listing?.status)
                  }
                  onClick={submitForReview}
                >
                  Submit for review
                </Button>
              </div>
            </div>

            {!isNew && (
              <div style={{ marginTop: 16 }}>
                <ul className="checklist">
                  {checks.map((check) => (
                    <li key={check.key}>
                      <span className={`checklist__mark ${check.done ? 'checklist__mark--done' : ''}`}>
                        <Icon name={check.done ? 'check' : 'alert'} size={11} />
                      </span>
                      <span>
                        {check.label}
                        {!check.done && <span className="checklist__hint">{check.hint}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                {!readyForReview && (
                  <p className="tiny muted" style={{ marginTop: 10 }}>
                    The submit button unlocks once every line above is ticked. Save your changes first if you
                    edited anything just now.
                  </p>
                )}
              </div>
            )}
            {submitState.error && (
              <div style={{ marginTop: 12 }}>
                <Alert tone="danger" title="Cannot submit yet">
                  {submitState.error.message}
                  {submitState.error.details?.length > 0 && (
                    <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                      {submitState.error.details.map((detail) => (
                        <li key={detail.field}>{detail.message}</li>
                      ))}
                    </ul>
                  )}
                </Alert>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

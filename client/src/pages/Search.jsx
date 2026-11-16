import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChargerCard } from '../components/ChargerCard.jsx';
import { MapPanel } from '../components/MapPanel.jsx';
import {
  Alert,
  Button,
  Card,
  CardSkeleton,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  Input,
  Select,
} from '../components/ui.jsx';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';
import { dateInputValue } from '../lib/format.js';

const CONNECTORS = ['Type 2', 'CCS2', 'CHAdeMO', 'Type 1', 'Bharat AC-001', 'Bharat DC-001'];

const SORTS = [
  { value: 'distance', label: 'Nearest first' },
  { value: 'price', label: 'Lowest price' },
  { value: 'rating', label: 'Best rated' },
  { value: 'newest', label: 'Newest' },
];

export default function Search() {
  const { meta } = useApp();
  const [params, setParams] = useSearchParams();

  const query = params.get('q') ?? '';
  const connector = params.get('connector') ?? '';
  const maxPrice = params.get('maxPrice') ?? '';
  const minPower = params.get('minPower') ?? '';
  const date = params.get('date') ?? '';
  const durationMin = params.get('durationMin') ?? '';
  const radius = params.get('radius') ?? '25';
  const sort = params.get('sort') ?? '';
  const lat = params.get('lat');
  const lng = params.get('lng');
  const currentType = params.get('currentType') ?? '';

  const [areaDraft, setAreaDraft] = useState(query);
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState('list');
  const [locationState, setLocationState] = useState({ status: 'idle', message: null });
  const abortRef = useRef(null);

  useEffect(() => setAreaDraft(query), [query]);

  const updateParam = useCallback(
    (key, value) => {
      const next = new URLSearchParams(params);
      if (value === '' || value === null || value === undefined) next.delete(key);
      else next.set(key, value);
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const requestUrl = useMemo(() => {
    const search = new URLSearchParams();
    if (query) search.set('q', query);
    if (connector) search.set('connector', connector);
    if (currentType) search.set('currentType', currentType);
    if (maxPrice) search.set('maxPrice', maxPrice);
    if (minPower) search.set('minPower', minPower);
    if (date) search.set('date', date);
    if (durationMin) search.set('durationMin', durationMin);
    if (lat && lng) {
      search.set('lat', lat);
      search.set('lng', lng);
      search.set('radius', radius);
    }
    if (sort) search.set('sort', sort);
    search.set('limit', '40');
    return `/listings?${search.toString()}`;
  }, [query, connector, currentType, maxPrice, minPower, date, durationMin, lat, lng, radius, sort]);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((current) => ({ ...current, loading: true, error: null }));

    api
      .get(requestUrl, { signal: controller.signal })
      .then((data) => setState({ loading: false, error: null, data }))
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setState({ loading: false, error, data: null });
      });

    return () => controller.abort();
  }, [requestUrl]);

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationState({
        status: 'error',
        message: 'This browser does not support location. Search by area instead.',
      });
      return;
    }
    setLocationState({ status: 'loading', message: null });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = new URLSearchParams(params);
        next.set('lat', position.coords.latitude.toFixed(5));
        next.set('lng', position.coords.longitude.toFixed(5));
        if (!next.get('radius')) next.set('radius', '25');
        setParams(next, { replace: true });
        setLocationState({ status: 'ready', message: 'Sorted by distance from your location.' });
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied. You can still search by area.'
            : error.code === error.TIMEOUT
              ? 'Location took too long. Try searching by area instead.'
              : 'We could not read your location. Search by area instead.';
        setLocationState({ status: 'error', message });
      },
      { timeout: 9000, maximumAge: 60_000 },
    );
  };

  const clearFilters = () => {
    const next = new URLSearchParams();
    if (query) next.set('q', query);
    setParams(next, { replace: true });
  };

  const results = state.data?.results ?? [];
  const activeFilterCount = [connector, maxPrice, minPower, date, durationMin, currentType].filter(
    Boolean,
  ).length;

  const center = lat && lng ? { lat: Number(lat), lng: Number(lng) } : null;

  return (
    <div className="search-page">
      <div className="container">
        <form
          className="search-head"
          onSubmit={(event) => {
            event.preventDefault();
            updateParam('q', areaDraft.trim());
          }}
        >
          <div className="search-row">
            <Field label="Where">
              <div style={{ position: 'relative' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: 13,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--taupe)',
                    display: 'grid',
                  }}
                >
                  <Icon name="search" size={16} />
                </span>
                <Input
                  value={areaDraft}
                  onChange={(event) => setAreaDraft(event.target.value)}
                  placeholder="Area, neighbourhood or city"
                  style={{ paddingLeft: 38 }}
                  aria-label="Search area"
                />
              </div>
            </Field>

            <Field label="Date">
              <Input
                type="date"
                value={date}
                min={dateInputValue()}
                onChange={(event) => updateParam('date', event.target.value)}
              />
            </Field>

            <Field label="Session length">
              <Select
                value={durationMin}
                onChange={(event) => updateParam('durationMin', event.target.value)}
              >
                <option value="">Any length</option>
                <option value="60">1 hour</option>
                <option value="120">2 hours</option>
                <option value="180">3 hours</option>
                <option value="240">4 hours</option>
                <option value="360">6 hours</option>
              </Select>
            </Field>

            <div className="row" style={{ paddingBottom: 2 }}>
              <Button type="submit" variant="primary" size="md">
                Search
              </Button>
              <Button type="button" variant="secondary" size="md" onClick={useMyLocation}>
                <Icon name="pin" size={15} /> Near me
              </Button>
            </div>
          </div>

          <div className="filter-chips">
            <Select
              value={connector}
              onChange={(event) => updateParam('connector', event.target.value)}
              aria-label="Connector"
              style={{ width: 'auto', minWidth: 150 }}
            >
              <option value="">Any connector</option>
              {CONNECTORS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>

            <Select
              value={currentType}
              onChange={(event) => updateParam('currentType', event.target.value)}
              aria-label="Current type"
              style={{ width: 'auto', minWidth: 130 }}
            >
              <option value="">AC or DC</option>
              <option value="AC">AC only</option>
              <option value="DC">DC fast</option>
            </Select>

            <Select
              value={minPower}
              onChange={(event) => updateParam('minPower', event.target.value)}
              aria-label="Minimum power"
              style={{ width: 'auto', minWidth: 140 }}
            >
              <option value="">Any power</option>
              <option value="3">3 kW and up</option>
              <option value="7">7 kW and up</option>
              <option value="11">11 kW and up</option>
              <option value="22">22 kW and up</option>
              <option value="50">50 kW and up</option>
            </Select>

            <Select
              value={maxPrice}
              onChange={(event) => updateParam('maxPrice', event.target.value)}
              aria-label="Maximum hourly price"
              style={{ width: 'auto', minWidth: 150 }}
            >
              <option value="">Any price</option>
              <option value="50">Up to ₹50/hr</option>
              <option value="100">Up to ₹100/hr</option>
              <option value="150">Up to ₹150/hr</option>
              <option value="250">Up to ₹250/hr</option>
            </Select>

            {lat && lng && (
              <Select
                value={radius}
                onChange={(event) => updateParam('radius', event.target.value)}
                aria-label="Search radius"
                style={{ width: 'auto', minWidth: 130 }}
              >
                <option value="5">Within 5 km</option>
                <option value="10">Within 10 km</option>
                <option value="25">Within 25 km</option>
                <option value="50">Within 50 km</option>
              </Select>
            )}

            {activeFilterCount > 0 && (
              <button type="button" className="chip" onClick={clearFilters}>
                Clear filters ({activeFilterCount})
              </button>
            )}
          </div>
        </form>

        {locationState.message && (
          <div style={{ marginBottom: 16 }}>
            <Alert
              tone={locationState.status === 'error' ? 'warn' : 'success'}
              onDismiss={() => setLocationState({ status: 'idle', message: null })}
            >
              {locationState.message}
            </Alert>
          </div>
        )}

        <div className="search-results-head">
          <div>
            <h1 style={{ fontSize: '1.4rem' }}>
              {state.loading
                ? 'Finding chargers…'
                : `${state.data?.total ?? 0} charger${(state.data?.total ?? 0) === 1 ? '' : 's'}${
                    query ? ` near “${query}”` : ' available'
                  }`}
            </h1>
            {state.data?.radiusKm && (
              <p className="small muted">Within {state.data.radiusKm} km of your search point</p>
            )}
          </div>

          <div className="row">
            <Select
              value={sort}
              onChange={(event) => updateParam('sort', event.target.value)}
              aria-label="Sort results"
              style={{ width: 'auto' }}
            >
              <option value="">Recommended</option>
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <div className="row" style={{ gap: 4 }}>
              <Button
                size="sm"
                variant={view === 'list' ? 'primary' : 'secondary'}
                onClick={() => setView('list')}
                aria-pressed={view === 'list'}
              >
                <Icon name="list" size={14} /> List
              </Button>
              <Button
                size="sm"
                variant={view === 'map' ? 'primary' : 'secondary'}
                onClick={() => setView('map')}
                aria-pressed={view === 'map'}
              >
                <Icon name="map" size={14} /> Map
              </Button>
            </div>
          </div>
        </div>

        {state.error ? (
          <ErrorState
            title="We could not load chargers"
            error={state.error}
            onRetry={() => setParams(new URLSearchParams(params), { replace: true })}
          />
        ) : state.loading ? (
          <div className="listing-grid">
            {[0, 1, 2, 3].map((key) => (
              <CardSkeleton key={key} />
            ))}
          </div>
        ) : results.length === 0 ? (
          <EmptyState
            icon="search"
            title="No chargers match this search"
            description={
              query
                ? `Nobody is listed in “${query}” with these filters yet. Try a wider radius, a different connector, or remove a filter.`
                : 'Try removing a filter or widening the radius. New hosts are added as they are reviewed.'
            }
            action={
              <Button variant="secondary" size="md" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="search-layout">
            {view !== 'map' && (
              <div className="listing-grid" style={{ alignContent: 'start' }}>
                {results.map((listing) => (
                  <ChargerCard
                    key={listing.id}
                    listing={listing}
                    selected={selectedId === listing.id}
                    onHover={setSelectedId}
                  />
                ))}
              </div>
            )}

            {view !== 'list' && (
              <div className="map-shell">
                <MapPanel
                  listings={results}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  center={center}
                />
              </div>
            )}

            {view === 'list' && (
              <div className="map-shell hide-mobile">
                <MapPanel
                  listings={results}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  center={center}
                />
              </div>
            )}
          </div>
        )}

        {results.length > 0 && (
          <Card className="card--pad" style={{ marginTop: 22 }}>
            <div className="row row--wrap row--between" style={{ gap: 12 }}>
              <p className="small muted" style={{ maxWidth: '70ch' }}>
                Prices show the host hourly rate. A{' '}
                {meta ? `${meta.platformFeePercent}%` : 'small'} platform fee is added on the booking
                page, and the full total is shown before you confirm. Chargers without photos or rules
                reviewed yet are not listed.
              </p>
              <a className="link-button" href="/policies/cancellation">
                Cancellation terms <Icon name="arrow" size={14} />
              </a>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

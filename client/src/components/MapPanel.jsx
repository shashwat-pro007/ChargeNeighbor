import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { money } from '../lib/format.js';
import { Icon } from './ui.jsx';

/**
 * Map of public listing positions. Coordinates are already fuzzed by the API,
 * so this never renders a real residential address.
 */
export function MapPanel({ listings, selectedId, onSelect, center, height = 540 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = L.map(containerRef.current, {
      scrollWheelZoom: false,
      attributionControl: true,
      zoomControl: true,
    }).setView([center?.lat ?? 19.076, center?.lng ?? 72.8777], center ? 12 : 11);

    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap contributors',
    });

    tiles.on('tileerror', () => setTileError(true));
    tiles.on('load', () => setTileError(false));
    tiles.addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const existing = markersRef.current;
    const seen = new Set();

    for (const listing of listings) {
      seen.add(listing.id);
      const isSelected = listing.id === selectedId;
      const html = `<span class="pin ${isSelected ? 'pin--active' : ''}">${money(
        listing.pricePerHour,
        listing.currency,
      )}</span>`;

      const icon = L.divIcon({
        html,
        className: 'pin-wrapper',
        iconSize: [64, 26],
        iconAnchor: [32, 26],
      });

      if (existing.has(listing.id)) {
        existing.get(listing.id).setIcon(icon);
        existing.get(listing.id).setLatLng([listing.location.lat, listing.location.lng]);
      } else {
        const marker = L.marker([listing.location.lat, listing.location.lng], { icon })
          .addTo(map)
          .on('click', () => onSelect?.(listing.id));
        marker.bindTooltip(`${listing.title} · ${listing.area}`, { direction: 'top', offset: [0, -22] });
        existing.set(listing.id, marker);
      }
    }

    for (const [id, marker] of existing.entries()) {
      if (!seen.has(id)) {
        marker.remove();
        existing.delete(id);
      }
    }

    if (listings.length > 0) {
      const bounds = L.latLngBounds(listings.map((item) => [item.location.lat, item.location.lng]));
      if (selectedId) {
        const selected = listings.find((item) => item.id === selectedId);
        if (selected) map.flyTo([selected.location.lat, selected.location.lng], 14, { duration: 0.6 });
      } else {
        map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
      }
    }
  }, [listings, selectedId, onSelect]);

  return (
    <div className="map-shell">
      <div ref={containerRef} className="map" style={{ height }} aria-label="Map of nearby chargers" />
      {tileError && (
        <div className="map-note" role="status">
          <Icon name="alert" size={13} /> Map tiles could not load (offline or blocked). The list on the
          left has the same results.
        </div>
      )}
      <p className="map-note">
        Pins show an approximate position within the neighbourhood. The exact address is shared after
        a booking is confirmed.
      </p>
    </div>
  );
}

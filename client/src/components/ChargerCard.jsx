import { Link } from 'react-router-dom';
import { km, money } from '../lib/format.js';
import { Badge, Icon } from './ui.jsx';

export function ChargerCard({ listing, selected = false, onHover }) {
  const photo = listing.photos?.[0]?.url;
  const reviewed = listing.rating?.count > 0;

  return (
    <article
      className={`card listing-card ${selected ? 'listing-card--selected' : ''}`}
      onMouseEnter={() => onHover?.(listing.id)}
      onFocus={() => onHover?.(listing.id)}
    >
      <Link to={`/chargers/${listing.id}`} className="listing-card__media" aria-label={`View ${listing.title}`}>
        {photo ? (
          <img src={photo} alt="" loading="lazy" />
        ) : (
          <div className="listing-card__media-fallback">
            <Icon name="plug" size={30} />
          </div>
        )}
        <span className="listing-card__badge">
          <Badge tone="success" title="Reviewed listing: charger details, photos and rules were checked by our team.">
            Reviewed
          </Badge>
        </span>
        <span className="listing-card__price">
          {money(listing.pricePerHour, listing.currency)}/hr
        </span>
      </Link>

      <div className="listing-card__body">
        <Link to={`/chargers/${listing.id}`}>
          <h3 className="listing-card__title">{listing.title}</h3>
        </Link>

        <div className="listing-card__meta">
          <Icon name="pin" size={14} />
          <span>
            {listing.area}, {listing.city}
          </span>
          {listing.distanceKm !== null && listing.distanceKm !== undefined && (
            <span className="muted">· {km(listing.distanceKm)}</span>
          )}
        </div>

        <div className="listing-card__specs">
          <span className="spec">
            <Icon name="plug" size={12} /> {listing.connector}
          </span>
          <span className="spec">
            <Icon name="bolt" size={12} /> {listing.powerKw} kW {listing.currentType}
          </span>
        </div>

        <div className="listing-card__foot">
          <span className="small muted">
            {reviewed ? (
              <span className="row" style={{ gap: 4 }}>
                <Icon name="star" size={13} style={{ color: '#a25f37' }} />
                {listing.rating.average} ({listing.rating.count})
              </span>
            ) : (
              'No reviews yet'
            )}
          </span>
          <Link to={`/chargers/${listing.id}`} className="link-button">
            View charger <Icon name="arrow" size={14} />
          </Link>
        </div>
      </div>
    </article>
  );
}

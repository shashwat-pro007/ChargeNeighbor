import { Link } from 'react-router-dom';

export function BrandMark({ size = 34 }) {
  return (
    <span
      className="brand__mark"
      style={{ width: size, height: size, borderRadius: size * 0.3 }}
      aria-hidden="true"
    >
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="currentColor">
        <path d="M13.6 2 5 13.4h5.5L9 22l8.6-11.4H12L13.6 2Z" />
      </svg>
    </span>
  );
}

export function Brand({ to = '/', size = 34 }) {
  return (
    <Link to={to} className="brand" aria-label="ChargeNeighbor home">
      <BrandMark size={size} />
      <span>
        Charge<span className="brand__dot">Neighbor</span>
      </span>
    </Link>
  );
}

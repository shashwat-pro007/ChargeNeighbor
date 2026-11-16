import { ButtonLink, Card, Icon } from '../components/ui.jsx';

export default function NotFound() {
  return (
    <div className="page">
      <div className="container page-narrow">
        <Card className="card--pad center">
          <span
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'var(--sand-light)',
              color: 'var(--terracotta)',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 16px',
            }}
          >
            <Icon name="pin" size={24} />
          </span>
          <h1 style={{ fontSize: '1.5rem' }}>This page is not on the map</h1>
          <p className="muted" style={{ marginTop: 10, maxWidth: '48ch', marginInline: 'auto' }}>
            The link may be old, or the page may have moved. Chargers and bookings are still one click away.
          </p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 20 }}>
            <ButtonLink to="/" variant="primary">
              Home
            </ButtonLink>
            <ButtonLink to="/search" variant="secondary">
              Find a charger
            </ButtonLink>
          </div>
        </Card>
      </div>
    </div>
  );
}

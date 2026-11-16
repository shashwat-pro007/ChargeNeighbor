import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BrandMark } from '../components/Brand.jsx';
import { ChargerCard } from '../components/ChargerCard.jsx';
import { Alert, Button, ButtonLink, Card, CardSkeleton, Icon } from '../components/ui.jsx';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';

function HeroArt() {
  return (
    <svg className="hero__art" viewBox="0 0 520 420" role="img" aria-label="Illustration of a home driveway with a wall-mounted EV charger and an electric car">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a2e2a" />
          <stop offset="100%" stopColor="#191210" />
        </linearGradient>
        <linearGradient id="car" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f4ece7" />
          <stop offset="100%" stopColor="#cbb6ab" />
        </linearGradient>
        <linearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#58c191" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#58c191" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="520" height="420" fill="url(#sky)" />
      <circle cx="404" cy="86" r="112" fill="#a25f37" opacity="0.16" />
      <circle cx="404" cy="86" r="62" fill="#d2b0a0" opacity="0.12" />

      <path d="M0 322h520v98H0z" fill="#100c0b" />
      <path d="M96 322h336l34 98H62z" fill="#241c19" />
      <path d="M196 322h136l16 98H180z" fill="#2f2522" />

      <path d="M58 300V150l92-58 92 58v150" fill="#2b211e" stroke="#4a3a34" strokeWidth="2" />
      <path d="M40 152 150 74l110 78" fill="none" stroke="#5a463f" strokeWidth="7" strokeLinecap="round" />
      <rect x="92" y="184" width="52" height="52" rx="6" fill="#f0c98c" opacity="0.72" />
      <rect x="166" y="184" width="52" height="52" rx="6" fill="#f0c98c" opacity="0.34" />
      <rect x="118" y="252" width="46" height="70" rx="4" fill="#3d302b" />

      <rect x="252" y="236" width="44" height="86" rx="10" fill="#14100f" stroke="#4b3b34" strokeWidth="2" />
      <rect x="260" y="246" width="28" height="30" rx="5" fill="#1f2a25" />
      <path d="M277 249l-8 13h6l-2 9 8-13h-6z" fill="#58c191" />
      <circle cx="274" cy="308" r="4" fill="#58c191" />
      <path d="M296 292c18 4 30 14 34 26" stroke="#58c191" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="274" cy="264" r="46" fill="url(#glow)" opacity="0.5" />

      <g>
        <path
          d="M318 306c2-16 14-28 34-32l30-6c10-2 20 2 26 10l16 22c8 2 14 9 14 18v14c0 6-4 10-10 10H328c-6 0-10-4-10-10z"
          fill="url(#car)"
        />
        <path d="M360 270h34l14 22h-58z" fill="#2b211e" opacity="0.55" />
        <circle cx="360" cy="342" r="16" fill="#14100f" stroke="#5f4b43" strokeWidth="3" />
        <circle cx="438" cy="342" r="16" fill="#14100f" stroke="#5f4b43" strokeWidth="3" />
        <circle cx="360" cy="342" r="6" fill="#6b564d" />
        <circle cx="438" cy="342" r="6" fill="#6b564d" />
        <rect x="326" y="300" width="10" height="6" rx="2" fill="#f0c98c" />
      </g>

      <path d="M296 292c-8 10-10 22-4 32" stroke="#3f5248" strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export default function Home() {
  const { meta, isSignedIn, isHost } = useApp();
  const navigate = useNavigate();
  const [area, setArea] = useState('');
  const [listings, setListings] = useState({ loading: true, error: null, items: [], total: 0 });

  useEffect(() => {
    let active = true;
    api
      .get('/listings?limit=3&sort=newest')
      .then((data) => {
        if (active) setListings({ loading: false, error: null, items: data.results, total: data.total });
      })
      .catch((error) => {
        if (active) setListings({ loading: false, error, items: [], total: 0 });
      });
    return () => {
      active = false;
    };
  }, []);

  const submit = (event) => {
    event.preventDefault();
    navigate(area.trim() ? `/search?q=${encodeURIComponent(area.trim())}` : '/search');
  };

  return (
    <>
      <section className="hero">
        <div className="container hero__grid">
          <div>
            <span className="eyebrow">A better way to charge nearby</span>
            <h1 className="hero__title">Find a home charger. Get back on the road.</h1>
            <p className="hero__lead">
              Discover nearby residential charging spots, compare availability and pricing, and book a
              time that works for you.
            </p>

            <form className="searchbar" onSubmit={submit} role="search">
              <span className="searchbar__field">
                <Icon name="pin" size={18} />
                <input
                  type="text"
                  value={area}
                  onChange={(event) => setArea(event.target.value)}
                  placeholder="Enter your area or destination"
                  aria-label="Area or destination"
                />
              </span>
              <Button type="submit" variant="primary" size="md">
                Find Chargers
              </Button>
            </form>

            <div className="hero__ctas">
              <ButtonLink to="/host" variant="secondary" size="md">
                Become a Host
              </ButtonLink>
              <ButtonLink to="/how-it-works" variant="ghost" size="md">
                How it works <Icon name="arrow" size={15} />
              </ButtonLink>
            </div>

            <p className="hero__note">
              <Icon name="shield" size={15} />
              Host and listing checks are shown transparently on every charger.
            </p>
          </div>

          <div className="hero__visual">
            <HeroArt />
            <div className="hero__float">
              <span style={{ color: 'var(--green)' }}>
                <Icon name="bolt" size={20} />
              </span>
              <div style={{ flex: 1 }}>
                <div className="hero__float-label">Residential charging</div>
                <div className="small">
                  Hourly sessions from real homes · see the full price before you book
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {meta?.testLogin?.enabled && (
        <div className="container" style={{ marginTop: 18 }}>
          <Alert tone="warn" title="Testing mode is on for sign-in">
            Numbers on the test allowlist sign in with the fixed code{' '}
            <strong style={{ display: 'inline' }}>{meta.testLogin.otp}</strong>. Real numbers still get a
            real one-time code. Turn this off in the server environment before launch.
          </Alert>
        </div>
      )}

      <section className="section">
        <div className="container">
          <div className="section__head">
            <div>
              <span className="section-label">How it works</span>
              <h2 className="section__title" style={{ marginTop: 10 }}>
                Three steps from empty battery to on your way
              </h2>
            </div>
            <ButtonLink to="/how-it-works" variant="secondary" size="sm">
              Read the details
            </ButtonLink>
          </div>

          <div className="steps">
            {[
              {
                title: 'Find',
                body: 'Search your area and filter by connector, power and price. Every listing shows an approximate location only.',
                icon: 'search',
              },
              {
                title: 'Book',
                body: 'Pick a free slot, choose your session length, and see the full price — host rate plus the platform fee.',
                icon: 'calendar',
              },
              {
                title: 'Charge',
                body: 'After confirmation you get the address, arrival notes and a check-in code unique to your booking.',
                icon: 'bolt',
              },
            ].map((step, index) => (
              <div className="step" key={step.title}>
                <span className="step__num">{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--tint">
        <div className="container">
          <div className="section__head">
            <div>
              <span className="section-label">Available now</span>
              <h2 className="section__title" style={{ marginTop: 10 }}>
                Chargers near you
              </h2>
              <p className="section__sub">
                These are live listings from hosts on ChargeNeighbor — no sample inventory.
              </p>
            </div>
            <ButtonLink to="/search" variant="secondary" size="sm">
              Browse all chargers
            </ButtonLink>
          </div>

          {listings.loading ? (
            <div className="listing-grid">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : listings.error ? (
            <Card className="card--pad">
              <Alert tone="danger" title="We could not load chargers">
                {listings.error.message}
              </Alert>
              <div style={{ marginTop: 14 }}>
                <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
                  Reload
                </Button>
              </div>
            </Card>
          ) : listings.items.length === 0 ? (
            <Card className="card--pad">
              <div className="row row--wrap" style={{ gap: 18, alignItems: 'flex-start' }}>
                <span
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: '50%',
                    background: 'var(--sand-light)',
                    color: 'var(--terracotta)',
                    display: 'grid',
                    placeItems: 'center',
                    flex: 'none',
                  }}
                >
                  <Icon name="plug" size={22} />
                </span>
                <div className="grow" style={{ minWidth: 220 }}>
                  <h3 style={{ fontSize: '1.05rem' }}>No chargers in the marketplace yet</h3>
                  <p className="muted small" style={{ marginTop: 6, maxWidth: '52ch' }}>
                    ChargeNeighbor shows real, reviewed listings only. Be the first host in your area, or
                    check back after hosts near you are approved.
                  </p>
                </div>
                <ButtonLink to="/host" variant="primary" size="md">
                  List your charger
                </ButtonLink>
              </div>
            </Card>
          ) : (
            <div className="listing-grid">
              {listings.items.map((listing) => (
                <ChargerCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="host-band">
            <div>
              <span className="eyebrow" style={{ color: '#d2b0a0' }}>
                For hosts
              </span>
              <h2>Your home charger can do more.</h2>
              <p>
                Offer the charging hours you do not use, set your own price and schedule, and manage
                every booking from one dashboard. You stay in control of when your charger is available.
              </p>
              <div className="row" style={{ marginTop: 22 }}>
                <ButtonLink to={isSignedIn ? '/host' : '/login?intent=host'} variant="ev" size="md">
                  {isHost ? 'Open host dashboard' : 'Become a host'}
                </ButtonLink>
                <Link to="/policies/hosts" style={{ color: '#d2b0a0', fontSize: '0.86rem', fontWeight: 600 }}>
                  Read host rules
                </Link>
              </div>
            </div>

            <div className="host-band__points">
              {[
                'Use idle charging capacity instead of leaving it unused',
                'Set your own hourly price, availability and house rules',
                'Pause your listing whenever the charger is unavailable',
                'Every booking shows the fee and your earning, line by line',
              ].map((point) => (
                <div className="host-band__point" key={point}>
                  <Icon name="check" size={16} />
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section section--tint">
        <div className="container">
          <span className="section-label">Trust &amp; safety</span>
          <h2 className="section__title" style={{ marginTop: 10 }}>
            Practical checks, stated plainly
          </h2>
          <p className="section__sub">
            We say exactly what has been checked. Verified phone numbers, reviewed listings and electrical
            safety are three different things.
          </p>

          <div className="trust-grid">
            <div className="trust-item">
              <div className="trust-item__icon"><Icon name="user" size={20} /></div>
              <h4>Phone verification</h4>
              <p>
                Every account confirms a phone number. This proves control of that number — it is not an
                identity check.
              </p>
            </div>
            <div className="trust-item">
              <div className="trust-item__icon"><Icon name="shield" size={20} /></div>
              <h4>Listing review</h4>
              <p>
                A person checks charger details, photos and rules before a listing goes live. It is not an
                electrical inspection.
              </p>
            </div>
            <div className="trust-item">
              <div className="trust-item__icon"><Icon name="pin" size={20} /></div>
              <h4>Address privacy</h4>
              <p>
                Search results show a neighbourhood and a fuzzed map pin. The exact address arrives only
                after booking.
              </p>
            </div>
            <div className="trust-item">
              <div className="trust-item__icon"><Icon name="calendar" size={20} /></div>
              <h4>Clear booking terms</h4>
              <p>
                Cancellation windows, arrival grace periods and no-show rules are shown before you confirm.
              </p>
            </div>
            <div className="trust-item">
              <div className="trust-item__icon"><Icon name="info" size={20} /></div>
              <h4>Reporting</h4>
              <p>
                Report a listing, a session or a user. Reports go to support with the booking record
                attached.
              </p>
            </div>
            <div className="trust-item">
              <div className="trust-item__icon"><Icon name="bolt" size={20} /></div>
              <h4>Honest estimates</h4>
              <p>
                Sessions are priced per hour. Charge delivered depends on your vehicle and the charger, so
                we never promise a battery percentage.
              </p>
            </div>
          </div>

          <div className="row row--wrap" style={{ marginTop: 26 }}>
            <ButtonLink to="/policies/safety" variant="secondary" size="sm">
              Safety policy
            </ButtonLink>
            <ButtonLink to="/policies/cancellation" variant="secondary" size="sm">
              Cancellation &amp; refunds
            </ButtonLink>
            <ButtonLink to="/policies/privacy" variant="secondary" size="sm">
              Privacy policy
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="row row--between row--wrap" style={{ gap: 20 }}>
            <div className="row" style={{ gap: 14 }}>
              <BrandMark size={40} />
              <div>
                <h3 style={{ fontSize: '1.05rem' }}>Ready to find a charger?</h3>
                <p className="muted small">
                  Search by area, connector and price. Platform fee{' '}
                  {meta ? `${meta.platformFeePercent}%` : 'shown at checkout'} on top of the host rate.
                </p>
              </div>
            </div>
            <ButtonLink to="/search" variant="primary" size="md">
              Find chargers near me
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}

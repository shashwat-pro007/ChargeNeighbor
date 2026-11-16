import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { Brand } from './Brand.jsx';
import { ButtonLink, Icon, ToastStack } from './ui.jsx';

const MAIN_NAV = [
  { to: '/search', label: 'Find a Charger' },
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/host', label: 'Become a Host' },
];

function AccountMenu({ user, isHost, isAdmin, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const initials = (user.name || user.phone || 'C')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .slice(-2)
    .toUpperCase();

  return (
    <div className="account-menu" ref={ref}>
      <button
        type="button"
        className="avatar"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        {initials}
      </button>

      {open && (
        <div className="account-menu__panel" role="menu">
          <div className="account-menu__header">
            <div className="strong">{user.name || 'Your account'}</div>
            <div className="small muted">{user.phone}</div>
          </div>
          <Link className="account-menu__item" to="/bookings" onClick={() => setOpen(false)}>
            <Icon name="calendar" size={16} /> My bookings
          </Link>
          <Link className="account-menu__item" to="/account" onClick={() => setOpen(false)}>
            <Icon name="user" size={16} /> Account & vehicle
          </Link>
          {isHost && (
            <Link className="account-menu__item" to="/host" onClick={() => setOpen(false)}>
              <Icon name="home" size={16} /> Host dashboard
            </Link>
          )}
          {isAdmin && (
            <Link className="account-menu__item" to="/admin" onClick={() => setOpen(false)}>
              <Icon name="shield" size={16} /> Admin console
            </Link>
          )}
          <div className="account-menu__sep" />
          <button
            type="button"
            className="account-menu__item account-menu__item--danger"
            onClick={async () => {
              setOpen(false);
              await onSignOut();
              navigate('/');
            }}
          >
            <Icon name="logout" size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { session, isSignedIn, isHost, isAdmin, signOut } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }, [location.pathname]);

  return (
    <>
      <a href="#main" className="sr-only">
        Skip to content
      </a>
      <header className="site-header">
        <div className="container site-header__inner">
          <Brand />
          <nav className="nav" aria-label="Main">
            {MAIN_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav__link ${isActive ? 'nav__link--active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="header-actions">
            {isSignedIn ? (
              <AccountMenu user={session.user} isHost={isHost} isAdmin={isAdmin} onSignOut={signOut} />
            ) : (
              <>
                <ButtonLink to="/login" variant="ghost" size="sm">
                  Log in
                </ButtonLink>
                <ButtonLink to="/login?intent=driver" variant="primary" size="sm" className="hide-mobile">
                  Get Started
                </ButtonLink>
              </>
            )}
            <button
              type="button"
              className="menu-toggle"
              onClick={() => setMobileOpen((value) => !value)}
              aria-expanded={mobileOpen}
              aria-label="Menu"
            >
              <Icon name={mobileOpen ? 'close' : 'menu'} size={18} />
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="mobile-nav">
            {MAIN_NAV.map((item) => (
              <Link key={item.to} to={item.to}>
                {item.label}
              </Link>
            ))}
            <Link to="/policies">Policies</Link>
            <Link to="/help">Help &amp; safety</Link>
            {isSignedIn ? (
              <>
                <Link to="/bookings">My bookings</Link>
                <Link to="/account">Account</Link>
                <button type="button" onClick={signOut}>
                  Sign out
                </button>
              </>
            ) : (
              <Link to="/login">
                <strong>Log in / Get started</strong>
              </Link>
            )}
          </div>
        )}
      </header>

      <main id="main">
        <Outlet />
      </main>

      <Footer />
      <ToastStack />
    </>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <div className="footer-brand">
              <span className="brand__mark" style={{ width: 32, height: 32 }}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13.6 2 5 13.4h5.5L9 22l8.6-11.4H12L13.6 2Z" />
                </svg>
              </span>
              ChargeNeighbor
            </div>
            <p className="footer-note">
              A neighbour-to-neighbour marketplace for residential EV charging. Listings are reviewed
              by our team; exact addresses are shared only after a booking is confirmed.
            </p>
          </div>

          <div>
            <h4>Charging</h4>
            <div className="footer-links">
              <Link to="/search">Find a Charger</Link>
              <Link to="/how-it-works">How It Works</Link>
              <Link to="/bookings">My bookings</Link>
              <Link to="/account">Vehicle profile</Link>
            </div>
          </div>

          <div>
            <h4>Hosting</h4>
            <div className="footer-links">
              <Link to="/host">Become a Host</Link>
              <Link to="/policies/hosts">Host rules</Link>
              <Link to="/policies/cancellation">Cancellation &amp; refunds</Link>
            </div>
          </div>

          <div>
            <h4>Policies &amp; help</h4>
            <div className="footer-links">
              <Link to="/policies">All policies</Link>
              <Link to="/policies/terms">Terms of Service</Link>
              <Link to="/policies/privacy">Privacy Policy</Link>
              <Link to="/policies/safety">Safety</Link>
              <Link to="/help">Help &amp; contact</Link>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} ChargeNeighbor. Marketplace platform, not a charging operator.</span>
          <span>Electricity is supplied by the host, not by ChargeNeighbor.</span>
        </div>
      </div>
    </footer>
  );
}

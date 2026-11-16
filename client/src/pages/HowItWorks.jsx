import { Link } from 'react-router-dom';
import { ButtonLink, Card, Icon } from '../components/ui.jsx';
import { useApp } from '../context/AppContext.jsx';

const DRIVER_STEPS = [
  {
    title: 'Sign in and add your vehicle',
    body: 'Verify your phone number, then add the connector your car uses. Compatibility checks use this, so you are never shown a charger you cannot plug into.',
  },
  {
    title: 'Search your area',
    body: 'Enter an area, or share your location to sort by distance. Filter by connector, AC or DC, power and hourly price.',
  },
  {
    title: 'Check availability and price',
    body: 'Open a charger to see free start times for the day, the host rate, the platform fee, and the total you will pay.',
  },
  {
    title: 'Book and get the details',
    body: 'After confirming you receive the address, the host arrival notes and a check-in code unique to your booking.',
  },
  {
    title: 'Charge and complete',
    body: 'Check in when you arrive, charge for your booked window, and mark the session complete. Then leave a review.',
  },
];

export default function HowItWorks() {
  const { meta, isHost } = useApp();

  return (
    <div className="page">
      <div className="container">
        <div style={{ maxWidth: 720 }}>
          <span className="section-label">How it works</span>
          <h1 style={{ marginTop: 12 }}>A plug, a neighbour, and a booking that explains itself</h1>
          <p className="muted" style={{ marginTop: 14, fontSize: '1.02rem' }}>
            ChargeNeighbor is a marketplace between drivers and households that own a charging point. We do
            not install chargers, we do not supply electricity, and we do not promise a battery percentage.
            What we do is make the arrangement clear before either side commits.
          </p>
        </div>

        <div className="steps" style={{ marginTop: 36, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <Card className="card--pad">
            <h2 style={{ fontSize: '1.1rem', marginBottom: 18 }}>For drivers</h2>
            <div className="timeline">
              {DRIVER_STEPS.map((step, index) => (
                <div className="timeline-item" key={step.title}>
                  <span className="timeline-dot">{index + 1}</span>
                  <div>
                    <h3 style={{ fontSize: '0.95rem', marginBottom: 4 }}>{step.title}</h3>
                    <p className="small muted">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="card--pad">
            <h2 style={{ fontSize: '1.1rem', marginBottom: 18 }}>For hosts</h2>
            <div className="timeline">
              {[
                {
                  title: 'Enable hosting on your account',
                  body: 'Sign in, verify your number, and turn on hosting from the login screen or the host dashboard.',
                },
                {
                  title: 'Describe the charger accurately',
                  body: 'Connector, AC or DC, rated power, hourly price, parking notes and house rules. Add real photos of the charger and the space.',
                },
                {
                  title: 'Publish your weekly availability',
                  body: 'Set the windows you are willing to offer, and block individual dates whenever the charger is unavailable.',
                },
                {
                  title: 'Submit for review',
                  body: 'A person checks the listing is complete before it appears in search. Edits to a live listing go back through review.',
                },
                {
                  title: 'Host the session and get paid',
                  body: 'You see every booking with your earning and the platform fee. Pause the listing any time; confirmed bookings still stand.',
                },
              ].map((step, index) => (
                <div className="timeline-item" key={step.title}>
                  <span className="timeline-dot">{index + 1}</span>
                  <div>
                    <h3 style={{ fontSize: '0.95rem', marginBottom: 4 }}>{step.title}</h3>
                    <p className="small muted">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="trust-grid" style={{ marginTop: 28 }}>
          <div className="trust-item">
            <div className="trust-item__icon"><Icon name="wallet" size={20} /></div>
            <h4>What a session costs</h4>
            <p>
              Host hourly rate × session length, plus a {meta?.platformFeePercent ?? 8}% platform fee.
              Sessions are sold in time, not kWh, because home chargers are not metered for billing here.
            </p>
          </div>
          <div className="trust-item">
            <div className="trust-item__icon"><Icon name="clock" size={20} /></div>
            <h4>Arrival and overstay</h4>
            <p>
              Your slot is held for {meta?.bookingRules?.gracePeriodMinutes ?? 15} minutes after the start.
              After that the host may release it. Staying past your window needs the host&apos;s agreement.
            </p>
          </div>
          <div className="trust-item">
            <div className="trust-item__icon"><Icon name="shield" size={20} /></div>
            <h4>What we check</h4>
            <p>
              Phone verification and listing review. Neither is an electrical inspection, and neither
              guarantees a charger will work. Report anything unsafe immediately.
            </p>
          </div>
        </div>

        <Card className="card--pad" style={{ marginTop: 28 }}>
          <div className="row row--between row--wrap" style={{ gap: 16 }}>
            <div>
              <h3 style={{ fontSize: '1rem' }}>Read the rules before you book</h3>
              <p className="small muted" style={{ marginTop: 4 }}>
                Cancellation windows, refunds, safety expectations and host rules are published in full.
              </p>
            </div>
            <div className="row row--wrap">
              <Link className="btn btn--secondary btn--md" to="/policies/cancellation">
                Cancellation &amp; refunds
              </Link>
              <ButtonLink to="/search" variant="primary" size="md">
                Find a charger
              </ButtonLink>
              {!isHost && (
                <ButtonLink to="/login?intent=host" variant="ghost" size="md">
                  Become a host
                </ButtonLink>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  Field,
  Icon,
  Select,
  Textarea,
} from '../components/ui.jsx';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';
import { dayOnly, titleCase } from '../lib/format.js';

const CATEGORIES = [
  'Unsafe charger or wiring',
  'Charger not available',
  'Listing inaccurate',
  'Address or access problem',
  'Unfair treatment',
  'Payment or refund issue',
  'No-show',
  'Other',
];

export default function Help() {
  const { session, toast } = useApp();
  const [form, setForm] = useState({ category: CATEGORIES[0], details: '' });
  const [state, setState] = useState({ busy: false, error: null });
  const [mine, setMine] = useState({ loading: true, items: [] });

  const loadMine = useCallback(() => {
    if (!session.user) return;
    api
      .get('/reports/me')
      .then((data) => setMine({ loading: false, items: data.reports }))
      .catch(() => setMine({ loading: false, items: [] }));
  }, [session.user]);

  useEffect(loadMine, [loadMine]);

  const submit = async (event) => {
    event.preventDefault();
    setState({ busy: true, error: null });
    try {
      await api.post('/reports', { targetType: 'other', category: form.category, details: form.details });
      setState({ busy: false, error: null });
      setForm({ category: CATEGORIES[0], details: '' });
      toast('Message sent to support.');
      loadMine();
    } catch (error) {
      setState({ busy: false, error });
    }
  };

  return (
    <div className="page">
      <div className="container">
        <div style={{ maxWidth: 720 }}>
          <span className="section-label">Help &amp; support</span>
          <h1 style={{ marginTop: 12 }}>Tell us what happened</h1>
          <p className="muted" style={{ marginTop: 12 }}>
            Support reviews reports with the booking record attached. For a specific charger or session,
            open it from{' '}
            <Link to="/bookings" className="link-button">
              your bookings
            </Link>{' '}
            so the case is linked automatically.
          </p>
        </div>

        <div style={{ margin: '24px 0' }}>
          <Alert tone="danger" title="ChargeNeighbor is not an emergency service">
            If there is smoke, fire, a shock, or someone is hurt, contact local emergency services first.
            Then report it here so we can pause the listing while it is investigated.
          </Alert>
        </div>

        <div className="detail-layout" style={{ paddingTop: 0 }}>
          <div className="stack-lg">
            <Card className="card--pad">
              <h2 style={{ fontSize: '1.05rem', marginBottom: 14 }}>Send a report</h2>

              {!session.user ? (
                <div className="stack">
                  <p className="small muted">
                    Sign in so support can reply and link the case to your account.
                  </p>
                  <ButtonLink to="/login?redirect=%2Fhelp" variant="primary" size="sm">
                    Sign in to report
                  </ButtonLink>
                </div>
              ) : (
                <form className="stack" onSubmit={submit}>
                  {state.error && <Alert tone="danger">{state.error.message}</Alert>}
                  <Field label="What is this about?" htmlFor="category">
                    <Select
                      id="category"
                      value={form.category}
                      onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                    >
                      {CATEGORIES.map((category) => (
                        <option key={category}>{category}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label="Details"
                    hint="At least a couple of sentences. Include booking references if relevant. Do not include anyone's private address or phone number."
                    error={state.error?.fieldError('details')}
                  >
                    <Textarea
                      value={form.details}
                      onChange={(event) => setForm((current) => ({ ...current, details: event.target.value }))}
                      placeholder="What happened, and what would you like us to do?"
                    />
                  </Field>
                  <div>
                    <Button
                      type="submit"
                      variant="primary"
                      size="md"
                      loading={state.busy}
                      disabled={form.details.trim().length < 20}
                    >
                      Send to support
                    </Button>
                  </div>
                </form>
              )}
            </Card>

            {session.user && (
              <Card className="card--pad">
                <h2 style={{ fontSize: '1.05rem', marginBottom: 12 }}>Your cases</h2>
                {mine.loading ? (
                  <p className="small muted">Loading…</p>
                ) : mine.items.length === 0 ? (
                  <p className="small muted">No reports yet.</p>
                ) : (
                  <div className="stack">
                    {mine.items.map((report) => (
                      <div key={report.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                        <div className="row" style={{ gap: 8 }}>
                          <Badge tone={report.status === 'RESOLVED' ? 'success' : report.status === 'REVIEWING' ? 'info' : 'warn'}>
                            {titleCase(report.status)}
                          </Badge>
                          <strong className="small">{report.category}</strong>
                          <span className="tiny muted">{dayOnly(report.createdAt)}</span>
                        </div>
                        <p className="small muted" style={{ marginTop: 6 }}>{report.details}</p>
                        {report.resolution && (
                          <p className="small" style={{ marginTop: 6, color: 'var(--green-dark)' }}>
                            Support: {report.resolution}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>

          <aside className="stack">
            <Card className="card--pad">
              <h3 style={{ fontSize: '0.98rem', marginBottom: 10 }}>Common questions</h3>
              <div className="stack">
                {[
                  {
                    q: 'How do I contact my host?',
                    a: 'Once a booking is confirmed, arrival notes and the exact address are on the booking page. Phone numbers stay private by default; use a report if you cannot reach the host.',
                  },
                  {
                    q: 'The charger would not start',
                    a: 'Check the connector matches your booking, then report it from the booking page. We will review the listing and any refund.',
                  },
                  {
                    q: 'When is payment taken?',
                    a: 'Payment state is shown on every booking. Online payment is only collected once a provider is connected; until then the booking is marked due at the session.',
                  },
                  {
                    q: 'Why can I not see the house number?',
                    a: 'Exact addresses are private until a booking is confirmed. Search results show a neighbourhood and an approximate pin.',
                  },
                ].map((item) => (
                  <div key={item.q}>
                    <div className="strong small">{item.q}</div>
                    <p className="small muted" style={{ marginTop: 3 }}>{item.a}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="card--pad">
              <h3 style={{ fontSize: '0.98rem', marginBottom: 10 }}>Policies</h3>
              <div className="stack">
                <Link className="link-button" to="/policies/safety">
                  Safety policy <Icon name="arrow" size={13} />
                </Link>
                <Link className="link-button" to="/policies/cancellation">
                  Cancellation &amp; refunds <Icon name="arrow" size={13} />
                </Link>
                <Link className="link-button" to="/policies/community">
                  Community rules <Icon name="arrow" size={13} />
                </Link>
                <Link className="link-button" to="/policies/privacy">
                  Privacy policy <Icon name="arrow" size={13} />
                </Link>
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}

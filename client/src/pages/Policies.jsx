import { useEffect, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { Alert, Badge, ButtonLink, Card, Icon, Skeleton } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { money } from '../lib/format.js';

export default function Policies() {
  const { slug } = useParams();
  const [index, setIndex] = useState({ loading: true, error: null, policies: [], meta: null });
  const [doc, setDoc] = useState({ loading: Boolean(slug), error: null, policy: null });

  useEffect(() => {
    api
      .get('/policies')
      .then((data) => setIndex({ loading: false, error: null, policies: data.policies, meta: data.meta }))
      .catch((error) => setIndex({ loading: false, error, policies: [], meta: null }));
  }, []);

  useEffect(() => {
    if (!slug) {
      setDoc({ loading: false, error: null, policy: null });
      return;
    }
    setDoc({ loading: true, error: null, policy: null });
    api
      .get(`/policies/${slug}`)
      .then((data) => setDoc({ loading: false, error: null, policy: data.policy }))
      .catch((error) => setDoc({ loading: false, error, policy: null }));
  }, [slug]);

  const cancellation = index.meta?.cancellation;

  if (!slug) {
    return (
      <>
        <section className="policy-hero">
          <div className="container">
            <span className="eyebrow" style={{ color: '#d2b0a0' }}>Policies</span>
            <h1>How ChargeNeighbor works, in writing</h1>
            <p>
              These policies are the same rules the booking engine applies. When a cancellation window
              changes here, the refund logic changes with it.
            </p>
          </div>
        </section>

        <div className="container" style={{ padding: '40px 20px 72px' }}>
          {index.error && (
            <Alert tone="danger" title="Could not load policies">
              {index.error.message}
            </Alert>
          )}

          {index.loading ? (
            <div className="policy-card-grid">
              {[0, 1, 2, 3, 4, 5].map((key) => (
                <Skeleton key={key} height={168} radius={20} />
              ))}
            </div>
          ) : (
            <div className="policy-card-grid">
              {index.policies.map((policy) => (
                <Card className="policy-card" key={policy.slug}>
                  <h3>{policy.title}</h3>
                  <p>{policy.summary}</p>
                  <Link to={`/policies/${policy.slug}`} className="link-button">
                    Read policy <Icon name="arrow" size={14} />
                  </Link>
                </Card>
              ))}
            </div>
          )}

          {index.meta && (
            <Card className="card--pad" style={{ marginTop: 24 }}>
              <div className="row row--between row--wrap" style={{ gap: 16 }}>
                <div>
                  <div className="field__label">Platform fee</div>
                  <p className="strong">{index.meta.fees.platformFeePercent}% added to the host rate</p>
                </div>
                <div>
                  <div className="field__label">Free cancellation</div>
                  <p className="strong">{index.meta.cancellation.freeUntilHours} hours before the start</p>
                </div>
                <div>
                  <div className="field__label">Arrival grace period</div>
                  <p className="strong">{index.meta.bookingRules.gracePeriodMinutes} minutes</p>
                </div>
                <div>
                  <div className="field__label">Effective</div>
                  <p className="strong">{index.meta.effectiveDate}</p>
                </div>
              </div>
            </Card>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <section className="policy-hero">
        <div className="container">
          <Link to="/policies" className="link-button" style={{ color: '#d2b0a0', marginBottom: 14 }}>
            <Icon name="arrow" size={14} style={{ transform: 'rotate(180deg)' }} /> All policies
          </Link>
          <h1>{doc.policy?.title || 'Policy'}</h1>
          {doc.policy && (
            <>
              <p>{doc.policy.summary}</p>
              <div className="row" style={{ marginTop: 14 }}>
                <Badge tone="neutral">Updated {doc.policy.updated}</Badge>
              </div>
            </>
          )}
        </div>
      </section>

      <div className="container">
        <div className="policy-layout">
          <nav className="policy-nav" aria-label="Policy pages">
            {index.policies.map((policy) => (
              <NavLink
                key={policy.slug}
                to={`/policies/${policy.slug}`}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                {policy.title}
              </NavLink>
            ))}
          </nav>

          <article className="policy-body">
            {doc.loading ? (
              <>
                <Skeleton height={24} width="50%" />
                <div style={{ height: 14 }} />
                <Skeleton height={120} radius={12} />
              </>
            ) : doc.error ? (
              <Alert tone="danger" title="Policy not found">
                {doc.error.message}
                <div style={{ marginTop: 10 }}>
                  <ButtonLink to="/policies" variant="secondary" size="sm">
                    Back to policies
                  </ButtonLink>
                </div>
              </Alert>
            ) : (
              <>
                {doc.policy.cancellationTable && cancellation && (
                  <Card className="card--pad" style={{ marginBottom: 20 }}>
                    <h3 style={{ fontSize: '0.98rem', marginBottom: 12 }}>What you get back</h3>
                    <div className="table-wrap">
                      <table className="data">
                        <thead>
                          <tr>
                            <th>When you cancel</th>
                            <th>Refund</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>More than {cancellation.freeUntilHours} hours before the start</td>
                            <td><strong>100%</strong></td>
                          </tr>
                          <tr>
                            <td>
                              Between {cancellation.partialUntilHours} and {cancellation.freeUntilHours} hours before
                            </td>
                            <td><strong>{cancellation.partialRefundPercent}%</strong></td>
                          </tr>
                          <tr>
                            <td>Less than {cancellation.partialUntilHours} hours before, or no-show</td>
                            <td><strong>No refund</strong></td>
                          </tr>
                          <tr>
                            <td>Host cancels, or the charger is unusable</td>
                            <td><strong>100% including platform fee</strong></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    {index.meta?.platformFeePercent > 0 && (
                      <p className="tiny muted" style={{ marginTop: 10 }}>
                        Example: a {money(500, 'INR')} session cancelled 8 hours before the start refunds{' '}
                        <strong>{money(250, 'INR')}</strong>.
                      </p>
                    )}
                  </Card>
                )}

                {doc.policy.sections.map((section) => (
                  <section key={section.heading}>
                    <h2>{section.heading}</h2>
                    {section.body.map((paragraph) => (
                      <p key={paragraph.slice(0, 40)}>{paragraph}</p>
                    ))}
                  </section>
                ))}

                <Card className="card--pad card--soft" style={{ marginTop: 32 }}>
                  <h3 style={{ fontSize: '0.96rem' }}>Questions about this policy?</h3>
                  <p className="small muted" style={{ marginTop: 6 }}>
                    Support reads every message and can look at the booking record with you.
                  </p>
                  <div className="row" style={{ marginTop: 12 }}>
                    <ButtonLink to="/help" variant="secondary" size="sm">
                      Contact support
                    </ButtonLink>
                    <ButtonLink to="/policies" variant="ghost" size="sm">
                      All policies
                    </ButtonLink>
                  </div>
                </Card>
              </>
            )}
          </article>
        </div>
      </div>
    </>
  );
}

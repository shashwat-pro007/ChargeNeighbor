import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="container" style={{ padding: '80px 20px' }}>
          <div className="card card--pad" style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
            <h1 style={{ fontSize: '1.5rem' }}>This page hit an unexpected problem</h1>
            <p className="muted" style={{ marginTop: 10 }}>
              The rest of ChargeNeighbor is fine. Reloading usually fixes it — if it keeps happening,
              send us a note from the Help page.
            </p>
            <div className="row" style={{ justifyContent: 'center', marginTop: 20 }}>
              <button type="button" className="btn btn--primary btn--md" onClick={() => window.location.reload()}>
                Reload page
              </button>
              <a className="btn btn--secondary btn--md" href="/help">
                Get help
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

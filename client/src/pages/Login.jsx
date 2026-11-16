import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BrandMark } from '../components/Brand.jsx';
import { Alert, Button, Field, Icon, Input } from '../components/ui.jsx';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';

export default function Login() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { meta, session, refreshSession, toast } = useApp();

  const redirect = params.get('redirect') || '';
  const initialIntent = params.get('intent') === 'host' ? 'host' : 'driver';

  const [intent, setIntent] = useState(initialIntent);
  const [step, setStep] = useState('phone');
  const [mode, setMode] = useState(params.get('mode') === 'id' ? 'id' : 'phone');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [request, setRequest] = useState({ loading: false, error: null, result: null });
  const [verify, setVerify] = useState({ loading: false, error: null });
  const [passwordForm, setPasswordForm] = useState({ loginId: '', password: '' });
  const [passwordLogin, setPasswordLogin] = useState({ loading: false, error: null });

  useEffect(() => {
    if (session.user) {
      navigate(redirect || (session.user.roles.includes('host') && initialIntent === 'host' ? '/host' : '/bookings'), {
        replace: true,
      });
    }
  }, [session.user, navigate, redirect, initialIntent]);

  const requestCode = async (event) => {
    event.preventDefault();
    setRequest({ loading: true, error: null, result: null });
    try {
      const result = await api.post('/auth/otp/request', { phone: phone.trim() });
      setRequest({ loading: false, error: null, result });
      setStep('code');
      if (result.testOtp) setCode(result.testOtp);
      toast(result.testMode ? 'Testing mode: fixed code filled in.' : 'Code sent.', 'info');
    } catch (error) {
      setRequest({ loading: false, error, result: null });
    }
  };

  const submitCode = async (event) => {
    event.preventDefault();
    setVerify({ loading: true, error: null });
    try {
      const result = await api.post('/auth/otp/verify', {
        phone: phone.trim(),
        code: code.trim(),
        name: name.trim() || undefined,
        intent,
      });
      const user = await refreshSession();
      if (result.isNewAccount && !result.user?.hasPassword) {
        toast('Account created. Add a login ID and password in Account to sign in without a code.');
      } else {
        toast('Signed in.');
      }
      const target =
        redirect ||
        (result.isNewAccount
          ? '/account?setup=password'
          : intent === 'host' && user?.roles?.includes('host')
            ? '/host'
            : '/bookings');
      navigate(target, { replace: true });
    } catch (error) {
      setVerify({ loading: false, error });
    }
  };

  const submitPassword = async (event) => {
    event.preventDefault();
    setPasswordLogin({ loading: true, error: null });
    try {
      await api.post('/auth/id/login', {
        loginId: passwordForm.loginId.trim(),
        password: passwordForm.password,
      });
      await refreshSession();
      toast('Signed in.');
      navigate(redirect || '/bookings', { replace: true });
    } catch (error) {
      setPasswordLogin({ loading: false, error });
    }
  };

  const switchMode = (next) => {
    setMode(next);
    setRequest({ loading: false, error: null, result: null });
    setVerify({ loading: false, error: null });
    setPasswordLogin({ loading: false, error: null });
    setStep('phone');
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="row" style={{ marginBottom: 22 }}>
          <BrandMark size={38} />
          <div>
            <div className="strong">ChargeNeighbor</div>
            <div className="tiny muted">Neighbourhood EV charging</div>
          </div>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Sign in method">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'phone'}
            className={`auth-tab ${mode === 'phone' ? 'auth-tab--active' : ''}`}
            onClick={() => switchMode('phone')}
          >
            Phone code
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'id'}
            className={`auth-tab ${mode === 'id' ? 'auth-tab--active' : ''}`}
            onClick={() => switchMode('id')}
          >
            Login ID
          </button>
        </div>

        {mode === 'id' ? (
          <form className="stack" onSubmit={submitPassword}>
            <h1>Sign in</h1>
            <p className="auth-card__lead">
              Use the login ID and password you set in your account. New here? Create an account with your
              phone number first.
            </p>

            {passwordLogin.error && (
              <Alert tone="danger">{passwordLogin.error.message}</Alert>
            )}

            <Field
              label="Login ID"
              htmlFor="loginId"
              error={passwordLogin.error?.fieldError('loginId')}
              required
            >
              <Input
                id="loginId"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="ananya.rao"
                value={passwordForm.loginId}
                onChange={(event) =>
                  setPasswordForm((current) => ({ ...current, loginId: event.target.value }))
                }
                required
              />
            </Field>

            <Field
              label="Password"
              htmlFor="password"
              error={passwordLogin.error?.fieldError('password')}
              required
            >
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={passwordForm.password}
                onChange={(event) =>
                  setPasswordForm((current) => ({ ...current, password: event.target.value }))
                }
                required
              />
            </Field>

            <Button type="submit" variant="ev" size="lg" block loading={passwordLogin.loading}>
              Sign in
            </Button>

            <button type="button" className="link-button tiny" onClick={() => switchMode('phone')}>
              Forgot your password? Sign in with your phone number and set a new one.
            </button>
          </form>
        ) : step === 'phone' ? (
          <form className="stack" onSubmit={requestCode}>
            <h1>{intent === 'host' ? 'Host your charger' : 'Sign in or create an account'}</h1>
            <p className="auth-card__lead">
              We verify every account with a one-time code sent to your phone. After that you can add a login
              ID and password for faster sign-in.
            </p>

            <div style={{ marginTop: 8 }}>
              <div className="field__label" style={{ marginBottom: 7 }}>I am here to</div>
              <div className="role-toggle">
                <button
                  type="button"
                  className={`role-option ${intent === 'driver' ? 'role-option--active' : ''}`}
                  onClick={() => setIntent('driver')}
                  aria-pressed={intent === 'driver'}
                >
                  <strong>Charge my car</strong>
                  <span className="tiny muted">Find and book chargers</span>
                </button>
                <button
                  type="button"
                  className={`role-option ${intent === 'host' ? 'role-option--active' : ''}`}
                  onClick={() => setIntent('host')}
                  aria-pressed={intent === 'host'}
                >
                  <strong>Host a charger</strong>
                  <span className="tiny muted">List a home charger</span>
                </button>
              </div>
            </div>

            <Field
              label="Phone number"
              htmlFor="phone"
              hint="Include country code, for example +919876543210."
              error={request.error?.fieldError('phone') ?? request.error?.message}
              required
            >
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+919876543210"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                error={Boolean(request.error)}
                required
              />
            </Field>

            <Field label="Your name" htmlFor="name" hint="Shown to the other party on a booking. Optional for now.">
              <Input
                id="name"
                autoComplete="name"
                placeholder="e.g. Ananya Rao"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>

            {meta?.testLogin?.enabled && (
              <Alert tone="warn" title="Testing mode">
                Allowlisted test numbers can sign in with the fixed code{' '}
                <strong style={{ display: 'inline' }}>{meta.testLogin.otp}</strong>.{' '}
                {meta.testLogin.prefixes?.length > 0 && (
                  <>Any number starting with {meta.testLogin.prefixes.join(', ')} is treated as a test number.</>
                )}
              </Alert>
            )}

            <Button type="submit" variant="primary" size="lg" block loading={request.loading}>
              Send code
            </Button>

            <p className="tiny muted center">
              By continuing you agree to our <Link to="/policies/terms" className="link-button">Terms</Link>{' '}
              and <Link to="/policies/privacy" className="link-button">Privacy Policy</Link>.
            </p>
          </form>
        ) : (
          <form className="stack" onSubmit={submitCode}>
            <h1>Enter the code</h1>
            <p className="auth-card__lead">
              We sent a 6 digit code to <strong>{phone}</strong>.{' '}
              <button type="button" className="link-button" onClick={() => setStep('phone')}>
                Change number
              </button>
            </p>

            {request.result?.testMode && (
              <Alert tone="warn" title="Fixed test code">
                This number is on the test allowlist. Use <strong style={{ display: 'inline' }}>{meta?.testLogin?.otp}</strong>{' '}
                to sign in. Disable test mode before launch.
              </Alert>
            )}

            <Field
              label="6 digit code"
              htmlFor="code"
              error={verify.error?.fieldError('code') ?? verify.error?.message}
              hint={`The code expires in ${request.result?.ttlMinutes ?? 5} minutes.`}
              required
            >
              <Input
                id="code"
                className="otp-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                error={Boolean(verify.error)}
                required
              />
            </Field>

            <Button type="submit" variant="ev" size="lg" block loading={verify.loading}>
              Verify and continue
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              block
              loading={request.loading}
              onClick={requestCode}
            >
              <Icon name="refresh" size={14} /> Resend code
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

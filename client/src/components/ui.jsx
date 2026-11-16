import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';

/* ---------------------------------------------------------------- icons ---- */

const ICONS = {
  bolt: { fill: true, d: 'M13 2 4 14h6l-1 8 9-12h-6l1-8Z' },
  pin: {
    d: 'M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  },
  home: { d: 'M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-9.5Z' },
  search: { d: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z M21 21l-4.3-4.3' },
  clock: { d: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 7v5l3 2' },
  plug: { d: 'M9 3v6M15 3v6M6 9h12v3a6 6 0 0 1-12 0V9ZM12 18v3' },
  shield: { d: 'M12 3 5 6v6c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6l-7-3Z M9 12l2 2 4-4' },
  check: { d: 'M4.5 12.5 9 17l10.5-10.5' },
  close: { d: 'M6 6l12 12M18 6 6 18' },
  menu: { d: 'M4 7h16M4 12h16M4 17h16' },
  map: { d: 'M9 4 3 6.5v14L9 18l6 2.5 6-2.5v-14L15 6.5 9 4Z M9 4v14M15 6.5v14' },
  list: { d: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01' },
  star: { fill: true, d: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 9.7l5.9-.9L12 3.5Z' },
  plus: { d: 'M12 5v14M5 12h14' },
  edit: { d: 'M4 20h4L20 8l-4-4L4 16v4Z M14.5 5.5 18.5 9.5' },
  trash: { d: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13' },
  alert: { d: 'M12 4 2.5 20h19L12 4Z M12 10v4M12 17h.01' },
  arrow: { d: 'M5 12h13M13 6l6 6-6 6' },
  filter: { d: 'M3 5h18l-7 8v6l-4 2v-8L3 5Z' },
  user: { d: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M4 21c0-4 3.6-6 8-6s8 2 8 6' },
  car: { d: 'M5 16v-3l2-5h10l2 5v3M3 16h18v3h-3v-2H6v2H3v-3Z' },
  calendar: { d: 'M4 6h16v14H4V6Z M4 10h16M8 3v4M16 3v4' },
  wallet: { d: 'M3 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z M3 7l2-3h11l2 3M16 13h2' },
  logout: { d: 'M9 4H5v16h4M14 8l4 4-4 4M18 12H9' },
  chevron: { d: 'M9 6l6 6-6 6' },
  external: { d: 'M14 4h6v6M20 4l-9 9M10 5H5v14h14v-5' },
  camera: { d: 'M4 8h3l2-3h6l2 3h3v11H4V8Z M12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z' },
  info: { d: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 11v5M12 8h.01' },
  refresh: { d: 'M20 11a8 8 0 1 0-2 6M20 5v6h-6' },
};

export function Icon({ name, size = 18, className = '', ...rest }) {
  const icon = ICONS[name];
  if (!icon) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`icon ${className}`}
      aria-hidden="true"
      focusable="false"
      fill={icon.fill ? 'currentColor' : 'none'}
      stroke={icon.fill ? 'none' : 'currentColor'}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <path d={icon.d} />
    </svg>
  );
}

/* --------------------------------------------------------------- buttons --- */

const buttonClass = (variant = 'primary', size = 'md', extra = '') =>
  ['btn', `btn--${variant}`, `btn--${size}`, extra].filter(Boolean).join(' ');

export function Button({ variant = 'primary', size = 'md', loading = false, children, className = '', ...rest }) {
  return (
    <button
      className={buttonClass(variant, size, className)}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading && <span className="btn__spinner" aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}

export function ButtonLink({ to, variant = 'primary', size = 'md', children, className = '', ...rest }) {
  return (
    <Link to={to} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}

/* ----------------------------------------------------------------- forms --- */

export function Field({ label, hint, error, required, children, htmlFor }) {
  return (
    <div className={`field ${error ? 'field--error' : ''}`}>
      {label && (
        <label className="field__label" htmlFor={htmlFor}>
          {label}
          {required && <span className="field__required" aria-hidden="true"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="field__error" role="alert">{error}</p>
      ) : hint ? (
        <p className="field__hint">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ error, className = '', ...rest }) {
  return <input className={`input ${error ? 'input--error' : ''} ${className}`} {...rest} />;
}

export function Textarea({ error, className = '', ...rest }) {
  return <textarea className={`input textarea ${error ? 'input--error' : ''} ${className}`} {...rest} />;
}

export function Select({ error, children, className = '', ...rest }) {
  return (
    <select className={`input select ${error ? 'input--error' : ''} ${className}`} {...rest}>
      {children}
    </select>
  );
}

/* ----------------------------------------------------------- presentation -- */

export function Badge({ tone = 'neutral', children, title }) {
  return (
    <span className={`badge badge--${tone}`} title={title}>
      {children}
    </span>
  );
}

export function Card({ children, className = '', as: Tag = 'div', ...rest }) {
  return (
    <Tag className={`card ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export function Spinner({ label = 'Loading' }) {
  return (
    <span className="spinner" role="status" aria-live="polite">
      <span className="spinner__ring" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Skeleton({ height = 16, width = '100%', radius = 8, className = '' }) {
  return (
    <span
      className={`skeleton ${className}`}
      style={{ height, width, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

export function CardSkeleton() {
  return (
    <Card className="listing-card listing-card--skeleton" aria-hidden="true">
      <Skeleton height={168} radius={14} />
      <div className="listing-card__body">
        <Skeleton height={14} width="45%" />
        <Skeleton height={20} width="80%" />
        <Skeleton height={14} width="60%" />
        <Skeleton height={14} width="35%" />
      </div>
    </Card>
  );
}

export function EmptyState({ icon = 'info', title, description, action, children }) {
  return (
    <div className="empty">
      <span className="empty__icon"><Icon name={icon} size={22} /></span>
      <h3 className="empty__title">{title}</h3>
      {description && <p className="empty__text">{description}</p>}
      {children}
      {action}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', error, onRetry, children }) {
  return (
    <div className="alert alert--danger" role="alert">
      <Icon name="alert" size={18} />
      <div>
        <strong>{title}</strong>
        <p>{error?.message || 'Please try again.'}</p>
        {children}
        {onRetry && (
          <button type="button" className="link-button" onClick={onRetry}>
            <Icon name="refresh" size={14} /> Try again
          </button>
        )}
      </div>
    </div>
  );
}

export function Alert({ tone = 'info', title, children, onDismiss }) {
  return (
    <div className={`alert alert--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={tone === 'danger' ? 'alert' : tone === 'success' ? 'check' : 'info'} size={18} />
      <div>
        {title && <strong>{title}</strong>}
        {children}
      </div>
      {onDismiss && (
        <button type="button" className="alert__close" onClick={onDismiss} aria-label="Dismiss">
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer }) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => onClose?.()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal__head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ToastStack() {
  const { toasts, dismissToast } = useApp();
  if (!toasts.length) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.tone}`}>
          <span>{toast.message}</span>
          <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Dismiss">
            <Icon name="close" size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          className={`tab ${value === tab.value ? 'tab--active' : ''}`}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
          {tab.count !== undefined && <span className="tab__count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function CopyButton({ value, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="link-button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

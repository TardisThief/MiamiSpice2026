/**
 * Shared primitives: chips, sheets, empty and loading states, toast.
 *
 * One vocabulary for these, used on every screen. A "chip" that looked different
 * in the filter row and the detail sheet would be a bug, not a flourish.
 */

import { useEffect, useRef } from 'react';
import { IconClose } from './Icons.jsx';

/* -------------------------------------------------------------------- chips */

export function Chip({ active = false, onClick, children, count, tone = 'default', ...rest }) {
  return (
    <button
      type="button"
      className={`chip ${active ? 'chip--active' : ''} ${tone !== 'default' ? `chip--${tone}` : ''}`}
      aria-pressed={active}
      onClick={onClick}
      {...rest}
    >
      {children}
      {count != null && <span className="chip__count num">{count}</span>}
    </button>
  );
}

/* ------------------------------------------------------------------- sheets */

/**
 * Bottom sheet.
 *
 * Uses a real <dialog> so focus trapping, Esc and the top layer come from the
 * platform rather than from hand-rolled listeners — and so it can never be clipped
 * by an ancestor's overflow.
 */
export function Sheet({ open, onClose, title, children, footer, labelledBy, actions }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Esc and backdrop dismissal both surface as `cancel`/`close`.
    const onCancel = (e) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener('cancel', onCancel);
    return () => el.removeEventListener('cancel', onCancel);
  }, [onClose]);

  // Clicking the backdrop (outside the panel) closes.
  const onClick = (e) => {
    if (e.target === ref.current) onClose();
  };

  return (
    <dialog ref={ref} className="sheet" onClick={onClick} aria-labelledby={labelledBy}>
      <div className="sheet__panel">
        <div className="sheet__grip" aria-hidden="true" />
        {title && (
          <header className="sheet__head">
            <h2 id={labelledBy} className="sheet__title">
              {title}
            </h2>
            {/* Header actions sit beside the close button so the primary controls
                for a sheet are all in one place, at the top. */}
            {actions}
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <IconClose />
            </button>
          </header>
        )}
        <div className="sheet__body scroll-y">{children}</div>
        {footer && <div className="sheet__foot">{footer}</div>}
      </div>
    </dialog>
  );
}

/* ------------------------------------------------------------ empty / error */

/**
 * Empty states teach the interface rather than announcing absence, so each one
 * takes an action that resolves it.
 */
export function EmptyState({ icon, title, children, action }) {
  return (
    <div className="empty">
      {icon && <div className="empty__icon">{icon}</div>}
      <h3 className="empty__title">{title}</h3>
      {children && <div className="empty__body">{children}</div>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}

export function ErrorState({ title, message, onRetry }) {
  return (
    <EmptyState
      title={title}
      action={
        onRetry && (
          <button type="button" className="btn btn--primary" onClick={onRetry}>
            Try again
          </button>
        )
      }
    >
      <p>{message}</p>
    </EmptyState>
  );
}

/* ----------------------------------------------------------------- skeleton */

/** Skeleton rows, not a centered spinner — the shape of what's coming. */
export function SkeletonList({ rows = 8 }) {
  return (
    <div className="skel-list" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading restaurants…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div className="skel-row" key={i}>
          <div className="skel-line skel-line--title" />
          <div className="skel-line skel-line--meta" />
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------- toast */

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`toast toast--${toast.tone}`} role="status" aria-live="polite" key={toast.id}>
      {toast.message}
    </div>
  );
}

/* ------------------------------------------------------------------ segment */

/** Segmented control for small mutually-exclusive choices (sort, theme). */
export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`segmented__item ${value === o.id ? 'is-active' : ''}`}
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

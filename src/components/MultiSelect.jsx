/**
 * A filter pill that opens a checklist.
 *
 * Replaces the native <select> the day and cuisine filters used to be. A native
 * multiple select is the wrong control on a phone — it renders as a squat scroll
 * box, needs a modifier key to deselect on desktop, and can't show counts — so
 * this is a plain button plus a panel of checkboxes.
 *
 * The panel is portalled to <body> and positioned fixed. It has to be: the chip
 * row it lives in is a horizontal scroller, and an absolutely-positioned child
 * would be clipped by that overflow the moment it grew taller than the row.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconChevronDown, IconClose, IconSearch } from './Icons.jsx';

const PANEL_MAX_H = 340;
const GAP = 6;

/*
 * Only one picker is open at a time, coordinated here rather than by lifting the
 * state into every screen that uses one. Without it, pressing the cuisine pill
 * while the day pill is open would leave two panels stacked over each other.
 */
let nextId = 0;
const pickers = new Set();
const announceOpen = (id) => {
  for (const close of pickers) close(id);
};

export function MultiSelect({
  icon,
  options,
  selected,
  onChange,
  /** Singular noun, for labels: "day", "cuisine". */
  noun,
  plural,
  /** Shown when nothing is picked: "Any day". */
  emptyLabel,
  /** Renders a search box once the list is this long. */
  searchThreshold = 12,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const idRef = useRef(null);
  if (idRef.current === null) idRef.current = nextId++;

  // Close when a different picker opens.
  useEffect(() => {
    const close = (openedId) => {
      if (openedId !== idRef.current) setOpen(false);
    };
    pickers.add(close);
    return () => pickers.delete(close);
  }, []);

  const toggleOpen = () =>
    setOpen((wasOpen) => {
      if (!wasOpen) announceOpen(idRef.current);
      return !wasOpen;
    });

  const searchable = options.length >= searchThreshold;

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - GAP;
    const above = r.top - GAP;
    // Flip above the pill when there isn't room under it.
    const dropUp = below < 200 && above > below;
    const maxH = Math.min(PANEL_MAX_H, Math.max(160, dropUp ? above : below));
    const width = Math.min(300, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setPos({
      left,
      width,
      maxH,
      ...(dropUp ? { bottom: window.innerHeight - r.top + GAP } : { top: r.bottom + GAP }),
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    // `true` so a scroll inside the chip row or the list repositions us too.
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    // Chosen values stay listed even when they don't match, so a search can't
    // hide what you already picked and leave you unable to switch it off.
    return options.filter(
      (o) => o.label.toLowerCase().includes(needle) || selected.includes(o.value),
    );
  }, [options, query, selected]);

  /*
   * One name, or a count. Listing three cuisines never fits the pill, and a
   * truncated list is worse than a number — "Italian, Japanese, Me…" tells you
   * less than "3 cuisines" does.
   */
  const label = useMemo(() => {
    if (!selected.length) return emptyLabel;
    if (selected.length === 1) {
      return options.find((o) => o.value === selected[0])?.label ?? selected[0];
    }
    return `${selected.length} ${plural}`;
  }, [selected, options, emptyLabel, plural]);

  const toggle = (value) =>
    onChange(
      selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value],
    );

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={`selfilter__control ${selected.length ? 'is-active' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Filter by ${noun}${selected.length ? `: ${label}` : ''}`}
        onClick={toggleOpen}
      >
        {icon}
        <span className="selfilter__label">{label}</span>
        <IconChevronDown width={14} height={14} className="selfilter__chev" />
      </button>

      {open &&
        pos &&
        createPortal(
          <>
            {/*
              A transparent backdrop rather than a document-level listener: it has
              to SWALLOW the dismissing click, not just observe it. Listening on
              the document closed the panel but let the same tap fall through and
              open whichever restaurant row happened to be underneath.
            */}
            <div
              className="msel__backdrop"
              onPointerDown={(e) => {
                e.preventDefault();
                setOpen(false);
              }}
            />
            <div
              ref={panelRef}
              className="msel"
              role="dialog"
              aria-label={`Choose ${plural}`}
              style={{
                left: pos.left,
                width: pos.width,
                maxHeight: pos.maxH,
                ...(pos.top != null ? { top: pos.top } : { bottom: pos.bottom }),
              }}
            >
              {searchable && (
                <div className="msel__search">
                  <IconSearch width={15} height={15} className="msel__searchicon" />
                  <input
                    className="msel__input"
                    type="search"
                    autoFocus
                    value={query}
                    placeholder={`Search ${options.length} ${plural}`}
                    aria-label={`Search ${plural}`}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              )}

              <div className="msel__list">
                {shown.length === 0 ? (
                  <p className="msel__none">No {noun} matches “{query}”.</p>
                ) : (
                  shown.map((o) => (
                    <label className="msel__row" key={o.value}>
                      <input
                        type="checkbox"
                        className="msel__box"
                        checked={selected.includes(o.value)}
                        onChange={() => toggle(o.value)}
                      />
                      <span className="msel__rowlabel">{o.label}</span>
                      {o.count != null && <span className="msel__count num">{o.count}</span>}
                    </label>
                  ))
                )}
              </div>

              <div className="msel__foot">
                <button
                  type="button"
                  className="msel__clear"
                  disabled={!selected.length}
                  onClick={() => onChange([])}
                >
                  <IconClose width={13} height={13} />
                  Clear
                </button>
                <button type="button" className="msel__done" onClick={() => setOpen(false)}>
                  Done
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

/**
 * Draggable divider between the content and the detail pane.
 *
 * The right split is genuinely personal — some people want a wide menu to read,
 * others want more map — so it's a preference rather than a fixed number, and it
 * persists.
 *
 * Pointer events rather than mouse events: the same code then works for a trackpad,
 * a stylus and a touchscreen on a convertible laptop. Pointer capture means the
 * drag keeps tracking even when the cursor outruns the 6px handle, which is what
 * makes a thin divider feel solid.
 *
 * Keyboard-operable too: a divider you can only drag is one keyboard users can't
 * move at all, and arrow keys are the documented interaction for `role="separator"`.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '../lib/store.jsx';

/** Bounds in px. Below the minimum the detail is unreadable; above it the list is. */
export const SIDEPANE_MIN = 320;
export const SIDEPANE_MAX = 720;
export const SIDEPANE_DEFAULT = 432;

const clamp = (n) => Math.min(SIDEPANE_MAX, Math.max(SIDEPANE_MIN, Math.round(n)));

export function SplitHandle() {
  const { prefs, updatePrefs } = useStore();
  const width = clamp(prefs.sidepaneWidth ?? SIDEPANE_DEFAULT);
  const ref = useRef(null);
  // Track the live value during a drag so we only write to storage on release.
  const liveRef = useRef(width);

  const apply = useCallback((px) => {
    liveRef.current = px;
    document.documentElement.style.setProperty('--sidepane-w', `${px}px`);
    // Leaflet needs telling that its container changed size, or the map keeps
    // rendering at the old width and tiles stop lining up with the pointer.
    window.dispatchEvent(new Event('resize'));
  }, []);

  // Keep the CSS variable in step with the stored preference.
  useEffect(() => {
    apply(width);
    return () => document.documentElement.style.removeProperty('--sidepane-w');
  }, [width, apply]);

  const onPointerDown = (e) => {
    e.preventDefault();
    const el = ref.current;
    el.setPointerCapture(e.pointerId);
    document.body.classList.add('is-resizing');

    const onMove = (ev) => {
      // The pane is on the right, so its width is the distance from the right edge.
      apply(clamp(window.innerWidth - ev.clientX));
    };

    const onUp = () => {
      el.releasePointerCapture(e.pointerId);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      document.body.classList.remove('is-resizing');
      updatePrefs({ sidepaneWidth: liveRef.current });
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  };

  const onKeyDown = (e) => {
    const step = e.shiftKey ? 64 : 16;
    let next = null;
    if (e.key === 'ArrowLeft') next = liveRef.current + step;
    if (e.key === 'ArrowRight') next = liveRef.current - step;
    if (e.key === 'Home') next = SIDEPANE_MAX;
    if (e.key === 'End') next = SIDEPANE_MIN;
    if (next == null) return;
    e.preventDefault();
    const clamped = clamp(next);
    apply(clamped);
    updatePrefs({ sidepaneWidth: clamped });
  };

  return (
    <div
      ref={ref}
      className="splith"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the detail panel"
      aria-valuenow={width}
      aria-valuemin={SIDEPANE_MIN}
      aria-valuemax={SIDEPANE_MAX}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => {
        apply(SIDEPANE_DEFAULT);
        updatePrefs({ sidepaneWidth: SIDEPANE_DEFAULT });
      }}
      title="Drag to resize · double-click to reset"
    >
      <span className="splith__grip" aria-hidden="true" />
    </div>
  );
}

/**
 * Subscribe to a CSS media query from JS.
 *
 * Used where a layout decision can't be expressed in CSS alone — the desktop
 * split view renders a different component tree, not just different styles, and
 * Compare switches between a column grid and an accordion.
 */

import { useEffect, useState } from 'react';

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    // Re-read on subscribe: the query may have changed since the initial state.
    setMatches(mq.matches);
    const onChange = (e) => setMatches(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/**
 * Wide enough to show the restaurant detail beside the list instead of over it.
 *
 * 1100px is where a 27rem detail pane, a readable list, and the 13rem sidebar all
 * fit without any of them being squeezed.
 */
export const SPLIT_VIEW_QUERY = '(min-width: 1100px)';

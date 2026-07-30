/**
 * Inline SVG icons.
 *
 * No icon font or sprite library: this app must work with the network off, and a
 * handful of 24px strokes is smaller than any dependency that would provide them.
 * All icons share one geometry (24px box, 1.75 stroke, round caps) so the set
 * reads as a single family.
 */

const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
};

export function IconList(p) {
  return (
    <svg {...base} {...p}>
      <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </svg>
  );
}

export function IconMap(p) {
  return (
    <svg {...base} {...p}>
      <path d="M9 3.5 3.5 5.8v14.7L9 18.2l6 2.3 5.5-2.3V3.5L15 5.8Z" />
      <path d="M9 3.5v14.7M15 5.8v14.7" />
    </svg>
  );
}

export function IconBookmark(p) {
  return (
    <svg {...base} {...p}>
      <path d="M6 4.5h12a1 1 0 0 1 1 1v14l-7-4-7 4v-14a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

export function IconTarget(p) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3" />
    </svg>
  );
}

export function IconSearch(p) {
  return (
    <svg {...base} {...p}>
      <circle cx="10.8" cy="10.8" r="6.8" />
      <path d="m15.8 15.8 4.4 4.4" />
    </svg>
  );
}

export function IconSliders(p) {
  return (
    <svg {...base} {...p}>
      <path d="M4 8h10M18 8h2M4 16h4M12 16h8" />
      <circle cx="16" cy="8" r="2.2" />
      <circle cx="10" cy="16" r="2.2" />
    </svg>
  );
}

export function IconClose(p) {
  return (
    <svg {...base} {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function IconChevronRight(p) {
  return (
    <svg {...base} {...p}>
      <path d="m9.5 5 7 7-7 7" />
    </svg>
  );
}

export function IconChevronDown(p) {
  return (
    <svg {...base} {...p}>
      <path d="m5 9.5 7 7 7-7" />
    </svg>
  );
}

export function IconHeart({ filled = false, ...p }) {
  return (
    <svg {...base} fill={filled ? 'currentColor' : 'none'} {...p}>
      <path d="M12 20s-7.5-4.6-7.5-9.6A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 7.5 3C19.5 15.4 12 20 12 20Z" />
    </svg>
  );
}

export function IconCheck(p) {
  return (
    <svg {...base} {...p}>
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}

export function IconCalendar(p) {
  return (
    <svg {...base} {...p}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8.5 3v4M15.5 3v4" />
    </svg>
  );
}

export function IconPhone(p) {
  return (
    <svg {...base} {...p}>
      <path d="M6.2 3.5h3l1.6 4-2 1.4a11 11 0 0 0 5.3 5.3l1.4-2 4 1.6v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.2 5.7a2 2 0 0 1 2-2.2Z" />
    </svg>
  );
}

export function IconNavigate(p) {
  return (
    <svg {...base} {...p}>
      <path d="M20.5 3.5 3.5 10.2l7 2.3 2.3 7Z" />
    </svg>
  );
}

export function IconLink(p) {
  return (
    <svg {...base} {...p}>
      <path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.5 1.5" />
      <path d="M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5L12 17" />
    </svg>
  );
}

export function IconPin(p) {
  return (
    <svg {...base} {...p}>
      <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function IconAlert(p) {
  return (
    <svg {...base} {...p}>
      <path d="M12 4.5 21 19.5H3Z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  );
}

/**
 * A cog, not a sunburst. The earlier version — a circle with radiating spokes —
 * read as a sun at tab-bar size, which is the wrong affordance entirely. Closed
 * teeth make it unambiguous at 21px.
 */
export function IconSettings(p) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.1 14.4a1.6 1.6 0 0 0 .32 1.76l.06.06a1.9 1.9 0 1 1-2.7 2.7l-.05-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.46v.17a1.9 1.9 0 1 1-3.8 0v-.09a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.76.32l-.06.06a1.9 1.9 0 1 1-2.7-2.7l.06-.06a1.6 1.6 0 0 0 .32-1.76 1.6 1.6 0 0 0-1.46-.97h-.17a1.9 1.9 0 0 1 0-3.8h.09a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.76l-.06-.06a1.9 1.9 0 1 1 2.7-2.7l.06.06a1.6 1.6 0 0 0 1.76.32h.08a1.6 1.6 0 0 0 .97-1.46v-.17a1.9 1.9 0 1 1 3.8 0v.09a1.6 1.6 0 0 0 .97 1.46 1.6 1.6 0 0 0 1.77-.32l.05-.06a1.9 1.9 0 1 1 2.7 2.7l-.06.06a1.6 1.6 0 0 0-.32 1.76v.08a1.6 1.6 0 0 0 1.46.97h.17a1.9 1.9 0 0 1 0 3.8h-.09a1.6 1.6 0 0 0-1.46.97Z" />
    </svg>
  );
}

export function IconDownload(p) {
  return (
    <svg {...base} {...p}>
      <path d="M12 3.5v11M7.5 10 12 14.5 16.5 10M4.5 19.5h15" />
    </svg>
  );
}

export function IconUpload(p) {
  return (
    <svg {...base} {...p}>
      <path d="M12 14.5v-11M7.5 8 12 3.5 16.5 8M4.5 19.5h15" />
    </svg>
  );
}

export function IconRefresh(p) {
  return (
    <svg {...base} {...p}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 3.5V9h-5.5" />
    </svg>
  );
}

/**
 * Compare: two columns of differing height, read as things measured against each
 * other. Chosen over a balance scale, which reads as "justice" at 21px.
 */
export function IconCompare(p) {
  return (
    <svg {...base} {...p}>
      <rect x="3.5" y="7" width="7" height="13.5" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="17" rx="1.5" />
    </svg>
  );
}

export function IconSpark(p) {
  return (
    <svg {...base} {...p}>
      <path d="M12 3.5 13.6 9 19 10.5 13.6 12 12 17.5 10.4 12 5 10.5 10.4 9Z" />
    </svg>
  );
}

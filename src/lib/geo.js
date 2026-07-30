/**
 * Geometry and location formatting.
 */

/** Great-circle distance in metres. */
export function haversineMeters(a, b) {
  if (!a || !b) return null;
  if (!Number.isFinite(a.lat) || !Number.isFinite(a.lng)) return null;
  if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return null;

  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Distances are shown in miles because that is what Miami reads in, and rounded
 * to a precision the underlying accuracy can actually support — quoting "0.42 mi"
 * from a pin that might be 80 m off would be false precision.
 */
export function formatDistance(meters) {
  if (meters == null || !Number.isFinite(meters)) return null;
  const feet = meters * 3.28084;
  if (feet < 1000) return `${Math.round(feet / 50) * 50} ft`;
  const miles = meters / 1609.344;
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

/** Accuracy radius, phrased as a range rather than a false point value. */
export function formatAccuracy(meters) {
  if (meters == null || !Number.isFinite(meters)) return null;
  const feet = Math.round(meters * 3.28084);
  if (feet < 1000) return `±${feet} ft`;
  return `±${(meters / 1609.344).toFixed(1)} mi`;
}

/**
 * Native-maps hand-off (spec 5.8).
 *
 * Deliberately passes NAME + ADDRESS as text rather than our lat/lng. Google and
 * Apple Maps have far better POI databases for resort and mall venues than our pin
 * does, so letting them resolve the venue sidesteps our own accuracy limits at the
 * exact moment it matters most. Our pin is for browsing and distance; theirs is for
 * navigating.
 */
export function nativeMapsUrl(name, address) {
  const query = encodeURIComponent([name, address].filter(Boolean).join(' '));
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

/** iOS falls back to the maps: scheme, which Apple Maps claims. */
export function appleMapsUrl(name, address) {
  const query = encodeURIComponent([name, address].filter(Boolean).join(' '));
  return `maps://?q=${query}`;
}

export function isIos() {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/**
 * Live device location via watchPosition (spec 5.7).
 *
 * watchPosition, not a one-shot getCurrentPosition, so the dot tracks as you walk.
 *
 * All three permission states are handled as first-class outcomes rather than as
 * errors to log and forget: granted, denied, and unavailable. On denial the caller
 * can fall back to a manually-set location so distance sorting still works, which
 * matters because "I said no once" shouldn't permanently break a feature.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** @typedef {'idle'|'prompting'|'watching'|'denied'|'unavailable'|'error'} GeoStatus */

const SECURE_CONTEXT_HINT =
  'Location needs a secure connection (HTTPS). Open the deployed https:// version rather than a local IP address.';

export function useGeolocation({ enabled = false } = {}) {
  const [status, setStatus] = useState('idle');
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const watchIdRef = useRef(null);

  const stop = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      setError('This browser does not offer location.');
      return;
    }

    // A non-secure context fails silently in some browsers, which looks like a bug
    // in the app rather than a deployment problem. Name it explicitly.
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setStatus('unavailable');
      setError(SECURE_CONTEXT_HINT);
      return;
    }

    if (watchIdRef.current != null) return;

    setStatus((s) => (s === 'watching' ? s : 'prompting'));
    setError(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          timestamp: pos.timestamp,
        });
        setStatus('watching');
        setError(null);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus('denied');
          setError('Location permission was declined.');
          stop();
          return;
        }
        if (err.code === err.POSITION_UNAVAILABLE) {
          setStatus('error');
          setError('Your position is not available right now.');
          return;
        }
        if (err.code === err.TIMEOUT) {
          setStatus('error');
          setError('Getting a location fix is taking longer than expected.');
          return;
        }
        setStatus('error');
        setError(err.message || 'Location failed.');
      },
      {
        enableHighAccuracy: true,
        // Long timeout: a cold GPS fix outdoors can genuinely take this long, and
        // failing early would send the user to the manual fallback unnecessarily.
        timeout: 20000,
        maximumAge: 10000,
      },
    );
  }, [stop]);

  useEffect(() => {
    if (enabled) start();
    else stop();
    return stop;
  }, [enabled, start, stop]);

  // Recover automatically if the user grants permission in browser settings after
  // having denied it — without this the app stays broken until a reload.
  useEffect(() => {
    if (!enabled || status !== 'denied') return;
    if (!navigator.permissions?.query) return;

    let cancelled = false;
    let permissionStatus;

    const onChange = () => {
      if (cancelled) return;
      if (permissionStatus.state === 'granted' || permissionStatus.state === 'prompt') {
        setStatus('idle');
        start();
      }
    };

    navigator.permissions
      .query({ name: 'geolocation' })
      .then((ps) => {
        if (cancelled) return;
        permissionStatus = ps;
        ps.addEventListener('change', onChange);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      permissionStatus?.removeEventListener('change', onChange);
    };
  }, [enabled, status, start]);

  return { status, position, error, start, stop, retry: start };
}

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Interroge une ressource à intervalle régulier.
 * - s'arrête quand l'onglet est masqué,
 * - évite les requêtes concurrentes,
 * - expose `refresh()` pour un rechargement immédiat.
 */
export function usePolling(fetcher, { interval = 5000, enabled = true, immediate = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(immediate && enabled));
  const inFlight = useRef(false);
  const fetcherRef = useRef(fetcher);
  const mounted = useRef(true);

  fetcherRef.current = fetcher;

  const run = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const result = await fetcherRef.current();
      if (!mounted.current) return;
      setData(result);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err);
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) {
      setLoading(false);
      return undefined;
    }

    if (immediate) run();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') run();
    }, interval);

    return () => {
      mounted.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, immediate, interval, run]);

  return { data, error, loading, refresh: run };
}

export default usePolling;

import { useEffect, useRef, useState } from "react";
import { getRouteByCallsign } from "../services/api";

// Module-level cache so navigating away and back doesn't re-fetch
const routeCache = {};

function extractRoute(payload) {
  const dep = payload?.departure || {};
  const arr = payload?.arrival || {};
  return {
    from: dep.icao || dep.iata || dep.city || null,
    to:   arr.icao || arr.iata || arr.city || null,
  };
}

/**
 * Fetches routes for a list of flights by callsign.
 * Respects a concurrency limit so we don't hammer AviationStack.
 *
 * @param {Array}   flights  - array of flight objects with { callsign }
 * @param {boolean} enabled  - set to false to skip all fetching
 * @returns {Object}  routeMap: { [callsign]: { loading, from, to, error } }
 */
export function useFlightRoutes(flights, enabled = true) {
  const [routeMap, setRouteMap] = useState({});
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;

    if (!enabled || !flights?.length) {
      setRouteMap({});
      return () => { activeRef.current = false; };
    }

    const uniqueCallsigns = [
      ...new Set(flights.map((f) => (f.callsign || "").trim()).filter(Boolean)),
    ];

    // Seed map with cached results so UI shows them immediately
    const initial = {};
    for (const cs of uniqueCallsigns) {
      initial[cs] = routeCache[cs] ?? { loading: true, from: null, to: null };
    }
    setRouteMap(initial);

    const toFetch = uniqueCallsigns.filter((cs) => !routeCache[cs]);
    if (!toFetch.length) return () => { activeRef.current = false; };

    // Hard cap: never burn more than 5 AviationStack calls per load (free tier = 100/month)
    const MAX_FETCH = 5;
    const CONCURRENCY = 3;
    let cursor = 0;

    async function worker() {
      while (cursor < capped.length) {
        const cs = capped[cursor++];
        if (!activeRef.current) return;

        try {
          const payload = await getRouteByCallsign(cs);
          const result = { loading: false, ...extractRoute(payload) };
          routeCache[cs] = result;
          if (activeRef.current) {
            setRouteMap((prev) => ({ ...prev, [cs]: result }));
          }
        } catch {
          const result = { loading: false, from: null, to: null, error: true };
          routeCache[cs] = result;
          if (activeRef.current) {
            setRouteMap((prev) => ({ ...prev, [cs]: result }));
          }
        }
      }
    }

    const capped = toFetch.slice(0, MAX_FETCH);
    const workers = Array.from(
      { length: Math.min(CONCURRENCY, capped.length) },
      () => worker()
    );
    Promise.all(workers).catch(() => {});

    return () => { activeRef.current = false; };
  }, [flights, enabled]);

  return routeMap;
}

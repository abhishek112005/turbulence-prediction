import { useEffect, useMemo, useState } from "react";
import FlightMap from "../components/FlightMap";
import TelemetryPanel from "../components/TelemetryPanel";
import TurbulenceGraph from "../components/TurbulenceGraph";
import { buildTurbulenceSegments } from "../components/TurbulenceOverlay";
import {
  getAircraftState,
  getFlightTrack,
  getLiveDashboardData,
  getMockDashboardData
} from "../services/api";

function normalizeTrackPath(path) {
  if (!Array.isArray(path)) {
    return [];
  }

  return path
    .map((point) => ({
      time: point?.[0],
      latitude: point?.[1],
      longitude: point?.[2],
      altitude: point?.[3] ?? 0,
      trueTrack: point?.[4] ?? null
    }))
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
}

function PilotDashboard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [statusText, setStatusText] = useState("");
  const [selectedFlightIcao, setSelectedFlightIcao] = useState("");
  const [fetchIntervalSec, setFetchIntervalSec] = useState(15);
  const [trackPoints, setTrackPoints] = useState([]);
  const [liveState, setLiveState] = useState(null);
  const [animatedLiveState, setAnimatedLiveState] = useState(null);
  const [turbulenceHistory, setTurbulenceHistory] = useState([]);

  useEffect(() => {
    getLiveDashboardData()
      .then((payload) => {
        setData(payload);
        const firstIcao = payload.flights?.[0]?.icao24 || "";
        setSelectedFlightIcao(firstIcao);
      })
      .catch(async () => {
        const payload = await getMockDashboardData();
        setData(payload);
        setSelectedFlightIcao(payload.flights?.[0]?.icao24 || "");
      })
      .finally(() => setLoading(false));
  }, []);

  function appendTurbulencePoint(flight, timestamp) {
    if (!flight) {
      return;
    }

    setTurbulenceHistory((prev) => {
      const next = {
        timestamp: timestamp || new Date().toISOString(),
        currentLevel: Number(flight.currentLevel ?? 0),
        predictedLevel: Number(flight.predictedLevel ?? 0),
        confidence: Number(flight.confidence ?? 0)
      };

      const last = prev[prev.length - 1];
      if (
        last &&
        last.timestamp === next.timestamp &&
        last.currentLevel === next.currentLevel &&
        last.predictedLevel === next.predictedLevel
      ) {
        return prev;
      }

      return [...prev.slice(-39), next];
    });
  }

  async function refresh(source) {
    setFetchError("");
    setStatusText("");
    setIsRefreshing(true);
    try {
      const payload = source === "live" ? await getLiveDashboardData() : await getMockDashboardData();
      setData(payload);
      setStatusText(source === "live" ? "Live telemetry refreshed" : "Mock telemetry loaded");
      const hasSelected = payload.flights?.some((flight) => flight.icao24 === selectedFlightIcao);
      const nextIcao = hasSelected ? selectedFlightIcao : payload.flights?.[0]?.icao24 || "";

      if (nextIcao !== selectedFlightIcao) {
        setSelectedFlightIcao(nextIcao);
      }

      const selectedFromPayload = payload.flights?.find((flight) => flight.icao24 === nextIcao);
      appendTurbulencePoint(selectedFromPayload, payload.fetchedAt);
    } catch (error) {
      setFetchError(error.message || "Could not refresh dashboard data.");
    } finally {
      setIsRefreshing(false);
    }
  }

  const selectedFlight = useMemo(() => {
    if (!data?.flights?.length || !selectedFlightIcao) {
      return null;
    }

    return data.flights.find((flight) => flight.icao24 === selectedFlightIcao) || null;
  }, [data, selectedFlightIcao]);

  useEffect(() => {
    setTurbulenceHistory([]);
  }, [selectedFlightIcao]);

  useEffect(() => {
    if (!selectedFlight) {
      return;
    }
    appendTurbulencePoint(selectedFlight, data?.fetchedAt);
  }, [selectedFlight, data?.fetchedAt]);

  useEffect(() => {
    if (!selectedFlight?.icao24) {
      setTrackPoints([]);
      setLiveState(null);
      return;
    }

    let active = true;
    Promise.all([
      getFlightTrack(selectedFlight.icao24),
      getAircraftState(selectedFlight.icao24)
    ])
      .then(([trackResponse, stateResponse]) => {
        if (!active) {
          return;
        }
        setTrackPoints(normalizeTrackPath(trackResponse.path));
        const initialState = stateResponse.state || null;
        setLiveState(initialState);
        setAnimatedLiveState(initialState);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setTrackPoints([]);
        setLiveState(null);
        setAnimatedLiveState(null);
      });

    return () => {
      active = false;
    };
  }, [selectedFlight?.icao24]);

  useEffect(() => {
    if (!selectedFlight?.icao24) {
      return undefined;
    }

    const timer = setInterval(async () => {
      try {
        const response = await getAircraftState(selectedFlight.icao24);
        if (response.state) {
          setLiveState(response.state);
          setTrackPoints((prev) => {
            const nextPoint = {
              time: response.state.last_contact || Date.now() / 1000,
              latitude: response.state.latitude,
              longitude: response.state.longitude,
              altitude: response.state.baro_altitude || 0,
              trueTrack: response.state.true_track || null
            };

            if (!Number.isFinite(nextPoint.latitude) || !Number.isFinite(nextPoint.longitude)) {
              return prev;
            }

            const lastPoint = prev[prev.length - 1];
            if (
              lastPoint &&
              Math.abs(lastPoint.latitude - nextPoint.latitude) < 1e-6 &&
              Math.abs(lastPoint.longitude - nextPoint.longitude) < 1e-6
            ) {
              return prev;
            }

            return [...prev, nextPoint];
          });
        }
      } catch {
        // Keep previous state if live polling fails.
      }
    }, fetchIntervalSec * 1000);

    return () => clearInterval(timer);
  }, [selectedFlight?.icao24, fetchIntervalSec]);

  useEffect(() => {
    if (!liveState || !Number.isFinite(liveState.latitude) || !Number.isFinite(liveState.longitude)) {
      setAnimatedLiveState(liveState);
      return;
    }

    setAnimatedLiveState((prev) => {
      if (!prev || !Number.isFinite(prev.latitude) || !Number.isFinite(prev.longitude)) {
        return liveState;
      }
      return prev;
    });

    let step = 0;
    const totalSteps = 12;
    const from = animatedLiveState || liveState;
    const to = liveState;

    const interval = setInterval(() => {
      step += 1;
      const t = Math.min(1, step / totalSteps);
      const latitude = from.latitude + (to.latitude - from.latitude) * t;
      const longitude = from.longitude + (to.longitude - from.longitude) * t;
      setAnimatedLiveState({
        ...to,
        latitude,
        longitude
      });
      if (t >= 1) {
        clearInterval(interval);
      }
    }, 180);

    return () => clearInterval(interval);
  }, [liveState]);

  useEffect(() => {
    const timer = setInterval(async () => {
      setIsRefreshing(true);
      try {
        const payload = await getLiveDashboardData();
        setData(payload);
        const hasSelected = payload.flights?.some((flight) => flight.icao24 === selectedFlightIcao);
        const nextIcao = hasSelected ? selectedFlightIcao : payload.flights?.[0]?.icao24 || "";

        if (nextIcao !== selectedFlightIcao) {
          setSelectedFlightIcao(nextIcao);
        }
        const selectedFromPayload =
          payload.flights?.find((flight) => flight.icao24 === nextIcao);
        appendTurbulencePoint(selectedFromPayload, payload.fetchedAt);
        setStatusText(`Auto live fetch every ${fetchIntervalSec}s is active.`);
      } catch (error) {
        setFetchError(error.message || "Auto live fetch failed.");
      } finally {
        setIsRefreshing(false);
      }
    }, fetchIntervalSec * 1000);

    return () => clearInterval(timer);
  }, [selectedFlightIcao, fetchIntervalSec]);

  const turbulenceSegments = useMemo(() => buildTurbulenceSegments(trackPoints), [trackPoints]);

  const originAirport = useMemo(() => {
    if (trackPoints.length < 1) {
      return null;
    }
    const first = trackPoints[0];
    return {
      city: "route-start",
      icao: "ORIGIN",
      lat: first.latitude,
      lon: first.longitude
    };
  }, [trackPoints]);

  const destinationAirport = useMemo(() => {
    if (trackPoints.length < 2) {
      return null;
    }
    const last = trackPoints[trackPoints.length - 1];
    return {
      city: "route-end",
      icao: "DEST",
      lat: last.latitude,
      lon: last.longitude
    };
  }, [trackPoints]);

  const distanceCoveredKm = useMemo(() => {
    if (!trackPoints || trackPoints.length < 2) {
      return 0;
    }

    const toRad = (deg) => (deg * Math.PI) / 180;
    let total = 0;
    for (let i = 1; i < trackPoints.length; i += 1) {
      const p1 = trackPoints[i - 1];
      const p2 = trackPoints[i];
      const dLat = toRad(p2.latitude - p1.latitude);
      const dLon = toRad(p2.longitude - p1.longitude);
      const lat1 = toRad(p1.latitude);
      const lat2 = toRad(p2.latitude);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      total += 6371 * c;
    }
    return total;
  }, [trackPoints]);

  if (loading) {
    return <section className="panel">Loading pilot dashboard...</section>;
  }

  return (
    <>
      <section className="panel">
        <h2>Pilot Dashboard</h2>
        <p>Advanced telemetry and map tracking for the selected flight.</p>
        <div className="toolbar">
          <button className="action-btn" disabled={isRefreshing} onClick={() => refresh("live")}>
            {isRefreshing ? "Refreshing..." : "Fetch Live Data"}
          </button>
          <button className="action-btn muted" disabled={isRefreshing} onClick={() => refresh("mock")}>
            Use Mock Data
          </button>
          <select
            className="input inline-input"
            value={fetchIntervalSec}
            onChange={(event) => setFetchIntervalSec(Number(event.target.value))}
          >
            <option value={15}>Auto Fetch: 15s</option>
            <option value={30}>Auto Fetch: 30s</option>
            <option value={60}>Auto Fetch: 1 minute</option>
          </select>
        </div>
        {statusText ? <p className="status-line">{statusText}</p> : null}
        {fetchError ? <p className="error-line">{fetchError}</p> : null}
      </section>

      <section className="panel">
        <label className="field-label" htmlFor="pilot-flight-select">
          Flight selection
        </label>
        <select
          id="pilot-flight-select"
          className="input"
          value={selectedFlightIcao}
          onChange={(event) => {
            const icao24 = event.target.value;
            setSelectedFlightIcao(icao24);
          }}
        >
          {data.flights.map((flight) => (
            <option key={flight.icao24} value={flight.icao24}>
              {flight.callsign} ({flight.icao24})
            </option>
          ))}
        </select>
      </section>

      <TelemetryPanel
        selectedFlight={selectedFlight}
        liveState={liveState}
        distanceCoveredKm={distanceCoveredKm}
      />

      <section className="panel-grid">
        <FlightMap
          originAirport={originAirport}
          destinationAirport={destinationAirport}
          pathPoints={trackPoints}
          liveState={animatedLiveState || liveState}
          segments={turbulenceSegments}
          selectedFlight={selectedFlight}
        />
        <TurbulenceGraph history={turbulenceHistory} />
      </section>
    </>
  );
}

export default PilotDashboard;

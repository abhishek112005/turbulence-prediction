import { useEffect, useMemo, useRef, useState } from "react";
import FlightMap from "../components/FlightMap";
import FlightList from "../components/FlightList";
import RouteInput from "../components/RouteInput";
import TelemetryPanel from "../components/TelemetryPanel";
import TurbulenceGraph from "../components/TurbulenceGraph";
import FlightPredictionTable from "../components/FlightPredictionTable";
import { buildTurbulenceSegments } from "../components/TurbulenceOverlay";
import { useAuth } from "../context/AuthContext";
import { useServerURL } from "../hooks/useServerURL";
import {
  assignPilotFlight,
  getAircraftState,
  getFlightTrack,
  getLiveDashboardData,
  getLiveFlightData,
  getLiveRouteOptions,
  getMockDashboardData,
  getPassengerJoinLink,
  getPilotFlightAssignment,
  getRouteByCallsign
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

function mapFlightLevelToAlertLevel(level) {
  if (level >= 3) {
    return 3;
  }
  if (level >= 1) {
    return 2;
  }
  return 1;
}

function levelText(level) {
  if (level >= 3) {
    return "Severe";
  }
  if (level >= 2) {
    return "Moderate";
  }
  if (level >= 1) {
    return "Light";
  }
  return "Calm";
}

function outboundLevelText(level) {
  if (level >= 3) {
    return "Severe";
  }
  if (level >= 2) {
    return "Moderate";
  }
  return "Calm";
}

function buildRouteLabel(route) {
  const departure = route?.departure || {};
  const arrival = route?.arrival || {};
  const from = departure.icao || departure.iata || departure.name || departure.city || "";
  const to = arrival.icao || arrival.iata || arrival.name || arrival.city || "";
  if (!from && !to) {
    return "Route provider unavailable";
  }
  return `${from || "Unknown origin"} -> ${to || "Unknown destination"}`;
}

function buildRouteOptionLabel(flight) {
  const callsign = (flight?.callsign || "N/A").trim() || "N/A";
  const icao24 = flight?.icao24 || "unknown";
  const route = flight?.route;
  const hasRouteDetails =
    route?.departure?.icao ||
    route?.departure?.iata ||
    route?.departure?.name ||
    route?.arrival?.icao ||
    route?.arrival?.iata ||
    route?.arrival?.name;

  if (!hasRouteDetails) {
    return `${callsign} (${icao24})`;
  }

  return `${callsign} (${icao24}) - ${buildRouteLabel(route)}`;
}

function formatAirportDisplay(airport, fallbackLabel) {
  if (!airport) {
    return fallbackLabel;
  }

  const code = airport.icao || airport.iata || "";
  const name = airport.name || airport.city || "";
  if (name && code) {
    return `${name} (${code})`;
  }
  return name || code || fallbackLabel;
}

function PilotDashboard() {
  const { user } = useAuth();
  const { base: BASE_URL } = useServerURL();
  const [loading, setLoading] = useState(true);
  const [catalogData, setCatalogData] = useState(null);
  const [flightData, setFlightData] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [flightInput, setFlightInput] = useState("");
  const [selectedFlightIcao, setSelectedFlightIcao] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [statusText, setStatusText] = useState("");
  const [fetchIntervalSec, setFetchIntervalSec] = useState(15);
  const [trackPoints, setTrackPoints] = useState([]);
  const [liveState, setLiveState] = useState(null);
  const [animatedLiveState, setAnimatedLiveState] = useState(null);
  const [routeData, setRouteData] = useState(null);
  const [routeFetchError, setRouteFetchError] = useState("");
  const [routeMatches, setRouteMatches] = useState([]);
  const [routeOptions, setRouteOptions] = useState({ origins: [], destinations: [], flights: [] });
  const [isSearchingRoutes, setIsSearchingRoutes] = useState(false);
  const [routeFilter, setRouteFilter] = useState(null);
  const [passengerJoinLink, setPassengerJoinLink] = useState("");
  const [turbulenceHistory, setTurbulenceHistory] = useState([]);
  const [broadcastResult, setBroadcastResult] = useState(null);
  const [broadcastLog, setBroadcastLog] = useState([]);
  const [customMsg, setCustomMsg] = useState("");
  const lastAutoBroadcastLevelRef = useRef(null);

  const availableFlights = catalogData?.flights || [];

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

  useEffect(() => {
    let active = true;

    async function loadInitialState() {
      try {
        const [pilotAssignment, liveCatalog] = await Promise.all([
          getPilotFlightAssignment(user.email),
          getLiveDashboardData()
        ]);

        if (!active) {
          return;
        }

        setCatalogData(liveCatalog);
        setFetchError("");
        getLiveRouteOptions()
          .then((optionsPayload) => {
            if (active) {
              setRouteOptions({
                origins: optionsPayload.origins || [],
                destinations: optionsPayload.destinations || [],
                flights: optionsPayload.flights || []
              });
            }
          })
          .catch(() => {
            if (active) {
              setRouteOptions({ origins: [], destinations: [], flights: [] });
            }
          });

        const savedAssignment = pilotAssignment.assignment;
        if (savedAssignment?.icao24) {
          setAssignment(savedAssignment);
          setSelectedFlightIcao(savedAssignment.icao24);
          setFlightInput(savedAssignment.icao24);
          const payload = await getLiveFlightData(savedAssignment.icao24);
          if (!active) {
            return;
          }
          setFlightData(payload);
          appendTurbulencePoint(payload.flight, payload.fetchedAt);
          setStatusText(`Sharing live updates for ${savedAssignment.icao24}.`);
          setFetchError("");
        }
      } catch {
        const mockCatalog = await getMockDashboardData();
        if (!active) {
          return;
        }
        setCatalogData(mockCatalog);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadInitialState();

    return () => {
      active = false;
    };
  }, [user.email]);

  async function refreshFlight(source) {
    if (!selectedFlightIcao) {
      setFetchError("Enter and assign a flight ICAO24 first.");
      return;
    }

    setFetchError("");
    setStatusText("");
    setIsRefreshing(true);

    try {
      if (source === "live") {
        const payload = await getLiveFlightData(selectedFlightIcao);
        setFlightData(payload);
        appendTurbulencePoint(payload.flight, payload.fetchedAt);
        setStatusText(`Live updates active for ${selectedFlightIcao}.`);
        setFetchError("");
      } else {
        const payload = await getMockDashboardData();
        setCatalogData(payload);
        const mockFlight =
          payload.flights.find((flight) => flight.icao24 === selectedFlightIcao) || null;
        if (!mockFlight) {
          throw new Error(`Mock data does not include ${selectedFlightIcao}.`);
        }
        const nextPayload = {
          flight: mockFlight,
          fetchedAt: payload.fetchedAt,
          source: payload.source,
          summary: payload.summary
        };
        setFlightData(nextPayload);
        appendTurbulencePoint(nextPayload.flight, nextPayload.fetchedAt);
        setStatusText(`Mock telemetry loaded for ${selectedFlightIcao}.`);
        setFetchError("");
      }
    } catch (error) {
      setFetchError(error.message || "Could not refresh flight data.");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleAssignFlight() {
    const normalizedInput = flightInput.trim().toLowerCase();
    if (!normalizedInput) {
      setFetchError("Enter the flight ICAO24 before assigning.");
      return;
    }

    setFetchError("");
    setStatusText("");
    setIsAssigning(true);

    try {
      const response = await assignPilotFlight(user.email, normalizedInput);
      const nextIcao = response.assignment?.icao24 || normalizedInput;
      setAssignment(response.assignment || null);
      setSelectedFlightIcao(nextIcao);
      setFlightInput(nextIcao);
      const nextPayload = {
        flight: response.flight,
        fetchedAt: new Date().toISOString(),
        source: "pilot-assignment",
        summary: catalogData?.summary || null
      };
      setFlightData(nextPayload);
      setTurbulenceHistory([]);
      appendTurbulencePoint(response.flight, nextPayload.fetchedAt);
      setStatusText(`Pilot updates are now shared for ${nextIcao}.`);
      setFetchError("");
    } catch (error) {
      setFetchError(error.message || "Could not assign the selected flight.");
    } finally {
      setIsAssigning(false);
    }
  }

  async function handleRouteSearch(selection) {
    const originCode = selection.originAirport?.code || selection.originAirport?.icao || selection.originAirport?.iata || "";
    const destinationCode =
      selection.destinationAirport?.code || selection.destinationAirport?.icao || selection.destinationAirport?.iata || "";

    setRouteFilter(selection);
    setIsSearchingRoutes(true);
    setFetchError("");

    try {
      const cachedFlights = routeOptions.flights || [];
      const flights = cachedFlights.filter((flight) => {
        const departureCode =
          flight.route?.departure?.icao || flight.route?.departure?.iata || "";
        const arrivalCode =
          flight.route?.arrival?.icao || flight.route?.arrival?.iata || "";
        return departureCode === originCode && arrivalCode === destinationCode;
      });
      setRouteMatches(flights);

      if (!flights.length) {
        setFlightInput("");
        setSelectedFlightIcao("");
        setStatusText("No currently flying matches found for the selected route.");
        return;
      }

      const firstFlight = flights[0];
      setFlightInput(firstFlight.icao24);
      setSelectedFlightIcao(firstFlight.icao24);
      await handleRouteFlightSelect(firstFlight);
      setStatusText(`Loaded ${flights.length} live flight(s) for ${originCode} -> ${destinationCode}.`);
    } catch (error) {
      setRouteMatches([]);
      setFetchError(error.message || "Could not fetch flights for this route.");
    } finally {
      setIsSearchingRoutes(false);
    }
  }

  async function handleRouteFlightSelect(flight) {
    const nextIcao = flight?.icao24 || "";
    if (!nextIcao) {
      return;
    }

    setFlightInput(nextIcao);
    setSelectedFlightIcao(nextIcao);
    setFetchError("");

    try {
      const payload = await getLiveFlightData(nextIcao);
      setFlightData(payload);
      appendTurbulencePoint(payload.flight, payload.fetchedAt);
      setStatusText(`Loaded live prediction for ${nextIcao}. Assign it to start broadcasting.`);
    } catch (error) {
      setFetchError(error.message || "Could not load the selected route flight.");
    }
  }

  async function handleLiveFlightSelection(nextIcao) {
    setFlightInput(nextIcao);
    setSelectedFlightIcao(nextIcao);
    setFetchError("");

    if (!nextIcao) {
      return;
    }

    try {
      const payload = await getLiveFlightData(nextIcao);
      setFlightData(payload);
      appendTurbulencePoint(payload.flight, payload.fetchedAt);
      setStatusText(`Loaded live prediction for ${nextIcao}.`);
    } catch (error) {
      setFetchError(error.message || "Could not load the selected ICAO24.");
    }
  }

  async function sendAlert(t, m) {
    const roomCode = selectedFlight?.icao24 || selectedFlightIcao || "default-room";
    try {
      const response = await fetch(`${BASE_URL}/api/alerts/broadcast/${roomCode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t, m })
      });
      const data = await response.json();
      const message = data.skipped ? "Level unchanged - not sent" : `Sent to ${data.sent} passengers`;
      setBroadcastResult(message);
      setBroadcastLog((prev) => [
        { t, m, msg: message, time: new Date().toLocaleTimeString() },
        ...prev
      ].slice(0, 5));
      setTimeout(() => setBroadcastResult(null), 4000);
    } catch {
      setBroadcastResult("Send failed - check connection");
    }
  }

  const selectedFlight = useMemo(() => flightData?.flight || null, [flightData]);
  const currentAlertLevel = useMemo(
    () => mapFlightLevelToAlertLevel(Math.max(Number(selectedFlight?.currentLevel ?? 0), Number(selectedFlight?.predictedLevel ?? 0))),
    [selectedFlight]
  );

  useEffect(() => {
    if (!selectedFlight?.icao24) {
      lastAutoBroadcastLevelRef.current = null;
      return;
    }

    const nextLevel = currentAlertLevel;
    const previousLevel = lastAutoBroadcastLevelRef.current;

    if (previousLevel == null) {
      lastAutoBroadcastLevelRef.current = nextLevel;
      return;
    }

    if (nextLevel > previousLevel) {
      const message =
        nextLevel >= 3
          ? "Severe turbulence increase detected. Remain seated immediately."
          : "Turbulence level has increased. Please fasten seatbelts.";
      sendAlert(nextLevel, message);
    }

    lastAutoBroadcastLevelRef.current = nextLevel;
  }, [currentAlertLevel, selectedFlight?.icao24]);

  useEffect(() => {
    let active = true;
    const room = (selectedFlightIcao || "").trim();
    if (!room) {
      setPassengerJoinLink("");
      return () => {
        active = false;
      };
    }

    getPassengerJoinLink(room)
      .then((payload) => {
        if (active) {
          setPassengerJoinLink(payload?.url || "");
        }
      })
      .catch(() => {
        if (active) {
          setPassengerJoinLink("");
        }
      });

    return () => {
      active = false;
    };
  }, [selectedFlightIcao]);

  useEffect(() => {
    if (!selectedFlight?.icao24) {
      setTrackPoints([]);
      setLiveState(null);
      setAnimatedLiveState(null);
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
    const normalizedCallsign = (selectedFlight?.callsign || "").trim();
    if (!normalizedCallsign) {
      setRouteData(null);
      setRouteFetchError("");
      return undefined;
    }

    let active = true;
    getRouteByCallsign(normalizedCallsign)
      .then((payload) => {
        if (active) {
          setRouteData(payload);
          setRouteFetchError("");
          getLiveRouteOptions()
            .then((optionsPayload) => {
              if (active) {
                setRouteOptions({
                  origins: optionsPayload.origins || [],
                  destinations: optionsPayload.destinations || [],
                  flights: optionsPayload.flights || []
                });
              }
            })
            .catch(() => {
              // Ignore refresh failures; keep whatever options we already have.
            });
        }
      })
      .catch((error) => {
        if (active) {
          // Keep the last known route on transient failures (rate limits, network blips).
          setRouteFetchError(error?.message || "Route lookup failed.");
        }
      });

    return () => {
      active = false;
    };
  }, [selectedFlight?.callsign]);

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
    if (!selectedFlightIcao) {
      return undefined;
    }

    const timer = setInterval(async () => {
      setIsRefreshing(true);
      try {
        const payload = await getLiveFlightData(selectedFlightIcao);
        setFlightData(payload);
        appendTurbulencePoint(payload.flight, payload.fetchedAt);
        setStatusText(`Pilot feed is auto-refreshing every ${fetchIntervalSec}s.`);
        setFetchError("");
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
    const departure = routeData?.departure;
    if (
      departure &&
      Number.isFinite(departure.lat) &&
      Number.isFinite(departure.lon)
    ) {
      return {
        city: departure.city || departure.name || "route-start",
        icao: departure.icao || departure.iata || "ORIGIN",
        lat: departure.lat,
        lon: departure.lon
      };
    }

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
  }, [routeData, trackPoints]);

  const destinationAirport = useMemo(() => {
    const arrival = routeData?.arrival;
    if (
      arrival &&
      Number.isFinite(arrival.lat) &&
      Number.isFinite(arrival.lon)
    ) {
      return {
        city: arrival.city || arrival.name || "route-end",
        icao: arrival.icao || arrival.iata || "DEST",
        lat: arrival.lat,
        lon: arrival.lon
      };
    }

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
  }, [routeData, trackPoints]);

  const routeSummary = useMemo(() => {
    return buildRouteLabel(routeData);
  }, [routeData]);

  const selectableFlights = useMemo(() => {
    if (routeFilter) {
      return routeMatches;
    }
    return availableFlights;
  }, [availableFlights, routeFilter, routeMatches]);

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
        <p>Enter your flight ICAO24, bind it to your pilot account, and share live turbulence updates.</p>
        <div className="toolbar">
          <button className="action-btn" disabled={isRefreshing || !selectedFlightIcao} onClick={() => refreshFlight("live")}>
            {isRefreshing ? "Refreshing..." : "Fetch Assigned Flight"}
          </button>
          <button className="action-btn muted" disabled={isRefreshing || !selectedFlightIcao} onClick={() => refreshFlight("mock")}>
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

      <RouteInput
        onSearch={handleRouteSearch}
        busy={isSearchingRoutes}
        origins={routeOptions.origins}
        destinations={routeOptions.destinations}
      />
      {routeFilter ? (
        <section className="panel">
          <h2>Route Search</h2>
          <p>
            Live route filter: {routeFilter.originAirport?.icao || routeFilter.originCity} {"->"}{" "}
            {routeFilter.destinationAirport?.icao || routeFilter.destinationCity}
          </p>
        </section>
      ) : null}

      <FlightList
        flights={routeMatches.map((flight) => ({
          ...flight,
          estDepartureAirport:
            flight.route?.departure?.icao || flight.route?.departure?.iata || flight.route?.departure?.name,
          estArrivalAirport:
            flight.route?.arrival?.icao || flight.route?.arrival?.iata || flight.route?.arrival?.name
        }))}
        selectedFlight={{ icao24: selectedFlightIcao }}
        onSelectFlight={handleRouteFlightSelect}
      />

      <section className="panel-grid">
        <article className="panel">
          <h2>Assign Flight ID</h2>
          <label className="field-label" htmlFor="pilot-flight-id">
            Flight ICAO24
          </label>
          <input
            id="pilot-flight-id"
            className="input"
            value={flightInput}
            onChange={(event) => setFlightInput(event.target.value)}
            placeholder="Enter ICAO24 like a0b1c2"
          />
          <label className="field-label" htmlFor="pilot-flight-quick-pick">
            Live flight list
          </label>
          <select
            id="pilot-flight-quick-pick"
            className="input"
            value={flightInput}
            onChange={(event) => handleLiveFlightSelection(event.target.value)}
          >
            <option value="">
              {routeFilter ? "Select ICAO24 for this route" : "Select from live flights"}
            </option>
            {selectableFlights.map((flight) => (
              <option key={flight.icao24} value={flight.icao24}>
                {buildRouteOptionLabel(flight)}
              </option>
            ))}
          </select>
          <div className="risk-stack" style={{ marginTop: 12 }}>
            <div className="risk-item">
              <p style={{ color: "#f87171" }}>Route start</p>
              <p style={{ color: "#fecaca" }}>
                {formatAirportDisplay(routeData?.departure, "N/A")}
              </p>
            </div>
            <div className="risk-item">
              <p style={{ color: "#4ade80" }}>Route end</p>
              <p style={{ color: "#bbf7d0" }}>
                {formatAirportDisplay(routeData?.arrival, "N/A")}
              </p>
            </div>
            {routeFetchError ? (
              <div className="risk-item">
                <p>Route status</p>
                <p style={{ color: "#f59e0b" }}>{routeFetchError}</p>
              </div>
            ) : null}
          </div>
          <div className="toolbar">
            <button className="action-btn" disabled={isAssigning} onClick={handleAssignFlight}>
              {isAssigning ? "Assigning..." : "Share This Flight"}
            </button>
          </div>
          {assignment ? (
            <p className="status-line">
              Shared flight: {assignment.callsign || "N/A"} ({assignment.icao24})
            </p>
          ) : (
            <p className="status-line">No flight is shared yet. Passengers will see updates after assignment.</p>
          )}
        </article>

        <article className="panel">
          <h2>Pilot Feed</h2>
          <p>Pilot account: {user.email}</p>
          <p>Assigned ICAO24: {selectedFlightIcao || "Not assigned"}</p>
          <p>Feed source: {flightData?.source || "Not active"}</p>
          {selectedFlightIcao ? (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 12, color: "#94a3b8", letterSpacing: 2 }}>PASSENGER JOIN QR</p>
              <div style={{ display: "grid", gap: 10 }}>
                <img
                  src={`${BASE_URL}/pilot/qr.png?room=${encodeURIComponent(selectedFlightIcao)}`}
                  alt="Passenger join QR"
                  style={{ width: 220, height: 220, borderRadius: 14, background: "#fff", padding: 10 }}
                />
                {passengerJoinLink ? (
                  <a href={passengerJoinLink} style={{ color: "#93c5fd", wordBreak: "break-all", fontSize: 12 }}>
                    {passengerJoinLink}
                  </a>
                ) : (
                  <p style={{ color: "#94a3b8", fontSize: 12 }}>Join link unavailable</p>
                )}
              </div>
            </div>
          ) : null}
        </article>
      </section>

      <TelemetryPanel
        selectedFlight={selectedFlight}
        liveState={liveState}
        distanceCoveredKm={distanceCoveredKm}
      />

      <section className="panel-grid">
        <article className="panel">
          <h2>Current Flight Status</h2>
          <div className="risk-stack">
            <div className="risk-item">
              <p>Flight ID</p>
              <p>{selectedFlight?.icao24 || "Not assigned"}</p>
            </div>
            <div className="risk-item">
              <p>Callsign</p>
              <p>{(selectedFlight?.callsign || "N/A").trim() || "N/A"}</p>
            </div>
            <div className="risk-item">
              <p>Current turbulence</p>
              <p>{levelText(Number(selectedFlight?.currentLevel ?? 0))}</p>
            </div>
            <div className="risk-item">
              <p>Predicted turbulence</p>
              <p>{levelText(Number(selectedFlight?.predictedLevel ?? 0))}</p>
            </div>
            <div className="risk-item">
              <p>Route</p>
              <p>{routeSummary}</p>
            </div>
          </div>
        </article>

        <article className="panel">
          <h2>Passenger Push Logic</h2>
          <div className="risk-stack">
            <div className="risk-item">
              <p>Broadcast room</p>
              <p>{selectedFlight?.icao24 || "default-room"}</p>
            </div>
            <div className="risk-item">
              <p>Current outbound level</p>
              <p>{currentAlertLevel} / {outboundLevelText(currentAlertLevel)}</p>
            </div>
            <div className="risk-item">
              <p>Mode</p>
              <p>Only sends when severity increases</p>
            </div>
          </div>
        </article>
      </section>

      <div
        style={{
          background: "#0d1626",
          border: "1px solid #1e3050",
          borderRadius: 8,
          padding: 16,
          marginTop: 12
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 2,
            color: "#5a7aa0",
            marginBottom: 12
          }}
        >
          BROADCAST TO PASSENGERS
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            marginBottom: 10
          }}
        >
          {[
            { t: 2, m: "Turbulence detected. Fasten seatbelts.", label: "TURBULENCE", color: "#f59e0b" },
            { t: 3, m: "Severe turbulence. Remain seated immediately.", label: "SEVERE", color: "#ef4444" },
            { t: 5, m: "Flight on schedule. Updated ETA en route.", label: "ETA UPDATE", color: "#3b82f6" },
            { t: 1, m: "Conditions calm. Seatbelt sign off.", label: "ALL CLEAR", color: "#22c55e" }
          ].map((button) => (
            <button
              key={button.t}
              onClick={() => sendAlert(button.t, button.m)}
              style={{
                padding: "10px 6px",
                background: "#111d33",
                border: `1px solid ${button.color}33`,
                borderRadius: 6,
                color: button.color,
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: 1,
                cursor: "pointer"
              }}
              onMouseOver={(event) => {
                event.currentTarget.style.background = `${button.color}22`;
              }}
              onMouseOut={(event) => {
                event.currentTarget.style.background = "#111d33";
              }}
            >
              {button.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input
            value={customMsg}
            onChange={(event) => setCustomMsg(event.target.value)}
            placeholder="Custom message (max 100 chars)"
            maxLength={100}
            style={{
              flex: 1,
              background: "#080e1a",
              border: "1px solid #1e3050",
              borderRadius: 6,
              color: "#e2eaf8",
              padding: "8px 10px",
              fontSize: 13
            }}
          />
          <button
            onClick={() => customMsg.trim() && sendAlert(2, customMsg.trim())}
            style={{
              padding: "8px 16px",
              background: "#185fa5",
              border: "1px solid #00c9ff",
              borderRadius: 6,
              color: "#fff",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
              letterSpacing: 1
            }}
          >
            SEND
          </button>
        </div>

        {broadcastResult ? (
          <div
            style={{
              fontSize: 12,
              padding: "6px 10px",
              borderRadius: 4,
              background:
                broadcastResult.includes("failed") || broadcastResult.includes("unchanged")
                  ? "#1c0303"
                  : "#052e16",
              color:
                broadcastResult.includes("failed") || broadcastResult.includes("unchanged")
                  ? "#ef4444"
                  : "#22c55e",
              marginBottom: 8
            }}
          >
            {broadcastResult}
          </div>
        ) : null}

        {broadcastLog.length > 0 ? (
          <div>
            {broadcastLog.map((log, index) => (
              <div
                key={`${log.time}-${index}`}
                style={{
                  fontSize: 11,
                  color: "#5a7aa0",
                  padding: "3px 0",
                  fontFamily: "monospace",
                  borderBottom: "1px solid #0d1626"
                }}
              >
                {log.time} - {log.m.slice(0, 40)} - {log.msg}
              </div>
            ))}
          </div>
        ) : null}
      </div>

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

      <FlightPredictionTable
        flight={selectedFlight}
        fetchedAt={flightData?.fetchedAt}
        routeData={routeData}
      />
    </>
  );
}

export default PilotDashboard;

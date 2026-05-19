import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import QRCode from "qrcode";
import FlightMap from "../components/FlightMap";
import TurbulenceGraph from "../components/TurbulenceGraph";
import FlightPredictionTable from "../components/FlightPredictionTable";
import { buildTurbulenceSegments } from "../components/TurbulenceOverlay";
import IntervalSelector from "../components/IntervalSelector";
import FlightCard from "../components/pilot/FlightCard";
import TurbulenceStatus from "../components/pilot/TurbulenceStatus";
import MetricCard from "../components/pilot/MetricCard";
import PredictionCard from "../components/pilot/PredictionCard";
import AlertBanner from "../components/pilot/AlertBanner";
import { useAuth } from "../context/AuthContext";
import { audioAlerts } from "../services/audioAlerts";
import {
  getAircraftState,
  getFlightTrack,
  getLiveFlightData,
  getMockDashboardData,
  getPilotFlightAssignment,
  getPirepValidation,
  publishSharedDisplayUpdate,
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
      trueTrack: point?.[4] ?? null,
    }))
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
}

function mapFlightLevelToAlertLevel(level) {
  if (level >= 3) return 3;
  if (level >= 1) return 2;
  return 1;
}

function levelText(level) {
  if (level >= 3) return "Severe";
  if (level >= 2) return "Moderate";
  if (level >= 1) return "Light";
  return "Calm";
}

function outboundLevelText(level) {
  if (level >= 3) return "Severe";
  if (level >= 2) return "Moderate";
  return "Calm";
}

function formatValidationValue(value) {
  if (!Number.isFinite(Number(value))) {
    return "N/A";
  }
  return Number(value).toFixed(2);
}

function buildSharedMessage(flight) {
  const level = Math.max(Number(flight?.currentLevel ?? 0), Number(flight?.predictedLevel ?? 0));
  if (level >= 3) {
    return {
      message: "Severe turbulence detected. Stay seated and keep seatbelts fastened.",
      action: "Seats caution ON",
    };
  }
  if (level >= 2) {
    return {
      message: "Moderate turbulence ahead. Please remain seated.",
      action: "Seats caution ON",
    };
  }
  if (level >= 1) {
    return {
      message: "Light turbulence detected. Cabin should stay prepared.",
      action: "Caution standby",
    };
  }
  return {
    message: "Conditions are calm. No active turbulence alert.",
    action: "Seats caution OFF",
  };
}

function buildAnnouncementMessage(flight) {
  const level = Math.max(Number(flight?.currentLevel ?? 0), Number(flight?.predictedLevel ?? 0));
  if (level >= 3) return "Attention all passengers. This is an urgent message from your captain. We are experiencing severe turbulence. All passengers must remain seated with seatbelts tightly fastened. Cabin crew, secure yourselves immediately.";
  if (level >= 2) return "Ladies and gentlemen, this is your captain speaking. We are encountering moderate turbulence. Please return to your seats immediately and ensure your seatbelts are securely fastened. Cabin crew, please be seated.";
  if (level >= 1) return "Ladies and gentlemen, this is your cabin crew. We are currently experiencing light turbulence. We request that you return to your seats and fasten your seatbelts as a precaution.";
  return "Ladies and gentlemen, we are now cruising through smooth conditions. You are free to move about the cabin. Thank you for flying with us.";
}

function buildAlarmType(flight) {
  const level = Math.max(Number(flight?.currentLevel ?? 0), Number(flight?.predictedLevel ?? 0));
  if (level >= 3) return "siren";
  if (level >= 2) return "buzzer";
  return "chime";
}

function severityTone(level) {
  if (level >= 3) return "severe";
  if (level >= 2) return "moderate";
  if (level >= 1) return "light";
  return "calm";
}

function PilotDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [liveModeEnabled, setLiveModeEnabled] = useState(false);
  const [flightData, setFlightData] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [selectedFlightIcao, setSelectedFlightIcao] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [statusText, setStatusText] = useState("");
  const [trackPoints, setTrackPoints] = useState([]);
  const [liveState, setLiveState] = useState(null);
  const [animatedLiveState, setAnimatedLiveState] = useState(null);
  const [turbulenceHistory, setTurbulenceHistory] = useState([]);
  const [pirepValidation, setPirepValidation] = useState(null);
  const [pirepLoading, setPirepLoading] = useState(false);
  const [pirepError, setPirepError] = useState("");
  const [sharingUpdate, setSharingUpdate] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [showIntervalSelector, setShowIntervalSelector] = useState(false);
  const [autoFetchInterval, setAutoFetchInterval] = useState(null);
  const [autoFetchActive, setAutoFetchActive] = useState(false);
  const [publishHistory, setPublishHistory] = useState([]);
  const [autoPublishEnabled, setAutoPublishEnabled] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const qrCanvasRef = useRef(null);

  function appendTurbulencePoint(flight, timestamp) {
    if (!flight) {
      return;
    }

    setTurbulenceHistory((prev) => {
      const next = {
        timestamp: timestamp || new Date().toISOString(),
        currentLevel: Number(flight.currentLevel ?? 0),
        predictedLevel: Number(flight.predictedLevel ?? 0),
        confidence: Number(flight.confidence ?? 0),
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
        const [pilotAssignment, mockCatalog] = await Promise.all([
          getPilotFlightAssignment(user.email),
          getMockDashboardData(),
        ]);

        if (!active) {
          return;
        }

        setFetchError("");
        const savedAssignment = pilotAssignment.assignment;
        setAssignment(savedAssignment || null);
        setSelectedFlightIcao(savedAssignment?.icao24 || "");

        if (savedAssignment?.icao24) {
          const mockFlight = (mockCatalog.flights || []).find(
            (flight) => flight.icao24 === savedAssignment.icao24
          );
          if (mockFlight) {
            const mockPayload = {
              flight: mockFlight,
              fetchedAt: mockCatalog.fetchedAt,
              source: mockCatalog.source,
              summary: mockCatalog.summary,
            };
            setFlightData(mockPayload);
            setTurbulenceHistory([]);
            appendTurbulencePoint(mockPayload.flight, mockPayload.fetchedAt);
            setStatusText(`Flight assigned by admin: ${savedAssignment.icao24}. Live fetch is paused until you enable it.`);
            setAutoPublishEnabled(true);
          } else {
            setStatusText(`Flight assigned by admin: ${savedAssignment.icao24}. Enable live fetch to load the latest telemetry.`);
            setAutoPublishEnabled(true);
          }
        } else {
          setStatusText("No flight is assigned to this pilot yet. Ask the admin to assign an ICAO24.");
        }
      } catch {
        if (!active) {
          return;
        }
        setStatusText("Could not load the pilot assignment right now.");
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

  useEffect(() => {
    if (!autoFetchActive || !liveModeEnabled || !autoFetchInterval || !selectedFlightIcao) {
      return;
    }

    const intervalId = setInterval(() => {
      refreshFlight("live");
    }, autoFetchInterval * 1000);

    return () => clearInterval(intervalId);
  }, [autoFetchActive, liveModeEnabled, autoFetchInterval, selectedFlightIcao]);

  useEffect(() => {
    if (!showQRCode || !qrCanvasRef.current) {
      return;
    }

    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const qrUrl = isLocalhost
      ? "https://mirella-fasciculate-mikki.ngrok-free.dev/common-display"
      : `${window.location.origin}/common-display`;

    QRCode.toCanvas(qrCanvasRef.current, qrUrl, {
      width: 220,
      margin: 2,
      color: {
        dark: "#ffffff",
        light: "#1a2e47",
      },
    }).catch((err) => {
      console.error("QR Code generation failed:", err);
    });
  }, [showQRCode]);

  async function refreshFlight(source) {
    if (!selectedFlightIcao) {
      setFetchError("No flight is assigned to this pilot yet.");
      return;
    }

    setFetchError("");
    setStatusText("");
    setIsRefreshing(true);

    try {
      if (source === "live" && !liveModeEnabled) {
        throw new Error("Enable live fetch first, then request fresh telemetry.");
      }

      if (source === "live") {
        const payload = await getLiveFlightData(selectedFlightIcao);
        setFlightData(payload);
        appendTurbulencePoint(payload.flight, payload.fetchedAt);
        setStatusText(`Live updates active for ${selectedFlightIcao}.`);
      } else {
        const payload = await getMockDashboardData();
        const mockFlight = (payload.flights || []).find((flight) => flight.icao24 === selectedFlightIcao) || null;
        if (!mockFlight) {
          throw new Error(`Mock data does not include ${selectedFlightIcao}.`);
        }
        const nextPayload = {
          flight: mockFlight,
          fetchedAt: payload.fetchedAt,
          source: payload.source,
          summary: payload.summary,
        };
        setFlightData(nextPayload);
        appendTurbulencePoint(nextPayload.flight, nextPayload.fetchedAt);
        setStatusText(`Mock telemetry loaded for ${selectedFlightIcao}.`);
      }
    } catch (error) {
      setFetchError(error.message || "Could not refresh flight data.");
    } finally {
      setIsRefreshing(false);
    }
  }

  const selectedFlight = useMemo(() => flightData?.flight || null, [flightData]);

  async function publishSharedUpdate(overrides = {}) {
    if (!selectedFlight || !selectedFlightIcao) {
      throw new Error("Load the assigned flight before sharing updates.");
    }

    const alertPayload = buildSharedMessage(selectedFlight);
    const now = new Date().toISOString();
    await publishSharedDisplayUpdate(user.email, {
      icao24: selectedFlightIcao,
      callsign: selectedFlight.callsign || assignment?.callsign || "",
      current_level: Number(selectedFlight.currentLevel ?? 0),
      predicted_level: Number(selectedFlight.predictedLevel ?? 0),
      confidence: Number.isFinite(Number(selectedFlight.confidence)) ? Number(selectedFlight.confidence) : null,
      message: overrides.message ?? alertPayload.message,
      action: overrides.action ?? alertPayload.action,
      route: "",
      source: overrides.source || "pilot-dashboard",
      published_at: now,
      announcement: overrides.announcement || "",
      announcement_token: overrides.announcementToken || "",
      alarm_type: overrides.alarmType || "",
      alarm_token: overrides.alarmToken || "",
    });
  }

  async function handleSpeakAlert() {
    if (!selectedFlight || !selectedFlightIcao) {
      setFetchError("Load the assigned flight before triggering speech.");
      return;
    }

    const announcement = buildAnnouncementMessage(selectedFlight);
    const announcementToken = `tts-${Date.now()}`;
    setSharingUpdate(true);
    setShareStatus("");
    setFetchError("");

    try {
      const alertLevel = Math.max(Number(selectedFlight?.currentLevel ?? 0), Number(selectedFlight?.predictedLevel ?? 0));
    audioAlerts.announceCustomPA(announcement, alertLevel);
      await publishSharedUpdate({
        announcement,
        announcementToken,
        source: "pilot-dashboard-tts",
      });
      setShareStatus(`Voice alert broadcast for ${selectedFlightIcao}.`);
    } catch (error) {
      setFetchError(error?.message || "Could not trigger the speech alert.");
    } finally {
      setSharingUpdate(false);
    }
  }

  async function handleCautionTrigger() {
    if (!selectedFlight || !selectedFlightIcao) {
      setFetchError("Load the assigned flight before triggering caution.");
      return;
    }

    const alarmType = buildAlarmType(selectedFlight);
    const alarmToken = `alarm-${Date.now()}`;
    setSharingUpdate(true);
    setShareStatus("");
    setFetchError("");

    try {
      if (alarmType === "siren") {
        audioAlerts.playSiren(2.5);
      } else if (alarmType === "buzzer") {
        audioAlerts.playBuzzer(2);
      } else {
        audioAlerts.playChime();
      }

      await publishSharedUpdate({
        alarmType,
        alarmToken,
        source: "pilot-dashboard-caution",
      });
      setShareStatus(`Caution trigger sent for ${selectedFlightIcao}.`);
    } catch (error) {
      setFetchError(error?.message || "Could not trigger the caution alert.");
    } finally {
      setSharingUpdate(false);
    }
  }

  async function handleShareUpdate() {
    if (!selectedFlight || !selectedFlightIcao) {
      setFetchError("Load the assigned flight before sharing updates.");
      return;
    }

    setSharingUpdate(true);
    setShareStatus("");
    setFetchError("");

    try {
      await publishSharedUpdate();
      setShareStatus(`Shared display updated for ${selectedFlightIcao}.`);
    } catch (error) {
      setFetchError(error?.message || "Could not publish the shared update.");
    } finally {
      setSharingUpdate(false);
    }
  }

  async function handleLiveModeToggle() {
    const next = !liveModeEnabled;
    setLiveModeEnabled(next);
    setFetchError("");

    if (!next) {
      setAutoFetchActive(false);
      setStatusText("Live fetch paused. Use mock or cached values until you enable it again.");
      setPirepValidation(null);
      setPirepError("");
      return;
    }

    if (!selectedFlightIcao) {
      setStatusText("Live fetch enabled, but no flight is assigned yet.");
      return;
    }

    setStatusText("Enabling live fetch and loading the latest telemetry for your assigned flight...");
    setIsRefreshing(true);
    try {
      const payload = await getLiveFlightData(selectedFlightIcao);
      setFlightData(payload);
      appendTurbulencePoint(payload.flight, payload.fetchedAt);
      setStatusText("Live fetch enabled and refreshed. Auto-fetch will start in 30s intervals.");
      setAutoFetchInterval(30);
      setAutoFetchActive(true);
    } catch (error) {
      setLiveModeEnabled(false);
      setFetchError(error?.message || "Could not enable live fetch.");
      setStatusText("Live fetch could not be enabled. Staying in low-cost mode.");
    } finally {
      setIsRefreshing(false);
    }
  }

  const currentAlertLevel = useMemo(
    () => mapFlightLevelToAlertLevel(Math.max(Number(selectedFlight?.currentLevel ?? 0), Number(selectedFlight?.predictedLevel ?? 0))),
    [selectedFlight]
  );

  useEffect(() => {
    if (!autoPublishEnabled || !selectedFlight || !selectedFlightIcao) {
      return;
    }

    const publishData = async () => {
      const alertPayload = buildSharedMessage(selectedFlight);
      try {
        await publishSharedDisplayUpdate(user.email, {
          icao24: selectedFlightIcao,
          callsign: selectedFlight.callsign || assignment?.callsign || "",
          current_level: Number(selectedFlight.currentLevel ?? 0),
          predicted_level: Number(selectedFlight.predictedLevel ?? 0),
          confidence: Number.isFinite(Number(selectedFlight.confidence)) ? Number(selectedFlight.confidence) : null,
          message: alertPayload.message,
          action: alertPayload.action,
          source: "auto-publish",
          published_at: new Date().toISOString(),
        });

        setPublishHistory((prev) => [
          {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            level: Math.max(Number(selectedFlight.currentLevel ?? 0), Number(selectedFlight.predictedLevel ?? 0)),
            message: alertPayload.message,
          },
          ...prev,
        ].slice(0, 15));
      } catch (err) {
        console.error("Auto-publish failed:", err);
      }
    };

    publishData();
  }, [selectedFlight, autoPublishEnabled, selectedFlightIcao, assignment?.callsign, user.email]);

  useEffect(() => {
    let active = true;

    async function loadValidation() {
      const icao24 = (selectedFlightIcao || "").trim();
      if (!liveModeEnabled || !icao24) {
        setPirepValidation(null);
        setPirepError("");
        setPirepLoading(false);
        return;
      }

      setPirepLoading(true);
      setPirepError("");

      try {
        const payload = await getPirepValidation(icao24, selectedFlight?.currentLevel);
        if (!active) {
          return;
        }
        setPirepValidation(payload);
      } catch (error) {
        if (!active) {
          return;
        }
        setPirepValidation(null);
        setPirepError(error?.message || "Could not load NOAA PIREP validation.");
      } finally {
        if (active) {
          setPirepLoading(false);
        }
      }
    }

    loadValidation();

    return () => {
      active = false;
    };
  }, [selectedFlightIcao, liveModeEnabled]);

  useEffect(() => {
    if (!liveModeEnabled || !selectedFlight?.icao24) {
      setTrackPoints([]);
      setLiveState(null);
      setAnimatedLiveState(null);
      return;
    }

    let active = true;
    Promise.all([getFlightTrack(selectedFlight.icao24), getAircraftState(selectedFlight.icao24)])
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
  }, [selectedFlight?.icao24, liveModeEnabled]);


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
        longitude,
      });
      if (t >= 1) {
        clearInterval(interval);
      }
    }, 180);

    return () => clearInterval(interval);
  }, [liveState, animatedLiveState]);

  const turbulenceSegments = useMemo(() => buildTurbulenceSegments(trackPoints), [trackPoints]);

  const originAirport = useMemo(() => {
    if (trackPoints.length < 1) return null;
    const first = trackPoints[0];
    return { city: "route-start", icao: "ORIGIN", lat: first.latitude, lon: first.longitude };
  }, [trackPoints]);

  const destinationAirport = useMemo(() => {
    if (trackPoints.length < 2) return null;
    const last = trackPoints[trackPoints.length - 1];
    return { city: "route-end", icao: "DEST", lat: last.latitude, lon: last.longitude };
  }, [trackPoints]);

  const distanceCoveredKm = useMemo(() => {
    if (!trackPoints || trackPoints.length < 2) {
      return 0;
    }

    const toRad = (deg) => (deg * Math.PI) / 180;
    let total = 0;
    for (let index = 1; index < trackPoints.length; index += 1) {
      const p1 = trackPoints[index - 1];
      const p2 = trackPoints[index];
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

  const turbulenceLabel = levelText(Math.max(Number(selectedFlight?.currentLevel ?? 0), Number(selectedFlight?.predictedLevel ?? 0)));
  const confidencePct = `${Math.round((Number(selectedFlight?.confidence ?? 0) || 0) * 100)}%`;
  const predictionCards = useMemo(() => {
    const current = Number(selectedFlight?.currentLevel ?? 0);
    const predicted = Number(selectedFlight?.predictedLevel ?? 0);
    const confidence = Math.max(0, Math.min(100, Math.round((Number(selectedFlight?.confidence ?? 0) || 0) * 100)));
    const futureLevel = Math.max(predicted, current > 1 ? current - 1 : current);

    return [
      {
        label: "T+2",
        severity: levelText(current),
        confidence: `${Math.max(confidence - 4, 0)}% confidence`,
        tone: severityTone(current),
      },
      {
        label: "T+5",
        severity: levelText(predicted),
        confidence: `${confidence}% confidence`,
        tone: severityTone(predicted),
      },
      {
        label: "T+10",
        severity: levelText(futureLevel),
        confidence: `${Math.max(confidence - 10, 0)}% confidence`,
        tone: severityTone(futureLevel),
      },
    ];
  }, [selectedFlight]);

  if (loading) {
    return <section className="panel">Loading pilot dashboard...</section>;
  }

  return (
    <div className="ops-page ops-page--pilot">
      <section className="ops-hero ops-hero--pilot">
        <div className="ops-hero__copy">
          <p className="ops-hero__eyebrow">Pilot Operations</p>
          <h1>Pilot turbulence command deck</h1>
          <p>
            Monitor the assigned aircraft, control the live telemetry cadence, validate predictions, and synchronize the passenger-facing cabin display from one cockpit view.
          </p>
        </div>
        <div className="ops-hero__metrics">
          <div className="ops-metric-card">
            <span>Assigned ICAO24</span>
            <strong>{selectedFlightIcao || "Pending"}</strong>
          </div>
          <div className="ops-metric-card">
            <span>Current severity</span>
            <strong>{turbulenceLabel}</strong>
          </div>
          <div className="ops-metric-card">
            <span>Cabin link</span>
            <strong>{autoPublishEnabled ? "Live sync" : "Manual share"}</strong>
          </div>
        </div>
      </section>

      <AlertBanner
        show={Math.max(Number(selectedFlight?.currentLevel ?? 0), Number(selectedFlight?.predictedLevel ?? 0)) >= 3}
        title="Severe turbulence warning"
        message="High-severity state detected. Push cabin-facing communication immediately and keep the aircraft in live monitoring mode."
      />

      <div className="pilot-control-layout">
        <div className="pilot-control-layout__main">
          <FlightCard
            icao24={selectedFlightIcao}
            route=""
            status={liveModeEnabled ? "ACTIVE" : "STANDBY"}
            callsign={selectedFlight?.callsign || assignment?.callsign || ""}
            liveActive={liveModeEnabled}
          />

          <TurbulenceStatus
            levelLabel={turbulenceLabel}
            currentLevel={levelText(Number(selectedFlight?.currentLevel ?? 0))}
            predictedLevel={levelText(Number(selectedFlight?.predictedLevel ?? 0))}
          />

          <section className="pilot-metric-grid">
            <MetricCard
              icon="ALT"
              label="Altitude"
              value={liveState?.baro_altitude != null ? `${Math.round(liveState.baro_altitude)} m` : "N/A"}
              hint="barometric altitude"
            />
            <MetricCard
              icon="VEL"
              label="Velocity"
              value={liveState?.velocity != null ? `${Math.round(liveState.velocity)} m/s` : "N/A"}
              hint="ground speed"
            />
            <MetricCard
              icon="V/S"
              label="Vertical Rate"
              value={liveState?.vertical_rate != null ? `${liveState.vertical_rate.toFixed(2)} m/s` : "N/A"}
              hint="climb / descent"
            />
            <MetricCard
              icon="CF"
              label="Confidence"
              value={confidencePct}
              hint="model confidence"
            />
          </section>

          <motion.section
            className="panel pilot-analytics-panel"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut", delay: 0.08 }}
          >
            <div className="pilot-section-head">
              <div>
                <p className="pilot-card-label">Turbulence Analytics</p>
                <h2>Current vs predicted severity</h2>
              </div>
            </div>
            <div className="pilot-analytics-bars">
              {[
                {
                  label: "Current turbulence",
                  value: Math.round((Number(selectedFlight?.currentLevel ?? 0) / 3) * 100),
                  tone: severityTone(Number(selectedFlight?.currentLevel ?? 0)),
                  text: levelText(Number(selectedFlight?.currentLevel ?? 0)),
                },
                {
                  label: "Predicted turbulence",
                  value: Math.round((Number(selectedFlight?.predictedLevel ?? 0) / 3) * 100),
                  tone: severityTone(Number(selectedFlight?.predictedLevel ?? 0)),
                  text: levelText(Number(selectedFlight?.predictedLevel ?? 0)),
                },
                {
                  label: "Model confidence",
                  value: Math.round((Number(selectedFlight?.confidence ?? 0) || 0) * 100),
                  tone: "sky",
                  text: confidencePct,
                },
              ].map((item) => (
                <div key={item.label} className="pilot-analytics-row">
                  <div className="pilot-analytics-row__meta">
                    <span>{item.label}</span>
                    <strong>{item.text}</strong>
                  </div>
                  <div className="pilot-analytics-row__track">
                    <motion.div
                      className={`pilot-analytics-row__fill tone-${item.tone}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${item.value}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                  <span className="pilot-analytics-row__value">{item.value}%</span>
                </div>
              ))}
            </div>
          </motion.section>
        </div>

        <aside className="pilot-control-layout__side">
          <motion.section
            className="panel pilot-side-panel"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          >
            <div className="pilot-section-head">
              <div>
                <p className="pilot-card-label">Prediction Window</p>
                <h2>Short horizon outlook</h2>
              </div>
            </div>
            <div className="pilot-prediction-stack">
              {predictionCards.map((item) => (
                <PredictionCard
                  key={item.label}
                  label={item.label}
                  severity={item.severity}
                  confidence={item.confidence}
                  tone={item.tone}
                />
              ))}
            </div>
          </motion.section>

          <motion.section
            className="panel pilot-side-panel"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, ease: "easeOut", delay: 0.08 }}
          >
            <div className="pilot-section-head">
              <div>
                <p className="pilot-card-label">Control Snapshot</p>
                <h2>Operational summary</h2>
              </div>
            </div>
            <div className="risk-stack">
              <div className="risk-item">
                <p>Pilot account</p>
                <p>{user.email}</p>
              </div>
              <div className="risk-item">
                <p>Callsign</p>
                <p>{(selectedFlight?.callsign || assignment?.callsign || "N/A").trim() || "N/A"}</p>
              </div>
              <div className="risk-item">
                <p>Operational level</p>
                <p>{currentAlertLevel} / {outboundLevelText(currentAlertLevel)}</p>
              </div>
              <div className="risk-item">
                <p>Distance covered</p>
                <p>{distanceCoveredKm.toFixed(1)} km</p>
              </div>
            </div>
          </motion.section>
        </aside>
      </div>

      <section className="panel">
        <h2>Pilot Dashboard</h2>
        <p>This dashboard is now assignment-based. Admin assigns the flight, and the pilot monitors the assigned aircraft here.</p>
        <div className="toolbar">
          <button className={`action-btn ${liveModeEnabled ? "" : "muted"}`} onClick={handleLiveModeToggle}>
            {liveModeEnabled ? "Disable Live Fetch" : "Enable Live Fetch"}
          </button>
          <button
            className={`action-btn ${autoFetchActive ? "success" : ""}`}
            disabled={!liveModeEnabled || !selectedFlightIcao}
            onClick={() => {
              if (autoFetchActive) {
                setAutoFetchActive(false);
                setStatusText("Auto-fetch disabled.");
              } else {
                setShowIntervalSelector(true);
              }
            }}
            title={liveModeEnabled && selectedFlightIcao ? "Setup auto-fetch ML model" : "Enable live fetch and assign flight first"}
          >
            {autoFetchActive ? `Auto-Fetch ON (${autoFetchInterval}s)` : "Auto-Fetch ML Model"}
          </button>
          <button
            className="action-btn"
            disabled={isRefreshing || !selectedFlightIcao || !liveModeEnabled}
            onClick={() => refreshFlight("live")}
            title={liveModeEnabled ? "Fetch live telemetry and predictions now" : "Enable live fetch first"}
          >
            {isRefreshing ? "Refreshing..." : liveModeEnabled ? "Fetch Assigned Flight" : "Enable Live Fetch First"}
          </button>
          <button className="action-btn muted" disabled={isRefreshing || !selectedFlightIcao} onClick={() => refreshFlight("mock")}>
            Use Mock Data
          </button>
          <button className="action-btn" disabled={sharingUpdate || !selectedFlightIcao} onClick={handleShareUpdate}>
            {sharingUpdate ? "Sharing..." : "Share Update"}
          </button>
          <button className="action-btn" disabled={sharingUpdate || !selectedFlightIcao} onClick={handleSpeakAlert}>
            {sharingUpdate ? "Working..." : "Speak Alert"}
          </button>
          <button className="action-btn" disabled={sharingUpdate || !selectedFlightIcao} onClick={handleCautionTrigger}>
            {sharingUpdate ? "Working..." : "Trigger Caution"}
          </button>
          <button
            className={`action-btn ${autoPublishEnabled ? "success" : ""}`}
            disabled={!liveModeEnabled || !selectedFlightIcao}
            onClick={() => {
              setAutoPublishEnabled(!autoPublishEnabled);
              if (!autoPublishEnabled) {
                setStatusText("Auto-publish enabled. Passenger display will update in real-time with your flight data.");
              } else {
                setStatusText("Auto-publish disabled. Use 'Share Update' for manual publishing.");
              }
            }}
            title={liveModeEnabled && selectedFlightIcao ? "Auto-publish updates to passenger display" : "Enable live fetch and assign flight first"}
          >
            {autoPublishEnabled ? "Auto-Publish ON" : "Auto-Publish OFF"}
          </button>
          <button className="action-btn" onClick={() => setShowQRCode(!showQRCode)} title="Generate QR code for passengers to scan">
            {showQRCode ? "Hide QR Code" : "Passenger QR Code"}
          </button>
        </div>
        {statusText ? <p className="status-line">{statusText}</p> : null}
        {!liveModeEnabled ? <p className="meta-line">Live mode is OFF. Click Enable Live Fetch to start a fresh live pull.</p> : null}
        {fetchError ? <p className="error-line">{fetchError}</p> : null}
        {shareStatus ? <p className="status-line">{shareStatus}</p> : null}
      </section>

      {showIntervalSelector && (
        <IntervalSelector
          onClose={() => setShowIntervalSelector(false)}
          onSelect={(interval) => {
            setAutoFetchInterval(interval);
            setAutoFetchActive(true);
            setStatusText(`Auto-fetch enabled every ${interval}s. ML model will be fetched automatically for your assigned flight.`);
          }}
        />
      )}

      {showQRCode && (
        <section className="panel qr-code-section">
          <h2>Passenger Access QR Code</h2>
          <p className="meta-line">Passengers scan this QR code to access the live cabin display on their mobile.</p>
          <div className="qr-code-container">
            <canvas ref={qrCanvasRef} />
          </div>
          <p className="meta-line" style={{ marginTop: "16px", textAlign: "center" }}>
            Link: {(() => {
              const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
              return isLocalhost
                ? "https://mirella-fasciculate-mikki.ngrok-free.dev/common-display"
                : `${window.location.origin}/common-display`;
            })()}
          </p>
          <button
            className="action-btn muted small"
            onClick={() => {
              const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
              const url = isLocalhost
                ? "https://mirella-fasciculate-mikki.ngrok-free.dev/common-display"
                : `${window.location.origin}/common-display`;
              navigator.clipboard.writeText(url);
              alert("Link copied to clipboard!");
            }}
          >
            Copy Link
          </button>
        </section>
      )}

      <section className="panel pilot-assignment-panel">
        <div className="panel-head">
          <div>
            <h2>Assignment + Feed Controls</h2>
            <p className="meta-line">Refresh the admin-mapped aircraft and confirm the feed source driving this control surface.</p>
          </div>
          <button
            className="action-btn muted small"
            onClick={async () => {
              try {
                const payload = await getPilotFlightAssignment(user.email);
                const savedAssignment = payload.assignment;
                setAssignment(savedAssignment || null);
                setSelectedFlightIcao(savedAssignment?.icao24 || "");
                setStatusText(`Assignment refreshed: ${savedAssignment?.icao24 || "Not assigned"}`);
              } catch (err) {
                setFetchError("Could not refresh assignment.");
              }
            }}
          >
            Refresh Assignment
          </button>
        </div>
        <div className="pilot-assignment-panel__grid">
          <div className="risk-item">
            <p>Assigned ICAO24</p>
            <p style={{ fontWeight: 700, fontSize: "1.1rem", color: selectedFlightIcao ? "#22c55e" : "var(--muted)" }}>
              {selectedFlightIcao && selectedFlightIcao.length >= 6 ? selectedFlightIcao : "Not assigned"}
            </p>
          </div>
          <div className="risk-item">
            <p>Feed source</p>
            <p>{flightData?.source || "Not active"}</p>
          </div>
          <div className="risk-item">
            <p>Assigned by</p>
            <p>Admin workflow</p>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>External Validation</h2>
            <p className="meta-line">Model prediction compared against the best available NOAA turbulence reference.</p>
          </div>
          <button
            className="action-btn muted small"
            disabled={pirepLoading || !selectedFlightIcao}
            onClick={async () => {
              if (!selectedFlightIcao) {
                return;
              }
              setPirepLoading(true);
              setPirepError("");
              try {
                const payload = await getPirepValidation(selectedFlightIcao, selectedFlight?.currentLevel);
                setPirepValidation(payload);
              } catch (error) {
                setPirepValidation(null);
                setPirepError(error?.message || "Could not load NOAA PIREP validation.");
              } finally {
                setPirepLoading(false);
              }
            }}
          >
            {pirepLoading ? "Checking..." : "Refresh Validation"}
          </button>
        </div>

        {!selectedFlightIcao ? (
          <p className="meta-line">No flight is assigned yet, so validation is not available.</p>
        ) : pirepLoading ? (
          <p className="meta-line">Checking NOAA reference data…</p>
        ) : pirepError ? (
          <div className="pirep-unavailable">
            <span className="pirep-unavailable__icon">ℹ</span>
            <div>
              <p className="pirep-unavailable__title">Validation unavailable</p>
              <p className="pirep-unavailable__detail">
                {pirepError.toLowerCase().includes("incomplete") || pirepError.toLowerCase().includes("telemetry")
                  ? "Not enough telemetry data has been collected for this flight yet. Enable live fetch and wait a few minutes, then refresh."
                  : pirepError}
              </p>
            </div>
          </div>
        ) : pirepValidation ? (
          <div className="validation-grid">
            <div className="validation-card">
              <p className="validation-label">Model prediction</p>
              <strong>{formatValidationValue(pirepValidation?.predicted_value)}</strong>
              <span>{pirepValidation?.predicted_label || "Pending"}</span>
            </div>
            <div className="validation-card">
              <p className="validation-label">NOAA external</p>
              <strong>{formatValidationValue(pirepValidation?.pirep_value)}</strong>
              <span>{pirepValidation?.external_source_label || pirepValidation?.pirep_label || "Pending"}</span>
            </div>
            <div className="validation-card">
              <p className="validation-label">Difference</p>
              <strong>{formatValidationValue(pirepValidation?.difference)}</strong>
              <span>{pirepValidation?.within_tolerance ? "Within tolerance" : "Outside tolerance"}</span>
            </div>
            <div className={`validation-card ${pirepValidation?.within_tolerance ? "validation-card-good" : "validation-card-warn"}`}>
              <p className="validation-label">Verdict</p>
              <strong>{pirepValidation?.within_tolerance ? "Aligned" : "Review"}</strong>
              <span>{pirepValidation?.message || (pirepValidation?.match ? "Labels match external report" : "Labels differ from external report")}</span>
            </div>
          </div>
        ) : (
          <p className="meta-line">Enable live fetch, then click Refresh Validation to run the NOAA check.</p>
        )}

        {pirepValidation ? (
          <div className="risk-stack" style={{ marginTop: 12 }}>
            <div className="risk-item">
              <p>Compared ICAO24</p>
              <p>{pirepValidation.icao24 || selectedFlightIcao}</p>
            </div>
            <div className="risk-item">
              <p>Nearest external distance</p>
              <p>{Number.isFinite(Number(pirepValidation.pirep_distance)) ? `${Number(pirepValidation.pirep_distance).toFixed(2)} deg` : "N/A"}</p>
            </div>
            <div className="risk-item">
              <p>External source</p>
              <p>{pirepValidation.external_source_label || "N/A"}</p>
            </div>
            <div className="risk-item">
              <p>NOAA time</p>
              <p>{pirepValidation.pirep_time || "N/A"}</p>
            </div>
            <div className="risk-item">
              <p>Raw NOAA turbulence</p>
              <p>{pirepValidation.pirep_raw || "No nearby report"}</p>
            </div>
          </div>
        ) : null}
      </section>

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

      <FlightPredictionTable flight={selectedFlight} fetchedAt={flightData?.fetchedAt} />

      {publishHistory.length > 0 && (
        <section className="panel">
          <h2>Published Updates (Passenger Display)</h2>
          <p className="meta-line">Real-time updates sent to passenger cabin display via WebSocket.</p>
          <div className="publish-history-list">
            {publishHistory.map((entry) => (
              <div key={entry.id} className={`publish-history-item level-${entry.level}`}>
                <div className="publish-time">{new Date(entry.timestamp).toLocaleTimeString()}</div>
                <div className="publish-content">
                  <div className="publish-level">{["Calm", "Light", "Moderate", "Severe"][entry.level] || "Unknown"}</div>
                  <div className="publish-message">{entry.message}</div>
                </div>
                <div className="publish-indicator">Sent</div>
              </div>
            ))}
          </div>
        </section>
      )}


      {!selectedFlightIcao ? (
        <section className="panel">
          <p className="meta-line">No assigned flight yet. The admin needs to assign an ICAO24 to this pilot before live monitoring can begin.</p>
        </section>
      ) : null}
    </div>
  );
}

export default PilotDashboard;

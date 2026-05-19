import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getLiveFlightData, getPilotFlightAssignment } from "../services/api";

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

function levelColor(level) {
  if (level >= 3) {
    return "#ef4444";
  }
  if (level >= 2) {
    return "#fb7185";
  }
  if (level >= 1) {
    return "#f59e0b";
  }
  return "#22c55e";
}

function buildAlertDescriptor(flight) {
  const currentLevel = Number(flight?.currentLevel ?? 0);
  const predictedLevel = Number(flight?.predictedLevel ?? 0);
  const outboundLevel = Math.max(currentLevel, predictedLevel);
  const label = levelText(outboundLevel);

  if (outboundLevel >= 3) {
    return {
      level: outboundLevel,
      label,
      title: "Severe turbulence warning",
      message: "Seatbelt caution active. Cabin movement should be restricted immediately.",
      action: "Seats caution ON"
    };
  }
  if (outboundLevel >= 2) {
    return {
      level: outboundLevel,
      label,
      title: "Moderate turbulence caution",
      message: "Advise passengers to remain seated and keep seatbelts fastened.",
      action: "Seats caution ON"
    };
  }
  if (outboundLevel >= 1) {
    return {
      level: outboundLevel,
      label,
      title: "Light turbulence advisory",
      message: "Keep the cabin aware and monitor for further increase.",
      action: "Caution standby"
    };
  }
  return {
    level: outboundLevel,
    label,
    title: "Calm conditions",
    message: "No active turbulence warning. Continue monitoring.",
    action: "Seats caution OFF"
  };
}

function formatTimestamp(value) {
  if (!value) {
    return "N/A";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }
  return parsed.toLocaleString();
}

function PilotAlerts() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState(null);
  const [flightData, setFlightData] = useState(null);
  const [monitoringEnabled, setMonitoringEnabled] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [alarmEnabled, setAlarmEnabled] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");
  const [history, setHistory] = useState([]);
  const lastAnnouncedLevelRef = useRef(null);
  const audioContextRef = useRef(null);

  const selectedFlight = flightData?.flight || null;
  const activeAlert = useMemo(() => buildAlertDescriptor(selectedFlight), [selectedFlight]);

  useEffect(() => {
    let active = true;

    async function loadAssignment() {
      try {
        const payload = await getPilotFlightAssignment(user.email);
        if (!active) {
          return;
        }
        setAssignment(payload.assignment || null);
        setStatusText(
          payload.assignment?.icao24
            ? `Assigned ICAO24 detected: ${payload.assignment.icao24}. Enable monitoring to start pilot alerts.`
            : "No shared ICAO24 found. Assign a flight in the Pilot dashboard first."
        );
      } catch (error) {
        if (!active) {
          return;
        }
        setErrorText(error?.message || "Could not load pilot assignment.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadAssignment();

    return () => {
      active = false;
    };
  }, [user.email]);

  function appendHistory(alertPayload, fetchedAt) {
    setHistory((prev) => [
      {
        time: formatTimestamp(fetchedAt || new Date().toISOString()),
        title: alertPayload.title,
        label: alertPayload.label,
        message: alertPayload.message
      },
      ...prev
    ].slice(0, 8));
  }

  function speakText(message) {
    if (!speechEnabled || typeof window === "undefined" || !window.speechSynthesis) {
      return;
    }
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function playCautionAlarm() {
    if (!alarmEnabled || typeof window === "undefined") {
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }

    const context = audioContextRef.current || new AudioContextClass();
    audioContextRef.current = context;

    const now = context.currentTime;
    for (let index = 0; index < 3; index += 1) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = index % 2 === 0 ? 880 : 660;
      gain.gain.setValueAtTime(0.001, now + index * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.18, now + index * 0.25 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.25 + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + index * 0.25);
      oscillator.stop(now + index * 0.25 + 0.2);
    }
  }

  async function fetchLatestAlert() {
    if (!assignment?.icao24) {
      setErrorText("Assign a flight in the Pilot dashboard before starting alerts.");
      return;
    }

    setRefreshing(true);
    setErrorText("");
    try {
      const payload = await getLiveFlightData(assignment.icao24);
      setFlightData(payload);
      const nextAlert = buildAlertDescriptor(payload.flight);
      appendHistory(nextAlert, payload.fetchedAt);

      const previousLevel = lastAnnouncedLevelRef.current;
      if (previousLevel === null || nextAlert.level !== previousLevel) {
        speakText(`Current turbulence is ${nextAlert.label}. ${nextAlert.message}`);
      }
      if (previousLevel !== null && nextAlert.level > previousLevel && nextAlert.level >= 2) {
        playCautionAlarm();
      }

      lastAnnouncedLevelRef.current = nextAlert.level;
      setStatusText(`Pilot alert feed updated for ${assignment.icao24}.`);
    } catch (error) {
      setErrorText(error?.message || "Could not fetch pilot alert data.");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!monitoringEnabled) {
      return undefined;
    }

    fetchLatestAlert();
    const timer = setInterval(fetchLatestAlert, 15000);
    return () => clearInterval(timer);
  }, [monitoringEnabled, assignment?.icao24]);

  if (loading) {
    return <section className="panel">Loading pilot alerts...</section>;
  }

  return (
    <div className="ops-page ops-page--alerts">
      <section className="ops-hero ops-hero--alerts">
        <div className="ops-hero__copy">
          <p className="ops-hero__eyebrow">Pilot Alerts</p>
          <h1>Shared-device alert console</h1>
          <p>
            Use this focused view when you want speech, caution escalation, and a simplified live turbulence alert surface during a demo or cockpit-style walkthrough.
          </p>
        </div>
        <div className="ops-hero__metrics">
          <div className="ops-metric-card">
            <span>Monitoring</span>
            <strong>{monitoringEnabled ? "Running" : "Paused"}</strong>
          </div>
          <div className="ops-metric-card">
            <span>Speech</span>
            <strong>{speechEnabled ? "Enabled" : "Muted"}</strong>
          </div>
          <div className="ops-metric-card">
            <span>Alarm</span>
            <strong>{alarmEnabled ? "Enabled" : "Muted"}</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Pilot Alerts</h2>
        <p>Dedicated pilot alert screen for shared-device use, with speech output and caution alarm escalation.</p>
        <div className="toolbar">
          <button
            className={`action-btn ${monitoringEnabled ? "" : "muted"}`}
            onClick={() => {
              const next = !monitoringEnabled;
              setMonitoringEnabled(next);
              setStatusText(
                next
                  ? "Pilot monitoring enabled. Fetching live turbulence alerts now."
                  : "Pilot monitoring paused."
              );
              setErrorText("");
            }}
            disabled={!assignment?.icao24}
          >
            {monitoringEnabled ? "Stop Monitoring" : "Start Monitoring"}
          </button>
          <button className="action-btn" onClick={fetchLatestAlert} disabled={refreshing || !assignment?.icao24}>
            {refreshing ? "Refreshing..." : "Refresh Now"}
          </button>
          <button
            className={`action-btn ${speechEnabled ? "" : "muted"}`}
            onClick={() => setSpeechEnabled((value) => !value)}
          >
            {speechEnabled ? "Speech ON" : "Speech OFF"}
          </button>
          <button
            className={`action-btn ${alarmEnabled ? "" : "muted"}`}
            onClick={() => setAlarmEnabled((value) => !value)}
          >
            {alarmEnabled ? "Alarm ON" : "Alarm OFF"}
          </button>
          <button
            className="action-btn muted"
            onClick={() => speakText(`Current turbulence is ${activeAlert.label}. ${activeAlert.message}`)}
            disabled={!selectedFlight}
          >
            Speak Current Turbulence
          </button>
        </div>
        {statusText ? <p className="status-line">{statusText}</p> : null}
        {errorText ? <p className="error-line">{errorText}</p> : null}
      </section>

      <section className="panel-grid">
        <article className="panel pilot-alert-hero">
          <p className="eyebrow">Live Cabin Alert</p>
          <h2 style={{ color: levelColor(activeAlert.level) }}>{activeAlert.title}</h2>
          <p className="hero-subline">{activeAlert.message}</p>
          <div className="insight-strip">
            <span className="insight-pill">
              Severity <strong>{activeAlert.label}</strong>
            </span>
            <span className="insight-pill">
              Action <strong>{activeAlert.action}</strong>
            </span>
            <span className="insight-pill">
              Assigned ICAO24 <strong>{assignment?.icao24 || "Not assigned"}</strong>
            </span>
          </div>
        </article>

        <article className="panel">
          <h2>Flight Snapshot</h2>
          <div className="risk-stack">
            <div className="risk-item">
              <p>Callsign</p>
              <p>{(selectedFlight?.callsign || assignment?.callsign || "N/A").trim() || "N/A"}</p>
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
              <p>Confidence</p>
              <p>{Number.isFinite(Number(selectedFlight?.confidence)) ? `${Math.round(Number(selectedFlight.confidence) * 100)}%` : "N/A"}</p>
            </div>
            <div className="risk-item">
              <p>Last update</p>
              <p>{formatTimestamp(flightData?.fetchedAt)}</p>
            </div>
          </div>
        </article>
      </section>

      <section className="panel">
        <h2>Alert History</h2>
        {!history.length ? (
          <p className="meta-line">No pilot alerts yet. Start monitoring to build a running alert log.</p>
        ) : (
          <div className="flight-list">
            {history.map((item, index) => (
              <article key={`${item.time}-${index}`} className="flight-list-item">
                <strong>{item.title}</strong>
                <span className="meta-line">{item.time}</span>
                <span>{item.label}</span>
                <span className="meta-line">{item.message}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default PilotAlerts;

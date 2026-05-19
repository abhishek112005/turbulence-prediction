import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { audioAlerts } from "../services/audioAlerts";
import { getSharedDisplayCurrent, getSharedDisplayStreamUrl } from "../services/api";

function levelText(level) {
  if (level >= 3) return "Severe";
  if (level >= 2) return "Moderate";
  if (level >= 1) return "Light";
  return "Calm";
}

function levelColor(level) {
  if (level >= 3) return "#ef4444";
  if (level >= 2) return "#fb7185";
  if (level >= 1) return "#f59e0b";
  return "#22c55e";
}

function formatTimestamp(value) {
  if (!value) return "No recent updates";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  const now = new Date();
  const diffMs = now - parsed;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return parsed.toLocaleTimeString();
}

function CommonDisplay() {
  useAuth();
  const [update, setUpdate] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState("");
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [audioArmed, setAudioArmed] = useState(false);
  const [audioHint, setAudioHint] = useState("Tap Enable Audio once on mobile to allow voice and alert sounds.");
  const [updateHistory, setUpdateHistory] = useState([]);
  const previousLevelRef = useRef(null);
  const lastAnnouncementRef = useRef(null);
  const previousSirenLevelRef = useRef(null);
  const lastAnnouncementTokenRef = useRef(null);
  const lastAlarmTokenRef = useRef(null);

  useEffect(() => {
    audioAlerts.setTTSEnabled(ttsEnabled);
  }, [ttsEnabled]);

  async function armAudio(message = "Common display audio enabled.") {
    const ok = await audioAlerts.armAudio();
    setAudioArmed(ok);
    setAudioHint(ok ? "Audio is enabled on this device." : "Audio is still blocked. Tap again and ensure the phone is not muted.");
    if (ok) {
      if (audioEnabled) {
        audioAlerts.playChime();
      }
      if (ttsEnabled) {
        audioAlerts.speak(message);
      }
    }
  }

  useEffect(() => {
    const unlock = () => {
      armAudio();
    };

    window.addEventListener("touchstart", unlock, { once: true, passive: true });
    window.addEventListener("click", unlock, { once: true, passive: true });

    return () => {
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("click", unlock);
    };
  }, [audioEnabled, ttsEnabled]);

  useEffect(() => {
    let active = true;
    let pollInterval = null;
    let eventSource = null;

    const applyUpdate = (nextUpdate) => {
      if (!active || !nextUpdate) return;
      setUpdate((prev) => {
        const prevPublishedAt = prev?.publishedAt || prev?.timestamp || null;
        const nextPublishedAt = nextUpdate?.publishedAt || nextUpdate?.timestamp || null;
        const prevAnnouncementToken = prev?.announcementToken || "";
        const prevAlarmToken = prev?.alarmToken || "";
        const nextAnnouncementToken = nextUpdate?.announcementToken || "";
        const nextAlarmToken = nextUpdate?.alarmToken || "";
        if (
          prevPublishedAt &&
          nextPublishedAt &&
          prevPublishedAt === nextPublishedAt &&
          prevAnnouncementToken === nextAnnouncementToken &&
          prevAlarmToken === nextAlarmToken
        ) {
          return prev;
        }
        addToHistory(nextUpdate);
        return nextUpdate;
      });
      setStatus("live");
      setError("");
    };

    const loadUpdate = async () => {
      if (!active) return;
      try {
        const payload = await getSharedDisplayCurrent();
        if (!active) return;
        if (payload.update) {
          applyUpdate(payload.update);
        }
      } catch {
        if (active) {
          setError("Could not load the current shared update.");
          setStatus("offline");
        }
      }
    };

    loadUpdate();
    pollInterval = setInterval(loadUpdate, 3000);

    try {
      eventSource = new EventSource(getSharedDisplayStreamUrl());
      eventSource.onopen = () => {
        if (!active) return;
        setStatus("live");
        setError("");
      };
      eventSource.onmessage = (event) => {
        if (!active) return;
        try {
          const payload = JSON.parse(event.data || "{}");
          const nextUpdate = payload?.update ?? payload;
          if (nextUpdate && typeof nextUpdate === "object" && Object.keys(nextUpdate).length > 0) {
            applyUpdate(nextUpdate);
          }
        } catch (parseError) {
          console.error("Failed to parse shared display event", parseError);
        }
      };
      eventSource.onerror = () => {
        if (!active) return;
        setStatus("reconnecting");
        setError("Reconnecting to live feed...");
      };
    } catch {
      if (active) {
        setStatus("offline");
        setError("Live stream unavailable. Using periodic refresh.");
      }
    }

    return () => {
      active = false;
      if (pollInterval) clearInterval(pollInterval);
      if (eventSource) eventSource.close();
    };
  }, []);

  function addToHistory(newUpdate) {
    setUpdateHistory((prev) => {
      const historyEntry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        currentLevel: Number(newUpdate?.currentLevel ?? 0),
        predictedLevel: Number(newUpdate?.predictedLevel ?? 0),
        confidence: Number(newUpdate?.confidence ?? 0),
        message: newUpdate?.message || "",
        action: newUpdate?.action || "",
        callsign: newUpdate?.callsign || "N/A"
      };

      return [historyEntry, ...prev].slice(0, 20);
    });
  }

  const severity = useMemo(() => {
    const currentLevel = Number(update?.currentLevel ?? 0);
    const predictedLevel = Number(update?.predictedLevel ?? 0);
    return Math.max(currentLevel, predictedLevel);
  }, [update]);

  useEffect(() => {
    if (!update) return;

    const currentLevel = Number(update?.currentLevel ?? 0);
    const predictedLevel = Number(update?.predictedLevel ?? 0);
    const maxLevel = Math.max(currentLevel, predictedLevel);
    const announcementToken = update?.announcementToken || null;
    const alarmToken = update?.alarmToken || null;

    if (ttsEnabled && audioArmed && announcementToken && announcementToken !== lastAnnouncementTokenRef.current) {
      // Pilot custom broadcast — use TTS (dynamic text, can't pre-generate)
      audioAlerts.announceCustomPA(update?.announcement || update?.message || "Pilot broadcast update.", maxLevel);
      lastAnnouncementTokenRef.current = announcementToken;
      lastAnnouncementRef.current = Date.now();
    }

    if (audioEnabled && audioArmed && alarmToken && alarmToken !== lastAlarmTokenRef.current) {
      const alarmType = update?.alarmType || "chime";
      if (alarmType === "siren") {
        audioAlerts.playSiren(2.5);
      } else if (alarmType === "buzzer") {
        audioAlerts.playBuzzer(2);
      } else {
        audioAlerts.playChime();
      }
      lastAlarmTokenRef.current = alarmToken;
    }

    if (maxLevel !== previousLevelRef.current) {
      const now = Date.now();
      const lastAnnouncement = lastAnnouncementRef.current || 0;

      if (now - lastAnnouncement > 3000 && ttsEnabled && audioArmed) {
        let announceText = "";

        if (maxLevel === 0) {
          announceText = "Ladies and gentlemen, we are now cruising through smooth conditions. You are free to move about the cabin.";
        } else if (maxLevel === 1) {
          announceText = "Ladies and gentlemen, this is your cabin crew. We are currently experiencing light turbulence. We request that you return to your seats and fasten your seatbelts as a precaution.";
        } else if (maxLevel === 2) {
          announceText = "Ladies and gentlemen, this is your captain speaking. We are encountering moderate turbulence. Please return to your seats immediately and ensure your seatbelts are securely fastened. Cabin crew, please be seated.";
        } else if (maxLevel === 3) {
          announceText = "Attention all passengers. This is an urgent message from your captain. We are experiencing severe turbulence. All passengers must remain seated with seatbelts tightly fastened. Do not attempt to move about the cabin. Cabin crew, secure yourselves immediately.";
        }

        if (announceText) {
          // Standard level announcement — plays pre-generated MP3 (same on all devices)
          audioAlerts.announceLevelPA(maxLevel);
          lastAnnouncementRef.current = now;
        }
      }

      if (audioEnabled && audioArmed) {
        if (maxLevel === 1) {
          audioAlerts.playChime();
        } else if (maxLevel === 2) {
          audioAlerts.playBuzzer(2);
        }
      }

      if (maxLevel === 3 && previousSirenLevelRef.current !== 3) {
        if (audioEnabled && audioArmed) audioAlerts.startContinuousSiren();
      } else if (maxLevel < 3 && previousSirenLevelRef.current === 3) {
        audioAlerts.stopContinuousSiren();
      }

      previousLevelRef.current = maxLevel;
      previousSirenLevelRef.current = maxLevel;
    }
  }, [update, audioEnabled, ttsEnabled, audioArmed]);

  if (severity === 3 && update) {
    return (
      <div className="cabin-alert-full-screen" onClick={() => armAudio("Severe turbulence screen audio enabled.")}>
        <div className="cabin-alert-backdrop" />
        <div className="cabin-alert-content">
          <div className="cabin-alert-icon">??</div>
          <h1 className="cabin-alert-title">SEVERE TURBULENCE</h1>
          <p className="cabin-alert-message">{update?.message || "Severe turbulence alert"}</p>
          <div className="cabin-alert-action">
            <p className="action-text">{update?.action || "Secure Immediately"}</p>
            <div className="action-indicator">
              <div className="pulse-ring" />
              <div className="pulse-ring" style={{ animationDelay: "0.4s" }} />
              <div className="pulse-ring" style={{ animationDelay: "0.8s" }} />
            </div>
          </div>
          <div className="alert-details">
            <div className="detail-item">
              <span className="detail-label">Confidence</span>
              <span className="detail-value">{Math.round((update?.confidence ?? 0) * 100)}%</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Last Update</span>
              <span className="detail-value">{formatTimestamp(update?.publishedAt)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cabin-display-shell">
      <section className="cabin-display-hero">
        <div>
          <p className="cabin-display-hero__eyebrow">Passenger Live System</p>
          <h1>Prepared cabin awareness</h1>
          <p>
            A cleaner passenger-facing display that turns pilot updates into clear motion states, seatbelt guidance, and audible caution when needed.
          </p>
        </div>
        <div className="cabin-display-hero__chips">
          <span>{status === "live" ? "Live feed" : "Standby feed"}</span>
          <span>{levelText(severity)} state</span>
          <span>{audioArmed ? "Audio armed" : "Tap to enable audio"}</span>
        </div>
      </section>

      <div className="cabin-display-wrapper" onClick={() => { if (!audioArmed) armAudio(); }}>
      <div className="cabin-control-bar">
        <div className="control-left">
          <h2 className="cabin-title">
            {status === "live" ? "LIVE" : "OFFLINE"} Cabin Display
          </h2>
          <p className="cabin-audio-note">{audioHint}</p>
        </div>
        <div className="control-right">
          <button
            className={`control-btn control-btn--arm ${audioArmed ? "active" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              armAudio();
            }}
            title="Enable audio playback on this device"
          >
            {audioArmed ? "Audio Enabled" : "Enable Audio"}
          </button>
          <button
            className={`control-btn ${ttsEnabled ? "active" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              setTtsEnabled(!ttsEnabled);
            }}
            title="Toggle text-to-speech"
          >
            Voice {ttsEnabled ? "ON" : "OFF"}
          </button>
          <button
            className={`control-btn ${audioEnabled ? "active" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              setAudioEnabled(!audioEnabled);
            }}
            title="Toggle audio alerts"
          >
            Alerts {audioEnabled ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      <section className={`cabin-main-alert severity-${severity}`}>
        <div className="alert-top-section">
          <div className="alert-current">
            <div className="alert-label">Current</div>
            <div className="alert-level">{levelText(Number(update?.currentLevel ?? 0))}</div>
          </div>

          <div className="alert-center">
            <div className="severity-indicator" style={{ borderColor: levelColor(severity) }}>
              <div
                className="severity-fill"
                style={{
                  backgroundColor: levelColor(severity),
                  width: `${(severity / 3) * 100}%`
                }}
              />
            </div>
            <h1 className="alert-main-text" style={{ color: levelColor(severity) }}>
              {levelText(severity)}
            </h1>
            <p className="alert-confidence">
              {Math.round((update?.confidence ?? 0) * 100)}% Confidence
            </p>
          </div>

          <div className="alert-predicted">
            <div className="alert-label">Predicted</div>
            <div className="alert-level">{levelText(Number(update?.predictedLevel ?? 0))}</div>
          </div>
        </div>

        <div className="alert-action-banner" style={{ backgroundColor: `${levelColor(severity)}20` }}>
          <p className="action-message">{update?.action || "Stand by for updates"}</p>
        </div>

        <div className="cabin-event-strip">
          <div className={`cabin-event-chip ${update?.announcement ? "active" : ""}`}>
            Voice: {update?.announcement ? "Broadcast queued" : "Standby"}
          </div>
          <div className={`cabin-event-chip ${update?.alarmType ? "active" : ""}`}>
            Caution: {update?.alarmType ? update.alarmType.toUpperCase() : "Standby"}
          </div>
          <div className={`cabin-event-chip ${audioArmed ? "active" : ""}`}>
            Device audio: {audioArmed ? "Ready" : "Tap enable"}
          </div>
        </div>
      </section>

      <section className="cabin-status-bar">
        <div className="status-item">
          <span className="status-label">Feed Status</span>
          <span className={`status-value ${status}`}>
            {status === "live" ? "LIVE" : status === "reconnecting" ? "RECONNECTING" : "OFFLINE"}
          </span>
        </div>
        <div className="status-item">
          <span className="status-label">Last Update</span>
          <span className="status-value">{formatTimestamp(update?.publishedAt)}</span>
        </div>
        <div className="status-item">
          <span className="status-label">Message</span>
          <span className="status-value">{update?.message || "Waiting for pilot update..."}</span>
        </div>
      </section>

      {error ? (
        <div className="cabin-error-box">
          <p>{error}</p>
        </div>
      ) : null}

      <section className="cabin-info-footer">
        <div className="info-row">
          <div className="info-box">
            <p className="info-title">Flight Callsign</p>
            <p className="info-value">{(update?.callsign || "N/A").trim() || "N/A"}</p>
          </div>
          <div className="info-box">
            <p className="info-title">Current Severity</p>
            <p className="info-value" style={{ color: levelColor(severity) }}>
              {levelText(severity)}
            </p>
          </div>
          <div className="info-box">
            <p className="info-title">Seatbelt Status</p>
            <p className="info-value">{severity >= 2 ? "REQUIRED" : "NOT REQUIRED"}</p>
          </div>
        </div>
      </section>

      {updateHistory.length > 0 && (
        <section className="cabin-history-section">
          <h2 className="cabin-history-title">Update History</h2>
          <div className="cabin-history-list">
            {updateHistory.map((entry) => {
              const entryLevel = Math.max(entry.currentLevel, entry.predictedLevel);
              return (
                <div key={entry.id} className={`history-item level-${entryLevel}`}>
                  <div className="history-time">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </div>
                  <div className="history-content">
                    <div className="history-level">
                      {levelText(entryLevel)} ({entryLevel}/3)
                    </div>
                    <div className="history-message">{entry.message}</div>
                    <div className="history-confidence">
                      {Math.round(entry.confidence * 100)}% confidence
                    </div>
                  </div>
                  <div className="history-badge" style={{ backgroundColor: levelColor(entryLevel), borderColor: levelColor(entryLevel) }}>
                    {levelText(entryLevel).charAt(0)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
      </div>
    </div>
  );
}

export default CommonDisplay;

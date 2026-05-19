import { motion } from "framer-motion";

export default function FlightCard({
  icao24,
  route,
  status,
  callsign,
  liveActive,
}) {
  return (
    <motion.section
      className={`pilot-flight-card glass-card ${liveActive ? "is-live" : ""}`}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      whileHover={{ scale: 1.01 }}
    >
      <div className="pilot-flight-card__top">
        <div>
          <p className="pilot-card-label">Flight Control</p>
          <h2>{icao24 || "No assignment yet"}</h2>
          <p className="pilot-flight-card__route">{route || "Route provider unavailable"}</p>
        </div>

        <div className="pilot-flight-card__meta">
          <div className="pilot-flight-card__badge">
            {liveActive ? "Live Active" : "Start Monitoring"}
          </div>
          <div className="pilot-flight-card__icon">✈</div>
        </div>
      </div>

      <div className="pilot-flight-card__bottom">
        <div className="pilot-mini-stat">
          <span>Callsign</span>
          <strong>{(callsign || "N/A").trim() || "N/A"}</strong>
        </div>
        <div className="pilot-mini-stat">
          <span>Status</span>
          <strong>{status}</strong>
        </div>
      </div>
    </motion.section>
  );
}

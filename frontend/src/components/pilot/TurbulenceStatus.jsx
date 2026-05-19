import { motion } from "framer-motion";

const statusMap = {
  Calm: "#22c55e",
  Light: "#f59e0b",
  Moderate: "#f97316",
  Severe: "#ef4444",
};

export default function TurbulenceStatus({ levelLabel, currentLevel, predictedLevel }) {
  const accent = statusMap[levelLabel] || "#22c55e";
  const isEscalated = levelLabel === "Moderate" || levelLabel === "Severe";

  return (
    <motion.section
      className={`pilot-status-card glass-card ${isEscalated ? "is-escalated" : ""}`}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: "easeOut", delay: 0.05 }}
    >
      <div className="pilot-status-card__header">
        <div>
          <p className="pilot-card-label">Live Turbulence Status</p>
          <h3 style={{ color: accent }}>{levelLabel}</h3>
        </div>
        <div className="pilot-status-card__signal" style={{ "--pilot-accent": accent }} />
      </div>

      <div className="pilot-status-card__levels">
        <div className="pilot-status-card__tile">
          <span>Current</span>
          <strong>{currentLevel}</strong>
        </div>
        <div className="pilot-status-card__tile">
          <span>Predicted</span>
          <strong>{predictedLevel}</strong>
        </div>
      </div>
    </motion.section>
  );
}

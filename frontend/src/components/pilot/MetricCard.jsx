import { motion } from "framer-motion";

export default function MetricCard({ icon, label, value, hint }) {
  return (
    <motion.article
      className="pilot-metric-card glass-card"
      whileHover={{ scale: 1.02, y: -2 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
    >
      <div className="pilot-metric-card__icon">{icon}</div>
      <div className="pilot-metric-card__content">
        <p className="pilot-card-label">{label}</p>
        <h3>{value}</h3>
        <span>{hint}</span>
      </div>
    </motion.article>
  );
}

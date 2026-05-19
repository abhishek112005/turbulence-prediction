import { motion } from "framer-motion";

export default function PredictionCard({ label, severity, confidence, tone }) {
  return (
    <motion.article
      className={`pilot-prediction-card glass-card tone-${tone}`}
      whileHover={{ scale: 1.02 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
    >
      <div className="pilot-prediction-card__head">
        <span>{label}</span>
        <strong>{severity}</strong>
      </div>
      <div className="pilot-prediction-card__badge">{confidence}</div>
    </motion.article>
  );
}

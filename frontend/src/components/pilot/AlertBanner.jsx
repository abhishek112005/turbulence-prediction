import { motion } from "framer-motion";

export default function AlertBanner({ show, title, message }) {
  if (!show) {
    return null;
  }

  return (
    <motion.section
      className="pilot-alert-banner"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <div className="pilot-alert-banner__icon">⚠</div>
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
    </motion.section>
  );
}

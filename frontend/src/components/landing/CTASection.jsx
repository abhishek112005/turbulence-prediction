import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { fadeUp } from "./SectionShell";

export default function CTASection({ title, description, actionHref, actionLabel, isInternal = false }) {
  return (
    <motion.div className="final-cta glass-card" {...fadeUp(0.06)}>
      <div className="final-cta__copy">
        <p className="home-eyebrow">Final CTA</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {isInternal ? (
        <Link to={actionHref} className="home-btn home-btn--primary">{actionLabel}</Link>
      ) : (
        <a href={actionHref} className="home-btn home-btn--primary">{actionLabel}</a>
      )}
    </motion.div>
  );
}

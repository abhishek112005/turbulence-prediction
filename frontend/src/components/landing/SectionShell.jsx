import { motion } from "framer-motion";

const viewport = { once: true, amount: 0.25 };

export function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 28 },
    whileInView: { opacity: 1, y: 0 },
    viewport,
    transition: { duration: 0.65, ease: "easeOut", delay },
  };
}

export default function SectionShell({ eyebrow, title, subtitle, align = "left", children }) {
  return (
    <div className={`home-shell home-shell--${align}`}>
      {(eyebrow || title || subtitle) ? (
        <motion.div className={`home-heading home-heading--${align}`} {...fadeUp(0)}>
          {eyebrow ? <p className="home-eyebrow">{eyebrow}</p> : null}
          {title ? <h2 className="home-title">{title}</h2> : null}
          {subtitle ? <p className="home-subtitle">{subtitle}</p> : null}
        </motion.div>
      ) : null}
      {children}
    </div>
  );
}

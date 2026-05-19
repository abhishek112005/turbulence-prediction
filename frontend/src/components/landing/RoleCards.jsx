import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import SectionShell, { fadeUp } from "./SectionShell";

const roles = [
  {
    key: "pilot",
    title: "Pilot",
    text: "Monitors turbulence, validates conditions, and triggers live cabin-facing alerts.",
    href: "/pilot",
  },
  {
    key: "admin",
    title: "Admin",
    text: "Manages user access, system mapping, and oversight of the operational pipeline.",
    href: "/admin",
  },
  {
    key: "passenger",
    title: "Passenger",
    text: "Receives clear real-time updates through the shared live display experience.",
    href: "/common-display",
  },
];

export default function RoleCards({ isAuthenticated, role }) {
  return (
    <SectionShell
      eyebrow="Role-Based System"
      title="Three focused views, one intelligence layer"
      subtitle="Each user sees only what they need, while the platform keeps the system narrative connected."
      align="center"
    >
      <div className="role-grid">
        {roles.map((item, index) => {
          const actionHref = isAuthenticated && role === item.key ? item.href : item.key === "passenger" ? "/common-display" : "/login";
          const actionLabel = isAuthenticated && role === item.key ? `Open ${item.title}` : item.key === "passenger" ? "Open Live Display" : `Sign in as ${item.title}`;

          return (
            <motion.article key={item.key} className="glass-card role-card" {...fadeUp(index * 0.08)}>
              <div className={`role-card__icon role-card__icon--${item.key}`}>{item.title.charAt(0)}</div>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <Link to={actionHref} className="home-btn home-btn--secondary home-btn--compact">
                {actionLabel}
              </Link>
            </motion.article>
          );
        })}
      </div>
    </SectionShell>
  );
}

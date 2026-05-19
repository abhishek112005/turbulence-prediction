import { motion } from "framer-motion";
import SectionShell, { fadeUp } from "./SectionShell";

const levels = [
  { label: "Calm", value: 24, tone: "calm" },
  { label: "Light", value: 46, tone: "light" },
  { label: "Moderate", value: 74, tone: "moderate" },
  { label: "Severe", value: 92, tone: "severe" },
];

export default function LiveDemo() {
  return (
    <SectionShell
      eyebrow="Live Demo"
      title="System feeling, not just system words"
      subtitle="This section is designed to feel like an active operational surface during a demo, with severity motion, alert escalation, and flight progress in one view."
    >
      <div className="demo-grid">
        <motion.div className="glass-card live-demo live-demo--visual" {...fadeUp(0.06)}>
          <div className="live-demo__header">
            <div>
              <p className="home-mini-label">Flight Corridor</p>
              <h3>Alert simulation</h3>
            </div>
            <span className="live-demo__status">Live</span>
          </div>

          <div className="live-demo__runway">
            <div className="live-demo__track" />
            <div className="live-demo__craft">✈</div>
            <div className="live-demo__pulse live-demo__pulse--one" />
            <div className="live-demo__pulse live-demo__pulse--two" />
            <div className="live-demo__label">Alert triggered</div>
          </div>

          <div className="live-demo__footer">
            <div className="live-demo__chip">Pilot broadcast</div>
            <div className="live-demo__chip live-demo__chip--danger">Seatbelt caution</div>
            <div className="live-demo__chip live-demo__chip--good">Cabin prepared</div>
          </div>
        </motion.div>

        <motion.div className="glass-card live-demo live-demo--levels" {...fadeUp(0.14)}>
          <div className="live-demo__header">
            <div>
              <p className="home-mini-label">Severity Surface</p>
              <h3>Turbulence levels</h3>
            </div>
          </div>

          <div className="live-bars">
            {levels.map((level, index) => (
              <motion.div key={level.label} className="live-bars__row" {...fadeUp(0.18 + index * 0.04)}>
                <div className="live-bars__label">
                  <span>{level.label}</span>
                  <strong>{level.value}%</strong>
                </div>
                <div className="live-bars__track">
                  <motion.div
                    className={`live-bars__fill live-bars__fill--${level.tone}`}
                    initial={{ width: 0 }}
                    whileInView={{ width: `${level.value}%` }}
                    viewport={{ once: true, amount: 0.5 }}
                    transition={{ duration: 0.9, delay: 0.15 + index * 0.08, ease: "easeOut" }}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </SectionShell>
  );
}

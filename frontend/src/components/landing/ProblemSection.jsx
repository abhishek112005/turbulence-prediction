import { motion } from "framer-motion";
import SectionShell, { fadeUp } from "./SectionShell";

const points = [
  {
    icon: "⏱",
    title: "No early warning system",
    text: "By the time cabin motion is felt, the safest moment to prepare has already passed.",
  },
  {
    icon: "📡",
    title: "Pilots rely on delayed reports",
    text: "Fragmented reports and passive weather awareness create a lag between risk and response.",
  },
  {
    icon: "⚠",
    title: "Passengers react too late",
    text: "Seatbelt action, crew preparation, and communication happen after the discomfort begins.",
  },
];

export default function ProblemSection() {
  return (
    <section className="home-section" id="problem">
      <SectionShell
        eyebrow="Problem"
        title="What happens today?"
        subtitle="Turbulence events are rarely defined by the turbulence alone. The real breakdown is how late the awareness reaches the cockpit and the cabin."
      >
        <div className="problem-grid">
          <motion.div className="problem-scene" {...fadeUp(0.1)}>
            <div className="problem-scene__frame">
              <div className="problem-scene__cloud problem-scene__cloud--one" />
              <div className="problem-scene__cloud problem-scene__cloud--two" />
              <div className="problem-scene__cloud problem-scene__cloud--three" />
              <div className="problem-scene__turbulence" />
              <div className="problem-scene__plane">✈</div>
              <div className="problem-scene__warning">Cabin reacts here</div>
            </div>
          </motion.div>

          <div className="problem-list">
            {points.map((item, index) => (
              <motion.article key={item.title} className="glass-card problem-card" {...fadeUp(0.14 + index * 0.08)}>
                <div className="problem-card__icon">{item.icon}</div>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </SectionShell>
    </section>
  );
}

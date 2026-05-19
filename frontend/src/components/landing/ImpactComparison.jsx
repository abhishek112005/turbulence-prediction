import { motion } from "framer-motion";
import SectionShell, { fadeUp } from "./SectionShell";

const before = ["Sudden turbulence", "Passenger panic", "Reactive response"];
const after = ["Early prediction", "Prepared cabin", "Proactive control"];

export default function ImpactComparison() {
  return (
    <SectionShell
      eyebrow="Impact"
      title="What changes with our system?"
      subtitle="The platform changes the rhythm of response. It moves crews and passengers from surprise into preparation."
      align="center"
    >
      <div className="impact-grid">
        <motion.article className="glass-card impact-card impact-card--before" {...fadeUp(0.06)}>
          <p className="impact-card__eyebrow">Before</p>
          <h3>Reactive cabin experience</h3>
          <ul>
            {before.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </motion.article>

        <motion.article className="glass-card impact-card impact-card--after" {...fadeUp(0.14)}>
          <p className="impact-card__eyebrow">After</p>
          <h3>Predictive control loop</h3>
          <ul>
            {after.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </motion.article>
      </div>
    </SectionShell>
  );
}

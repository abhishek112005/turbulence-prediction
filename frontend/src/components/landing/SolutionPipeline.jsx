import { motion } from "framer-motion";
import SectionShell, { fadeUp } from "./SectionShell";

const steps = [
  { title: "OpenSky", desc: "Live aircraft states", accent: "sky" },
  { title: "ML", desc: "Current + future prediction", accent: "blue" },
  { title: "NOAA", desc: "External validation", accent: "green" },
  { title: "Pilot", desc: "Operational awareness", accent: "amber" },
  { title: "Passenger", desc: "Prepared cabin response", accent: "red" },
];

export default function SolutionPipeline() {
  return (
    <SectionShell
      eyebrow="Solution"
      title="How we solve it"
      subtitle="A single predictive chain connects live telemetry to human action before cabin stress escalates."
      align="center"
    >
      <div className="pipeline">
        {steps.map((step, index) => (
          <motion.div key={step.title} className="pipeline__item-wrap" {...fadeUp(index * 0.08)}>
            <article className={`glass-card pipeline__item pipeline__item--${step.accent}`}>
              <span className="pipeline__step">Stage {index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.desc}</p>
            </article>
            {index < steps.length - 1 ? (
              <div className="pipeline__connector" aria-hidden="true">
                <span />
              </div>
            ) : null}
          </motion.div>
        ))}
      </div>
    </SectionShell>
  );
}

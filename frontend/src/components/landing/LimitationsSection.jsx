import { motion } from "framer-motion";
import SectionShell, { fadeUp } from "./SectionShell";

const limitations = [
  {
    title: "Reactive systems",
    text: "Most workflows begin after turbulence is already experienced, which leaves little room for calm preparation.",
  },
  {
    title: "Fragmented data sources",
    text: "Flight telemetry, route context, model output, and external weather references rarely arrive in one coordinated view.",
  },
  {
    title: "No real-time communication",
    text: "Even when awareness exists, pilots and passengers are often not synchronized through the same alert surface.",
  },
];

export default function LimitationsSection() {
  return (
    <section className="home-section home-section--tight">
      <SectionShell
        eyebrow="Limitations"
        title="Why current systems fail"
        subtitle="The issue is not lack of data. It is the lack of a clean, real-time decision chain."
        align="center"
      >
        <div className="limitation-grid">
          {limitations.map((item, index) => (
            <motion.article key={item.title} className="glass-card limitation-card" {...fadeUp(index * 0.08)}>
              <div className="limitation-card__index">0{index + 1}</div>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </motion.article>
          ))}
        </div>
      </SectionShell>
    </section>
  );
}

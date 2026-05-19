import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import SectionShell, { fadeUp } from "./SectionShell";

function CTA({ href, label, variant = "primary", isInternal = false }) {
  const className = variant === "primary" ? "home-btn home-btn--primary" : "home-btn home-btn--secondary";
  if (isInternal) {
    return <Link to={href} className={className}>{label}</Link>;
  }
  return <a href={href} className={className}>{label}</a>;
}

export default function HeroSection({
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  isInternalPrimary = false,
}) {
  return (
    <section className="home-hero">
      <div className="home-hero__sky" aria-hidden="true">
        <div className="home-hero__orb home-hero__orb--one" />
        <div className="home-hero__orb home-hero__orb--two" />
        <div className="home-hero__orb home-hero__orb--three" />
        <div className="home-hero__grid" />
        <div className="home-hero__trail" />
        <div className="home-hero__plane">✈</div>
        <div className="home-hero__particles">
          {Array.from({ length: 14 }).map((_, index) => (
            <span key={index} style={{ "--p": index }} />
          ))}
        </div>
      </div>

      <SectionShell align="left">
        <div className="home-hero__content">
          <motion.div className="home-hero__copy" {...fadeUp(0)}>
            <p className="home-eyebrow">Predictive Aviation Awareness</p>
            <h1 className="home-hero__title">
              Turbulence isn&apos;t the problem. <span>Late awareness is.</span>
            </h1>
            <p className="home-hero__lead">
              Today, pilots and passengers react after turbulence hits. We help predict it before it happens.
            </p>
            <div className="home-hero__actions">
              <CTA href={primaryHref} label={primaryLabel} variant="primary" isInternal={isInternalPrimary} />
              <CTA href={secondaryHref} label={secondaryLabel} variant="secondary" />
            </div>
            <div className="home-hero__meta">
              <div className="home-stat-chip">
                <strong>OpenSky</strong>
                <span>Live telemetry backbone</span>
              </div>
              <div className="home-stat-chip">
                <strong>ML + NOAA</strong>
                <span>Prediction and external validation</span>
              </div>
              <div className="home-stat-chip">
                <strong>Pilot to Passenger</strong>
                <span>One aligned alert flow</span>
              </div>
            </div>
          </motion.div>

          <motion.div className="home-hero__dashboard" {...fadeUp(0.12)}>
            <div className="hero-panel hero-panel--top">
              <div className="hero-panel__pill">Live System Snapshot</div>
              <h3>Awareness layer before impact</h3>
              <p>Telemetry, prediction, validation, and cabin alerts in one operational chain.</p>
            </div>

            <div className="hero-visual">
              <div className="hero-visual__route">
                <div className="hero-visual__point hero-visual__point--origin">Origin</div>
                <div className="hero-visual__line" />
                <div className="hero-visual__craft">✈</div>
                <div className="hero-visual__alert">Alert Triggered</div>
                <div className="hero-visual__point hero-visual__point--arrival">Arrival</div>
              </div>

              <div className="hero-visual__cards">
                <div className="hero-mini-card">
                  <span>Current</span>
                  <strong>Light</strong>
                </div>
                <div className="hero-mini-card">
                  <span>Predicted</span>
                  <strong>Moderate</strong>
                </div>
                <div className="hero-mini-card hero-mini-card--accent">
                  <span>Cabin State</span>
                  <strong>Prepared</strong>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </SectionShell>
    </section>
  );
}

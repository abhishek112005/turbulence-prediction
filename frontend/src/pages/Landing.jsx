import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import HeroSection from "../components/landing/HeroSection";
import ProblemSection from "../components/landing/ProblemSection";
import SolutionPipeline from "../components/landing/SolutionPipeline";
import LiveDemo from "../components/landing/LiveDemo";
import ImpactComparison from "../components/landing/ImpactComparison";
import RoleCards from "../components/landing/RoleCards";
import CTASection from "../components/landing/CTASection";
import LimitationsSection from "../components/landing/LimitationsSection";

function roleToPath(role) {
  if (role === "pilot") return "/pilot";
  if (role === "admin") return "/admin";
  if (role === "passenger") return "/common-display";
  return "/";
}

export default function Landing() {
  const { isAuthenticated, user } = useAuth();

  useEffect(() => {
    if (window.location.hash) {
      const id = window.location.hash.replace("#", "");
      const target = document.getElementById(id);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, []);

  return (
    <div className="home-page">
      <HeroSection
        primaryHref={isAuthenticated ? roleToPath(user?.role) : "/common-display"}
        primaryLabel={isAuthenticated ? "Explore Live System" : "Explore Live System"}
        secondaryHref="#solution"
        secondaryLabel="See How It Works"
        isInternalPrimary
      />

      <ProblemSection />
      <LimitationsSection />

      <section className="home-section home-section--solution" id="solution">
        <SolutionPipeline />
      </section>

      <section className="home-section">
        <LiveDemo />
      </section>

      <section className="home-section">
        <ImpactComparison />
      </section>

      <section className="home-section">
        <RoleCards isAuthenticated={isAuthenticated} role={user?.role} />
      </section>

      <section className="home-section home-section--final-cta">
        <CTASection
          title="From reaction -> prediction"
          description="Bring pilots, admins, and passengers onto one calmer timeline with earlier awareness and cleaner coordination."
          actionHref={isAuthenticated ? roleToPath(user?.role) : "/common-display"}
          actionLabel="View Live System"
          isInternal
        />
      </section>

      <footer className="home-footer">
        <div>
          <p className="home-footer__brand">Turbulence Prediction Platform</p>
          <p className="home-footer__sub">
            Real-time flight telemetry, predictive modeling, and shared alerting designed for high-clarity demos.
          </p>
        </div>
        <div className="home-footer__links">
          <Link to="/">Home</Link>
          <Link to="/common-display">Live System</Link>
          {!isAuthenticated ? <Link to="/login">Login</Link> : <Link to={roleToPath(user?.role)}>Dashboard</Link>}
        </div>
      </footer>
    </div>
  );
}

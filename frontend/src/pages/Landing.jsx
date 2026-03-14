import { Link } from "react-router-dom";

function Landing() {
  return (
    <>
      <section className="hero">
        <h1>AI Flight Turbulence Prediction Dashboard</h1>
        <p className="hero-subline">
          Role-based portal for passengers, pilots, and flight operations teams.
        </p>
        <div className="insight-strip">
          <span className="insight-pill">Live OpenSky tracking</span>
          <span className="insight-pill">ML turbulence prediction</span>
          <span className="insight-pill">Protected role-based access</span>
        </div>
      </section>

      <section className="panel landing-grid">
        <article>
          <h2>Passenger Portal</h2>
          <p>View your flight status, route, and turbulence prediction snapshot.</p>
        </article>
        <article>
          <h2>Pilot + Admin Portals</h2>
          <p>Pilot gets operational flight details. Admin gets full fleet analytics.</p>
        </article>
      </section>

      <section className="panel">
        <h2>Start</h2>
        <div className="toolbar">
          <Link className="action-btn" to="/signup">
            Signup with Role
          </Link>
          <Link className="action-btn muted" to="/login">
            Login
          </Link>
        </div>
      </section>
    </>
  );
}

export default Landing;

import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function roleToPath(role) {
  if (role === "passenger") {
    return "/passenger";
  }
  if (role === "pilot") {
    return "/pilot";
  }
  if (role === "admin") {
    return "/admin";
  }
  return "/";
}

function Landing() {
  const { isAuthenticated, user } = useAuth();

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
        <h2>{isAuthenticated ? "Continue" : "Start"}</h2>
        <div className="toolbar">
          {isAuthenticated ? (
            <Link className="action-btn" to={roleToPath(user?.role)}>
              Go to Dashboard
            </Link>
          ) : (
            <>
              <Link className="action-btn" to="/signup">
                Signup with Role
              </Link>
              <Link className="action-btn muted" to="/login">
                Login
              </Link>
            </>
          )}
        </div>
      </section>
    </>
  );
}

export default Landing;

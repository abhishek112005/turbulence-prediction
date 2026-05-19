import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { signupWithGoogle } from "../services/api";

const GOOGLE_SCRIPT_ID = "google-identity-services-signup";

function roleToPath(role) {
  if (role === "passenger") {
    return "/common-display";
  }
  if (role === "pilot") {
    return "/pilot";
  }
  if (role === "admin") {
    return "/admin";
  }
  return "/";
}

function Signup() {
  const navigate = useNavigate();
  const { isAuthenticated, login } = useAuth();
  const [error, setError] = useState("");
  const [selectedRole, setSelectedRole] = useState("passenger");
  const [googleReady, setGoogleReady] = useState(false);
  const googleButtonRef = useRef(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!googleClientId) {
      return;
    }

    function initializeGoogle() {
      if (!window.google?.accounts?.id || !googleButtonRef.current) {
        return;
      }

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response) => {
          if (!response?.credential) {
            setError("Google response missing credential token.");
            return;
          }
          await finishSignup(response.credential);
        }
      });

      window.google.accounts.id.renderButton(googleButtonRef.current, {
        type: "standard",
        shape: "pill",
        theme: "outline",
        text: "continue_with",
        width: 260
      });

      setGoogleReady(true);
    }

    if (window.google?.accounts?.id) {
      initializeGoogle();
      return;
    }

    const existingScript = document.getElementById(GOOGLE_SCRIPT_ID);
    if (existingScript) {
      existingScript.addEventListener("load", initializeGoogle, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_SCRIPT_ID;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initializeGoogle;
    document.body.appendChild(script);
  }, [googleClientId, selectedRole]);

  async function finishSignup(googleToken) {
    setError("");
    try {
      const payload = await signupWithGoogle(googleToken, selectedRole);
      login(payload);
      navigate(roleToPath(payload.role), { replace: true });
    } catch (signupError) {
      setError(signupError.message || "Unable to signup right now.");
    }
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <section className="auth-stage">
      <div className="auth-stage__backdrop" aria-hidden="true">
        <div className="auth-stage__orb auth-stage__orb--one" />
        <div className="auth-stage__orb auth-stage__orb--two" />
      </div>

      <div className="auth-layout">
        <article className="auth-story glass-card">
          <p className="auth-story__eyebrow">Role Setup</p>
          <h1>Choose the view you belong to.</h1>
          <p className="auth-story__lead">
            The platform stays one system underneath, but each role enters with a different responsibility and a cleaner interface.
          </p>

          <div className="auth-role-preview">
            <div className={`auth-role-pill ${selectedRole === "passenger" ? "active" : ""}`}>Passenger</div>
            <div className={`auth-role-pill ${selectedRole === "pilot" ? "active" : ""}`}>Pilot</div>
            <div className={`auth-role-pill ${selectedRole === "admin" ? "active" : ""}`}>Admin</div>
          </div>
        </article>

        <section className="panel auth-card auth-card--premium">
          <p className="auth-card__eyebrow">Signup</p>
          <h2>Create your access</h2>
          <p className="auth-card__copy">Select your role, then continue with Google OAuth.</p>

          <label className="field-label auth-field-label" htmlFor="role-select">
            Role
          </label>
          <div className="auth-select-shell">
            <select
              id="role-select"
              className="input auth-input auth-select"
              value={selectedRole}
              onChange={(event) => setSelectedRole(event.target.value)}
            >
              <option value="passenger">Passenger</option>
              <option value="pilot">Pilot</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {googleClientId ? (
            <div className="google-wrap auth-google-wrap">
              <div className="auth-google-shell">
                <div className="auth-google-button-host" ref={googleButtonRef} />
              </div>
              {!googleReady ? <p className="meta-line">Loading Google sign-up...</p> : null}
            </div>
          ) : (
            <p className="error-line">
              Missing <code>VITE_GOOGLE_CLIENT_ID</code>. Add it to use one-click Google signup.
            </p>
          )}
          <div className="toolbar auth-toolbar">
            <Link className="action-btn auth-action-btn auth-action-btn--secondary" to="/login">
              Already have account? Login
            </Link>
          </div>

          {error ? <p className="error-line">{error}</p> : null}
        </section>
      </div>
    </section>
  );
}

export default Signup;

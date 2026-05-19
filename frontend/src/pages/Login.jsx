import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { authenticateWithGoogle } from "../services/api";

const GOOGLE_SCRIPT_ID = "google-identity-services";

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

function Login() {
  const navigate = useNavigate();
  const { isAuthenticated, login } = useAuth();
  const [error, setError] = useState("");
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
          await finishLogin(response.credential);
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
  }, [googleClientId]);

  async function finishLogin(googleToken) {
    setError("");
    try {
      const payload = await authenticateWithGoogle(googleToken);
      login(payload);
      navigate(roleToPath(payload.role), { replace: true });
    } catch (authError) {
      setError(authError.message || "Unable to login right now.");
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
          <p className="auth-story__eyebrow">Secure Access</p>
          <h1>Enter the turbulence control layer.</h1>
          <p className="auth-story__lead">
            Sign in once with Google and move directly into the role-specific system view designed for pilots, admins, and passengers.
          </p>

          <div className="auth-story__highlights">
            <div className="auth-story__item">
              <strong>Pilot</strong>
              <span>Assigned flight monitoring and live alert controls.</span>
            </div>
            <div className="auth-story__item">
              <strong>Admin</strong>
              <span>System oversight, user management, and fleet analytics.</span>
            </div>
            <div className="auth-story__item">
              <strong>Passenger</strong>
              <span>Shared live display with prepared cabin-facing updates.</span>
            </div>
          </div>
        </article>

        <section className="panel auth-card auth-card--premium">
          <p className="auth-card__eyebrow">Login</p>
          <h2>Continue with Google</h2>
          <p className="auth-card__copy">Use your authorized account to open the correct operational dashboard automatically.</p>

          {googleClientId ? (
            <div className="google-wrap auth-google-wrap">
              <div className="auth-google-shell">
                <div className="auth-google-button-host" ref={googleButtonRef} />
              </div>
              {!googleReady ? <p className="meta-line">Loading Google sign-in...</p> : null}
            </div>
          ) : (
            <p className="error-line">
              Missing <code>VITE_GOOGLE_CLIENT_ID</code>. Add it to use one-click Google login.
            </p>
          )}

          <div className="toolbar auth-toolbar">
            <Link className="action-btn auth-action-btn auth-action-btn--primary" to="/signup">
              New user? Signup
            </Link>
            <Link className="action-btn auth-action-btn auth-action-btn--secondary" to="/">
              Back to Landing
            </Link>
          </div>

          {error ? <p className="error-line">{error}</p> : null}
        </section>
      </div>
    </section>
  );
}

export default Login;

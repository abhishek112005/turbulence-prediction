import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { signupWithGoogle } from "../services/api";

const GOOGLE_SCRIPT_ID = "google-identity-services-signup";

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
    <section className="panel auth-card">
      <h2>Signup</h2>
      <p>Select your role, then continue with Google OAuth.</p>

      <label className="field-label" htmlFor="role-select">
        Role
      </label>
      <select
        id="role-select"
        className="input"
        value={selectedRole}
        onChange={(event) => setSelectedRole(event.target.value)}
      >
        <option value="passenger">Passenger</option>
        <option value="pilot">Pilot</option>
        <option value="admin">Admin</option>
      </select>

      {googleClientId ? (
        <div className="google-wrap">
          <div ref={googleButtonRef} />
          {!googleReady ? <p className="meta-line">Loading Google sign-up...</p> : null}
        </div>
      ) : (
        <p className="error-line">
          Missing <code>VITE_GOOGLE_CLIENT_ID</code>. Add it to use one-click Google signup.
        </p>
      )}
      <div className="toolbar">
        <Link className="action-btn muted" to="/login">
          Already have account? Login
        </Link>
      </div>

      {error ? <p className="error-line">{error}</p> : null}
    </section>
  );
}

export default Signup;

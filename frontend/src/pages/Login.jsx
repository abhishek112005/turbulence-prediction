import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { authenticateWithGoogle } from "../services/api";

const GOOGLE_SCRIPT_ID = "google-identity-services";

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
    <section className="panel auth-card">
      <h2>Login</h2>
      <p>Authenticate with Google. Backend validates token and returns role + JWT.</p>

      {googleClientId ? (
        <div className="google-wrap">
          <div ref={googleButtonRef} />
          {!googleReady ? <p className="meta-line">Loading Google sign-in...</p> : null}
        </div>
      ) : (
        <p className="error-line">
          Missing <code>VITE_GOOGLE_CLIENT_ID</code>. Add it to use one-click Google login.
        </p>
      )}
      <div className="toolbar">
        <Link className="action-btn" to="/signup">
          New user? Signup
        </Link>
        <Link className="action-btn muted" to="/">
          Back to Landing
        </Link>
      </div>

      {error ? <p className="error-line">{error}</p> : null}
    </section>
  );
}

export default Login;

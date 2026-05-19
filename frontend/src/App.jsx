import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { useScrolled } from "./hooks/useScrolled";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import CommonDisplay from "./pages/CommonDisplay";
import PilotDashboard from "./pages/PilotDashboard";
import PilotAlerts from "./pages/PilotAlerts";
import AdminDashboard from "./pages/AdminDashboard";
import ProtectedRoute from "./router/ProtectedRoute";

function AppNavbar({ isLanding }) {
  const { user, isAuthenticated, logout } = useAuth();
  const scrolled = useScrolled(60);
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/");
  }

  const transparent = isLanding && !scrolled;

  return (
    <header className={`app-nav${transparent ? " app-nav--transparent" : ""}${isLanding ? " app-nav--fixed" : ""}`}>
      <div className="app-nav__inner">
        <Link className="app-nav__brand" to="/">
          <svg className="app-nav__icon" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/>
          </svg>
          <span className="app-nav__brand-text">Turbulence Prediction</span>
        </Link>

        <nav className="nav-links">
          <Link to="/">Home</Link>
          {isAuthenticated && user?.role === "passenger" && <Link to="/common-display">Live Display</Link>}
          {!isAuthenticated && <Link to="/signup">Signup</Link>}
          {!isAuthenticated && <Link to="/login">Login</Link>}
          {user?.role === "pilot" && <Link to="/pilot">Pilot</Link>}
          {user?.role === "pilot" && <Link to="/pilot-alerts">Alerts</Link>}
          {user?.role === "admin" && <Link to="/admin">Admin</Link>}
        </nav>

        <div className="nav-user">
          {isAuthenticated ? (
            <>
              <span>{user.email}</span>
              {user.role && (
                <span className={`nav-role-pill nav-role-${user.role}`}>
                  {user.role}
                </span>
              )}
              <button className="link-btn" onClick={handleLogout}>
                Logout
              </button>
            </>
          ) : (
            <span className="nav-guest">Guest</span>
          )}
        </div>
      </div>
    </header>
  );
}

function AppRoutes() {
  const location = useLocation();
  const isLanding = location.pathname === "/";

  return (
    <>
      <AppNavbar isLanding={isLanding} />
      <main className={isLanding ? "lp-root" : "app-shell"}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route
            path="/common-display"
            element={<CommonDisplay />}
          />
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/pilot"
            element={
              <ProtectedRoute role="pilot">
                <PilotDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pilot-alerts"
            element={
              <ProtectedRoute role="pilot">
                <PilotAlerts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute role="admin">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import PassengerDashboard from "./pages/PassengerDashboard";
import PilotDashboard from "./pages/PilotDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import ProtectedRoute from "./router/ProtectedRoute";

function AppNavbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <header className="app-nav">
      <Link className="brand-link" to="/">
        Turbulence Prediction Dashboard
      </Link>

      <nav className="nav-links">
        <Link to="/">Landing</Link>
        {!isAuthenticated ? <Link to="/signup">Signup</Link> : null}
        {!isAuthenticated ? <Link to="/login">Login</Link> : null}
        {user?.role === "passenger" ? <Link to="/passenger">Passenger</Link> : null}
        {user?.role === "pilot" ? <Link to="/pilot">Pilot</Link> : null}
        {user?.role === "admin" ? <Link to="/admin">Admin</Link> : null}
      </nav>

      <div className="nav-user">
        {isAuthenticated ? (
          <>
            <span>{user.email}</span>
            <button className="link-btn" onClick={handleLogout}>
              Logout
            </button>
          </>
        ) : (
          <span>Guest</span>
        )}
      </div>
    </header>
  );
}

function AppRoutes() {
  return (
    <>
      <AppNavbar />
      <main className="app-shell">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />

          <Route
            path="/passenger"
            element={
              <ProtectedRoute role="passenger">
                <PassengerDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pilot"
            element={
              <ProtectedRoute role="pilot">
                <PilotDashboard />
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

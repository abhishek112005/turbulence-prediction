import { createContext, useContext, useMemo, useState } from "react";

const AUTH_STORAGE_KEY = "turbulence_auth_v1";
const AuthContext = createContext(null);

function readStoredAuth() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return { user: null, token: "" };
    }

    const parsed = JSON.parse(raw);
    if (!parsed?.user) {
      return { user: null, token: "" };
    }

    return {
      user: parsed.user,
      token: parsed.token || ""
    };
  } catch {
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // ignore
    }
    return { user: null, token: "" };
  }
}

export function AuthProvider({ children }) {
  const [storedAuth] = useState(() => readStoredAuth());
  const [user, setUser] = useState(storedAuth.user);
  const [token, setToken] = useState(storedAuth.token);

  function login(userData) {
    const nextUser = { email: userData.email, role: userData.role };
    const nextToken = userData.token || "";

    setUser(nextUser);
    setToken(nextToken);
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ user: nextUser, token: nextToken })
    );
  }

  function logout() {
    setUser(null);
    setToken("");
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(user),
      login,
      logout
    }),
    [user, token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

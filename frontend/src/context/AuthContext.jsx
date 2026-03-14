import { createContext, useContext, useEffect, useMemo, useState } from "react";

const AUTH_STORAGE_KEY = "turbulence_auth_v1";
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (parsed?.user) {
        setUser(parsed.user);
        setToken(parsed.token || "");
      }
    } catch {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, []);

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

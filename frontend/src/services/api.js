import {
  dashboardSummary,
  turbulenceSplit,
  futureRisk,
  flights
} from "../data/mockData";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getBackendUrl() {
  const hostname = window.location.hostname;
  const isNgrok = hostname.includes("ngrok");
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
  const isPrivateIP = hostname.match(/^192\.168\.|^10\.|^172\.1[6-9]\.|^172\.2[0-9]\.|^172\.3[01]\./) !== null;

  if (isNgrok) {
    return "";
  }

  if (isLocalhost) {
    return "http://localhost:8000";
  }

  if (isPrivateIP) {
    return `http://${hostname}:8000`;
  }

  return window.location.origin;
}

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || getBackendUrl();

export async function getMockDashboardData() {
  await sleep(300);
  return {
    summary: dashboardSummary,
    turbulenceSplit,
    futureRisk,
    flights,
    source: "mock",
    fetchedAt: new Date().toISOString()
  };
}

export async function getLiveDashboardData() {
  const response = await fetch(`${API_BASE_URL}/api/pipeline/run-live?persist_predictions=false`, {
    method: "POST"
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const detail = payload?.detail || `status ${response.status}`;
    throw new Error(`Pipeline fetch failed: ${detail}`);
  }

  return response.json();
}

export async function getLiveFlightData(icao24) {
  const response = await fetch(
    `${API_BASE_URL}/api/pipeline/flight/${encodeURIComponent(icao24)}/live`,
    {
      method: "POST"
    }
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const detail = payload?.detail || `status ${response.status}`;
    throw new Error(`Flight fetch failed: ${detail}`);
  }

  return response.json();
}

export async function getPirepValidation(icao24, currentLevel) {
  const qs = currentLevel != null ? `?current_level=${encodeURIComponent(currentLevel)}` : "";
  return getJson(`${API_BASE_URL}/api/pirep-validate/${encodeURIComponent(icao24)}${qs}`);
}

export async function authenticateWithGoogle(googleToken) {
  const response = await fetch(`${API_BASE_URL}/api/auth/google`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ token: googleToken })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const detail = payload?.detail || `status ${response.status}`;
    throw new Error(`Google login failed: ${detail}`);
  }

  return response.json();
}

export async function signupWithGoogle(googleToken, role) {
  const response = await fetch(`${API_BASE_URL}/api/auth/google-signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ token: googleToken, role })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const detail = payload?.detail || `status ${response.status}`;
    throw new Error(`Google signup failed: ${detail}`);
  }

  return response.json();
}

export async function assignPilotFlight(adminEmail, pilotEmail, icao24) {
  return requestJson(`${API_BASE_URL}/api/pilot/assign-flight`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...adminHeaders(adminEmail)
    },
    body: JSON.stringify({ pilot_email: pilotEmail, icao24 })
  });
}

export async function getPilotFlightAssignment(pilotEmail) {
  return getJson(
    `${API_BASE_URL}/api/pilot/assign-flight/${encodeURIComponent(pilotEmail)}`
  );
}

export async function getSharedDisplayCurrent() {
  return getJson(`${API_BASE_URL}/api/shared-display/current`);
}

export function getSharedDisplayStreamUrl() {
  return `${API_BASE_URL}/api/shared-display/stream`;
}

export async function publishSharedDisplayUpdate(pilotEmail, payload) {
  return requestJson(`${API_BASE_URL}/api/shared-display/publish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Email": String(pilotEmail || "").trim()
    },
    body: JSON.stringify(payload)
  });
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const detail = payload?.detail || `status ${response.status}`;
    throw new Error(detail);
  }
  return response.json();
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const detail = payload?.detail || `status ${response.status}`;
    throw new Error(detail);
  }
  return response.json();
}

function adminHeaders(adminEmail) {
  return {
    "X-User-Email": String(adminEmail || "").trim()
  };
}

export async function getDepartureFlights(airportIcao, begin, end) {
  const query = new URLSearchParams({
    airport: airportIcao,
    begin: String(begin),
    end: String(end)
  });
  return getJson(`${API_BASE_URL}/api/opensky/flights/departure?${query.toString()}`);
}

export async function getFlightTrack(icao24) {
  const query = new URLSearchParams({ icao24, time: "0" });
  return getJson(`${API_BASE_URL}/api/opensky/tracks?${query.toString()}`);
}

export async function getAircraftState(icao24) {
  return getJson(`${API_BASE_URL}/api/opensky/states/${encodeURIComponent(icao24)}`);
}

export async function getRouteByCallsign(callsign) {
  return getJson(`${API_BASE_URL}/api/routes/by-callsign/${encodeURIComponent(callsign)}`);
}

export async function getLiveRouteFlights(origin, destination) {
  const query = new URLSearchParams({
    origin: String(origin || ""),
    destination: String(destination || "")
  });
  return getJson(`${API_BASE_URL}/api/routes/live-flights?${query.toString()}`);
}

export async function getLiveRouteOptions() {
  return getJson(`${API_BASE_URL}/api/routes/live-options`);
}

export async function getAdminUsers(adminEmail, { includeInactive = true, limit = 500 } = {}) {
  const query = new URLSearchParams({
    include_inactive: includeInactive ? "true" : "false",
    limit: String(limit)
  });
  return requestJson(`${API_BASE_URL}/api/admin/users?${query.toString()}`, {
    headers: adminHeaders(adminEmail)
  });
}

export async function deleteAdminUser(adminEmail, email) {
  return requestJson(`${API_BASE_URL}/api/admin/users/${encodeURIComponent(email)}`, {
    method: "DELETE",
    headers: adminHeaders(adminEmail)
  });
}

export async function getTurbulenceAnalytics(
  adminEmail,
  { maxCells = 400, gridDeg = 5, sinceMinutes = 120 } = {}
) {
  const query = new URLSearchParams({
    max_cells: String(maxCells),
    grid_deg: String(gridDeg),
    since_minutes: String(sinceMinutes)
  });
  return requestJson(`${API_BASE_URL}/api/admin/analytics/turbulence?${query.toString()}`, {
    headers: adminHeaders(adminEmail)
  });
}

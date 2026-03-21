import {
  dashboardSummary,
  turbulenceSplit,
  futureRisk,
  flights
} from "../data/mockData";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (window.location.port === "3000"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : window.location.origin);

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
  const response = await fetch(`${API_BASE_URL}/api/pipeline/run-live`, {
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

export async function assignPilotFlight(pilotEmail, icao24) {
  const response = await fetch(`${API_BASE_URL}/api/pilot/assign-flight`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ pilot_email: pilotEmail, icao24 })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const detail = payload?.detail || `status ${response.status}`;
    throw new Error(`Pilot flight assignment failed: ${detail}`);
  }

  return response.json();
}

export async function getPilotFlightAssignment(pilotEmail) {
  return getJson(
    `${API_BASE_URL}/api/pilot/assign-flight/${encodeURIComponent(pilotEmail)}`
  );
}

export async function getSharedPilotFlights() {
  return getJson(`${API_BASE_URL}/api/pilot/shared-flights`);
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

export async function getPassengerJoinLink(room) {
  const query = new URLSearchParams({ room: String(room || "") });
  return getJson(`${API_BASE_URL}/api/pilot/passenger-link?${query.toString()}`);
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
  { maxCells = 900, gridDeg = 5, sinceMinutes = 360 } = {}
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

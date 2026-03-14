import {
  dashboardSummary,
  turbulenceSplit,
  futureRisk,
  flights
} from "../data/mockData";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

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

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const detail = payload?.detail || `status ${response.status}`;
    throw new Error(detail);
  }
  return response.json();
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

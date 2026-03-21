# Live Flight Turbulence Monitor (Full-Stack)

**Type:** Minor Project  
**Author:** abhishesk  

A full-stack app that fetches live aircraft telemetry (OpenSky), stores it in PostgreSQL, runs ML inference to estimate turbulence risk, and serves results to a React dashboard (Passenger / Pilot / Admin) with real-time WebSocket alerts.

---

## What’s inside

- **Frontend (React + Vite)**: `frontend/` (dev: `http://localhost:3000`)
- **Backend (FastAPI + ML + Postgres)**: `turb_pred/` (dev: `http://127.0.0.1:8000`)
- Notes / docs: `FULL_PROJECT_FLOW.txt`, `PROJECT_OVERVIEW.txt`, `SLIDE7_IMPLEMENTATION.md`

## High-level flow

1. Backend fetches aircraft states from **OpenSky** → inserts into `planes_table`
2. Backend builds inference features → runs ML models (`turbulence_model.pkl`, `future_turbulence_model.pkl`)
3. Backend stores results in `predictions` and can persist alerts in `alerts`
4. Frontend dashboards call REST APIs and subscribe to **room WebSockets** for live alerts

---

## Tech stack

- **UI**: React 18, Vite, React Router, Leaflet/React-Leaflet
- **API**: FastAPI, Uvicorn
- **Data/ML**: pandas, numpy, scikit-learn, joblib
- **DB**: PostgreSQL (via `psycopg2-binary`)
- **Realtime**: WebSockets

---

## Run locally (dev)

### Prerequisites

- Node.js 18+ (recommended)
- Python 3.10+ (recommended)
- PostgreSQL running locally

### 1) Backend

```powershell
cd turb_pred
pip install -r requirements.txt
uvicorn api.pipeline_api:app --reload --host 127.0.0.1 --port 8000
```

Backend health check: `GET /health`

### 2) Frontend

```powershell
cd frontend
npm install
npm run dev
```

---

## Environment variables

### Frontend (`frontend/.env`)

| Variable | Example | Used for |
|---|---|---|
| `VITE_API_BASE_URL` | `http://127.0.0.1:8000` | Backend base URL |
| `VITE_GOOGLE_CLIENT_ID` | `xxxx.apps.googleusercontent.com` | Google OAuth button |

### Backend (process env)

| Variable | Used for |
|---|---|
| `CLIENT_ID`, `CLIENT_SECRET` | OpenSky OAuth (client credentials) |
| `AVIATIONSTACK_ACCESS_KEY`, `AVIATIONSTACK_BASE_URL` | Optional route/provider enrichment |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` | PostgreSQL connection |
| `PILOT_DEVICE_IP` | Force the IP used in passenger links/QR (useful on hotspots) |
| `PILOT_SERVER_PORT` | Port used in passenger links/QR (default `8000`) |
| `ENABLE_GLOBAL_PASSENGER_ALERTS` | Enable `/ws/passenger-alerts` (disabled by default) |

Security note: `turb_pred/config/settings.py` contains **default values** for credentials. For real usage, override them via environment variables and avoid committing secrets.

---

## Database setup (recommended)

This repo expects an existing PostgreSQL database. Minimal tables you should create:

```sql
-- Raw OpenSky snapshots
CREATE TABLE IF NOT EXISTS planes_table (
  id BIGSERIAL PRIMARY KEY,
  icao24 TEXT,
  callsign TEXT,
  origin_country TEXT,
  longitude DOUBLE PRECISION,
  latitude DOUBLE PRECISION,
  baro_altitude DOUBLE PRECISION,
  velocity DOUBLE PRECISION,
  true_track DOUBLE PRECISION,
  vertical_rate DOUBLE PRECISION,
  on_ground BOOLEAN,
  last_contact BIGINT,
  fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Model outputs
CREATE TABLE IF NOT EXISTS predictions (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  icao24 TEXT NOT NULL,
  predicted_turbulence INTEGER NOT NULL,
  confidence DOUBLE PRECISION
);

-- App users (Google signup/login)
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

The backend also auto-creates:
- `pilot_flight_assignments` (pilot → shared flight mapping)
- `alerts` (alert history)

---

## Backend API (main endpoints)

### Pipeline

- `POST /api/pipeline/run-live`  
  Runs the global pipeline and returns fleet/dashboard payload.

- `POST /api/pipeline/flight/{icao24}/live`  
  Returns payload for a single aircraft (usually from cached DB data).

### Pilot ↔ Passenger linking

- `POST /api/pilot/assign-flight`  
- `GET /api/pilot/assign-flight/{pilot_email}`  
- `GET /api/pilot/shared-flights`

Passenger join utilities:
- `GET /pilot/qr.png?room=<icao24>` (QR image)
- `GET /api/pilot/passenger-link?room=<icao24>` (join URL JSON)
- `GET /passenger` (standalone mobile-friendly passenger page)

### WebSockets (room alerts)

- `WS /ws/{room_code}`  
  Room-based WebSocket used by the Passenger UI and the standalone `/passenger` page.

Broadcast to a room:
- `POST /api/alerts/broadcast/{room_code}`

### OpenSky helper endpoints

- `GET /api/opensky/flights/departure?airport=...&begin=...&end=...`
- `GET /api/opensky/tracks?icao24=...&time=0`
- `GET /api/opensky/states/{icao24}`

### Admin

Admin endpoints require `X-User-Email: <admin email>` and a matching active user row in `users`.

- `GET /api/admin/users`
- `DELETE /api/admin/users/{email}`
- `GET /api/admin/analytics/turbulence`

---

## Frontend pages (role-based)

- `/` Landing
- `/signup` Google signup + role selection
- `/login` Google login
- `/passenger` Passenger dashboard (protected)
- `/pilot` Pilot dashboard (protected)
- `/admin` Admin dashboard (protected)

---

## Serving the built frontend from the backend (optional)

If `frontend/dist` exists, the FastAPI app serves it:

```powershell
cd frontend
npm run build
```

Then start the backend and open `http://127.0.0.1:8000/`.

---

## Notes / limitations

- OpenSky can rate-limit aggressively; when that happens the backend continues serving from cached DB telemetry when possible.
- Authentication is present (Google login/signup), but the stored token is **not enforced on most endpoints**. Admin access is enforced via `X-User-Email` lookup.


import base64
import io
import os
import socket
import subprocess

import qrcode
from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel

from communication.alerts import dispatch_alert
from communication.connection_manager import passenger_connection_manager


router = APIRouter()


class ManualAlertRequest(BaseModel):
    type: str
    message: str
    severity: str | None = None
    flight_id: str | None = None


def get_local_ip():
    try:
        result = subprocess.run(
            ["ipconfig"],
            capture_output=True,
            text=True,
            check=True,
        )
        sections = result.stdout.split("\n\n")
        for section in sections:
            if "IPv4 Address" not in section or "Default Gateway" not in section:
                continue
            if "Media disconnected" in section:
                continue

            ipv4_address = ""
            has_gateway = False
            for line in section.splitlines():
                if "IPv4 Address" in line:
                    ipv4_address = line.split(":")[-1].strip()
                elif "Default Gateway" in line and line.split(":")[-1].strip():
                    has_gateway = True

            if has_gateway and ipv4_address:
                return ipv4_address
    except Exception:
        pass

    override_ip = os.getenv("PILOT_DEVICE_IP", "").strip()
    if override_ip:
        return override_ip

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("10.255.255.255", 1))
        return sock.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        sock.close()


def build_passenger_link(request: Request | None = None, room: str = ""):
    host = ""
    if request:
        host = (request.url.hostname or "").strip()

    if not host or host in {"127.0.0.1", "localhost"}:
        host = get_local_ip()

    port = os.getenv("PILOT_SERVER_PORT", "8000").strip() or "8000"
    room = (room or "").strip()
    if room:
        return f"http://{host}:{port}/passenger?room={room}"
    return f"http://{host}:{port}/passenger"


def generate_qr_image_data(url):
    image = qrcode.make(url)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{encoded}"


def generate_qr_png_bytes(url: str) -> bytes:
    image = qrcode.make(url)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


@router.websocket("/ws/passenger-alerts")
async def passenger_alerts_socket(websocket: WebSocket):
    if os.getenv("ENABLE_GLOBAL_PASSENGER_ALERTS", "").strip() not in {"1", "true", "TRUE", "yes", "YES"}:
        await websocket.accept()
        await websocket.send_json(
            {
                "type": "system",
                "severity": "info",
                "message": "Global passenger alerts are disabled. Scan a flight QR to join a flight room.",
            }
        )
        await websocket.close(code=1008)
        return

    await passenger_connection_manager.connect(websocket)
    await websocket.send_json(
        {
            "type": "system",
            "severity": "info",
            "message": "Connected to the onboard turbulence alert channel.",
        }
    )
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        passenger_connection_manager.disconnect(websocket)
    except Exception:
        passenger_connection_manager.disconnect(websocket)


@router.get("/passenger", response_class=HTMLResponse)
def passenger_dashboard(request: Request):
    html = """
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Passenger Alerts</title>
        <style>
          body { margin: 0; font-family: Arial, sans-serif; background: #020617; color: #e2e8f0; }
          .shell { min-height: 100vh; padding: 20px; background: linear-gradient(180deg, #0f2948 0%, #020617 100%); }
          .card { max-width: 480px; margin: 0 auto; background: rgba(15, 23, 42, 0.9); border: 1px solid #315585; border-radius: 18px; padding: 20px; box-shadow: 0 16px 40px rgba(2, 6, 23, 0.35); }
          .badge { display: inline-block; padding: 6px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
          .badge-info { background: #0f766e; color: #ccfbf1; }
          .badge-light { background: #a16207; color: #fef3c7; }
          .badge-moderate { background: #b45309; color: #ffedd5; }
          .badge-severe { background: #b91c1c; color: #fee2e2; }
          .panel { margin-top: 18px; padding: 16px; border-radius: 14px; background: #0f172a; border: 1px solid #223554; }
          .muted { color: #94a3b8; font-size: 14px; }
          .alert-list { display: grid; gap: 12px; margin-top: 16px; }
          .alert-item { border: 1px solid #315585; border-radius: 14px; padding: 14px; background: rgba(15, 23, 42, 0.92); }
          .alert-item h3 { margin: 0 0 6px; font-size: 18px; }
          .alert-item p { margin: 6px 0; }
          .kv { display: grid; grid-template-columns: 1fr; gap: 12px; margin-top: 14px; }
          .kv-row { padding: 12px 14px; border-radius: 14px; background: rgba(2, 6, 23, 0.5); border: 1px solid #223554; }
          .kv-row strong { display: block; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #94a3b8; }
          .kv-row span { display: block; margin-top: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
          .join { margin-top: 14px; padding: 14px; border-radius: 14px; background: rgba(2, 6, 23, 0.5); border: 1px solid #223554; }
          .join label { display: block; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #94a3b8; margin-bottom: 8px; }
          .join .row { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
          .join input { padding: 10px 12px; border-radius: 10px; border: 1px solid #223554; background: #0b1220; color: #e2e8f0; }
          .join button { padding: 10px 14px; border-radius: 10px; border: 1px solid #315585; background: #1d4ed8; color: #e2e8f0; cursor: pointer; font-weight: 700; }
        </style>
      </head>
      <body>
        <main class="shell">
          <section class="card">
            <span id="status-badge" class="badge badge-info">Connecting</span>
            <h1>Passenger Turbulence Alerts</h1>
            <p class="muted">Stay connected to the onboard hotspot and keep this page open to receive live cabin alerts.</p>
            <p class="muted">Flight room: <strong id="room-code">Not selected</strong></p>

            <form class="join" id="join-form">
              <label for="room-input">Enter flight ICAO24</label>
              <div class="row">
                <input id="room-input" placeholder="ex: 0b22b" autocomplete="off" />
                <button type="submit">Join</button>
              </div>
              <p class="muted" style="margin:10px 0 0;">Ask the pilot for the ICAO24 (flight room) if you don't know it.</p>
            </form>

            <div class="kv" id="flight-details" style="display:none;">
              <div class="kv-row">
                <strong>Callsign</strong>
                <span id="flight-callsign">N/A</span>
              </div>
              <div class="kv-row">
                <strong>Current Turbulence</strong>
                <span id="flight-current">N/A</span>
              </div>
              <div class="kv-row">
                <strong>Predicted (Next Window)</strong>
                <span id="flight-predicted">N/A</span>
              </div>
              <div class="kv-row">
                <strong>Confidence</strong>
                <span id="flight-confidence">N/A</span>
              </div>
            </div>

            <div class="panel">
              <strong>Current alert</strong>
              <h2 id="current-message">Waiting for the pilot or prediction system...</h2>
              <p id="current-severity" class="muted">Severity: info</p>
              <p id="current-extra" class="muted">No active turbulence alert.</p>
            </div>

            <div class="alert-list" id="alert-list"></div>
          </section>
        </main>

        <script>
          const badge = document.getElementById("status-badge");
          const currentMessage = document.getElementById("current-message");
          const currentSeverity = document.getElementById("current-severity");
          const currentExtra = document.getElementById("current-extra");
          const alertList = document.getElementById("alert-list");
          const roomCodeEl = document.getElementById("room-code");
          const detailsWrap = document.getElementById("flight-details");
          const detailsCallsign = document.getElementById("flight-callsign");
          const detailsCurrent = document.getElementById("flight-current");
          const detailsPredicted = document.getElementById("flight-predicted");
          const detailsConfidence = document.getElementById("flight-confidence");
          const joinForm = document.getElementById("join-form");
          const roomInput = document.getElementById("room-input");

          const ALERT_LABELS = {
            1: { label: "Calm", color: "#22c55e", severity: "info" },
            2: { label: "Moderate turbulence", color: "#f59e0b", severity: "moderate" },
            3: { label: "Severe turbulence", color: "#ef4444", severity: "severe" },
            4: { label: "EMERGENCY", color: "#dc2626", severity: "severe" },
            5: { label: "ETA Update", color: "#3b82f6", severity: "info" }
          };

          function severityClass(level) {
            if (level === "severe") return "badge-severe";
            if (level === "moderate") return "badge-moderate";
            if (level === "light") return "badge-light";
            return "badge-info";
          }

          function renderAlert(payload) {
            const severity = payload.severity || "info";
            badge.textContent = severity;
            badge.className = `badge ${severityClass(severity)}`;
            currentMessage.textContent = payload.message || "Alert received";
            currentSeverity.textContent = `Severity: ${severity}`;
            currentExtra.textContent = payload.eta_minutes
              ? `ETA: ${payload.eta_minutes} minute(s)`
              : "Cabin advisory from the pilot system.";

            const item = document.createElement("article");
            item.className = "alert-item";
            item.innerHTML = `
              <span class="badge ${severityClass(severity)}">${severity}</span>
              <h3>${payload.type || "alert"}</h3>
              <p>${payload.message || ""}</p>
              <p class="muted">${new Date().toLocaleTimeString()}</p>
            `;
            alertList.prepend(item);
          }

          function enrichRoomPayload(payload) {
            if (payload && Number.isFinite(Number(payload.t))) {
              const t = Number(payload.t);
              const meta = ALERT_LABELS[t] || { label: "alert", severity: "info", color: "#9fb0d3" };
              return {
                type: meta.label,
                severity: meta.severity,
                message: payload.m || payload.message || "Alert received"
              };
            }
            return payload;
          }

          const protocol = window.location.protocol === "https:" ? "wss" : "ws";
          const params = new URLSearchParams(window.location.search);
          const room = (params.get("room") || "").trim();
          if (roomCodeEl) roomCodeEl.textContent = room || "Not selected";

          if (roomInput) {
            roomInput.value = room || "";
          }

          if (joinForm) {
            joinForm.addEventListener("submit", (event) => {
              event.preventDefault();
              const nextRoom = (roomInput && roomInput.value ? roomInput.value : "").trim();
              if (!nextRoom) return;
              const nextUrl = new URL(window.location.href);
              nextUrl.searchParams.set("room", nextRoom);
              window.location.replace(nextUrl.toString());
            });
          }

          if (!room) {
            badge.textContent = "No flight selected";
            badge.className = "badge badge-severe";
            currentMessage.textContent = "Enter your flight ICAO24 to connect.";
            currentSeverity.textContent = "Severity: info";
            currentExtra.textContent = "You will only receive updates for the ICAO24 room you join.";
          }

          async function loadFlightDetails(roomCode) {
            try {
              const resp = await fetch(`/api/pipeline/flight/${encodeURIComponent(roomCode)}/live`, { method: "POST" });
              if (!resp.ok) return;
              const payload = await resp.json();
              const flight = payload.flight || null;
              if (!flight) return;
              if (detailsWrap) detailsWrap.style.display = "grid";
              if (detailsCallsign) detailsCallsign.textContent = (flight.callsign || "N/A").trim() || "N/A";
              if (detailsCurrent) detailsCurrent.textContent = String(flight.currentLabel || flight.currentLevel || "N/A");
              if (detailsPredicted) detailsPredicted.textContent = String(flight.futureLabel || flight.predictedLevel || "N/A");
              if (detailsConfidence) detailsConfidence.textContent = `${Math.round((Number(flight.confidence || 0) * 100))}%`;
            } catch {
              // Ignore details fetch failures.
            }
          }

          const socket = room
            ? new WebSocket(`${protocol}://${window.location.host}/ws/${encodeURIComponent(room)}`)
            : null;

          if (socket) {
            socket.addEventListener("open", () => {
              badge.textContent = `Connected: ${room}`;
              badge.className = "badge badge-info";
              currentMessage.textContent = `Connected to flight ${room}.`;
              currentSeverity.textContent = "Severity: info";
              currentExtra.textContent = "Waiting for pilot alerts and prediction updates...";
              if (joinForm) joinForm.style.display = "none";
            });

            socket.addEventListener("message", (event) => {
              const payload = enrichRoomPayload(JSON.parse(event.data));
              renderAlert(payload);
            });

            socket.addEventListener("close", () => {
              badge.textContent = "Disconnected";
              badge.className = "badge badge-severe";
              currentExtra.textContent = "Connection closed. Keep this page open to reconnect when available.";
              if (joinForm) joinForm.style.display = "block";
            });
          }

          if (room) {
            loadFlightDetails(room);
          }
        </script>
      </body>
    </html>
    """
    return HTMLResponse(content=html)


@router.post("/api/alerts/send")
async def send_manual_alert(payload: ManualAlertRequest):
    alert = {
        "type": payload.type,
        "severity": payload.severity or "info",
        "message": payload.message,
        "flight_id": payload.flight_id,
    }
    dispatch_alert(alert)
    return {"status": "sent", "alert": alert}


@router.get("/pilot/qr", response_class=HTMLResponse)
def pilot_qr(request: Request):
    room = (request.query_params.get("room") or "").strip()
    passenger_link = build_passenger_link(request, room=room)
    qr_image_data = generate_qr_image_data(passenger_link) if room else ""

    html = """
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Pilot Passenger QR</title>
        <style>
          body {{ margin: 0; font-family: Arial, sans-serif; background: #020617; color: #e2e8f0; }}
          .shell {{ min-height: 100vh; display: grid; place-items: center; padding: 24px; background: linear-gradient(180deg, #0f2948 0%, #020617 100%); }}
          .card {{ width: min(560px, 100%); background: rgba(15, 23, 42, 0.94); border: 1px solid #315585; border-radius: 18px; padding: 24px; }}
          img {{ width: 260px; height: 260px; border-radius: 16px; background: white; padding: 12px; }}
          a {{ color: #93c5fd; word-break: break-all; }}
          .row {{ display: grid; grid-template-columns: 1fr; gap: 10px; margin-top: 14px; }}
          label {{ display: block; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #94a3b8; margin-bottom: 6px; }}
          input, select {{ width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid #223554; background: #0b1220; color: #e2e8f0; }}
          button {{ padding: 10px 12px; border-radius: 10px; border: 1px solid #315585; background: #0f2948; color: #e2e8f0; cursor: pointer; font-weight: 700; }}
          button.primary {{ background: #1d4ed8; border-color: #60a5fa; }}
          .muted {{ color: #94a3b8; font-size: 13px; }}
          .qr-wrap {{ display: grid; place-items: center; margin-top: 16px; text-align: center; }}
          .flights {{ display: grid; gap: 8px; margin-top: 10px; }}
          .flight-btn {{ text-align: left; }}
        </style>
      </head>
      <body>
        <main class="shell">
          <section class="card">
            <h1>Passenger Join QR</h1>
            <p class="muted">Pick a flight by ICAO24 or by route, then generate a flight-specific QR code.</p>

            <div class="row">
              <label for="mode">Selection Mode</label>
              <select id="mode">
                <option value="icao24">Select by ICAO24</option>
                <option value="route">Select by Route</option>
              </select>
            </div>

            <div class="row" id="icao24-block">
              <label for="room">Flight ICAO24 (Room)</label>
              <input id="room" placeholder="ex: 0b22b" />
              <button class="primary" id="generate">Generate QR</button>
              <div class="muted">Passengers will join `/passenger?room=&lt;icao24&gt;` and receive alerts from `/ws/&lt;icao24&gt;`.</div>
            </div>

            <div class="row" id="route-block" style="display:none;">
              <label for="origin">Origin</label>
              <select id="origin"><option value="">Loading...</option></select>
              <label for="destination">Destination</label>
              <select id="destination"><option value="">Loading...</option></select>
              <button id="find">Find Matching Flights</button>
              <div class="flights" id="matches"></div>
              <div class="muted">Route options come from cached route lookups to avoid rate limits.</div>
            </div>

            <div class="qr-wrap" id="qr-wrap" style="display:none;">
              <p><strong>Flight room:</strong> <span id="room-label"></span></p>
              <img id="qr-img" alt="Passenger dashboard QR code" />
              <p><a id="qr-link" href="#" target="_blank" rel="noreferrer"></a></p>
            </div>
          </section>
        </main>

        <script>
          const modeEl = document.getElementById("mode");
          const blockIcao = document.getElementById("icao24-block");
          const blockRoute = document.getElementById("route-block");
          const roomInput = document.getElementById("room");
          const generateBtn = document.getElementById("generate");
          const findBtn = document.getElementById("find");
          const originEl = document.getElementById("origin");
          const destEl = document.getElementById("destination");
          const matchesEl = document.getElementById("matches");
          const qrWrap = document.getElementById("qr-wrap");
          const qrImg = document.getElementById("qr-img");
          const qrLink = document.getElementById("qr-link");
          const roomLabel = document.getElementById("room-label");

          function setMode(mode) {
            blockIcao.style.display = mode === "icao24" ? "grid" : "none";
            blockRoute.style.display = mode === "route" ? "grid" : "none";
          }

          function navigateWithRoom(room) {
            const url = new URL(window.location.href);
            url.searchParams.set("room", room);
            window.location.href = url.toString();
          }

          function clearMatches() {
            matchesEl.innerHTML = "";
          }

          function addMatchButton(flight) {
            const btn = document.createElement("button");
            btn.className = "flight-btn";
            const dep = (flight.route && flight.route.departure) ? (flight.route.departure.icao || flight.route.departure.iata || "??") : "??";
            const arr = (flight.route && flight.route.arrival) ? (flight.route.arrival.icao || flight.route.arrival.iata || "??") : "??";
            const callsign = (flight.callsign || "N/A").trim() || "N/A";
            btn.textContent = `${callsign} (${flight.icao24}) - ${dep} -> ${arr}`;
            btn.addEventListener("click", () => navigateWithRoom(flight.icao24));
            matchesEl.appendChild(btn);
          }

          modeEl.addEventListener("change", () => setMode(modeEl.value));
          generateBtn.addEventListener("click", () => {
            const room = (roomInput.value || "").trim();
            if (!room) return;
            navigateWithRoom(room);
          });

          async function loadRouteOptions() {
            try {
              const resp = await fetch("/api/routes/live-options");
              if (!resp.ok) throw new Error("options fetch failed");
              const payload = await resp.json();
              const origins = payload.origins || [];
              const destinations = payload.destinations || [];
              const flights = payload.flights || [];

              originEl.innerHTML = `<option value="">Select origin</option>` + origins.map(o => `<option value="${o.code}">${o.label}</option>`).join("");
              destEl.innerHTML = `<option value="">Select destination</option>` + destinations.map(d => `<option value="${d.code}">${d.label}</option>`).join("");

              findBtn.addEventListener("click", () => {
                const origin = originEl.value;
                const destination = destEl.value;
                clearMatches();
                const matches = flights.filter(f => {
                  const dep = f.route && f.route.departure ? (f.route.departure.icao || f.route.departure.iata || "") : "";
                  const arr = f.route && f.route.arrival ? (f.route.arrival.icao || f.route.arrival.iata || "") : "";
                  return dep === origin && arr === destination;
                });
                if (!matches.length) {
                  matchesEl.innerHTML = `<div class="muted">No cached matches for this route yet. Select a flight by ICAO24 first to warm the cache.</div>`;
                  return;
                }
                matches.slice(0, 20).forEach(addMatchButton);
              });
            } catch {
              originEl.innerHTML = `<option value="">No live origins available</option>`;
              destEl.innerHTML = `<option value="">No live destinations available</option>`;
            }
          }

          (function init() {
            const params = new URLSearchParams(window.location.search);
            const room = (params.get("room") || "").trim();
            if (room) {
              qrWrap.style.display = "grid";
              roomLabel.textContent = room;
              qrImg.src = "__QR_IMAGE_DATA__";
              qrLink.href = "__PASSENGER_LINK__";
              qrLink.textContent = "__PASSENGER_LINK__";
              roomInput.value = room;
            }
            loadRouteOptions();
          })();
        </script>
      </body>
    </html>
    """
    html = html.replace("__PASSENGER_LINK__", passenger_link)
    html = html.replace("__QR_IMAGE_DATA__", qr_image_data)
    return HTMLResponse(content=html)


@router.get("/pilot/qr.png")
def pilot_qr_png(request: Request, room: str = ""):
    room = (room or "").strip()
    passenger_link = build_passenger_link(request, room=room)
    png_bytes = generate_qr_png_bytes(passenger_link)
    return Response(content=png_bytes, media_type="image/png")


@router.get("/api/pilot/passenger-link")
def pilot_passenger_link(request: Request, room: str = ""):
    room = (room or "").strip()
    return {
        "room": room,
        "url": build_passenger_link(request, room=room),
    }

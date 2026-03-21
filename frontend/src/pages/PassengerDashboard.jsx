import { useEffect, useMemo, useState } from "react";
import AlertBanner from "../components/AlertBanner";
import FlightTable from "../components/FlightTable";
import { useFlightRoom } from "../hooks/useFlightRoom";
import { useServerURL } from "../hooks/useServerURL";
import {
  getLiveFlightData,
  getMockDashboardData,
  getPassengerJoinLink,
  getSharedPilotFlights
} from "../services/api";

function PassengerDashboard() {
  const { base } = useServerURL();
  const [loading, setLoading] = useState(true);
  const [sharedFlights, setSharedFlights] = useState([]);
  const [selectedFlightIcao, setSelectedFlightIcao] = useState("");
  const [selectedSharedFlight, setSelectedSharedFlight] = useState(null);
  const [flightData, setFlightData] = useState(null);
  const [joinLink, setJoinLink] = useState("");
  const [fetchError, setFetchError] = useState("");
  const [statusText, setStatusText] = useState("");

  const selectedFlight = useMemo(() => flightData?.flight || null, [flightData]);
  const { lastAlert, status, dismissAlert } = useFlightRoom(selectedFlightIcao || "default-room");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = (params.get("room") || "").trim();
    if (room) {
      setSelectedFlightIcao(room);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSharedFlights() {
      try {
        const payload = await getSharedPilotFlights();
        if (!active) return;
        const flights = payload.sharedFlights || [];
        setSharedFlights(flights);

        if (!selectedFlightIcao) {
          setSelectedFlightIcao(flights[0]?.icao24 || "");
        }
      } catch {
        // Fall back to mock data so the page doesn't look broken.
        const mockPayload = await getMockDashboardData();
        if (!active) return;
        const mockFlight = mockPayload.flights[0] || null;
        setSharedFlights([]);
        setSelectedFlightIcao(mockFlight?.icao24 || "");
        setFlightData(
          mockFlight
            ? {
                flight: mockFlight,
                fetchedAt: mockPayload.fetchedAt,
                source: mockPayload.source,
                summary: mockPayload.summary
              }
            : null
        );
        setStatusText("Pilot feed unavailable. Showing mock data.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadSharedFlights();
    const timer = setInterval(loadSharedFlights, 15000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [selectedFlightIcao]);

  useEffect(() => {
    const nextSharedFlight =
      sharedFlights.find((item) => item.icao24 === selectedFlightIcao) || null;
    setSelectedSharedFlight(nextSharedFlight);
  }, [selectedFlightIcao, sharedFlights]);

  useEffect(() => {
    let active = true;

    async function loadFlight() {
      if (!selectedFlightIcao) {
        setFlightData(null);
        setJoinLink("");
        return;
      }

      setFetchError("");
      try {
        const [payload, linkPayload] = await Promise.all([
          getLiveFlightData(selectedFlightIcao),
          getPassengerJoinLink(selectedFlightIcao)
        ]);
        if (!active) return;
        setFlightData(payload);
        setJoinLink(linkPayload?.url || "");
        setStatusText(`Connected to flight room ${selectedFlightIcao}.`);
      } catch (error) {
        if (!active) return;
        setFetchError(error?.message || "Could not load flight details.");
        setJoinLink("");
      }
    }

    loadFlight();

    return () => {
      active = false;
    };
  }, [selectedFlightIcao]);

  if (loading) {
    return <section className="panel">Loading passenger dashboard...</section>;
  }

  return (
    <>
      <AlertBanner alert={lastAlert} onDismiss={dismissAlert} />

      <section className="panel">
        <h2>Passenger Dashboard</h2>
        <p>Select the ICAO24 shared by a pilot. Then scan the QR on your mobile to receive live updates.</p>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#888", padding: "4px 0" }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: status === "connected" ? "#22c55e" : status === "reconnecting" ? "#f59e0b" : "#666"
            }}
          />
          {status === "connected" ? "Connected to flight room" : status === "reconnecting" ? "Reconnecting..." : "Disconnected"}
        </div>
        {statusText ? <p className="status-line">{statusText}</p> : null}
        {fetchError ? <p className="error-line">{fetchError}</p> : null}
      </section>

      <section className="panel-grid">
        <article className="panel">
          <h2>Select ICAO24</h2>
          <label className="field-label" htmlFor="passenger-flight-select">
            Pilot-shared flights
          </label>
          <select
            id="passenger-flight-select"
            className="input"
            value={selectedFlightIcao}
            onChange={(event) => setSelectedFlightIcao(event.target.value)}
          >
            <option value="">Select an ICAO24</option>
            {sharedFlights.map((item) => (
              <option key={`${item.pilotEmail}-${item.icao24}`} value={item.icao24}>
                {(item.flight?.callsign || item.callsign || "N/A").trim() || "N/A"} ({item.icao24})
              </option>
            ))}
          </select>

          {selectedSharedFlight ? (
            <div className="risk-stack">
              <div className="risk-item">
                <p>Pilot</p>
                <p>{selectedSharedFlight.pilotEmail}</p>
              </div>
              <div className="risk-item">
                <p>Shared ICAO24</p>
                <p>{selectedSharedFlight.icao24}</p>
              </div>
              <div className="risk-item">
                <p>Last pilot update</p>
                <p>{selectedSharedFlight.updatedAt || "N/A"}</p>
              </div>
            </div>
          ) : (
            <p className="meta-line">No pilot-shared flight selected.</p>
          )}
        </article>

        <article className="panel">
          <h2>Mobile Join QR</h2>
          {!selectedFlightIcao ? (
            <p className="meta-line">Select an ICAO24 to generate the QR.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <img
                src={`${base}/pilot/qr.png?room=${encodeURIComponent(selectedFlightIcao)}`}
                alt="Passenger join QR"
                style={{ width: 240, height: 240, borderRadius: 14, background: "#fff", padding: 10, justifySelf: "start" }}
              />
              {joinLink ? (
                <a href={joinLink} style={{ color: "#93c5fd", wordBreak: "break-all", fontSize: 12 }}>
                  {joinLink}
                </a>
              ) : (
                <p className="meta-line">Join link unavailable</p>
              )}
              <p className="meta-line">Scan this QR on your phone. It opens the onboard passenger page on port 8000.</p>
            </div>
          )}
        </article>
      </section>

      <section className="panel">
        <h2>Live Turbulence Updates</h2>
        <FlightTable flights={selectedFlight ? [selectedFlight] : []} />
        <div className="risk-stack">
          <div className="risk-item">
            <p>Feed source</p>
            <p>{flightData?.source || "N/A"}</p>
          </div>
          <div className="risk-item">
            <p>Last refresh</p>
            <p>{flightData?.fetchedAt || "N/A"}</p>
          </div>
        </div>
      </section>
    </>
  );
}

export default PassengerDashboard;

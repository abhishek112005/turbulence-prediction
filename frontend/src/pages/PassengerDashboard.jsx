import { useEffect, useMemo, useState } from "react";
import FlightTable from "../components/FlightTable";
import { getLiveDashboardData, getMockDashboardData } from "../services/api";

function PassengerDashboard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [statusText, setStatusText] = useState("");
  const [selectedFlightIcao, setSelectedFlightIcao] = useState("");

  useEffect(() => {
    getMockDashboardData()
      .then((payload) => {
        setData(payload);
        if (payload.flights?.length) {
          setSelectedFlightIcao(payload.flights[0].icao24);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function refresh(source) {
    setFetchError("");
    setStatusText("");
    setIsRefreshing(true);
    try {
      const payload = source === "live" ? await getLiveDashboardData() : await getMockDashboardData();
      setData(payload);
      setStatusText(source === "live" ? "Live feed updated" : "Mock data loaded");
      if (!selectedFlightIcao && payload.flights?.length) {
        setSelectedFlightIcao(payload.flights[0].icao24);
      }
    } catch (error) {
      setFetchError(error.message || "Could not refresh dashboard data.");
    } finally {
      setIsRefreshing(false);
    }
  }

  const selectedFlight = useMemo(() => {
    if (!data?.flights?.length) {
      return null;
    }

    return data.flights.find((flight) => flight.icao24 === selectedFlightIcao) || data.flights[0];
  }, [data, selectedFlightIcao]);

  if (loading) {
    return <section className="panel">Loading passenger dashboard...</section>;
  }

  return (
    <>
      <section className="panel">
        <h2>Passenger Dashboard</h2>
        <p>Track your route and see turbulence outlook for your selected flight.</p>
        <div className="toolbar">
          <button className="action-btn" disabled={isRefreshing} onClick={() => refresh("live")}>
            {isRefreshing ? "Refreshing..." : "Fetch Live Data"}
          </button>
          <button className="action-btn muted" disabled={isRefreshing} onClick={() => refresh("mock")}>
            Use Mock Data
          </button>
        </div>
        {statusText ? <p className="status-line">{statusText}</p> : null}
        {fetchError ? <p className="error-line">{fetchError}</p> : null}
      </section>

      <section className="panel-grid">
        <article className="panel">
          <h2>Route Selection</h2>
          <label className="field-label" htmlFor="passenger-flight-select">
            Select flight
          </label>
          <select
            id="passenger-flight-select"
            className="input"
            value={selectedFlight?.icao24 || ""}
            onChange={(event) => setSelectedFlightIcao(event.target.value)}
          >
            {data.flights.map((flight) => (
              <option key={flight.icao24} value={flight.icao24}>
                {flight.callsign} ({flight.icao24})
              </option>
            ))}
          </select>
          <div className="map-canvas">
            {selectedFlight ? (
              <span className="flight-dot" style={{ left: "50%", top: "52%" }}>
                {selectedFlight.callsign}
              </span>
            ) : null}
          </div>
        </article>

        <article className="panel">
          <h2>Turbulence Prediction</h2>
          <FlightTable flights={selectedFlight ? [selectedFlight] : []} />
          <div className="risk-stack">
            {data.futureRisk.map((risk) => (
              <div key={risk.window} className="risk-item">
                <p>{risk.window}</p>
                <p>{(risk.severeRisk * 100).toFixed(0)}% severe probability</p>
                <p>{(risk.confidence * 100).toFixed(0)}% confidence</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}

export default PassengerDashboard;

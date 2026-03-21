import RiskBadge from "./RiskBadge";

function formatRoute(routeData) {
  const dep = routeData?.departure || null;
  const arr = routeData?.arrival || null;
  const from = dep?.icao || dep?.iata || dep?.name || dep?.city || "";
  const to = arr?.icao || arr?.iata || arr?.name || arr?.city || "";
  if (!from && !to) {
    return "N/A";
  }
  return `${from || "Unknown"} -> ${to || "Unknown"}`;
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return "N/A";
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "N/A";
  }
  return date.toLocaleString();
}

function FlightPredictionTable({ flight, fetchedAt, routeData }) {
  if (!flight) {
    return (
      <section className="panel">
        <h2>Flight Prediction Details</h2>
        <p className="meta-line">Select a live flight to see prediction details.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Flight Prediction Details</h2>
      <p className="meta-line">
        Predicted turbulence is the model&apos;s short-horizon forecast (next update window, roughly ~1 minute).
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Flight ID (ICAO24)</th>
              <th>Callsign</th>
              <th>Route</th>
              <th>Current Turbulence</th>
              <th>Predicted Turbulence</th>
              <th>Confidence</th>
              <th>Last Refresh</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{flight.icao24 || "N/A"}</td>
              <td>{(flight.callsign || "N/A").trim() || "N/A"}</td>
              <td>{formatRoute(routeData)}</td>
              <td>
                <RiskBadge level={Number(flight.currentLevel ?? 0)} />
              </td>
              <td>
                <RiskBadge level={Number(flight.predictedLevel ?? 0)} />
              </td>
              <td>{(((Number(flight.confidence) || 0) * 100) || 0).toFixed(0)}%</td>
              <td>{formatTimestamp(fetchedAt)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default FlightPredictionTable;


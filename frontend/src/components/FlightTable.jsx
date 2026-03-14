import RiskBadge from "./RiskBadge";

function FlightTable({ flights }) {
  if (!flights.length) {
    return <p>No flights available for this fetch window.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ICAO24</th>
            <th>Callsign</th>
            <th>Altitude (m)</th>
            <th>Velocity (m/s)</th>
            <th>Vertical Rate</th>
            <th>Current</th>
            <th>Predicted</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {flights.map((flight) => (
            <tr key={flight.icao24}>
              <td>{flight.icao24}</td>
              <td>{flight.callsign}</td>
              <td>{flight.altitude.toLocaleString()}</td>
              <td>{flight.velocity}</td>
              <td>{flight.verticalRate}</td>
              <td>
                <RiskBadge level={flight.currentLevel} />
              </td>
              <td>
                <RiskBadge level={flight.predictedLevel} />
              </td>
              <td>{(flight.confidence * 100).toFixed(0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default FlightTable;

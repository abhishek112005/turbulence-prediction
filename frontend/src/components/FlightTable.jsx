import RiskBadge from "./RiskBadge";
import { countryFromIcao24 } from "../utils/icao24Country";

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
            <th>Country</th>
            <th>Altitude (m)</th>
            <th>Velocity (m/s)</th>
            <th>Vertical Rate</th>
            <th>Current</th>
            <th>Predicted</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {flights.map((flight) => {
            const { name: countryName, flag } = countryFromIcao24(flight.icao24);
            const displayCountry = flight.originCountry || flight.origin_country || countryName;
            const displayFlag = (flight.originCountry || flight.origin_country) ? "🌐" : flag;

            return (
              <tr key={flight.icao24}>
                <td className="mono">{flight.icao24}</td>
                <td>{flight.callsign}</td>
                <td className="flt-country-cell">
                  <span className="flt-flag">{displayFlag}</span>
                  <span className="flt-country-name">{displayCountry}</span>
                </td>
                <td className="mono">{flight.altitude.toLocaleString()}</td>
                <td className="mono">{flight.velocity}</td>
                <td className="mono">{flight.verticalRate}</td>
                <td>
                  <RiskBadge level={flight.currentLevel} />
                </td>
                <td>
                  <RiskBadge level={flight.predictedLevel} />
                </td>
                <td className="mono">{(flight.confidence * 100).toFixed(0)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default FlightTable;

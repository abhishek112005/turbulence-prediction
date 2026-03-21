import { useState } from "react";

function RouteInput({ onSearch, busy, origins = [], destinations = [] }) {
  const [originCode, setOriginCode] = useState("");
  const [destinationCode, setDestinationCode] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    const originAirport = origins.find((airport) => airport.code === originCode) || null;
    const destinationAirport = destinations.find((airport) => airport.code === destinationCode) || null;

    if (!originAirport || !destinationAirport) {
      setError("Select both origin and destination from the airport list.");
      return;
    }

    setError("");
    onSearch({
      originCity: originAirport.city || originAirport.name || "",
      destinationCity: destinationAirport.city || destinationAirport.name || "",
      originAirport,
      destinationAirport
    });
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <h2>Route Assignment</h2>
      <label className="field-label" htmlFor="origin-city">
        Origin City
      </label>
      <select
        id="origin-city"
        className="input"
        value={originCode}
        onChange={(event) => setOriginCode(event.target.value)}
      >
        <option value="">{origins.length ? "Select live origin airport" : "No live origins available"}</option>
        {origins.map((airport) => (
          <option key={`origin-${airport.code}`} value={airport.code}>
            {airport.label}
          </option>
        ))}
      </select>

      <label className="field-label" htmlFor="destination-city">
        Destination City
      </label>
      <select
        id="destination-city"
        className="input"
        value={destinationCode}
        onChange={(event) => setDestinationCode(event.target.value)}
      >
        <option value="">{destinations.length ? "Select live destination airport" : "No live destinations available"}</option>
        {destinations.map((airport) => (
          <option key={`destination-${airport.code}`} value={airport.code}>
            {airport.label}
          </option>
        ))}
      </select>

      <div className="toolbar">
        <button className="action-btn" type="submit" disabled={busy}>
          {busy ? "Finding flights..." : "Find Route Flights"}
        </button>
      </div>

      {error ? <p className="error-line">{error}</p> : null}
    </form>
  );
}

export default RouteInput;

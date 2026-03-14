import { useState } from "react";
import { findAirportByCity } from "../data/airports";

function RouteInput({ onSearch, busy }) {
  const [originCity, setOriginCity] = useState("");
  const [destinationCity, setDestinationCity] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    const originAirport = findAirportByCity(originCity);
    const destinationAirport = findAirportByCity(destinationCity);

    if (!originAirport || !destinationAirport) {
      setError("Could not resolve one or both cities. Try major airport cities (ex: Hyderabad, Delhi).");
      return;
    }

    setError("");
    onSearch({
      originCity,
      destinationCity,
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
      <input
        id="origin-city"
        className="input"
        value={originCity}
        onChange={(event) => setOriginCity(event.target.value)}
        placeholder="ex: Hyderabad"
      />

      <label className="field-label" htmlFor="destination-city">
        Destination City
      </label>
      <input
        id="destination-city"
        className="input"
        value={destinationCity}
        onChange={(event) => setDestinationCity(event.target.value)}
        placeholder="ex: Delhi"
      />

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

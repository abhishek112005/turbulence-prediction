function FlightList({ flights, selectedFlight, onSelectFlight }) {
  return (
    <section className="panel">
      <h2>Matching Flights</h2>
      {!flights.length ? (
        <p className="meta-line">No flights for this route/time window.</p>
      ) : (
        <div className="flight-list">
          {flights.map((flight) => {
            const active = selectedFlight?.icao24 === flight.icao24;
            return (
              <button
                key={`${flight.icao24}-${flight.firstSeen || 0}`}
                type="button"
                className={`flight-list-item ${active ? "active" : ""}`}
                onClick={() => onSelectFlight(flight)}
              >
                <strong>{(flight.callsign || "N/A").trim() || "N/A"}</strong>
                <span>{flight.icao24}</span>
                <span>
                  {flight.estDepartureAirport || "N/A"} {"->"} {flight.estArrivalAirport || "N/A"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default FlightList;

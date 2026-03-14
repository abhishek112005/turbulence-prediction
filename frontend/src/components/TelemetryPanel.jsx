import StatCard from "./StatCard";

function TelemetryPanel({ selectedFlight, liveState, distanceCoveredKm = 0 }) {
  return (
    <section className="stats-grid">
      <StatCard
        label="Selected Flight"
        value={(selectedFlight?.callsign || "N/A").trim() || "N/A"}
        hint={selectedFlight?.icao24 || "No ICAO"}
      />
      <StatCard
        label="Altitude"
        value={liveState?.baro_altitude != null ? `${Math.round(liveState.baro_altitude)} m` : "N/A"}
        hint="barometric altitude"
      />
      <StatCard
        label="Velocity"
        value={liveState?.velocity != null ? `${Math.round(liveState.velocity)} m/s` : "N/A"}
        hint="ground speed"
      />
      <StatCard
        label="Vertical Rate"
        value={liveState?.vertical_rate != null ? `${liveState.vertical_rate.toFixed(2)} m/s` : "N/A"}
        hint="climb / descent"
      />
      <StatCard
        label="Distance Covered"
        value={`${distanceCoveredKm.toFixed(1)} km`}
        hint="route distance tracked"
      />
    </section>
  );
}

export default TelemetryPanel;

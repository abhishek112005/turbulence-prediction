import { useMemo } from "react";
import L from "leaflet";
import { Marker, Popup } from "react-leaflet";

function AircraftMarker({ liveState, callsign }) {
  if (
    !liveState ||
    !Number.isFinite(liveState.latitude) ||
    !Number.isFinite(liveState.longitude)
  ) {
    return null;
  }

  const heading = Number.isFinite(liveState.true_track) ? liveState.true_track : 0;
  const icon = useMemo(
    () =>
      L.divIcon({
        className: "aircraft-icon-wrap",
        html: `<div class="aircraft-icon" style="transform: rotate(${heading}deg)">✈</div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      }),
    [heading]
  );

  return (
    <Marker position={[liveState.latitude, liveState.longitude]} icon={icon}>
      <Popup>
        <strong>{callsign || "Aircraft"}</strong>
        <div>ICAO24: {liveState.icao24 || "N/A"}</div>
        <div>Altitude: {Math.round(liveState.baro_altitude || 0)} m</div>
      </Popup>
    </Marker>
  );
}

export default AircraftMarker;

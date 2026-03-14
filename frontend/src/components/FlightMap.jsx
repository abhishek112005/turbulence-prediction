import { useMemo } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import AircraftMarker from "./AircraftMarker";
import AirportMarkers from "./AirportMarkers";
import RoutePolyline from "./RoutePolyline";
import TurbulenceOverlay from "./TurbulenceOverlay";

function AutoCenter({ center }) {
  const map = useMap();
  map.setView(center, map.getZoom(), { animate: true });
  return null;
}

function FlightMap({ originAirport, destinationAirport, pathPoints, liveState, segments, selectedFlight }) {
  const center = useMemo(() => {
    if (liveState && Number.isFinite(liveState.latitude) && Number.isFinite(liveState.longitude)) {
      return [liveState.latitude, liveState.longitude];
    }
    if (originAirport) {
      return [originAirport.lat, originAirport.lon];
    }
    return [20, 78];
  }, [liveState, originAirport]);

  return (
    <section className="panel">
      <h2>Flight Path + Live Marker</h2>
      <div className="map-wrap">
        <MapContainer center={center} zoom={5} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />
          <AutoCenter center={center} />
          <AirportMarkers originAirport={originAirport} destinationAirport={destinationAirport} />
          <RoutePolyline pathPoints={pathPoints} />
          <TurbulenceOverlay segments={segments} />
          <AircraftMarker liveState={liveState} callsign={selectedFlight?.callsign} />
        </MapContainer>
      </div>
    </section>
  );
}

export default FlightMap;

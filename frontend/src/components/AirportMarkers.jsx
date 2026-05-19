import { Marker, Popup } from "react-leaflet";
import L from "leaflet";

function makePin(color) {
  return L.divIcon({
    className: "",
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24C24 5.373 18.627 0 12 0z"
        fill="${color}" stroke="#fff" stroke-width="1.5"/>
      <circle cx="12" cy="12" r="5" fill="#fff"/>
    </svg>`,
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -36],
  });
}

const GREEN_PIN = makePin("#22c55e");
const RED_PIN   = makePin("#ef4444");

function AirportMarkers({ originAirport, destinationAirport }) {
  return (
    <>
      {originAirport ? (
        <Marker position={[originAirport.lat, originAirport.lon]} icon={GREEN_PIN}>
          <Popup>
            <strong>Origin</strong>
            <div>{originAirport.city.toUpperCase()}</div>
            <div>{originAirport.icao}</div>
          </Popup>
        </Marker>
      ) : null}

      {destinationAirport ? (
        <Marker position={[destinationAirport.lat, destinationAirport.lon]} icon={RED_PIN}>
          <Popup>
            <strong>Destination</strong>
            <div>{destinationAirport.city.toUpperCase()}</div>
            <div>{destinationAirport.icao}</div>
          </Popup>
        </Marker>
      ) : null}
    </>
  );
}

export default AirportMarkers;

import { Marker, Popup } from "react-leaflet";

function AirportMarkers({ originAirport, destinationAirport }) {
  return (
    <>
      {originAirport ? (
        <Marker position={[originAirport.lat, originAirport.lon]}>
          <Popup>
            <strong>Origin</strong>
            <div>{originAirport.city.toUpperCase()}</div>
            <div>{originAirport.icao}</div>
          </Popup>
        </Marker>
      ) : null}

      {destinationAirport ? (
        <Marker position={[destinationAirport.lat, destinationAirport.lon]}>
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

import { Polyline } from "react-leaflet";

function RoutePolyline({ pathPoints }) {
  if (!pathPoints || pathPoints.length < 2) {
    return null;
  }

  const positions = pathPoints.map((point) => [point.latitude, point.longitude]);
  return <Polyline positions={positions} pathOptions={{ color: "#2563eb", weight: 3 }} />;
}

export default RoutePolyline;

import { Polyline } from "react-leaflet";

function levelFromSegment(segment) {
  const diff = Math.abs((segment.toAlt || 0) - (segment.fromAlt || 0));
  if (diff < 120) {
    return { level: 0, color: "green", label: "Calm" };
  }
  if (diff < 260) {
    return { level: 1, color: "yellow", label: "Light" };
  }
  if (diff < 500) {
    return { level: 2, color: "orange", label: "Moderate" };
  }
  return { level: 3, color: "red", label: "Severe" };
}

export function buildTurbulenceSegments(pathPoints) {
  if (!pathPoints || pathPoints.length < 2) {
    return [];
  }

  const segments = [];
  for (let i = 0; i < pathPoints.length - 1; i += 1) {
    const current = pathPoints[i];
    const next = pathPoints[i + 1];
    const rating = levelFromSegment({
      fromAlt: current.altitude,
      toAlt: next.altitude
    });

    segments.push({
      id: `${i}-${i + 1}`,
      color: rating.color,
      label: rating.label,
      positions: [
        [current.latitude, current.longitude],
        [next.latitude, next.longitude]
      ]
    });
  }

  return segments;
}

function TurbulenceOverlay({ segments }) {
  if (!segments || !segments.length) {
    return null;
  }

  return (
    <>
      {segments.map((segment) => (
        <Polyline
          key={segment.id}
          positions={segment.positions}
          pathOptions={{ color: segment.color, weight: 5, opacity: 0.75 }}
        />
      ))}
    </>
  );
}

export default TurbulenceOverlay;

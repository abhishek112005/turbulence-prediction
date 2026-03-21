import { memo, useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";

function MapAutoFit() {
  const map = useMap();

  useEffect(() => {
    const invalidate = () => {
      try {
        map.invalidateSize(true);
      } catch {
        // ignore
      }
    };

    const id = window.setTimeout(invalidate, 50);
    window.addEventListener("resize", invalidate);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("resize", invalidate);
    };
  }, [map]);

  return null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function intensityColor(intensity) {
  // Boost low values so the map isn't "all blue" when intensities cluster near 0.
  const raw = clamp(Number(intensity) || 0, 0, 1);
  const t = Math.pow(raw, 0.55);

  // Blue -> Orange -> Magenta-ish (similar to the reference heatmap vibe).
  const stops = [
    { t: 0.0, r: 64, g: 156, b: 255 }, // light blue
    { t: 0.5, r: 255, g: 166, b: 64 }, // orange
    { t: 1.0, r: 197, g: 29, b: 180 } // magenta
  ];

  let left = stops[0];
  let right = stops[stops.length - 1];
  for (let i = 0; i < stops.length; i += 1) {
    if (stops[i].t <= t) {
      left = stops[i];
    }
    if (stops[i].t >= t) {
      right = stops[i];
      break;
    }
  }
  const span = right.t - left.t || 1;
  const k = (t - left.t) / span;

  const r = Math.round(left.r + (right.r - left.r) * k);
  const g = Math.round(left.g + (right.g - left.g) * k);
  const b = Math.round(left.b + (right.b - left.b) * k);
  return `rgb(${r}, ${g}, ${b})`;
}

function formatPct(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function TurbulenceHeatmap({ cells, gridDeg }) {
  const markers = useMemo(() => {
    return (cells || []).map((cell) => {
      const intensity = Number(cell.intensity) || 0;
      const count = Number(cell.count) || 0;
      const radius = clamp(4 + Math.sqrt(count) * 3.2, 4, 18);
      const color = intensityColor(intensity);
      const boosted = Math.pow(clamp(intensity, 0, 1), 0.55);

      return (
        <CircleMarker
          key={`${cell.lat}:${cell.lon}`}
          center={[cell.lat, cell.lon]}
          radius={radius}
          pathOptions={{
            color,
            weight: 2,
            opacity: 0.9,
            fillColor: color,
            fillOpacity: clamp(0.22 + boosted * 0.68, 0.22, 0.86)
          }}
        >
          <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
            <div className="mono">Grid: {gridDeg}°</div>
            <div>Count: {cell.count}</div>
            <div>Avg level: {cell.avgLevel}</div>
            <div>Severe: {formatPct(cell.severePct)}</div>
            <div>Intensity: {Math.round(boosted * 100)}%</div>
            <div>Continent: {cell.continent}</div>
          </Tooltip>
        </CircleMarker>
      );
    });
  }, [cells, gridDeg]);

  return (
    <div className="heatmap-wrap">
      <div className="map-wrap heatmap-map">
        <MapContainer center={[20, 0]} zoom={2} minZoom={2} style={{ height: "100%", width: "100%" }}>
          <MapAutoFit />
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />
          {markers}
        </MapContainer>

        <div className="heatmap-legend-overlay" aria-hidden="true">
          <div className="heatmap-legend-title">Intensity scale</div>
          <div className="heatmap-bar" />
          <div className="heatmap-labels">
            <span>Low</span>
            <span>Medium</span>
            <span>High</span>
          </div>
          <div className="heatmap-legend-note">
            Color = turbulence intensity (avg level × confidence). Larger circles = more aircraft samples in that grid.
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(TurbulenceHeatmap);

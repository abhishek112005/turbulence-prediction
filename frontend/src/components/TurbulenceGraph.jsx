const LEVEL_LABELS = ["Calm", "Light", "Moderate", "Severe"];

function toLevelY(level, height, padding) {
  const clamped = Math.max(0, Math.min(3, Number(level) || 0));
  const usableHeight = height - padding * 2;
  return padding + usableHeight * (1 - clamped / 3);
}

function buildPolyline(history, key, width, height, padding) {
  if (!history.length) {
    return "";
  }

  const step = history.length > 1 ? (width - padding * 2) / (history.length - 1) : 0;
  return history
    .map((point, index) => {
      const x = padding + step * index;
      const y = toLevelY(point[key], height, padding);
      return `${x},${y}`;
    })
    .join(" ");
}

function TurbulenceGraph({ history }) {
  const width = 520;
  const height = 240;
  const padding = 28;
  const currentLine = buildPolyline(history, "currentLevel", width, height, padding);
  const predictedLine = buildPolyline(history, "predictedLevel", width, height, padding);
  const latest = history[history.length - 1];
  const xTickIndices = [0, Math.floor((history.length - 1) / 2), history.length - 1]
    .filter((idx, pos, arr) => idx >= 0 && arr.indexOf(idx) === pos);
  const step = history.length > 1 ? (width - padding * 2) / (history.length - 1) : 0;

  function formatTime(timestamp) {
    if (!timestamp) {
      return "--:--:--";
    }
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour12: false });
  }

  return (
    <section className="panel">
      <h2>Turbulence Trend Graph</h2>
      {!history.length ? (
        <p className="meta-line">Waiting for live prediction points...</p>
      ) : (
        <>
          <svg className="turb-graph" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Turbulence trend graph">
            {[0, 1, 2, 3].map((lvl) => (
              <g key={lvl}>
                <line
                  x1={padding}
                  x2={width - padding}
                  y1={toLevelY(lvl, height, padding)}
                  y2={toLevelY(lvl, height, padding)}
                  stroke="rgba(159,176,211,0.35)"
                  strokeWidth="1"
                />
                <text x="6" y={toLevelY(lvl, height, padding) + 4} fill="#9fb0d3" fontSize="11">
                  {LEVEL_LABELS[lvl]}
                </text>
              </g>
            ))}

            <polyline fill="none" stroke="#67e8f9" strokeWidth="2.5" points={currentLine} />
            <polyline fill="none" stroke="#f97316" strokeWidth="2.5" points={predictedLine} />

            {xTickIndices.map((idx) => {
              const x = padding + step * idx;
              const label = formatTime(history[idx]?.timestamp);
              return (
                <g key={`x-tick-${idx}`}>
                  <line
                    x1={x}
                    x2={x}
                    y1={height - padding}
                    y2={height - padding + 6}
                    stroke="#9fb0d3"
                    strokeWidth="1"
                  />
                  <text x={x - 24} y={height - 4} fill="#9fb0d3" fontSize="10">
                    {label}
                  </text>
                </g>
              );
            })}
          </svg>

          <div className="graph-meta">
            <span className="insight-pill">Current line: cyan</span>
            <span className="insight-pill">Predicted line: orange</span>
            <span className="insight-pill">X-axis: time</span>
            {latest ? (
              <span className="insight-pill">
                Latest confidence: <strong>{Math.round((latest.confidence || 0) * 100)}%</strong>
              </span>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

export default TurbulenceGraph;

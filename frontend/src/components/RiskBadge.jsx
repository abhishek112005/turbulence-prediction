const labels = ["Calm", "Light", "Moderate", "Severe"];

function RiskBadge({ level }) {
  const safeLevel = Number.isFinite(level) ? level : 0;

  return (
    <span className={`risk-badge level-${safeLevel}`}>
      {labels[safeLevel] || "Unknown"}
    </span>
  );
}

export default RiskBadge;

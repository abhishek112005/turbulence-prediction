import { useMemo, useState } from "react";
import { groupFlightsByCountry } from "../utils/icao24Country";

const LEVEL_COLORS = ["#2dd4bf", "#f59e0b", "#fb7185", "#ef4444"];
const LEVEL_LABELS = ["Calm", "Light", "Moderate", "Severe"];
const LEVEL_KEYS   = ["calm", "light", "moderate", "severe"];

function TurbBreakdown({ levels, total }) {
  return (
    <div className="fpc-turb-track" title={
      LEVEL_KEYS.map((k, i) => `${LEVEL_LABELS[i]}: ${levels[k]}`).join(" · ")
    }>
      {LEVEL_KEYS.map((key, i) => {
        const w = total > 0 ? (levels[key] / total) * 100 : 0;
        return w > 0 ? (
          <div
            key={key}
            className="fpc-turb-seg"
            style={{ width: `${w}%`, background: LEVEL_COLORS[i] }}
          />
        ) : null;
      })}
    </div>
  );
}

function WorstBadge({ level }) {
  if (level === 0) return null;
  return (
    <span
      className="fpc-worst-badge"
      style={{ background: LEVEL_COLORS[level] }}
    >
      {LEVEL_LABELS[level]}
    </span>
  );
}

function FlightsPerCountry({ flights = [], selectedCountry = null, onCountrySelect }) {
  const [showAll, setShowAll] = useState(false);
  const countries = useMemo(() => groupFlightsByCountry(flights), [flights]);

  const displayed = showAll ? countries : countries.slice(0, 10);
  const maxCount  = countries[0]?.count || 1;

  if (!flights.length) {
    return (
      <div className="fpc-empty">
        <p className="meta-line">No flight data available. Run the pipeline to see country distribution.</p>
      </div>
    );
  }

  const totalSevere   = countries.reduce((s, c) => s + c.levels.severe, 0);
  const totalModerate = countries.reduce((s, c) => s + c.levels.moderate, 0);

  const handleClick = (name) => {
    if (!onCountrySelect) return;
    onCountrySelect(selectedCountry === name ? null : name);
  };

  return (
    <div className="fpc-root">
      {/* Summary row */}
      <div className="fpc-summary">
        <span className="fpc-total">{flights.length} flights</span>
        <span className="fpc-spread">across {countries.length} countr{countries.length === 1 ? "y" : "ies"}</span>
        {totalSevere > 0 && (
          <span className="fpc-alert-chip fpc-alert-severe">{totalSevere} severe</span>
        )}
        {totalModerate > 0 && (
          <span className="fpc-alert-chip fpc-alert-moderate">{totalModerate} moderate</span>
        )}
        {selectedCountry && (
          <button
            className="fpc-clear-btn"
            onClick={() => onCountrySelect?.(null)}
          >
            ✕ Clear filter
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="fpc-legend">
        {LEVEL_KEYS.map((k, i) => (
          <span key={k} className="fpc-legend-item">
            <span className="fpc-legend-dot" style={{ background: LEVEL_COLORS[i] }} />
            {LEVEL_LABELS[i]}
          </span>
        ))}
      </div>

      {/* Country rows */}
      <div className="fpc-list">
        {displayed.map(({ name, flag, count, pct, levels, worstLevel }) => {
          const isSelected = selectedCountry === name;
          return (
            <div
              key={name}
              className={`fpc-row ${isSelected ? "fpc-row--selected" : ""} ${onCountrySelect ? "fpc-row--clickable" : ""}`}
              onClick={() => handleClick(name)}
              title={onCountrySelect ? `Click to filter Fleet Monitor by ${name}` : undefined}
            >
              <div className="fpc-label">
                <span className="fpc-flag">{flag}</span>
                <span className="fpc-name">{name}</span>
                <WorstBadge level={worstLevel} />
              </div>

              <div className="fpc-bar-wrap">
                <div
                  className="fpc-bar"
                  style={{ width: `${(count / maxCount) * 100}%` }}
                />
                <TurbBreakdown levels={levels} total={count} />
              </div>

              <div className="fpc-count-col">
                <span className="fpc-count">{count}</span>
                <span className="fpc-pct">{pct.toFixed(1)}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {countries.length > 10 && (
        <button
          className="fpc-show-more"
          onClick={() => setShowAll(v => !v)}
        >
          {showAll
            ? "Show less"
            : `Show all ${countries.length} countries (+${countries.length - 10} more)`}
        </button>
      )}

      {onCountrySelect && (
        <p className="fpc-hint meta-line">
          Click a country to filter the Fleet Monitor below.
        </p>
      )}
    </div>
  );
}

export default FlightsPerCountry;

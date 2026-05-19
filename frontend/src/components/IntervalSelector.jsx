import { useState } from "react";

function IntervalSelector({ onClose, onSelect }) {
  const [selected, setSelected] = useState(30);

  return (
    <div className="interval-modal-overlay" onClick={onClose}>
      <div className="interval-modal" onClick={(e) => e.stopPropagation()}>
        <h3>⚙️ Auto-Fetch ML Model</h3>
        <p>Select how often you want to automatically fetch and run the ML model predictions.</p>

        <div className="interval-options">
          <div
            className={`interval-option ${selected === 30 ? "selected" : ""}`}
            onClick={() => setSelected(30)}
          >
            <span className="interval-option-label">30 sec</span>
            <span className="interval-option-desc">Fast updates</span>
          </div>

          <div
            className={`interval-option ${selected === 60 ? "selected" : ""}`}
            onClick={() => setSelected(60)}
          >
            <span className="interval-option-label">1 min</span>
            <span className="interval-option-desc">Balanced</span>
          </div>
        </div>

        <div className="interval-actions">
          <button
            className="action-btn success"
            onClick={() => {
              onSelect(selected);
              onClose();
            }}
          >
            Start Auto-Fetch
          </button>
          <button className="action-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default IntervalSelector;

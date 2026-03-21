import { useEffect, useState } from "react";

export default function AlertBanner({ alert, onDismiss }) {
  const [countdown, setCountdown] = useState(null);

  const persist = alert?.t >= 3;
  const duration = alert?.t === 5 ? 20 : 30;

  useEffect(() => {
    if (!alert || persist) {
      return undefined;
    }
    setCountdown(duration);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onDismiss();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [alert]);

  if (!alert) {
    return null;
  }

  const bgMap = {
    1: "#052e16",
    2: "#1c1003",
    3: "#1c0303",
    4: "#1c0303",
    5: "#030f1c"
  };

  const pulse = alert.t >= 3;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: bgMap[alert.t] || "#111",
        borderBottom: `3px solid ${alert.color}`,
        padding: "14px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        animation: pulse ? "pulse-border 1s infinite" : "slide-down 0.3s ease"
      }}
    >
      <style>{`
        @keyframes slide-down {
          from { transform: translateY(-100%); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
        @keyframes pulse-border {
          0%,100% { border-bottom-color: ${alert.color}; }
          50% { border-bottom-color: transparent; }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: alert.color
          }}
        />
        <div>
          <div
            style={{
              color: alert.color,
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: 1
            }}
          >
            {alert.label}
          </div>
          <div style={{ color: "#ccc", fontSize: 13 }}>{alert.m}</div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {!persist && countdown !== null ? (
          <div style={{ position: "relative", width: 36, height: 36 }}>
            <svg width="36" height="36" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="18" cy="18" r="14" fill="none" stroke="#333" strokeWidth="3" />
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke={alert.color}
                strokeWidth="3"
                strokeDasharray={`${2 * Math.PI * 14}`}
                strokeDashoffset={`${2 * Math.PI * 14 * (1 - countdown / duration)}`}
                style={{ transition: "stroke-dashoffset 1s linear" }}
              />
            </svg>
            <span
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%,-50%)",
                fontSize: 10,
                color: "#ccc"
              }}
            >
              {countdown}
            </span>
          </div>
        ) : null}
        <button
          onClick={onDismiss}
          style={{
            background: "none",
            border: "none",
            color: "#888",
            fontSize: 20,
            cursor: "pointer",
            padding: "4px 8px"
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

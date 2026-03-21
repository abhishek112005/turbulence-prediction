import { useEffect, useRef, useState } from "react";
import { useServerURL } from "./useServerURL";

export function useFlightRoom(roomCode) {
  const { ws: wsBase } = useServerURL();
  const wsRef = useRef(null);
  const [lastAlert, setLastAlert] = useState(null);
  const [alertHistory, setAlertHistory] = useState([]);
  const [status, setStatus] = useState("disconnected");
  const reconnectTimer = useRef(null);

  const ALERT_LABELS = {
    1: { label: "Calm", color: "#22c55e" },
    2: { label: "Moderate turbulence", color: "#f59e0b" },
    3: { label: "Severe turbulence", color: "#ef4444" },
    4: { label: "EMERGENCY", color: "#dc2626" },
    5: { label: "ETA Update", color: "#3b82f6" }
  };

  function connect() {
    if (!roomCode) {
      return;
    }

    const url = `${wsBase}/ws/${roomCode}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      clearInterval(reconnectTimer.current);
      reconnectTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send("ping");
        }
      }, 25000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const enriched = {
          ...data,
          ...ALERT_LABELS[data.t],
          timestamp: new Date().toLocaleTimeString()
        };
        setLastAlert(enriched);
        setAlertHistory((prev) => [enriched, ...prev].slice(0, 20));
        if (data.t >= 3 && navigator.vibrate) {
          navigator.vibrate(data.t === 4 ? [500, 100, 500] : [200, 100, 200]);
        }
      } catch (error) {
        console.error("WS parse error", error);
      }
    };

    ws.onclose = () => {
      setStatus("reconnecting");
      clearInterval(reconnectTimer.current);
      setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      setStatus("reconnecting");
      ws.close();
    };
  }

  useEffect(() => {
    connect();
    return () => {
      clearInterval(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [roomCode]);

  function dismissAlert() {
    setLastAlert(null);
  }

  return { lastAlert, alertHistory, status, dismissAlert };
}

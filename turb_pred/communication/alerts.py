import asyncio
import os
import time

from database.db_connection import get_connection

from communication.connection_manager import passenger_connection_manager


_RECENT_ALERTS: dict[tuple[str, str, str, str], float] = {}


def ensure_alerts_table():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS alerts (
            id BIGSERIAL PRIMARY KEY,
            timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            alert_type TEXT NOT NULL,
            severity TEXT,
            message TEXT NOT NULL,
            flight_id TEXT
        );
        """
    )
    conn.commit()
    cursor.close()
    conn.close()


def save_alert(alert_type, severity, message, flight_id):
    ensure_alerts_table()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO alerts (alert_type, severity, message, flight_id)
        VALUES (%s, %s, %s, %s);
        """,
        (alert_type, severity, message, flight_id),
    )
    conn.commit()
    cursor.close()
    conn.close()


def should_emit_alert(payload, dedupe_seconds):
    if dedupe_seconds <= 0:
        return True

    key = (
        str(payload.get("type") or ""),
        str(payload.get("severity") or ""),
        str(payload.get("message") or ""),
        str(payload.get("flight_id") or ""),
    )
    now = time.monotonic()
    last_sent = _RECENT_ALERTS.get(key)
    if last_sent is not None and now - last_sent < dedupe_seconds:
        return False

    _RECENT_ALERTS[key] = now
    return True


async def broadcast_alert(payload):
    # Safety: by default, do not broadcast globally to all passengers.
    # Room-specific passenger alerts are handled via `/ws/{room}` in the pipeline API.
    if os.getenv("ENABLE_GLOBAL_PASSENGER_ALERTS", "").strip() not in {"1", "true", "TRUE", "yes", "YES"}:
        return
    await passenger_connection_manager.broadcast(payload)


def dispatch_alert(payload, dedupe_seconds=0):
    if not should_emit_alert(payload, dedupe_seconds):
        return False

    save_alert(
        alert_type=payload.get("type") or "notice",
        severity=payload.get("severity"),
        message=payload.get("message") or "",
        flight_id=payload.get("flight_id"),
    )

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        asyncio.run(broadcast_alert(payload))
    else:
        loop.create_task(broadcast_alert(payload))

    return True

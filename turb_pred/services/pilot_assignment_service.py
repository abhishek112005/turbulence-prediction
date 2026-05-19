from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from models.db_models import FlightStatus, PilotAircraftMap, PilotFlightSession, User
from services.flight_data_fusion import FlightFusionService, normalize_icao24


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class PilotAssignmentService:
    def __init__(self, db: Session):
        self.db = db
        self.flight_fusion = FlightFusionService(db)

    def get_active_pilot(self, email: str) -> User:
        stmt = select(User).where(User.email.ilike(email), User.role == "pilot", User.is_active.is_(True))
        pilot = self.db.execute(stmt).scalar_one_or_none()
        if not pilot:
            raise HTTPException(status_code=404, detail="Active pilot account not found.")
        return pilot

    def assign_aircraft(self, pilot_email: str, icao24: str) -> PilotAircraftMap:
        pilot = self.get_active_pilot(pilot_email)
        normalized_icao24 = normalize_icao24(icao24)
        if not normalized_icao24:
            raise HTTPException(status_code=400, detail="ICAO24 is required.")

        existing_owner = self.db.execute(
            select(PilotAircraftMap).where(PilotAircraftMap.icao24 == normalized_icao24)
        ).scalar_one_or_none()
        if existing_owner and existing_owner.pilot_id != pilot.id:
            raise HTTPException(status_code=409, detail="This ICAO24 is already assigned to another pilot.")

        mapping = self.db.execute(
            select(PilotAircraftMap).where(PilotAircraftMap.pilot_id == pilot.id)
        ).scalar_one_or_none()
        if mapping is None:
            mapping = PilotAircraftMap(pilot_id=pilot.id, icao24=normalized_icao24)
            self.db.add(mapping)
        else:
            mapping.icao24 = normalized_icao24
            mapping.updated_at = _utcnow()

        self.db.flush()
        self._ensure_assignment_session(pilot=pilot, mapping=mapping, fused_flight=None, force_new=True)
        self.db.commit()
        self.db.refresh(mapping)
        return mapping

    def get_mapping_for_pilot(self, pilot_email: str) -> PilotAircraftMap:
        pilot = self.get_active_pilot(pilot_email)
        mapping = self.db.execute(
            select(PilotAircraftMap).where(PilotAircraftMap.pilot_id == pilot.id)
        ).scalar_one_or_none()
        if not mapping:
            raise HTTPException(status_code=404, detail="No aircraft mapping found for this pilot.")
        return mapping

    def get_current_assignment_card(self, pilot_email: str) -> dict:
        pilot = self.get_active_pilot(pilot_email)
        mapping = self.get_mapping_for_pilot(pilot_email)
        fused_flight = self.flight_fusion.get_fused_flight(mapping.icao24)
        session = self._ensure_assignment_session(pilot=pilot, mapping=mapping, fused_flight=fused_flight)

        if session.flight_status == FlightStatus.ACTIVE.value and fused_flight["liveState"].get("onGround"):
            session.flight_status = FlightStatus.COMPLETED.value
            session.completed_at = _utcnow()
            self.db.commit()
            self.db.refresh(session)

        return self._serialize_assignment(mapping=mapping, session=session, fused_flight=fused_flight)

    def start_flight(self, pilot_email: str) -> dict:
        pilot = self.get_active_pilot(pilot_email)
        mapping = self.get_mapping_for_pilot(pilot_email)
        fused_flight = self.flight_fusion.get_fused_flight(mapping.icao24)
        session = self._ensure_assignment_session(pilot=pilot, mapping=mapping, fused_flight=fused_flight)

        if session.flight_status == FlightStatus.COMPLETED.value:
            session = self._ensure_assignment_session(pilot=pilot, mapping=mapping, fused_flight=fused_flight, force_new=True)

        if session.flight_status == FlightStatus.ASSIGNED.value:
            session.flight_status = FlightStatus.ACTIVE.value
            session.started_at = _utcnow()

        self._refresh_session_snapshot(session, fused_flight)
        self.db.commit()
        self.db.refresh(session)
        return self._serialize_assignment(mapping=mapping, session=session, fused_flight=fused_flight)

    def end_flight(self, pilot_email: str) -> dict:
        pilot = self.get_active_pilot(pilot_email)
        mapping = self.get_mapping_for_pilot(pilot_email)
        session = self._get_latest_session(pilot.id, mapping.id)
        if not session:
            raise HTTPException(status_code=404, detail="No flight session found for this pilot.")
        if session.flight_status != FlightStatus.COMPLETED.value:
            session.flight_status = FlightStatus.COMPLETED.value
            session.completed_at = _utcnow()
            if session.started_at is None:
                session.started_at = session.created_at
        fused_flight = self.flight_fusion.get_fused_flight(mapping.icao24)
        self._refresh_session_snapshot(session, fused_flight)
        self.db.commit()
        self.db.refresh(session)
        return self._serialize_assignment(mapping=mapping, session=session, fused_flight=fused_flight)

    def _ensure_assignment_session(
        self,
        pilot: User,
        mapping: PilotAircraftMap,
        fused_flight: dict | None,
        force_new: bool = False,
    ) -> PilotFlightSession:
        latest = self._get_latest_session(pilot.id, mapping.id)
        if latest and not force_new and latest.flight_status != FlightStatus.COMPLETED.value:
            self._refresh_session_snapshot(latest, fused_flight)
            self.db.flush()
            return latest

        session = PilotFlightSession(
            pilot_id=pilot.id,
            aircraft_map_id=mapping.id,
            flight_status=FlightStatus.ASSIGNED.value,
        )
        self._refresh_session_snapshot(session, fused_flight)
        self.db.add(session)
        self.db.flush()
        return session

    def _get_latest_session(self, pilot_id: int, aircraft_map_id: int) -> PilotFlightSession | None:
        return self.db.execute(
            select(PilotFlightSession)
            .where(
                PilotFlightSession.pilot_id == pilot_id,
                PilotFlightSession.aircraft_map_id == aircraft_map_id,
            )
            .order_by(PilotFlightSession.created_at.desc(), PilotFlightSession.id.desc())
        ).scalars().first()

    @staticmethod
    def _refresh_session_snapshot(session: PilotFlightSession, fused_flight: dict | None) -> None:
        if not fused_flight:
            return

        route = fused_flight.get("route") or {}
        session.callsign_snapshot = fused_flight.get("callsign")
        session.flight_number = fused_flight.get("flightNumber")
        session.departure_icao = ((route.get("departure") or {}).get("icao")) if route else None
        session.arrival_icao = ((route.get("arrival") or {}).get("icao")) if route else None
        session.updated_at = _utcnow()

    @staticmethod
    def _serialize_assignment(mapping: PilotAircraftMap, session: PilotFlightSession, fused_flight: dict) -> dict:
        return {
            "assignment": {
                "mappingId": mapping.id,
                "pilotId": mapping.pilot_id,
                "icao24": mapping.icao24,
                "mappedAt": mapping.created_at.isoformat() if mapping.created_at else None,
                "updatedAt": mapping.updated_at.isoformat() if mapping.updated_at else None,
            },
            "flightSession": {
                "id": session.id,
                "flightStatus": session.flight_status,
                "startedAt": session.started_at.isoformat() if session.started_at else None,
                "completedAt": session.completed_at.isoformat() if session.completed_at else None,
                "callsign": session.callsign_snapshot,
                "flightNumber": session.flight_number,
                "departureIcao": session.departure_icao,
                "arrivalIcao": session.arrival_icao,
            },
            "flight": fused_flight,
        }

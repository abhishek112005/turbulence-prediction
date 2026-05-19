from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.sqlalchemy import Base


class FlightStatus(str, Enum):
    ASSIGNED = "ASSIGNED"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, default=datetime.utcnow)

    pilot_aircraft_map: Mapped["PilotAircraftMap | None"] = relationship(
        back_populates="pilot",
        uselist=False,
    )
    flight_sessions: Mapped[list["PilotFlightSession"]] = relationship(back_populates="pilot")


class PilotAircraftMap(Base):
    __tablename__ = "pilot_aircraft_map"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pilot_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, unique=True)
    icao24: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    pilot: Mapped[User] = relationship(back_populates="pilot_aircraft_map")
    flight_sessions: Mapped[list["PilotFlightSession"]] = relationship(back_populates="aircraft_map")


class PilotFlightSession(Base):
    __tablename__ = "pilot_flight_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pilot_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    aircraft_map_id: Mapped[int] = mapped_column(ForeignKey("pilot_aircraft_map.id"), nullable=False)
    flight_status: Mapped[str] = mapped_column(String(16), nullable=False, default=FlightStatus.ASSIGNED.value)
    callsign_snapshot: Mapped[str | None] = mapped_column(String(64))
    flight_number: Mapped[str | None] = mapped_column(String(64))
    departure_icao: Mapped[str | None] = mapped_column(String(16))
    arrival_icao: Mapped[str | None] = mapped_column(String(16))
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    pilot: Mapped[User] = relationship(back_populates="flight_sessions")
    aircraft_map: Mapped[PilotAircraftMap] = relationship(back_populates="flight_sessions")

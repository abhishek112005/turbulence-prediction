from pydantic import BaseModel
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database.sqlalchemy import get_db
from models.db_models import User
from services.pilot_assignment_service import PilotAssignmentService
from utils.security import require_role


router = APIRouter(tags=["admin-assignments"])


class PilotAircraftMapRequest(BaseModel):
    pilot_email: str
    icao24: str


@router.post("/api/admin/pilot-aircraft-map")
def assign_pilot_aircraft(
    payload: PilotAircraftMapRequest,
    _: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    service = PilotAssignmentService(db)
    mapping = service.assign_aircraft(payload.pilot_email, payload.icao24)
    return {
        "message": "Pilot-aircraft mapping saved. Future flight detection is automatic.",
        "mapping": {
            "id": mapping.id,
            "pilotId": mapping.pilot_id,
            "icao24": mapping.icao24,
            "createdAt": mapping.created_at.isoformat() if mapping.created_at else None,
            "updatedAt": mapping.updated_at.isoformat() if mapping.updated_at else None,
        },
    }

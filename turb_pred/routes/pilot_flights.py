from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database.sqlalchemy import get_db
from models.db_models import User
from services.pilot_assignment_service import PilotAssignmentService
from utils.security import require_role


router = APIRouter(tags=["pilot-flight"])


@router.get("/pilot/flight")
@router.get("/api/pilot/flight", include_in_schema=False)
def get_current_pilot_flight(
    user: User = Depends(require_role("pilot")),
    db: Session = Depends(get_db),
):
    service = PilotAssignmentService(db)
    return service.get_current_assignment_card(user.email)


@router.post("/pilot/start-flight")
@router.post("/api/pilot/start-flight", include_in_schema=False)
def start_pilot_flight(
    user: User = Depends(require_role("pilot")),
    db: Session = Depends(get_db),
):
    service = PilotAssignmentService(db)
    return service.start_flight(user.email)


@router.post("/pilot/end-flight")
@router.post("/api/pilot/end-flight", include_in_schema=False)
def end_pilot_flight(
    user: User = Depends(require_role("pilot")),
    db: Session = Depends(get_db),
):
    service = PilotAssignmentService(db)
    return service.end_flight(user.email)

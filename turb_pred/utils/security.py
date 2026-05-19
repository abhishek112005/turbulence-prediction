from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from config.settings import JWT_ALGORITHM, JWT_EXPIRE_MINUTES, JWT_SECRET_KEY
from database.sqlalchemy import get_db
from models.db_models import User


bearer_scheme = HTTPBearer(auto_error=False)


def create_access_token(email: str, role: str, expires_minutes: int | None = None) -> str:
    expires_delta = timedelta(minutes=expires_minutes or JWT_EXPIRE_MINUTES)
    payload = {
        "sub": str(email).strip().lower(),
        "role": str(role).strip().lower(),
        "exp": datetime.now(timezone.utc) + expires_delta,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="JWT token expired.") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid JWT token.") from exc


def resolve_request_identity(request: Request) -> tuple[str, str | None]:
    auth_header = (request.headers.get("authorization") or "").strip()
    if auth_header.lower().startswith("bearer "):
        payload = decode_access_token(auth_header.split(" ", 1)[1].strip())
        return str(payload.get("sub") or "").strip().lower(), str(payload.get("role") or "").strip().lower() or None

    email = (request.headers.get("x-user-email") or "").strip().lower()
    return email, None


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    email = ""
    role_from_token = None

    if credentials:
        payload = decode_access_token(credentials.credentials)
        email = str(payload.get("sub") or "").strip().lower()
        role_from_token = str(payload.get("role") or "").strip().lower() or None
    else:
        email = (request.headers.get("x-user-email") or "").strip().lower()

    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    user = db.execute(select(User).where(User.email.ilike(email), User.is_active.is_(True))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authenticated user not found.")

    if role_from_token and user.role.lower() != role_from_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token role mismatch.")

    return user


def require_role(required_role: str):
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role.lower() != required_role.lower():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"{required_role.title()} access required.")
        return user

    return dependency

from fastapi import HTTPException
import requests


def verify_google_token_and_get_email(token: str) -> str:
    verify_response = requests.get(
        "https://oauth2.googleapis.com/tokeninfo",
        params={"id_token": token},
        timeout=20,
    )

    if verify_response.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google token.")

    token_info = verify_response.json()
    email = (token_info.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Google token missing email.")

    return email

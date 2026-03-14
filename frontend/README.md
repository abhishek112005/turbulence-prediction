# Turbulence Frontend (Temp)

Temporary React frontend for your turbulence prediction project.

## Backend (Pipeline API)

Run this first in a separate terminal:

1. `cd c:\Abhishek\SUMMER-INTERNSHIP\turb_pred`
2. `pip install -r requirements.txt`
3. `uvicorn api.pipeline_api:app --reload --host 127.0.0.1 --port 8000`

## Start

1. Open terminal in `frontend`
2. Run `npm install`
3. Run `npm run dev`
4. Open the local URL shown by Vite

## Notes

- `Fetch Live Data` calls backend endpoint `POST /api/pipeline/run-live`.
- Backend runs: OpenSky fetch -> DB insert -> clean/features -> model predict -> DB store.
- `Use Mock Data` is available for UI testing when backend is down.
- Designed to work on desktop and mobile.

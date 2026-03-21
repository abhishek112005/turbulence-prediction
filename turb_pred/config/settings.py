import os

# OpenSky API credentials
CLIENT_ID = os.getenv("CLIENT_ID", "mdjohnpaulreddy-api-client")
CLIENT_SECRET = os.getenv("CLIENT_SECRET", "7jOxtFGc01ZHvwMe32w16fZLBIdB0o1N")
AVIATIONSTACK_ACCESS_KEY = os.getenv("AVIATIONSTACK_ACCESS_KEY", "fc057cefd03851bb282926d8ea5d2761")
AVIATIONSTACK_BASE_URL = os.getenv("AVIATIONSTACK_BASE_URL", "https://api.aviationstack.com/v1")

# PostgreSQL settings
DB_NAME = os.getenv("DB_NAME", "planes")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "Abhi1234")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")

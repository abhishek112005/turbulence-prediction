import os

# OpenSky API credentials
CLIENT_ID = os.getenv("CLIENT_ID", "abhishekpersonal51@gmail.com-api-client")
CLIENT_SECRET = os.getenv("CLIENT_SECRET", "ptrLNHhHDUK63fk5Xf7Teg72tJBxj5gj")
AVIATIONSTACK_ACCESS_KEY = os.getenv("AVIATIONSTACK_ACCESS_KEY", "fc057cefd03851bb282926d8ea5d2761")
AVIATIONSTACK_BASE_URL = os.getenv("AVIATIONSTACK_BASE_URL", "https://api.aviationstack.com/v1")

# PostgreSQL settings
DB_NAME = os.getenv("DB_NAME", "planes")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "Abhi1234")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")

SQLALCHEMY_DATABASE_URL = os.getenv(
    "SQLALCHEMY_DATABASE_URL",
    f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}",
)

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "turbulence-platform-dev-secret-key-2026")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "480"))

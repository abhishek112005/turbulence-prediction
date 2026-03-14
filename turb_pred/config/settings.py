import os

# OpenSky API credentials
CLIENT_ID = os.getenv("CLIENT_ID", "abhishekpothanagari@gmail.com-api-client")
CLIENT_SECRET = os.getenv("CLIENT_SECRET", "ado7IxewwJDcHa4hsTUdjxQC8RgkPoVt")

# PostgreSQL settings
DB_NAME = os.getenv("DB_NAME", "planes")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "Abhi1234")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")

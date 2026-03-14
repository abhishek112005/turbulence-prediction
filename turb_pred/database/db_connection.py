import psycopg2
from config.settings import DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT


def get_connection():
    """
    Creates and returns a PostgreSQL database connection.
    """

    try:
        connection = psycopg2.connect(
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            host=DB_HOST,
            port=DB_PORT
        )

        return connection

    except Exception as e:
        print("❌ Database connection error:", e)
        raise

import pandas as pd
from database.db_connection import get_connection


def fetch_data(limit=None):
    """
    Fetch historical aircraft telemetry data from planes_table.

    If limit is None:
        → Fetch full dataset (recommended for training)

    If limit is provided:
        → Fetch limited rows (useful for quick testing)
    """

    conn = get_connection()

    if limit:
        query = f"""
            SELECT *
            FROM planes_table
            ORDER BY icao24, fetched_at
            LIMIT {limit};
        """
    else:
        query = """
            SELECT *
            FROM planes_table
            ORDER BY icao24, fetched_at;
        """

    df = pd.read_sql(query, conn)
    conn.close()

    return df


def clean_dataframe(df):
    """
    Clean raw telemetry data.
    """

    print("Initial rows:", len(df))

    # Remove aircraft on ground
    df = df[df["on_ground"] == False]

    # Drop rows with missing critical telemetry
    df = df.dropna(subset=[
        "baro_altitude",
        "velocity",
        "vertical_rate",
        "longitude",
        "latitude"
    ])

    print("Rows after cleaning:", len(df))

    return df


if __name__ == "__main__":

    print("🔄 Fetching data from database...")

    df = fetch_data()   # Full historical data
    df = clean_dataframe(df)

    print("\n✅ Data Fetch & Cleaning Complete")
    print("Total rows:", len(df))

    print("\nSample Output:")
    print(df.head())
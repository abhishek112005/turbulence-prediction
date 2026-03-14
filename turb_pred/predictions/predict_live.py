import joblib
import pandas as pd

from database.db_connection import get_connection
from preprocessing.feature_engineering import (
    clean_dataframe,
    create_features,
    generate_turbulence_label
)


def fetch_latest_batch(limit=5000):
    conn = get_connection()

    query = f"""
        SELECT *
        FROM planes_table
        ORDER BY fetched_at DESC
        LIMIT {limit};
    """

    df = pd.read_sql(query, conn)
    conn.close()

    return df


def insert_predictions(predictions_df):
    conn = get_connection()
    cursor = conn.cursor()

    insert_query = """
        INSERT INTO predictions (icao24, predicted_turbulence, confidence)
        VALUES (%s, %s, %s)
    """

    for _, row in predictions_df.iterrows():
        cursor.execute(insert_query, (
            row["icao24"],
            int(row["prediction"]),
            float(row["confidence"])
        ))

    conn.commit()
    cursor.close()
    conn.close()


if __name__ == "__main__":

    print("🚀 Loading trained model...")
    model = joblib.load("turbulence_model.pkl")

    print("📡 Fetching latest aircraft batch...")
    df = fetch_latest_batch()

    df = clean_dataframe(df)
    df = create_features(df)

    features = [
        "baro_altitude",
        "velocity",
        "speed_altitude_ratio",
        "altitude_km"
    ]

    X = df[features]

    print("🤖 Predicting turbulence...")
    predictions = model.predict(X)
    probabilities = model.predict_proba(X)

    df["prediction"] = predictions
    df["confidence"] = probabilities.max(axis=1)

    print("💾 Inserting predictions into database...")
    insert_predictions(df[["icao24", "prediction", "confidence"]])

    print("✅ Live prediction completed successfully!")

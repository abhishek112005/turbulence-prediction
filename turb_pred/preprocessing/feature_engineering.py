import pandas as pd
import numpy as np
from preprocessing.clean_data import fetch_data, clean_dataframe


def create_features(df):
    """
    Create turbulence-related numerical features
    including temporal delta features.
    """

    # ------------------------------
    # BASIC FEATURES
    # ------------------------------

    df["abs_vertical_rate"] = df["vertical_rate"].abs()
    df["speed_altitude_ratio"] = df["velocity"] / (df["baro_altitude"] + 1)
    df["altitude_km"] = df["baro_altitude"] / 1000

    # ------------------------------
    # TEMPORAL FEATURES
    # ------------------------------

    df["fetched_at"] = pd.to_datetime(df["fetched_at"])

    df = df.sort_values(["icao24", "fetched_at"])

    # Time difference
    df["time_diff"] = (
        df.groupby("icao24")["fetched_at"]
        .diff()
        .dt.total_seconds()
    )

    # Vertical acceleration
    df["vertical_rate_diff"] = (
        df.groupby("icao24")["vertical_rate"].diff()
    )

    df["vertical_acceleration"] = (
        df["vertical_rate_diff"] / df["time_diff"]
    )

    # Velocity acceleration
    df["velocity_diff"] = (
        df.groupby("icao24")["velocity"].diff()
    )

    df["velocity_acceleration"] = (
        df["velocity_diff"] / df["time_diff"]
    )

    # Rolling instability
    df["vertical_rate_std_3"] = (
        df.groupby("icao24")["vertical_rate"]
        .rolling(3)
        .std()
        .reset_index(level=0, drop=True)
    )

    df["velocity_std_3"] = (
        df.groupby("icao24")["velocity"]
        .rolling(3)
        .std()
        .reset_index(level=0, drop=True)
    )

    # Clean infinities
    df.replace([np.inf, -np.inf], np.nan, inplace=True)

    # Keep rows with valid temporal context
    df = df[df["time_diff"].notna()]
    df = df[df["vertical_rate_std_3"].notna()]

    return df


def generate_turbulence_label(df):
    """
    Generate current turbulence severity label.
    """

    def classify(vr):
        if vr < 2:
            return 0
        elif vr < 5:
            return 1
        elif vr < 10:
            return 2
        else:
            return 3

    df["turbulence_level"] = df["abs_vertical_rate"].apply(classify)

    return df


def generate_future_turbulence_label(df, shift_steps=2):
    """
    Generate future turbulence label (t + shift_steps).
    """

    df = df.sort_values(["icao24", "fetched_at"])

    df["future_turbulence_level"] = (
        df.groupby("icao24")["turbulence_level"]
        .shift(-shift_steps)
    )

    # Remove rows without future label
    df = df[df["future_turbulence_level"].notna()]

    df["future_turbulence_level"] = df["future_turbulence_level"].astype(int)

    return df


if __name__ == "__main__":

    print("🔄 Fetching data from database...")

    df = fetch_data()
    df = clean_dataframe(df)
    df = create_features(df)
    df = generate_turbulence_label(df)
    df = generate_future_turbulence_label(df, shift_steps=2)

    print("\n✅ Feature Engineering Complete")
    print("Total rows after processing:", len(df))

    print("\nSample Output:")
    print(df[[
        "vertical_rate",
        "vertical_acceleration",
        "vertical_rate_std_3",
        "turbulence_level",
        "future_turbulence_level"
    ]].head())

    print("\nCurrent Turbulence Distribution:")
    print(df["turbulence_level"].value_counts())

    print("\nFuture Turbulence Distribution:")
    print(df["future_turbulence_level"].value_counts())
















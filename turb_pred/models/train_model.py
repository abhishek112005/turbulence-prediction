import joblib
import pandas as pd

from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, accuracy_score

from preprocessing.feature_engineering import (
    fetch_data,
    clean_dataframe,
    create_features,
    generate_turbulence_label
)


def prepare_dataset():
    """
    Fetch, clean, engineer features, and prepare dataset.
    """

    print("🔄 Fetching & preprocessing data...")

    df = fetch_data()
    df = clean_dataframe(df)
    df = create_features(df)
    df = generate_turbulence_label(df)

    # ----------------------------------------
    # FINAL FEATURE LIST (NO LEAKAGE)
    # ----------------------------------------

    features = [
        "baro_altitude",
        "velocity",
        "altitude_km",
        "speed_altitude_ratio",
        "vertical_acceleration",
        "velocity_acceleration",
        "vertical_rate_std_3",
        "velocity_std_3"
    ]

    X = df[features]
    y = df["turbulence_level"]

    return X, y, features


if __name__ == "__main__":

    print("🚀 Preparing dataset...\n")

    X, y, feature_names = prepare_dataset()

    # -------------------------------
    # Model Initialization
    # -------------------------------

    model = RandomForestClassifier(
        n_estimators=300,
        max_depth=None,
        random_state=42,
        class_weight="balanced"
    )

    # -------------------------------
    # 🔥 5-FOLD CROSS VALIDATION
    # -------------------------------

    print("🔍 Running 5-Fold Cross Validation...\n")

    cv_scores = cross_val_score(
        model,
        X,
        y,
        cv=5,
        scoring="accuracy"
    )

    print("📊 5-Fold Accuracy Scores:", cv_scores)
    print("📊 Mean CV Accuracy:", cv_scores.mean())
    print("📊 Std Dev:", cv_scores.std(), "\n")

    # -------------------------------
    # Train-Test Split
    # -------------------------------

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y
    )

    print("🔄 Training Final Model...\n")
    model.fit(X_train, y_train)

    # -------------------------------
    # Predictions
    # -------------------------------

    y_pred = model.predict(X_test)

    print("✅ Model Training Complete\n")

    print("📊 Test Accuracy:", accuracy_score(y_test, y_pred))
    print("\n📋 Classification Report:\n")
    print(classification_report(y_test, y_pred))

    # --------------------------------------
    # 📈 Feature Importance
    # --------------------------------------

    importance_df = pd.DataFrame({
        "feature": feature_names,
        "importance": model.feature_importances_
    }).sort_values(by="importance", ascending=False)

    print("\n📈 Feature Importance:\n")
    print(importance_df)

    # --------------------------------------
    # 💾 Save Model
    # --------------------------------------

    joblib.dump(model, "turbulence_model.pkl")
    print("\n💾 Model saved as turbulence_model.pkl\n")
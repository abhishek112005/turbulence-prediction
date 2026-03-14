import joblib
import pandas as pd

from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, accuracy_score

from preprocessing.feature_engineering import (
    fetch_data,
    clean_dataframe,
    create_features,
    generate_turbulence_label,
    generate_future_turbulence_label
)


def prepare_dataset():
    print("🔄 Fetching & preprocessing data...")

    df = fetch_data()
    df = clean_dataframe(df)
    df = create_features(df)
    df = generate_turbulence_label(df)
    df = generate_future_turbulence_label(df, shift_steps=2)

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
    y = df["future_turbulence_level"]

    return X, y, features


if __name__ == "__main__":

    print("🚀 Preparing FUTURE dataset...\n")

    X, y, feature_names = prepare_dataset()

    # 🔥 Manual class weights to boost severe detection
    model = RandomForestClassifier(
        n_estimators=300,
        random_state=42,
        class_weight={
            0: 1,
            1: 2,
            2: 3,
            3: 4
        }
    )

    print("🔍 Running 5-Fold Cross Validation...\n")

    cv_scores = cross_val_score(model, X, y, cv=5, scoring="accuracy")

    print("📊 5-Fold Accuracy Scores:", cv_scores)
    print("📊 Mean CV Accuracy:", cv_scores.mean())
    print("📊 Std Dev:", cv_scores.std(), "\n")

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y
    )

    print("🔄 Training Future Model...\n")
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)

    print("📊 Test Accuracy:", accuracy_score(y_test, y_pred))

    report = classification_report(y_test, y_pred, output_dict=True)
    print("\n📋 Classification Report:\n")
    print(classification_report(y_test, y_pred))

    print("\n🎯 Severe Class Recall:", report["3"]["recall"])

    joblib.dump(model, "future_turbulence_model.pkl")
    print("\n💾 Future model saved as future_turbulence_model.pkl\n")
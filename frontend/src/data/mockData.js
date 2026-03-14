export const dashboardSummary = {
  rowsInLastBatch: 5000,
  activeAircraft: 1432,
  predictionCount: 4879,
  modelName: "RandomForestClassifier",
  futureModelName: "future_turbulence_model.pkl"
};

export const turbulenceSplit = [
  { level: "Calm", value: 62, color: "#2dd4bf" },
  { level: "Light", value: 22, color: "#f59e0b" },
  { level: "Moderate", value: 11, color: "#fb7185" },
  { level: "Severe", value: 5, color: "#ef4444" }
];

export const futureRisk = [
  { window: "T+2 steps", severeRisk: 0.18, confidence: 0.84 },
  { window: "T+5 steps", severeRisk: 0.24, confidence: 0.79 },
  { window: "T+10 steps", severeRisk: 0.31, confidence: 0.72 }
];

export const flights = [
  {
    icao24: "a0b1c2",
    callsign: "IND642",
    altitude: 10320,
    velocity: 237,
    verticalRate: 1.8,
    currentLevel: 1,
    predictedLevel: 2,
    confidence: 0.83
  },
  {
    icao24: "bb7ff1",
    callsign: "AIC211",
    altitude: 11650,
    velocity: 252,
    verticalRate: 0.9,
    currentLevel: 0,
    predictedLevel: 1,
    confidence: 0.91
  },
  {
    icao24: "cc21da",
    callsign: "UAE901",
    altitude: 9280,
    velocity: 228,
    verticalRate: 6.2,
    currentLevel: 2,
    predictedLevel: 3,
    confidence: 0.77
  },
  {
    icao24: "d33f90",
    callsign: "SIA470",
    altitude: 12100,
    velocity: 260,
    verticalRate: 2.1,
    currentLevel: 1,
    predictedLevel: 1,
    confidence: 0.86
  }
];

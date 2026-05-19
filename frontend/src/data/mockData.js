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
    callsign: "DAL642",
    altitude: 10320,
    velocity: 237,
    verticalRate: 1.8,
    currentLevel: 1,
    predictedLevel: 2,
    confidence: 0.83,
    originCountry: "United States"
  },
  {
    icao24: "a1c3e5",
    callsign: "UAL211",
    altitude: 11200,
    velocity: 245,
    verticalRate: 0.5,
    currentLevel: 0,
    predictedLevel: 0,
    confidence: 0.94,
    originCountry: "United States"
  },
  {
    icao24: "800f1a",
    callsign: "AIC101",
    altitude: 10900,
    velocity: 241,
    verticalRate: 1.2,
    currentLevel: 1,
    predictedLevel: 1,
    confidence: 0.88,
    originCountry: "India"
  },
  {
    icao24: "801c4d",
    callsign: "IGO204",
    altitude: 9800,
    velocity: 228,
    verticalRate: 2.1,
    currentLevel: 0,
    predictedLevel: 1,
    confidence: 0.91,
    originCountry: "India"
  },
  {
    icao24: "3c6a2b",
    callsign: "DLH430",
    altitude: 11650,
    velocity: 252,
    verticalRate: 0.9,
    currentLevel: 0,
    predictedLevel: 1,
    confidence: 0.91,
    originCountry: "Germany"
  },
  {
    icao24: "3857ab",
    callsign: "AFR882",
    altitude: 9280,
    velocity: 228,
    verticalRate: 6.2,
    currentLevel: 2,
    predictedLevel: 3,
    confidence: 0.77,
    originCountry: "France"
  },
  {
    icao24: "400c9f",
    callsign: "BAW117",
    altitude: 12100,
    velocity: 260,
    verticalRate: 2.1,
    currentLevel: 1,
    predictedLevel: 1,
    confidence: 0.86,
    originCountry: "United Kingdom"
  },
  {
    icao24: "780e33",
    callsign: "CCA981",
    altitude: 10500,
    velocity: 238,
    verticalRate: 1.5,
    currentLevel: 1,
    predictedLevel: 2,
    confidence: 0.79,
    originCountry: "China"
  },
  {
    icao24: "7c1f08",
    callsign: "QFA12",
    altitude: 11800,
    velocity: 255,
    verticalRate: 0.7,
    currentLevel: 0,
    predictedLevel: 0,
    confidence: 0.96,
    originCountry: "Australia"
  },
  {
    icao24: "840a5c",
    callsign: "JAL31",
    altitude: 10700,
    velocity: 242,
    verticalRate: 1.1,
    currentLevel: 0,
    predictedLevel: 1,
    confidence: 0.89,
    originCountry: "Japan"
  },
  {
    icao24: "c02b17",
    callsign: "ACA856",
    altitude: 11100,
    velocity: 249,
    verticalRate: 0.8,
    currentLevel: 0,
    predictedLevel: 0,
    confidence: 0.93,
    originCountry: "Canada"
  },
  {
    icao24: "4b1d90",
    callsign: "SAS921",
    altitude: 10300,
    velocity: 236,
    verticalRate: 1.9,
    currentLevel: 1,
    predictedLevel: 1,
    confidence: 0.85,
    originCountry: "Sweden"
  }
];

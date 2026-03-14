export const airports = [
  { city: "hyderabad", iata: "HYD", icao: "VOHS", lat: 17.2403, lon: 78.4294 },
  { city: "delhi", iata: "DEL", icao: "VIDP", lat: 28.5562, lon: 77.1 },
  { city: "mumbai", iata: "BOM", icao: "VABB", lat: 19.0896, lon: 72.8656 },
  { city: "bengaluru", iata: "BLR", icao: "VOBL", lat: 13.1986, lon: 77.7066 },
  { city: "chennai", iata: "MAA", icao: "VOMM", lat: 12.9941, lon: 80.1709 },
  { city: "kolkata", iata: "CCU", icao: "VECC", lat: 22.6547, lon: 88.4467 },
  { city: "pune", iata: "PNQ", icao: "VAPO", lat: 18.5822, lon: 73.9197 },
  { city: "ahmedabad", iata: "AMD", icao: "VAAH", lat: 23.0772, lon: 72.6347 },
  { city: "goa", iata: "GOX", icao: "VOGA", lat: 15.3808, lon: 73.8314 },
  { city: "kochi", iata: "COK", icao: "VOCI", lat: 10.152, lon: 76.4019 },
];

export function findAirportByCity(input) {
  const query = (input || "").trim().toLowerCase();
  if (!query) {
    return null;
  }

  return (
    airports.find((airport) => airport.city === query) ||
    airports.find((airport) => airport.city.includes(query))
  );
}

export function findAirportByIcao(icao) {
  const query = (icao || "").trim().toUpperCase();
  if (!query) {
    return null;
  }

  return airports.find((airport) => airport.icao === query) || null;
}

export const airports = [
  { city: "hyderabad", name: "Rajiv Gandhi International Airport", iata: "HYD", icao: "VOHS", lat: 17.2403, lon: 78.4294 },
  { city: "delhi", name: "Indira Gandhi International Airport", iata: "DEL", icao: "VIDP", lat: 28.5562, lon: 77.1 },
  { city: "mumbai", name: "Chhatrapati Shivaji Maharaj International Airport", iata: "BOM", icao: "VABB", lat: 19.0896, lon: 72.8656 },
  { city: "bengaluru", name: "Kempegowda International Airport", iata: "BLR", icao: "VOBL", lat: 13.1986, lon: 77.7066 },
  { city: "chennai", name: "Chennai International Airport", iata: "MAA", icao: "VOMM", lat: 12.9941, lon: 80.1709 },
  { city: "kolkata", name: "Netaji Subhas Chandra Bose International Airport", iata: "CCU", icao: "VECC", lat: 22.6547, lon: 88.4467 },
  { city: "pune", name: "Pune Airport", iata: "PNQ", icao: "VAPO", lat: 18.5822, lon: 73.9197 },
  { city: "ahmedabad", name: "Sardar Vallabhbhai Patel International Airport", iata: "AMD", icao: "VAAH", lat: 23.0772, lon: 72.6347 },
  { city: "goa", name: "Manohar International Airport", iata: "GOX", icao: "VOGA", lat: 15.3808, lon: 73.8314 },
  { city: "kochi", name: "Cochin International Airport", iata: "COK", icao: "VOCI", lat: 10.152, lon: 76.4019 },
  { city: "dubai", name: "Dubai International Airport", iata: "DXB", icao: "OMDB", lat: 25.2532, lon: 55.3657 },
  { city: "abu dhabi", name: "Zayed International Airport", iata: "AUH", icao: "OMAA", lat: 24.4329, lon: 54.6511 },
  { city: "doha", name: "Hamad International Airport", iata: "DOH", icao: "OTHH", lat: 25.2731, lon: 51.6081 },
  { city: "singapore", name: "Singapore Changi Airport", iata: "SIN", icao: "WSSS", lat: 1.3644, lon: 103.9915 },
  { city: "london", name: "Heathrow Airport", iata: "LHR", icao: "EGLL", lat: 51.47, lon: -0.4543 },
  { city: "paris", name: "Charles de Gaulle Airport", iata: "CDG", icao: "LFPG", lat: 49.0097, lon: 2.5479 },
  { city: "frankfurt", name: "Frankfurt Airport", iata: "FRA", icao: "EDDF", lat: 50.0379, lon: 8.5622 },
  { city: "amsterdam", name: "Amsterdam Airport Schiphol", iata: "AMS", icao: "EHAM", lat: 52.3105, lon: 4.7683 },
  { city: "new york", name: "John F. Kennedy International Airport", iata: "JFK", icao: "KJFK", lat: 40.6413, lon: -73.7781 },
  { city: "new york", name: "LaGuardia Airport", iata: "LGA", icao: "KLGA", lat: 40.7769, lon: -73.874 },
  { city: "chicago", name: "O'Hare International Airport", iata: "ORD", icao: "KORD", lat: 41.9742, lon: -87.9073 },
  { city: "dallas", name: "Dallas/Fort Worth International Airport", iata: "DFW", icao: "KDFW", lat: 32.8998, lon: -97.0403 },
  { city: "los angeles", name: "Los Angeles International Airport", iata: "LAX", icao: "KLAX", lat: 33.9416, lon: -118.4085 },
  { city: "san francisco", name: "San Francisco International Airport", iata: "SFO", icao: "KSFO", lat: 37.6213, lon: -122.379 },
  { city: "toronto", name: "Toronto Pearson International Airport", iata: "YYZ", icao: "CYYZ", lat: 43.6777, lon: -79.6248 },
  { city: "sydney", name: "Sydney Kingsford Smith Airport", iata: "SYD", icao: "YSSY", lat: -33.9399, lon: 151.1753 },
  { city: "melbourne", name: "Melbourne Airport", iata: "MEL", icao: "YMML", lat: -37.669, lon: 144.841 },
  { city: "cape town", name: "Cape Town International Airport", iata: "CPT", icao: "FACT", lat: -33.97, lon: 18.6021 },
  { city: "johannesburg", name: "O. R. Tambo International Airport", iata: "JNB", icao: "FAOR", lat: -26.1337, lon: 28.242 },
  { city: "tokyo", name: "Tokyo Haneda Airport", iata: "HND", icao: "RJTT", lat: 35.5494, lon: 139.7798 },
  { city: "hong kong", name: "Hong Kong International Airport", iata: "HKG", icao: "VHHH", lat: 22.308, lon: 113.9185 },
  { city: "istanbul", name: "Istanbul Airport", iata: "IST", icao: "LTFM", lat: 41.2753, lon: 28.7519 },
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

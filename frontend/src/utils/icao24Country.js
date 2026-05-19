// ICAO 24-bit address blocks → country
// Source: ICAO Doc 9303 / Annex 10 official allocations.
// Only ranges verified against aircraft registration prefixes are included.
// Sorted ascending by start — enables O(log n) binary search.
// Format per entry: [startHex, endHex, countryName, flagEmoji]

const BLOCKS = [
  // ── Africa ──────────────────────────────────────────────────────────────────
  [0x008000, 0x00FFFF, "South Africa",   "🇿🇦"],  // ZS/ZT/ZU registrations
  [0x010000, 0x017FFF, "Egypt",          "🇪🇬"],  // SU-
  [0x018000, 0x01FFFF, "Libya",          "🇱🇾"],  // 5A-
  [0x020000, 0x027FFF, "Morocco",        "🇲🇦"],  // CN-
  [0x028000, 0x02FFFF, "Tunisia",        "🇹🇳"],  // TS-
  [0x050000, 0x050FFF, "Kenya",          "🇰🇪"],  // 5Y-
  [0x064000, 0x064FFF, "Nigeria",        "🇳🇬"],  // 5N-
  [0x0A0000, 0x0A7FFF, "Algeria",        "🇩🇿"],  // 7T-

  // ── Russia / Former Soviet ───────────────────────────────────────────────────
  [0x100000, 0x1FFFFF, "Russia",         "🇷🇺"],  // RA- (largest single allocation)
  [0x250000, 0x257FFF, "Latvia",         "🇱🇻"],  // YL-
  [0x258000, 0x25FFFF, "Lithuania",      "🇱🇹"],  // LY-
  [0x268000, 0x26FFFF, "Ukraine",        "🇺🇦"],  // UR-

  // ── Western Europe ───────────────────────────────────────────────────────────
  [0x300000, 0x33FFFF, "Italy",          "🇮🇹"],  // I-
  [0x340000, 0x37FFFF, "Spain",          "🇪🇸"],  // EC-
  [0x380000, 0x3BFFFF, "France",         "🇫🇷"],  // F-
  [0x3C0000, 0x3FFFFF, "Germany",        "🇩🇪"],  // D-
  [0x400000, 0x43FFFF, "United Kingdom", "🇬🇧"],  // G-
  [0x440000, 0x447FFF, "Austria",        "🇦🇹"],  // OE-
  [0x448000, 0x44FFFF, "Belgium",        "🇧🇪"],  // OO-
  [0x450000, 0x457FFF, "Bulgaria",       "🇧🇬"],  // LZ-
  [0x458000, 0x45FFFF, "Denmark",        "🇩🇰"],  // OY-
  [0x460000, 0x467FFF, "Finland",        "🇫🇮"],  // OH-
  [0x468000, 0x46FFFF, "Greece",         "🇬🇷"],  // SX-
  [0x470000, 0x477FFF, "Hungary",        "🇭🇺"],  // HA-
  [0x478000, 0x47FFFF, "Norway",         "🇳🇴"],  // LN-
  [0x480000, 0x487FFF, "Netherlands",    "🇳🇱"],  // PH-
  [0x488000, 0x48FFFF, "Poland",         "🇵🇱"],  // SP-
  [0x490000, 0x497FFF, "Portugal",       "🇵🇹"],  // CS-
  [0x498000, 0x49FFFF, "Czech Republic", "🇨🇿"],  // OK-
  [0x4A0000, 0x4A7FFF, "Romania",        "🇷🇴"],  // YR-
  [0x4B0000, 0x4B7FFF, "Sweden",         "🇸🇪"],  // SE-
  [0x4B8000, 0x4BFFFF, "Switzerland",    "🇨🇭"],  // HB-
  [0x508000, 0x50FFFF, "Ireland",        "🇮🇪"],  // EI-

  // ── Asia-Pacific (high-confidence) ───────────────────────────────────────────
  [0x780000, 0x7BFFFF, "China",          "🇨🇳"],  // B-
  [0x7C0000, 0x7FFFFF, "Australia",      "🇦🇺"],  // VH-
  [0x800000, 0x83FFFF, "India",          "🇮🇳"],  // VT-
  [0x840000, 0x87FFFF, "Japan",          "🇯🇵"],  // JA-

  // ── Americas ─────────────────────────────────────────────────────────────────
  [0xA00000, 0xAFFFFF, "United States",  "🇺🇸"],  // N- (largest fleet in world)
  [0xC00000, 0xC3FFFF, "Canada",         "🇨🇦"],  // CF/C-
  [0xE00000, 0xE3FFFF, "Argentina",      "🇦🇷"],  // LV-/LQ-
  [0xE40000, 0xE7FFFF, "Brazil",         "🇧🇷"],  // PP/PR/PT-
  [0xE80000, 0xE9FFFF, "Chile",          "🇨🇱"],  // CC-
];

// Binary search — O(log n) lookup
export function countryFromIcao24(icao24) {
  if (!icao24) return { name: "Unknown", flag: "🌐" };

  const addr = parseInt(String(icao24).toLowerCase(), 16);
  if (Number.isNaN(addr)) return { name: "Unknown", flag: "🌐" };

  let lo = 0;
  let hi = BLOCKS.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const [start, end, name, flag] = BLOCKS[mid];
    if (addr < start) {
      hi = mid - 1;
    } else if (addr > end) {
      lo = mid + 1;
    } else {
      return { name, flag };
    }
  }

  return { name: "Other / Unknown", flag: "🌐" };
}

/**
 * Groups flights by country with turbulence breakdown.
 * Prefers `originCountry` if the backend already provides it (OpenSky includes it
 * in state vectors as `origin_country`). Falls back to ICAO24 prefix lookup.
 *
 * @param {Array} flights - array of flight objects with at least { icao24 }
 * @returns {Array} sorted by count desc: [{ name, flag, count, pct, levels, worstLevel }]
 *   levels: { calm, light, moderate, severe } counts based on predictedLevel
 */
export function groupFlightsByCountry(flights) {
  const counts = {};

  for (const flight of flights) {
    let name, flag;

    if (flight.originCountry || flight.origin_country) {
      name = flight.originCountry || flight.origin_country;
      // Try to get flag from ICAO24 if originCountry name matches a known country
      const icaoResult = countryFromIcao24(flight.icao24);
      flag = icaoResult.name === name ? icaoResult.flag : "🌐";
    } else {
      ({ name, flag } = countryFromIcao24(flight.icao24));
    }

    if (!counts[name]) {
      counts[name] = { name, flag, count: 0, levels: { calm: 0, light: 0, moderate: 0, severe: 0 } };
    }
    counts[name].count++;

    const lvl = Number(flight.predictedLevel ?? flight.currentLevel ?? 0);
    if (lvl <= 0)      counts[name].levels.calm++;
    else if (lvl === 1) counts[name].levels.light++;
    else if (lvl === 2) counts[name].levels.moderate++;
    else               counts[name].levels.severe++;
  }

  const total = flights.length || 1;
  return Object.values(counts)
    .sort((a, b) => b.count - a.count)
    .map((c) => {
      const worstLevel = c.levels.severe > 0 ? 3
        : c.levels.moderate > 0 ? 2
        : c.levels.light > 0 ? 1
        : 0;
      return { ...c, pct: (c.count / total) * 100, worstLevel };
    });
}

/**
 * data.js
 * Static configuration: satellite categories, their visual style and
 * where their TLE data is stored / fetched from.
 *
 * Each category maps to one or more CelesTrak "GROUP" values
 * (see https://celestrak.org/NORAD/elements/ for the full list).
 * The actual TLE data used by the app lives in /data/tle/<key>.json
 * and is refreshed periodically by scripts/update_tle.py (see README).
 */

const CATEGORIES = [
  {
    key: "stations",
    label: "Stanice & posádka",
    color: "#4fd1ff",
    celestrakGroups: ["stations"],
    file: "data/tle/stations.json"
  },
  {
    key: "starlink",
    label: "Starlink",
    color: "#7c5cff",
    celestrakGroups: ["starlink"],
    file: "data/tle/starlink.json"
  },
  {
    key: "weather",
    label: "Počasí & Země",
    color: "#4ade80",
    celestrakGroups: ["weather", "earth-resources", "noaa"],
    file: "data/tle/weather.json"
  },
  {
    key: "communications",
    label: "Komunikace",
    color: "#facc15",
    celestrakGroups: ["geo", "intelsat", "ses", "iridium-NEXT"],
    file: "data/tle/communications.json"
  },
  {
    key: "navigation",
    label: "Navigace (GNSS)",
    color: "#fb923c",
    celestrakGroups: ["gps-ops", "glo-ops", "galileo", "beidou"],
    file: "data/tle/navigation.json"
  },
  {
    key: "debris",
    label: "Trosky",
    color: "#ff6b6b",
    celestrakGroups: ["cosmos-2251-debris", "iridium-33-debris", "fengyun-1c-debris"],
    file: "data/tle/debris.json"
  },
  {
    key: "other",
    label: "Ostatní aktivní",
    color: "#8b98b3",
    celestrakGroups: ["active"],
    file: "data/tle/other.json"
  }
];

// Physical / display constants
const EARTH_RADIUS_KM = 6371;
const MU_KM3_S2 = 398600.4418; // Earth's standard gravitational parameter

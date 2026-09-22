"use strict";

/**
 * services/external/weather.js
 * ---------------------------------------------------------------------------
 * Météo via Open-Meteo : API publique, SANS clé, sans inscription.
 *   • géocodage : geocoding-api.open-meteo.com
 *   • prévisions : api.open-meteo.com
 *
 * Si le réseau est bloqué (proxy, pare-feu), la commande affiche un message
 * propre — jamais de fausse météo inventée.
 * ---------------------------------------------------------------------------
 */

const { fetchJson, query, fail, success } = require("./http");

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

/** Codes WMO → libellé français + emoji. */
const WEATHER_CODES = {
  0: ["Ciel dégagé", "☀️"],
  1: ["Principalement dégagé", "🌤️"],
  2: ["Partiellement nuageux", "⛅"],
  3: ["Couvert", "☁️"],
  45: ["Brouillard", "🌫️"],
  48: ["Brouillard givrant", "🌫️"],
  51: ["Bruine légère", "🌦️"],
  53: ["Bruine modérée", "🌦️"],
  55: ["Bruine dense", "🌧️"],
  56: ["Bruine verglaçante", "🌧️"],
  57: ["Bruine verglaçante dense", "🌧️"],
  61: ["Pluie faible", "🌦️"],
  63: ["Pluie modérée", "🌧️"],
  65: ["Pluie forte", "🌧️"],
  66: ["Pluie verglaçante", "🌧️"],
  67: ["Pluie verglaçante forte", "🌧️"],
  71: ["Neige faible", "🌨️"],
  73: ["Neige modérée", "❄️"],
  75: ["Neige forte", "❄️"],
  77: ["Grains de neige", "❄️"],
  80: ["Averses faibles", "🌦️"],
  81: ["Averses modérées", "🌧️"],
  82: ["Averses violentes", "⛈️"],
  85: ["Averses de neige", "🌨️"],
  86: ["Fortes averses de neige", "❄️"],
  95: ["Orage", "⛈️"],
  96: ["Orage avec grêle", "⛈️"],
  99: ["Orage violent avec grêle", "⛈️"]
};

function describe(code) {
  return WEATHER_CODES[code] || ["Conditions inconnues", "🌡️"];
}

/** Cherche une ville (géocodage). */
async function geocode(place, options = {}) {
  const name = String(place || "").trim();
  if (!name) return fail("error", "Aucun lieu indiqué.");
  if (name.length > 80) return fail("error", "Nom de lieu trop long.");

  const url = `${GEOCODE_URL}${query({ name, count: 5, language: options.language || "fr", format: "json" })}`;
  const res = await fetchJson(url, { timeoutMs: options.timeoutMs || 10000 });
  if (!res.ok) return res;

  const results = Array.isArray(res.data && res.data.results) ? res.data.results : [];
  if (!results.length) return fail("not-found", `Aucune ville trouvée pour « ${name} ».`);
  return success(
    results.map((r) => ({
      name: r.name,
      country: r.country || "",
      countryCode: r.country_code || "",
      admin: r.admin1 || "",
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      timezone: r.timezone || "auto",
      population: Number(r.population) || 0
    }))
  );
}

/**
 * Météo complète d'un lieu.
 * @param {string} place
 * @param {{ language?: string, timeoutMs?: number, days?: number }} [options]
 */
async function forecast(place, options = {}) {
  const geo = await geocode(place, options);
  if (!geo.ok) return geo;

  const city = geo.data[0];
  const days = Math.min(7, Math.max(1, Number(options.days) || 3));
  const url = `${FORECAST_URL}${query({
    latitude: city.latitude,
    longitude: city.longitude,
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,precipitation",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,wind_speed_10m_max",
    timezone: city.timezone || "auto",
    forecast_days: days
  })}`;

  const res = await fetchJson(url, { timeoutMs: options.timeoutMs || 12000 });
  if (!res.ok) return res;

  const data = res.data || {};
  const current = data.current || {};
  const daily = data.daily || {};
  const [label, icon] = describe(current.weather_code);

  const forecastDays = Array.isArray(daily.time)
    ? daily.time.slice(0, days).map((date, index) => {
        const [dayLabel, dayIcon] = describe(Array.isArray(daily.weather_code) ? daily.weather_code[index] : 0);
        return {
          date,
          label: dayLabel,
          icon: dayIcon,
          min: Array.isArray(daily.temperature_2m_min) ? Math.round(daily.temperature_2m_min[index]) : null,
          max: Array.isArray(daily.temperature_2m_max) ? Math.round(daily.temperature_2m_max[index]) : null,
          rain: Array.isArray(daily.precipitation_probability_max) ? daily.precipitation_probability_max[index] : null,
          wind: Array.isArray(daily.wind_speed_10m_max) ? Math.round(daily.wind_speed_10m_max[index]) : null,
          sunrise: Array.isArray(daily.sunrise) ? String(daily.sunrise[index] || "").slice(11, 16) : "",
          sunset: Array.isArray(daily.sunset) ? String(daily.sunset[index] || "").slice(11, 16) : ""
        };
      })
    : [];

  return success({
    place: city,
    current: {
      temperature: Math.round(Number(current.temperature_2m ?? 0)),
      feelsLike: Math.round(Number(current.apparent_temperature ?? 0)),
      humidity: Math.round(Number(current.relative_humidity_2m ?? 0)),
      wind: Math.round(Number(current.wind_speed_10m ?? 0)),
      precipitation: Number(current.precipitation ?? 0),
      isDay: Boolean(current.is_day),
      label,
      icon
    },
    units: { temperature: "°C", wind: "km/h" },
    timezone: data.timezone || city.timezone,
    days: forecastDays
  });
}

module.exports = { geocode, forecast, describe, WEATHER_CODES };

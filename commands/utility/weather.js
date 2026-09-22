"use strict";

/**
 * /weather — météo via Open-Meteo (public, sans clé).
 *   /weather Kinshasa
 *   /weather Paris 5   → 5 jours
 */

const { box, lightBox, cmd, ICONS, num } = require("../../utils/text");

module.exports = {
  name: "weather",
  aliases: ["meteo", "météo", "weatherforecast", "temps"],
  category: "utility",
  description: "Affiche la météo d'une ville : conditions actuelles et prévisions.",
  usage: "/weather <ville> [jours]",
  examples: ["/weather Kinshasa", "/weather Paris 5"],
  permissions: "public",
  cooldown: 6,

  async execute(ctx, bag) {
    const days = Number(ctx.args[ctx.args.length - 1]) || 3;
    const city = ctx.args
      .slice(0, Number(ctx.args[ctx.args.length - 1]) ? ctx.args.length - 1 : ctx.args.length)
      .join(" ")
      .trim();

    if (!city) {
      return lightBox("MÉTÉO", [
        `${ICONS.warn} Indique une ville.`,
        "",
        `${cmd("weather Kinshasa", ctx.prefix)}`,
        `${cmd("weather Paris 5", ctx.prefix)} — 5 jours`
      ]);
    }

    const result = await bag.services.external.weather.forecast(city, { days: Math.min(7, Math.max(1, days)), language: "fr", timeoutMs: 15000 });
    if (!result.ok) {
      return lightBox("MÉTÉO", [
        `${ICONS.no} ${result.message}`,
        "",
        result.kind === "not-found"
          ? `${ICONS.pin} Vérifie l'orthographe : ${cmd("weather Kinshasa", ctx.prefix)}`
          : `${ICONS.info} Service : Open-Meteo (public, sans clé).`
      ]);
    }

    const data = result.data;
    const place = data.place;
    const current = data.current;

    const lines = [
      `${current.icon} ${current.label}`,
      `${ICONS.time} Température : ${num(current.temperature)} °C (ressenti ${num(current.feelsLike)} °C)`,
      `💧 Humidité : ${num(current.humidity)} % • 💨 Vent : ${num(current.wind)} km/h`,
      current.precipitation ? `🌧️ Précipitations : ${num(current.precipitation)} mm` : "",
      "",
      `${ICONS.chart} Prévisions :`
    ].filter(Boolean);

    for (const day of data.days.slice(0, 5)) {
      const label = new Date(day.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
      lines.push(
        `  ${day.icon} ${label} — ${num(day.min)}°/${num(day.max)}°` +
          `${day.rain !== null && day.rain !== undefined ? ` • pluie ${num(day.rain)}%` : ""}` +
          `${day.wind ? ` • vent ${num(day.wind)}` : ""}`
      );
    }

    return box(
      `MÉTÉO — ${String(place.name).toUpperCase()}`,
      [...lines, "", `${ICONS.info} ${[place.admin, place.country].filter(Boolean).join(", ") || place.name} • ${data.timezone || ""}`],
      { icon: "🌍", footer: [`Source : Open-Meteo • ${cmd("time " + place.name, ctx.prefix)} pour l'heure locale`] }
    );
  }
};

"use strict";

/**
 * /time — heure actuelle (fuseau du serveur, ou d'une ville demandée).
 *   /time            → heure du bot
 *   /time Kinshasa   → heure locale de la ville (géocodage Open-Meteo)
 */

const { box, lightBox, ICONS } = require("../../utils/text");

module.exports = {
  name: "time",
  aliases: ["heure", "clock", "horloge"],
  category: "utility",
  description: "Affiche l'heure actuelle, éventuellement pour une ville précise.",
  usage: "/time [ville]",
  examples: ["/time", "/time Kinshasa", "/time Paris"],
  permissions: "public",
  cooldown: 3,

  async execute(ctx, bag) {
    const city = ctx.argString.trim();
    const now = new Date();

    if (!city) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      return box(
        "HEURE",
        [
          `${ICONS.time} ${now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`,
          `${ICONS.info} Fuseau du serveur : ${tz}`,
          `Décalage : ${-now.getTimezoneOffset() / 60 >= 0 ? "+" : ""}${-now.getTimezoneOffset() / 60} h par rapport à UTC`
        ]
      );
    }

    const geo = await bag.services.external.weather.geocode(city, { language: "fr" });
    if (!geo.ok) {
      return lightBox("HEURE", [
        `${ICONS.warn} Ville introuvable${geo.message ? ` (${geo.message})` : ""}.`,
        "",
        `${ctx.prefix}time sans argument donne l'heure du serveur.`
      ]);
    }

    const place = geo.data[0];
    const timezone = place.timezone || "UTC";
    let localTime;
    try {
      localTime = now.toLocaleTimeString("fr-FR", { timeZone: timezone, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return lightBox("HEURE", [`${ICONS.warn} Fuseau horaire non reconnu pour ${place.name} (${timezone}).`]);
    }

    const offsetLabel = (() => {
      try {
        const parts = new Intl.DateTimeFormat("fr-FR", { timeZone: timezone, timeZoneName: "shortOffset" }).formatToParts(now);
        return (parts.find((p) => p.type === "timeZoneName") || {}).value || timezone;
      } catch {
        return timezone;
      }
    })();

    return box(
      `HEURE — ${place.name.toUpperCase()}`,
      [
        `${ICONS.time} ${localTime}`,
        `${ICONS.info} ${[place.admin, place.country].filter(Boolean).join(", ") || place.name} • ${offsetLabel}`,
        geo.data.length > 1 ? `🔎 Autres résultats : ${geo.data.slice(1, 3).map((p) => `${p.name} (${p.country})`).join(", ")}` : ""
      ].filter(Boolean)
    );
  }
};

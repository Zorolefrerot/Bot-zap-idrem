"use strict";

/**
 * /date — date du jour avec informations utiles.
 */

const { box, ICONS, num } = require("../../utils/text");

module.exports = {
  name: "date",
  aliases: ["jour", "aujourdhui", "today"],
  category: "utility",
  description: "Affiche la date du jour, le numéro de semaine et la progression de l'année.",
  usage: "/date",
  examples: ["/date"],
  permissions: "public",
  cooldown: 3,

  async execute(ctx, bag) {
    const now = new Date();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const endOfYear = new Date(now.getFullYear() + 1, 0, 1);
    const dayOfYear = Math.floor((now - startOfYear) / 86400000) + 1;
    const yearProgress = Math.round(((now - startOfYear) / (endOfYear - startOfYear)) * 100);

    // Numéro de semaine ISO 8601.
    const isoWeek = (() => {
      const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
      const dayNum = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
      return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
    })();

    const days = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
    const leap = (now.getFullYear() % 4 === 0 && now.getFullYear() % 100 !== 0) || now.getFullYear() % 400 === 0;

    return box(
      "DATE",
      [
        `📅 ${now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`,
        "",
        `${ICONS.time} ${now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} (${tz})`,
        `${ICONS.chart} Jour ${num(dayOfYear)}/365${leap ? "6" : ""} • Semaine ${isoWeek}`,
        `${ICONS.bolt} Année écoulée à ${yearProgress} %`,
        "",
        `${ICONS.info} Format ISO : ${now.toISOString().slice(0, 10)}`
      ]
    );
  }
};

"use strict";

/**
 * /setrules — définit les règles affichées par /rules dans ce groupe.
 *   /setrules <texte>   → nouvelles règles
 *   /setrules append <ligne> → ajoute une ligne
 *   /setrules reset     → règles par défaut
 *
 * Chaque groupe a ses propres règles : aucun partage entre conversations.
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");

const MAX_LENGTH = 1200;

module.exports = {
  name: "setrules",
  aliases: ["rules-set", "setregles", "changerules"],
  category: "groups",
  description: "Définit les règles du groupe affichées par /rules.",
  usage: "/setrules <texte|append <ligne>|reset>",
  examples: ["/setrules 1. Respect. 2. Pas de spam.", "/setrules append Pas de publicité.", "/setrules reset"],
  permissions: "groupadmin",
  cooldown: 10,
  groupOnly: true,

  async execute(ctx, bag) {
    const { services } = bag;
    const settings = services.settings.get(ctx.threadID);
    const arg = String(ctx.args[0] || "").trim().toLowerCase();

    if (!ctx.argString.trim()) {
      return lightBox("RÈGLES", [
        `${ICONS.warn} Aucun texte fourni.`,
        "",
        `${ICONS.pin} ${cmd("setrules <texte>", ctx.prefix)} → remplace les règles`,
        `${ICONS.pin} ${cmd("setrules append <ligne>", ctx.prefix)} → ajoute une ligne`,
        `${ICONS.pin} ${cmd("setrules reset", ctx.prefix)} → règles par défaut`,
        `${ICONS.info} Limite : ${num(MAX_LENGTH)} caractères.`
      ]);
    }

    let next;
    if (arg === "reset") {
      next = services.settings.defaults().rules;
    } else if (arg === "append" || arg === "add" || arg === "ajouter") {
      const line = ctx.args.slice(1).join(" ").trim();
      if (!line) return lightBox("RÈGLES", [`${ICONS.warn} Précise la ligne à ajouter.`, "", cmd("setrules append Pas de publicité.", ctx.prefix)]);
      const current = String(settings.rules || "").trim();
      const numbered = /^\s*\d+[.)-]/.test(line) ? "" : `${countRules(current) + 1}. `;
      next = `${current}${current ? "\n" : ""}${numbered}${line}`;
      if (next.length > MAX_LENGTH) {
        return lightBox("RÈGLES", [`${ICONS.no} Les règles atteindraient ${num(next.length)} caractères (limite ${num(MAX_LENGTH)}).`, "", `${ICONS.info} Réécris-les plus court avec ${cmd("setrules <texte>", ctx.prefix)}.`]);
      }
    } else {
      next = ctx.argString.trim();
      if (next.length > MAX_LENGTH) return lightBox("RÈGLES", [`${ICONS.no} Trop long : ${num(next.length)} caractères (limite ${num(MAX_LENGTH)}).`]);
    }

    const result = services.settings.set(ctx.threadID, "rules", next, { by: ctx.senderID });
    if (!result.ok) return lightBox("RÈGLES", [`${ICONS.no} ${result.error}`]);

    bag.logs.info("group", `Règles mises à jour (${ctx.threadID})`, { userID: ctx.senderID, threadID: ctx.threadID, command: "setrules" });

    return box("RÈGLES ENREGISTRÉES", [
      `${ICONS.ok} Règles de ${ctx.threadName || "ce groupe"} mises à jour.`,
      "",
      String(result.value).slice(0, 600),
      result.value.length > 600 ? `… (${num(result.value.length)} caractères au total)` : "",
      "",
      `${ICONS.info} Affichage public : ${cmd("rules", ctx.prefix)}`
    ].filter((line) => line !== ""));
  }
};

/** Nombre de règles numérotées déjà présentes (pour la numérotation auto). */
function countRules(text) {
  const matches = String(text || "").match(/^\s*\d+[.)-]/gm);
  return matches ? matches.length : 0;
}

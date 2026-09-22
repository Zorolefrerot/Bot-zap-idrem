"use strict";

/**
 * /setstatus — pilote le mode de fonctionnement du bot (persisté).
 *
 *   /setstatus                     → état actuel
 *   /setstatus actif               → fonctionnement normal
 *   /setstatus maintenance [texte] → seuls les admins obtiennent une réponse
 *   /setstatus silencieux          → commandes uniquement, aucune conversation
 *
 * Le mode est stocké dans data/settings.json (clé globale) : il survit au
 * redémarrage. Aucun effet de bord caché : le dispatcher l'applique réellement.
 */

const { box, lightBox, cmd, ICONS } = require("../../utils/text");
const { record } = require("../../utils/moderation");

module.exports = {
  name: "setstatus",
  aliases: ["status", "mode", "maintenance", "statut"],
  category: "admin",
  description: "Affiche ou change le mode du bot : actif, maintenance ou silencieux.",
  usage: "/setstatus [actif|maintenance|silencieux] [annonce]",
  examples: ["/setstatus", "/setstatus maintenance Mise à jour en cours", "/setstatus actif"],
  permissions: "admin",
  cooldown: 15,

  async execute(ctx, bag) {
    const { services } = bag;
    const current = services.settings.status();
    const arg = String(ctx.args[0] || "").trim().toLowerCase();

    if (!arg) {
      return box("MODE DU BOT", [
        `${current.icon} Mode actuel : ${current.label}`,
        current.text ? `${ICONS.pin} Annonce : ${current.text}` : "",
        current.updatedAt ? `${ICONS.time} Changé le ${new Date(current.updatedAt).toLocaleString("fr-FR")}` : "",
        "",
        `${ICONS.info} Modes disponibles :`,
        ...current.modes.map((mode) => {
          const info = { actif: "répond à tout, conversation naturelle incluse", maintenance: "répond uniquement aux administrateurs du bot", silencieux: "répond aux commandes, jamais de conversation spontanée" }[mode];
          return `   • ${cmd(`setstatus ${mode}`, ctx.prefix)} — ${info}`;
        })
      ].filter((line) => line !== ""));
    }

    const mode = arg === "off" ? "silencieux" : arg === "on" ? "actif" : arg;
    const text = ctx.args.slice(1).join(" ").trim();
    const result = services.settings.setStatus(mode, { text, by: ctx.senderID });

    if (!result.ok) {
      return lightBox("MODE DU BOT", [
        `${ICONS.no} ${result.error}`,
        "",
        `${ICONS.pin} ${cmd("setstatus actif", ctx.prefix)} • ${cmd("setstatus maintenance", ctx.prefix)} • ${cmd("setstatus silencieux", ctx.prefix)}`
      ]);
    }

    record(bag, ctx, "setstatus", `${result.mode}${text ? ` — ${text}` : ""}`);

    const consequences = {
      actif: "Tous les utilisateurs peuvent de nouveau utiliser le bot, conversation naturelle comprise.",
      maintenance: "Les non-administrateurs reçoivent un message de maintenance (au plus une fois par conversation toutes les 10 minutes).",
      silencieux: "Les commandes restent actives ; le bot ne répond plus aux messages spontanés ni aux mentions."
    };

    return box("MODE DU BOT", [
      `${result.icon} Nouveau mode : ${result.label}`,
      text ? `${ICONS.pin} Annonce : ${text.slice(0, 120)}` : "",
      "",
      `${ICONS.info} ${consequences[result.mode]}`,
      `${ICONS.info} Le mode est persisté : il reste actif après un redémarrage.`
    ].filter((line) => line !== ""));
  }
};

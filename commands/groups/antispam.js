"use strict";

/**
 * /antispam — protection anti-flood du groupe.
 *   /antispam            → état + seuils réels
 *   /antispam on|off     → activation pour CE groupe
 *   /antispam status     → état détaillé du garde (flood, cooldowns)
 *
 * Les seuils viennent de config.json (floodMessages, floodWindowMs, floodMuteMs)
 * et sont appliqués par core/guard.js — la commande ne fait qu'afficher la vérité.
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");
const { formatDuration } = require("../../utils/helpers");

module.exports = {
  name: "antispam",
  aliases: ["antiflood", "flood", "protection"],
  category: "groups",
  description: "Active ou consulte la protection anti-flood du groupe.",
  usage: "/antispam [on|off|status]",
  examples: ["/antispam", "/antispam on", "/antispam status"],
  permissions: "groupadmin",
  cooldown: 8,

  async execute(ctx, bag) {
    const { services, config, guard } = bag;
    const arg = String(ctx.args[0] || "").trim().toLowerCase();
    const settings = services.settings.get(ctx.threadID);
    const limits = config.limits;

    if (arg === "status" || arg === "etat" || arg === "état") {
      const state = guard ? guard.state() : null;
      return box("ANTI-SPAM — ÉTAT", [
        `🛡️ Paramètres appliqués :`,
        `   • ${num(limits.floodMessages)} messages / ${formatDuration(limits.floodWindowMs)} → flood`,
        `   • Sanction : mute de ${formatDuration(limits.floodMuteMs)}`,
        `   • Cooldown global : ${formatDuration(limits.globalCooldownMs)} entre deux commandes`,
        "",
        `${ICONS.chart} Garde-fous en mémoire : ${num((state.flood && state.flood.size) || state.floodEntries || 0)} suivi(s)`,
        `${ICONS.no} Muet actifs (tous groupes) : ${num(services.warnings.stats().mutes)}`,
        "",
        `${ICONS.info} Ces compteurs sont remis à zéro au redémarrage du bot.`
      ]);
    }

    if (!arg) {
      return box("ANTI-SPAM", [
        `${settings.antispam ? `${ICONS.ok} Activé` : `${ICONS.no} Désactivé`} pour ${ctx.threadName || "ce groupe"}`,
        "",
        `${ICONS.pin} Seuil : ${num(limits.floodMessages)} messages en ${formatDuration(limits.floodWindowMs)}`,
        `${ICONS.pin} Sanction : mute temporaire de ${formatDuration(limits.floodMuteMs)}`,
        `${ICONS.pin} Cooldown global entre commandes : ${formatDuration(limits.globalCooldownMs)}`,
        "",
        `${ICONS.info} Les administrateurs du bot échappent au cooldown global.`,
        `${ICONS.pin} ${cmd(`antispam ${settings.antispam ? "off" : "on"}`, ctx.prefix)} • ${cmd("antispam status", ctx.prefix)}`
      ]);
    }

    const result = services.settings.set(ctx.threadID, "antispam", arg, { by: ctx.senderID });
    if (!result.ok) {
      return lightBox("ANTI-SPAM", [`${ICONS.warn} ${result.error}`, "", `${ICONS.pin} ${cmd("antispam on|off|status", ctx.prefix)}`]);
    }

    bag.logs.info("group", `Anti-spam ${result.value ? "activé" : "désactivé"} (${ctx.threadID})`, { userID: ctx.senderID, threadID: ctx.threadID, command: "antispam" });
    return box("ANTI-SPAM", [
      `${result.value ? ICONS.ok : ICONS.no} Anti-spam ${result.value ? "activé" : "désactivé"} pour ce groupe.`,
      "",
      result.value
        ? `${ICONS.info} Effet : au-delà de ${num(limits.floodMessages)} messages en ${formatDuration(limits.floodWindowMs)}, l'auteur est rendu muet ${formatDuration(limits.floodMuteMs)}.`
        : `${ICONS.warn} Sans anti-spam, seuls les cooldowns par commande s'appliquent.`,
      `${ICONS.pin} Réglage indépendant pour chaque groupe.`
    ]);
  }
};

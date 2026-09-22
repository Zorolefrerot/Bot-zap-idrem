"use strict";

/**
 * /antilink — filtrage des liens dans le groupe.
 *   /antilink                  → état + liste blanche
 *   /antilink on|off           → activation
 *   /antilink allow <domaine>  → ajoute un domaine autorisé (liste du groupe)
 *   /antilink deny <domaine>   → retire un domaine de la liste du groupe
 *   /antilink list             → domaines autorisés (groupe + global)
 *
 * Action réelle : le dispatcher supprime le message (unsendMessage) et ajoute un
 * avertissement. Les administrateurs du groupe ne sont jamais filtrés.
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");

module.exports = {
  name: "antilink",
  aliases: ["nolink", "liens", "links", "antipub"],
  category: "groups",
  description: "Bloque les liens non autorisés dans le groupe (avec liste blanche par domaine).",
  usage: "/antilink [on|off|allow <domaine>|deny <domaine>|list]",
  examples: ["/antilink on", "/antilink allow youtube.com", "/antilink list"],
  permissions: "groupadmin",
  cooldown: 8,
  groupOnly: true,

  async execute(ctx, bag) {
    const { services, config } = bag;
    const [action, ...rest] = ctx.args.map((a) => String(a).trim());
    const word = String(action || "").toLowerCase();
    const settings = services.settings.get(ctx.threadID);
    const globalAllowed = Array.isArray(config.moderation.allowedLinkDomains) ? config.moderation.allowedLinkDomains : [];

    const stateBox = () =>
      box("ANTI-LIEN", [
        `${settings.antilink ? `${ICONS.ok} Activé` : `${ICONS.no} Désactivé`} pour ${ctx.threadName || "ce groupe"}`,
        "",
        `${ICONS.pin} Domaines autorisés (ce groupe) : ${settings.allowedLinkDomains.length ? settings.allowedLinkDomains.join(", ") : "aucun"}`,
        `${ICONS.gear} Domaines autorisés (global) : ${globalAllowed.join(", ") || "aucun"}`,
        "",
        `${ICONS.info} Effet réel : message supprimé + avertissement. Les admins du groupe passent toujours.`,
        `${ICONS.pin} ${cmd("antilink on|off", ctx.prefix)} • ${cmd("antilink allow youtube.com", ctx.prefix)} • ${cmd("antilink list", ctx.prefix)}`
      ]);

    if (!word) return stateBox();

    if (word === "list" || word === "liste") {
      return box("DOMAINES AUTORISÉS", [
        `${ICONS.group} Ce groupe : ${settings.allowedLinkDomains.length ? settings.allowedLinkDomains.map((d) => `• ${d}`).join("\n") : "• (aucun)"}`,
        `${ICONS.gear} Global : ${globalAllowed.length ? globalAllowed.map((d) => `• ${d}`).join("\n") : "• (aucun)"}`,
        "",
        `${ICONS.info} Les deux listes sont combinées à la vérification.`
      ]);
    }

    if (word === "allow" || word === "add" || word === "autoriser") {
      const domain = String(rest[0] || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
      if (!domain) return lightBox("ANTI-LIEN", [`${ICONS.warn} Précise un domaine.`, "", cmd("antilink allow youtube.com", ctx.prefix)]);
      const next = [...new Set([...settings.allowedLinkDomains, domain])];
      const result = services.settings.set(ctx.threadID, "allowedLinkDomains", next, { by: ctx.senderID });
      if (!result.ok) return lightBox("ANTI-LIEN", [`${ICONS.no} ${result.error}`]);
      bag.logs.info("group", `Domaine autorisé : ${domain} (${ctx.threadID})`, { userID: ctx.senderID, threadID: ctx.threadID, command: "antilink" });
      return box("ANTI-LIEN", [
        `${ICONS.ok} ${domain} est autorisé dans ce groupe.`,
        `${ICONS.pin} Liste : ${num(result.value.length)} domaine(s) → ${result.value.join(", ")}`,
        "",
        settings.antilink ? "" : `${ICONS.warn} L'anti-lien est désactivé : ${cmd("antilink on", ctx.prefix)}.`
      ].filter((line) => line !== ""));
    }

    if (word === "deny" || word === "remove" || word === "retirer") {
      const domain = String(rest[0] || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
      if (!domain) return lightBox("ANTI-LIEN", [`${ICONS.warn} Précise un domaine à retirer.`, "", cmd("antilink deny tiktok.com", ctx.prefix)]);
      const next = settings.allowedLinkDomains.filter((d) => d !== domain);
      if (next.length === settings.allowedLinkDomains.length) {
        return lightBox("ANTI-LIEN", [`${ICONS.warn} ${domain} n'est pas dans la liste de ce groupe.`, "", `${ICONS.pin} ${cmd("antilink list", ctx.prefix)}`]);
      }
      const result = services.settings.set(ctx.threadID, "allowedLinkDomains", next, { by: ctx.senderID });
      if (!result.ok) return lightBox("ANTI-LIEN", [`${ICONS.no} ${result.error}`]);
      return box("ANTI-LIEN", [`${ICONS.ok} ${domain} retiré de la liste du groupe.`, `${ICONS.pin} Reste : ${result.value.join(", ") || "aucun domaine"}`]);
    }

    // on / off
    const result = services.settings.set(ctx.threadID, "antilink", word, { by: ctx.senderID });
    if (!result.ok) {
      return lightBox("ANTI-LIEN", [`${ICONS.warn} ${result.error}`, "", `${ICONS.pin} ${cmd("antilink on|off|allow|deny|list", ctx.prefix)}`]);
    }
    bag.logs.info("group", `Anti-lien ${result.value ? "activé" : "désactivé"} (${ctx.threadID})`, { userID: ctx.senderID, threadID: ctx.threadID, command: "antilink" });

    return box("ANTI-LIEN", [
      `${result.value ? ICONS.ok : ICONS.no} Anti-lien ${result.value ? "activé" : "désactivé"} pour ce groupe.`,
      "",
      `${ICONS.info} Effet : tout lien hors liste blanche est supprimé et son auteur reçoit un avertissement.`,
      `${ICONS.pin} Autoriser un site : ${cmd("antilink allow exemple.com", ctx.prefix)}`,
      `${ICONS.warn} Après ${num(config.limits.maxWarns)} avertissements : mute automatique de ${num(services.warnings.autoMuteMinutes())} minutes.`
    ]);
  }
};

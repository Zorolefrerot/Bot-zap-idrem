"use strict";

/**
 * /members — composition du groupe courant.
 *   /members            → effectif + premiers membres (noms réels si connus)
 *   /members list       → liste étendue (jusqu'à 40 noms)
 *   /members count      → effectif uniquement
 *   /members new        → membres vus récemment (activité enregistrée)
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");

const SHORT_LIMIT = 12;
const LONG_LIMIT = 40;

module.exports = {
  name: "members",
  aliases: ["membres", "liste", "participants", "qui"],
  category: "groups",
  description: "Liste les membres du groupe (effectif, noms connus, administrateurs).",
  usage: "/members [list|count]",
  examples: ["/members", "/members list", "/members count"],
  permissions: "public",
  cooldown: 10,
  groupOnly: true,

  async execute(ctx, bag) {
    const { services } = bag;
    const arg = String(ctx.args[0] || "").trim().toLowerCase();
    const info = await services.groups.threadInfo(ctx.threadID, { force: arg === "list" });

    if (!info.ok) {
      return lightBox("MEMBRES", [
        `${ICONS.warn} Impossible de lire la composition du groupe (${info.error}).`,
        "",
        `${ICONS.info} Le bot n'invente pas de liste : réessaie dans quelques secondes.`
      ]);
    }

    const participants = Array.isArray(info.participantIDs) ? info.participantIDs : [];
    const admins = Array.isArray(info.adminIDs) ? info.adminIDs : [];

    if (arg === "count") {
      return box("EFFECTIF", [
        `${ICONS.group} ${num(info.memberCount || participants.length)} membre(s)`,
        `${ICONS.crown} ${num(admins.length)} administrateur(s)`,
        info.name ? `${ICONS.pin} Groupe : ${info.name}` : ""
      ].filter((line) => line !== ""));
    }

    const limit = arg === "list" ? LONG_LIMIT : SHORT_LIMIT;
    const names = participants.slice(0, limit).map((id) => {
      const known = services.users.getName(id);
      const role = admins.includes(id) ? `${ICONS.crown}` : id === ctx.senderID ? `${ICONS.user}` : "•";
      return `${role} ${String(known || id).slice(0, 26)}`;
    });

    const lines = [
      `${ICONS.group} ${ctx.threadName || info.name || "Ce groupe"} — ${num(info.memberCount || participants.length)} membre(s)`,
      `${ICONS.crown} ${num(admins.length)} administrateur(s)${admins.length ? ` : ${admins.slice(0, 4).map((id) => services.users.getName(id) || id.slice(-6)).join(", ")}${admins.length > 4 ? "…" : ""}` : ""}`,
      ""
    ];

    if (!names.length) {
      lines.push(`${ICONS.warn} Facebook n'a renvoyé aucune liste de participants.`);
      lines.push(`${ICONS.info} L'effectif connu reste : ${num(info.memberCount)}.`);
    } else {
      lines.push(...names);
      if (participants.length > limit) lines.push("", `… ${num(participants.length - limit)} autre(s) — ${cmd("members list", ctx.prefix)} pour 40 noms.`);
      lines.push("", `${ICONS.info} Les noms affichés viennent des profils déjà croisés par le bot.`);
    }

    return box("MEMBRES", lines.filter((line) => line !== ""));
  }
};

"use strict";

/**
 * /unmute — lève le mute d'un utilisateur dans la conversation courante.
 *   /unmute <@personne|uid>
 *   /unmute list   → liste des utilisateurs muets ici
 *   /unmute all    → lève tous les mutes de ce groupe
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");
const { formatDuration } = require("../../utils/helpers");
const { target, record } = require("../../utils/moderation");

module.exports = {
  name: "unmute",
  aliases: ["demute", "unmuteall", "libere", "libère"],
  category: "admin",
  description: "Lève le mute d'un utilisateur (ou de tout le groupe).",
  usage: "/unmute <@personne|uid|list|all>",
  examples: ["/unmute @quelquun", "/unmute list", "/unmute all"],
  permissions: "groupadmin",
  cooldown: 8,

  async execute(ctx, bag) {
    const { services } = bag;
    const arg = String(ctx.args[0] || "").trim().toLowerCase();

    if (arg === "list" || arg === "liste") {
      const all = services.users.all();
      const muted = all.filter((user) => services.warnings.muteInfo(ctx.threadID, user.userID));
      if (!muted.length) return lightBox("MUETS", [`${ICONS.ok} Personne n'est muet dans cette conversation.`]);
      return box("UTILISATEURS MUETS", [
        ...muted.slice(0, 15).map((user) => {
          const info = services.warnings.muteInfo(ctx.threadID, user.userID);
          return `🔇 ${String(user.name || user.userID).slice(0, 24)} — encore ${formatDuration(info.remainingMs)}`;
        }),
        muted.length > 15 ? `… et ${num(muted.length - 15)} autre(s).` : "",
        "",
        `${ICONS.info} ${cmd("unmute all", ctx.prefix)} pour tout lever.`
      ].filter((line) => line !== ""));
    }

    if (arg === "all" || arg === "tous") {
      const all = services.users.all();
      const muted = all.filter((user) => services.warnings.muteInfo(ctx.threadID, user.userID));
      if (!muted.length) return lightBox("MUETS", [`${ICONS.ok} Personne n'est muet ici.`]);
      let count = 0;
      for (const user of muted) {
        if (services.warnings.unmute(ctx.threadID, user.userID).ok) count += 1;
      }
      record(bag, ctx, "unmute-all", `${count} mute(s) levé(s)`);
      return box("MUTES LEVÉS", [`${ICONS.ok} ${num(count)} utilisateur(s) peuvent de nouveau parler au bot.`]);
    }

    const { id, name, explicit } = target(ctx);
    if (!id || !explicit) {
      return lightBox("UNMUTE", [`${ICONS.warn} Indique qui libérer.`, "", `${ICONS.pin} ${cmd("unmute @quelquun", ctx.prefix)} • ${cmd("unmute list", ctx.prefix)}`]);
    }

    const result = services.warnings.unmute(ctx.threadID, id);
    if (!result.ok) return lightBox("UNMUTE", [`${ICONS.warn} ${result.error}`, "", `${ICONS.pin} ${cmd("unmute list", ctx.prefix)}`]);

    record(bag, ctx, "unmute", id);
    return box("UNMUTE", [`${ICONS.ok} ${name || id} n'est plus muet dans cette conversation.`]);
  }
};

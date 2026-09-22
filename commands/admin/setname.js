"use strict";

/**
 * /setname — renommage réel via l'API Messenger.
 *
 *   /setname <pseudo>       → pseudo du BOT dans cette conversation
 *   /setname reset          → rétablit le pseudo Facebook du bot
 *   /setname title <nom>    → renomme le GROUPE (groupe uniquement)
 *
 * Si Messenger refuse (permissions de conversation), le bot le dit clairement.
 */

const { box, lightBox, cmd, ICONS } = require("../../utils/text");
const { callApiMethod } = require("../../utils/helpers");

module.exports = {
  name: "setname",
  aliases: ["nickname", "rename", "renomme", "settitle"],
  category: "admin",
  description: "Change le pseudo du bot dans la conversation, ou le nom du groupe.",
  usage: "/setname <pseudo|title <nom>|reset>",
  examples: ["/setname IDREM ⚡", "/setname title Groupe Projet 2026", "/setname reset"],
  permissions: "admin",
  cooldown: 15,

  async execute(ctx, bag) {
    const { logger } = bag;
    const api = ctx.api;
    const first = String(ctx.args[0] || "").trim().toLowerCase();

    if (!ctx.args.length) {
      return lightBox("RENOMMAGE", [
        `${ICONS.warn} Indique un nouveau nom.`,
        "",
        `${ICONS.pin} ${cmd("setname IDREM ⚡", ctx.prefix)} → pseudo du bot ici`,
        `${ICONS.pin} ${cmd("setname title Mon Groupe", ctx.prefix)} → nom du groupe`,
        `${ICONS.pin} ${cmd("setname reset", ctx.prefix)} → pseudo d'origine`
      ]);
    }

    // --- Nom du GROUPE -------------------------------------------------------
    if (first === "title" || first === "titre" || first === "nom") {
      const title = ctx.args.slice(1).join(" ").trim();
      if (!title) return lightBox("RENOMMAGE", [`${ICONS.warn} Précise le nouveau nom du groupe.`, "", cmd("setname title Mon Groupe", ctx.prefix)]);
      if (!ctx.isGroup) return lightBox("RENOMMAGE", [`${ICONS.warn} Cette conversation n'est pas un groupe.`]);
      if (title.length > 80) return lightBox("RENOMMAGE", [`${ICONS.no} Nom trop long (80 caractères maximum).`]);
      if (!api || typeof api.setTitle !== "function") {
        return lightBox("RENOMMAGE", [`${ICONS.no} L'API Messenger n'expose pas setTitle sur cette version.`, "", `${ICONS.info} Rien n'est simulé : le nom du groupe n'a pas été changé.`]);
      }

      await ctx.typing(700);
      try {
        await callApiMethod(api.setTitle.bind(api), [title, ctx.threadID], { timeoutMs: 20000 });
      } catch (err) {
        const message = String((err && (err.error || err.message)) || err).slice(0, 140);
        logger.warn(`setTitle refusé : ${message}`, "admin");
        return lightBox("RENOMMAGE", [`${ICONS.no} Messenger a refusé le changement de nom.`, `${ICONS.pin} Motif technique : ${message}`, "", `${ICONS.info} Le bot doit être membre (et souvent admin) du groupe.`]);
      }

      bag.services.groups.update(ctx.threadID, { name: title });
      bag.logs.info("admin", `Groupe ${ctx.threadID} renommé « ${title} »`, { userID: ctx.senderID, threadID: ctx.threadID, command: "setname" });
      return box("NOM DU GROUPE", [`${ICONS.ok} Le groupe s'appelle maintenant « ${title} ».`, `${ICONS.user} Changé par ${ctx.senderName || ctx.senderID}`]);
    }

    // --- Pseudo du BOT -------------------------------------------------------
    const nickname = first === "reset" ? "" : ctx.argString.trim().slice(0, 42);
    if (!api || typeof api.changeNickname !== "function") {
      return lightBox("PSEUDO", [`${ICONS.no} L'API Messenger n'expose pas changeNickname sur cette version.`]);
    }

    await ctx.typing(600);
    try {
      await callApiMethod(api.changeNickname.bind(api), [nickname, ctx.threadID, ctx.botUserID], { timeoutMs: 20000 });
    } catch (err) {
      const message = String((err && (err.error || err.message)) || err).slice(0, 140);
      logger.warn(`changeNickname refusé : ${message}`, "admin");
      return lightBox("PSEUDO", [
        `${ICONS.no} Messenger a refusé le changement de pseudo.`,
        `${ICONS.pin} Motif technique : ${message}`,
        "",
        `${ICONS.info} Rien n'est simulé : le pseudo n'a pas été modifié.`
      ]);
    }

    bag.logs.info("admin", `Pseudo du bot = « ${nickname || "(réinitialisé)"} » (thread ${ctx.threadID})`, { userID: ctx.senderID, threadID: ctx.threadID, command: "setname" });
    return box("PSEUDO DU BOT", [
      nickname ? `${ICONS.ok} Dans cette conversation, je m'appelle « ${nickname} ».` : `${ICONS.ok} Mon pseudo d'origine a été rétabli ici.`,
      "",
      `${ICONS.pin} Portée : cette conversation uniquement (Messenger ne permet pas de pseudo global).`,
      `${ICONS.info} Nom officiel du bot : ${bag.config.identity.name}`
    ]);
  }
};

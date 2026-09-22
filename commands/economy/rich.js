"use strict";

/**
 * /rich — classement des plus riches.
 */

const { box, cmd, num, ICONS } = require("../../utils/text");

const MEDALS = ["🥇", "🥈", "🥉"];

module.exports = {
  name: "rich",
  aliases: ["richest", "fortune", "milliardaire"],
  category: "economy",
  description: "Classement des utilisateurs les plus riches en IDREM Coins.",
  usage: "/rich [nombre]",
  examples: ["/rich", "/rich 5"],
  permissions: "public",
  cooldown: 6,

  async execute(ctx, bag) {
    const { services } = bag;
    const limit = Math.min(20, Math.max(3, Number(ctx.args[0]) || 10));
    const entries = services.economy.top(limit);

    if (!entries.length) {
      return box("FORTUNES", [`Personne n'a encore de pièces.`, "", `${ICONS.pin} ${cmd("daily", ctx.prefix)} pour commencer.`]);
    }

    const lines = entries.map((entry, index) => {
      const medal = MEDALS[index] || `${String(index + 1).padStart(2, " ")}.`;
      const name = String(entry.userID === ctx.senderID ? "Toi" : services.users.getName(entry.userID) || entry.userID).slice(0, 18);
      return `${medal} ${name} — ${services.economy.fmt(entry.balance)}`;
    });

    const myIndex = services.economy.top(9999).findIndex((entry) => entry.userID === ctx.senderID);
    return box(
      "LES PLUS RICHES",
      [...lines, "", myIndex >= 0 ? `${ICONS.target} Ta position : #${num(myIndex + 1)}` : `${ICONS.target} Tu n'es pas encore classé.`],
      { icon: ICONS.money, footer: [`${ICONS.pin} ${cmd("leaderboard coins", ctx.prefix)} affiche le même classement`] }
    );
  }
};

"use strict";

/**
 * /balance — solde, revenus et inventaire.
 *   /balance           → ton solde
 *   /balance @quelquun → le solde d'un autre
 */

const { box, num, cmd, ICONS, progress } = require("../../utils/text");

module.exports = {
  name: "balance",
  aliases: ["bal", "solde", "money", "cash", "coins"],
  category: "economy",
  description: "Affiche ton solde d'IDREM Coins, tes revenus et l'état de tes cooldowns.",
  usage: "/balance [@personne|uid]",
  examples: ["/balance", "/balance @quelquun"],
  permissions: "public",
  cooldown: 3,

  async execute(ctx, bag) {
    const { services, config } = bag;
    const target = ctx.resolveTarget(ctx.args[0]);
    const isSelf = target.id === ctx.senderID;
    const name = target.name || ctx.displayName(target.id);

    const account = services.economy.get(target.id);
    const cooldowns = services.economy.cooldowns(target.id);
    const inventoryValue = services.economy.inventoryValue(target.id);
    const rank = services.economy.top(9999).findIndex((entry) => entry.userID === target.id) + 1;

    const cool = (state) => (state.ready ? `${ICONS.ok} prêt` : `⏳ ${bag.helpers.formatDuration(state.remainingMs)}`);

    const lines = [
      `${ICONS.user} ${isSelf ? "Ton compte" : `Compte de ${name}`}`,
      `${ICONS.money} Solde : ${services.economy.fmt(account.balance)}`,
      "",
      `${ICONS.chart} Gagné au total : ${num(account.totalEarned)} ${config.currency.symbol}`,
      `${ICONS.chart} Dépensé : ${num(account.totalSpent)} ${config.currency.symbol}`,
      `${ICONS.media} Inventaire : ${account.inventory.length} objet(s) — ${services.economy.fmt(inventoryValue)}`,
      rank ? `${ICONS.target} Classement : #${num(rank)}` : "",
      "",
      `${ICONS.time} Cooldowns :`,
      `  ${cmd("daily", ctx.prefix)} — ${cool(cooldowns.daily)}`,
      `  ${cmd("work", ctx.prefix)} — ${cool(cooldowns.work)}`,
      `  ${cmd("crime", ctx.prefix)} — ${cool(cooldowns.crime)}`
    ].filter((line) => line !== "");

    const wealth = Math.min(100, Math.round((account.balance / Math.max(1, config.currency.maxBalance)) * 100 * 40));
    return box(isSelf ? "MON COMPTE" : "COMPTE", lines, {
      icon: ICONS.money,
      footer: [`💰 Fortune ${progress(wealth, 100)}`, `${ICONS.pin} ${cmd("shop", ctx.prefix)} pour dépenser, ${cmd("rich", ctx.prefix)} pour le classement`]
    });
  }
};

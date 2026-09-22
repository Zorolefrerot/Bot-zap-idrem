"use strict";

/**
 * /transfer — envoie des pièces à un autre utilisateur.
 *   /transfer @quelquun 200
 *   /transfer 100065927401614 200
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");

module.exports = {
  name: "transfer",
  aliases: ["send", "payer", "pay", "envoyer"],
  category: "economy",
  description: "Transfère des IDREM Coins à un autre utilisateur.",
  usage: "/transfer <@personne|uid> <montant>",
  examples: ["/transfer @quelquun 200", "/transfer 100065927401614 500"],
  permissions: "public",
  cooldown: 5,

  async execute(ctx, bag) {
    const { services, config } = bag;
    const target = ctx.resolveTarget(ctx.args[0]);
    const amountArg = ctx.args[1] || ctx.args[0];
    const amount = Number(String(amountArg).replace(",", ".").trim());

    if (!target.explicit) {
      return lightBox("TRANSFERT", [
        `${ICONS.warn} Indique le destinataire et le montant.`,
        "",
        `${cmd("transfer @quelquun 200", ctx.prefix)}`,
        `${cmd(`transfer ${ctx.senderID} 200`, ctx.prefix)}`
      ]);
    }
    if (!Number.isFinite(amount) || amount < 1) {
      return lightBox("TRANSFERT", [
        `${ICONS.warn} Montant invalide.`,
        "",
        `${cmd("transfer @quelquun 200", ctx.prefix)}`
      ]);
    }

    const result = services.economy.transfer(ctx.senderID, target.id, Math.floor(amount));
    if (!result.ok) return lightBox("TRANSFERT", [`${ICONS.no} ${result.error}`]);

    const name = target.name || ctx.displayName(target.id);
    return box(
      "TRANSFERT EFFECTUÉ",
      [
        `${ICONS.money} ${num(result.amount)} ${config.currency.symbol} envoyés à ${name}.`,
        result.fee > 0 ? `${ICONS.info} Frais : ${num(result.fee)} ${config.currency.symbol} — reçu : ${num(result.received)}` : "",
        `${ICONS.chart} Ton solde : ${services.economy.fmt(result.balance)}`
      ].filter(Boolean),
      { icon: ICONS.ok }
    );
  }
};

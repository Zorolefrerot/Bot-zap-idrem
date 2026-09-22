"use strict";

/**
 * /gayrate — mesure humoristique et absurde (stable pour la journée).
 * Purement divertissant : aucune catégorie réelle de personnes n'est jugée.
 */

const { box, num, progress, ICONS } = require("../../utils/text");
const { dailyValue } = require("../../utils/random");

const COMMENTS = [
  "Le détecteur s'emballe… mais ce n'est qu'un jouet.",
  "Résultat absurde, comme prévu.",
  "L'algorithme a haussé les épaules.",
  "Rien de sérieux ici : c'est un générateur de nombres.",
  "Le bot assume : aucune signification réelle.",
  "Score du jour enregistré. Demain, autre chose."
];

module.exports = {
  name: "gayrate",
  aliases: ["gaymeter", "gay"],
  category: "fun",
  description: "Mesure humoristique absurde (stable par jour) — sans aucune signification réelle.",
  usage: "/gayrate [@personne]",
  examples: ["/gayrate", "/gayrate @quelquun"],
  permissions: "public",
  cooldown: 5,

  async execute(ctx, bag) {
    const target = ctx.resolveTarget(ctx.args[0]);
    const score = dailyValue(`gayrate:${target.id}`, 0, 100);
    const name = target.id === ctx.senderID ? "toi" : target.name || ctx.displayName(target.id);
    const comment = bag.random.pick(COMMENTS);

    return box(
      "GAYMETER 🌈",
      [
        `${ICONS.target} ${name}`,
        `🌈 ${num(score)} %`,
        progress(score, 100),
        "",
        `💬 ${comment}`,
        "",
        `${ICONS.info} Commande d'humour absurde : un simple tirage déterministe.`,
        "Aucune signification réelle, aucun jugement sur qui que ce soit."
      ],
      { icon: "🌈" }
    );
  }
};

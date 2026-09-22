"use strict";

/**
 * /simp — taux de « simpitude » humoristique (stable par jour).
 */

const { box, num, progress, ICONS } = require("../../utils/text");
const { dailyValue } = require("../../utils/random");

const LABELS = [
  { min: 90, text: "Niveau professionnel : tu écris des poèmes aux inconnus." },
  { min: 75, text: "Tu réponds en 3 secondes chrono, même à 4 h du matin." },
  { min: 60, text: "Tu complimentes un peu trop souvent, mais ça part d'un bon sentiment." },
  { min: 45, text: "Équilibre raisonnable : attentif sans excès." },
  { min: 30, text: "Plutôt détaché, tu gardes tes distances." },
  { min: 15, text: "Froid comme un serveur éteint." },
  { min: 0, text: "Aucun signe détecté. Impressionnant de retenue." }
];

module.exports = {
  name: "simp",
  aliases: ["simprate", "simpnation"],
  category: "fun",
  description: "Mesure humoristique de la « simpitude » (stable par jour, sans sérieux).",
  usage: "/simp [@personne]",
  examples: ["/simp", "/simp @quelquun"],
  permissions: "public",
  cooldown: 5,

  async execute(ctx) {
    const target = ctx.resolveTarget(ctx.args[0]);
    const score = dailyValue(`simp:${target.id}`, 0, 100);
    const name = target.id === ctx.senderID ? "toi" : target.name || ctx.displayName(target.id);
    const label = LABELS.find((item) => score >= item.min) || LABELS[LABELS.length - 1];

    return box(
      "SIMPMETER",
      [
        `${ICONS.target} ${name}`,
        `💗 ${num(score)} %`,
        progress(score, 100),
        "",
        `💬 ${label.text}`,
        `${ICONS.info} Tirage déterministe du jour — purement ludique.`
      ],
      { icon: "💗" }
    );
  }
};

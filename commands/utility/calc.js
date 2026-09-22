"use strict";

/**
 * /calc — calculatrice sécurisée (aucun eval).
 *   /calc 2+3*4
 *   /calc sqrt(144) + log(100)
 */

const { box, lightBox, mono, ICONS, num } = require("../../utils/text");

module.exports = {
  name: "calc",
  aliases: ["calculer", "calculette", "compute", "calculatrice"],
  category: "utility",
  description: "Calcule une expression mathématique de façon sécurisée (sans eval).",
  usage: "/calc <expression>",
  examples: ["/calc 2+3*4", "/calc sqrt(144)", "/calc 15% de 200 → /calc 200*0.15"],
  permissions: "public",
  cooldown: 2,

  async execute(ctx, bag) {
    const expression = ctx.argString.trim();

    if (!expression) {
      return lightBox("CALCULATRICE", [
        `${ICONS.warn} Aucune expression fournie.`,
        "",
        `${ICONS.pin} Exemples :`,
        `  ${mono("/calc 2+3*4")}`,
        `  ${mono("/calc sqrt(144) + 10%4")}`,
        `  ${mono("/calc 2pi")}`,
        "",
        `${ICONS.info} Opérateurs : + − * / % ^ et parenthèses`,
        `${ICONS.info} Fonctions : ${bag.math.functionNames().slice(0, 14).join(", ")}…`,
        `${ICONS.info} Constantes : ${bag.math.constantNames().join(", ")}`,
        `${ICONS.lock} Aucun code n'est exécuté : seule l'arithmétique est acceptée.`
      ]);
    }

    const result = bag.math.calculate(expression);
    if (!result.ok) {
      return lightBox("CALCUL", [
        `${ICONS.no} ${result.error}`,
        "",
        `${ICONS.pin} Exemple valide : ${mono("/calc (2+3)*4")}`
      ]);
    }

    return box(
      "RÉSULTAT",
      [
        `${mono(expression)}`,
        `${ICONS.bolt} = ${result.text}`,
        "",
        `${ICONS.info} Valeur brute : ${num(result.value)}`
      ],
      { icon: ICONS.ok }
    );
  }
};

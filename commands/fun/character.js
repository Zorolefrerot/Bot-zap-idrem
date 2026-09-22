"use strict";

/**
 * /character — portrait humoristique généré à partir d'un tirage déterministe.
 */

const { box, num, progress, ICONS } = require("../../utils/text");
const { dailyValue, seeded, pick } = require("../../utils/random");
const { CHARACTER_TRAITS, CHARACTER_QUIRKS } = require("../../services/corpus");

module.exports = {
  name: "character",
  aliases: ["personnage", "portrait", "charactercard"],
  category: "fun",
  description: "Dresse un portrait humoristique de quelqu'un (traits et manies tirés au sort).",
  usage: "/character [@personne]",
  examples: ["/character", "/character @quelquun"],
  permissions: "public",
  cooldown: 5,

  async execute(ctx, bag) {
    const target = ctx.resolveTarget(ctx.args[0]);
    const seedKey = `character:${target.id}`;
    const name = target.id === ctx.senderID ? "toi" : target.name || ctx.displayName(target.id);

    const rnd = seeded(`${seedKey}:${bag.random.dayKey()}`);
    const trait = CHARACTER_TRAITS[Math.floor(rnd() * CHARACTER_TRAITS.length)];
    const quirk = CHARACTER_QUIRKS[Math.floor(rnd() * CHARACTER_QUIRKS.length)];
    const charisma = dailyValue(`${seedKey}:charisma`, 20, 100);
    const humour = dailyValue(`${seedKey}:humour`, 20, 100);
    const chaos = dailyValue(`${seedKey}:chaos`, 5, 100);
    const patience = dailyValue(`${seedKey}:patience`, 10, 100);

    const user = bag.services.users.get(target.id);
    const classes = ["🧙 Mage du hors-sujet", "🛡️ Gardien du calme", "🎭 Bouffon officiel", "🚀 Explorateur de menus", "🧰 Bricoleur de commandes", "🎯 Stratège discret"];
    const classPick = classes[Math.floor(rnd() * classes.length)];

    return box(
      `FICHE PERSONNAGE — ${String(name).slice(0, 18).toUpperCase()}`,
      [
        `${ICONS.user} ${classPick}`,
        `${ICONS.pin} Trait dominant : ${trait}`,
        `${ICONS.fun} Manie connue : ${quirk}`,
        "",
        `✨ Charisme ${progress(charisma, 100)}`,
        `😂 Humour ${progress(humour, 100)}`,
        `🌪️ Chaos ${progress(chaos, 100)}`,
        `🧘 Patience ${progress(patience, 100)}`,
        "",
        `${ICONS.chart} Données réelles : niveau ${num(user.level)} • ${num(user.messages)} messages`,
        `${ICONS.info} Portrait généré pour la journée — divertissement uniquement.`
      ],
      { icon: ICONS.fun }
    );
  }
};

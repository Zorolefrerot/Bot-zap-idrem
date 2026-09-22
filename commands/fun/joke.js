"use strict";

/** /joke — blague du corpus local (fonctionne toujours, sans réseau). */

const { box, ICONS } = require("../../utils/text");
const { pick } = require("../../utils/random");
const { JOKES } = require("../../services/corpus");

module.exports = {
  name: "joke",
  aliases: ["blague", "rigole", "humour"],
  category: "fun",
  description: "Raconte une blague courte (corpus local, sans service externe).",
  usage: "/joke",
  examples: ["/joke"],
  permissions: "public",
  cooldown: 3,

  async execute(ctx) {
    return box("BLAGUE", [`${ICONS.fun} ${pick(JOKES)}`, "", `${ICONS.info} Divertissement — corpus local du bot.`], { icon: ICONS.fun });
  }
};

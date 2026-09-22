"use strict";

/** /quote — citation du corpus local. */

const { box, ICONS } = require("../../utils/text");
const { pick } = require("../../utils/random");
const { QUOTES } = require("../../services/corpus");

module.exports = {
  name: "quote",
  aliases: ["citation", "phrase", "inspire"],
  category: "fun",
  description: "Affiche une citation (corpus local).",
  usage: "/quote",
  examples: ["/quote"],
  permissions: "public",
  cooldown: 3,

  async execute(ctx) {
    const quote = pick(QUOTES);
    return box("CITATION", [`💬 « ${quote.text} »`, "", `— ${quote.author}`], { icon: ICONS.book });
  }
};

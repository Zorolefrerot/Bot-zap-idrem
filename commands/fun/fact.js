"use strict";

/** /fact — fait surprenant du corpus local. */

const { box, ICONS } = require("../../utils/text");
const { pick } = require("../../utils/random");
const { FACTS } = require("../../services/corpus");

module.exports = {
  name: "fact",
  aliases: ["fait", "savais", "le savais-tu", "funfact"],
  category: "fun",
  description: "Donne un fait surprenant (corpus local, vérifié à la rédaction).",
  usage: "/fact",
  examples: ["/fact"],
  permissions: "public",
  cooldown: 3,

  async execute(ctx) {
    return box("LE SAVIEZ-VOUS ?", [pick(FACTS), "", `${ICONS.info} À vérifier si le sujet est important 😉`], { icon: ICONS.info });
  }
};

"use strict";

/**
 * /give — variante conviviale de /transfer (même moteur économique).
 *   /give @quelquun 100
 */

const transfer = require("./transfer");

module.exports = {
  ...transfer,
  name: "give",
  aliases: ["donner", "offrir", "cadeau"],
  description: "Offre des IDREM Coins à quelqu'un (équivalent de /transfer).",
  usage: "/give <@personne|uid> <montant>",
  examples: ["/give @quelquun 100"]
};

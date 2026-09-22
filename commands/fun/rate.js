"use strict";

/**
 * /rate — note humoristique (stable pour la journée).
 *   /rate           → te note
 *   /rate @quelquun → note la personne
 *   /rate pizza     → note un concept
 */

const { box, num, progress, ICONS } = require("../../utils/text");
const { dailyValue } = require("../../utils/random");
const { RATE_COMMENTS } = require("../../services/corpus");

function commentFor(score) {
  const entry = RATE_COMMENTS.find((item) => score >= item.min);
  return entry ? entry.text : RATE_COMMENTS[RATE_COMMENTS.length - 1].text;
}

module.exports = {
  name: "rate",
  aliases: ["note", "noter", "evaluer", "évaluer"],
  category: "fun",
  description: "Note sur 10 (toi, quelqu'un, ou un concept) — résultat stable pour la journée.",
  usage: "/rate [@personne|sujet]",
  examples: ["/rate", "/rate @quelquun", "/rate la pizza"],
  permissions: "public",
  cooldown: 4,

  async execute(ctx) {
    const target = ctx.resolveTarget(ctx.args[0]);
    const subject = target.explicit && !ctx.args[0] ? "" : ctx.argString.trim();
    const key = subject ? `${ctx.senderID}:rate:${subject.toLowerCase().slice(0, 40)}` : `rate:${target.id}`;
    const score = dailyValue(key, 0, 10);
    const label = subject ? subject.slice(0, 40) : target.id === ctx.senderID ? "toi-même" : target.name || ctx.displayName(target.id);

    return box(
      "NOTE",
      [
        `${ICONS.target} ${label}`,
        `${"⭐".repeat(Math.max(1, Math.round(score / 2)))} ${num(score)}/10`,
        progress(score, 10),
        "",
        `💬 ${commentFor(score)}`,
        `${ICONS.info} Résultat fixé pour aujourd'hui — 100 % divertissement.`
      ],
      { icon: ICONS.target }
    );
  }
};

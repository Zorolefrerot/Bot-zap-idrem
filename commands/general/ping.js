"use strict";

/**
 * /ping — latence du bot + état rapide.
 */

const { box, num, ICONS } = require("../../utils/text");

module.exports = {
  name: "ping",
  aliases: ["latence", "pong"],
  category: "general",
  description: "Mesure la latence de réponse du bot.",
  usage: "/ping",
  examples: ["/ping"],
  permissions: "public",
  cooldown: 2,

  async execute(ctx, bag) {
    const started = Date.now();
    const label = (() => {
      const ms = started - ctx.startedAt;
      if (ms < 250) return { icon: "🟢", text: "Excellent" };
      if (ms < 700) return { icon: "🟡", text: "Correct" };
      return { icon: "🔴", text: "Élevée" };
    })();

    return box(
      "PONG",
      [
        `${label.icon} Latence : ${num(started - ctx.startedAt)} ms — ${label.text}`,
        `${ICONS.time} Session active depuis ${bag.helpers.formatDuration(bag.services.stats.uptimeMs())}`,
        `${ICONS.chart} ${num(bag.registry.count())} commandes chargées`
      ],
      { icon: ICONS.bolt }
    );
  }
};

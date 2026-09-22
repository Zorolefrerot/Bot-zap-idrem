"use strict";

/**
 * /riddle — devinette textuelle.
 *   /riddle            → propose une devinette
 *   /riddle <réponse>  → répond
 *   /riddle stop       → révèle la réponse
 */

const { box, lightBox, cmd, ICONS, num } = require("../../utils/text");

module.exports = {
  name: "riddle",
  aliases: ["devinette", "enigme", "énigme"],
  category: "games",
  description: "Devinettes : trouve la réponse à l'énigme proposée.",
  usage: "/riddle [réponse|stop]",
  examples: ["/riddle", "/riddle echo"],
  permissions: "public",
  cooldown: 3,

  async execute(ctx, bag) {
    const { services, config } = bag;
    const games = services.games;
    const arg = ctx.argString.trim();

    if (arg && !["stop", "fin"].includes(arg.toLowerCase())) {
      const answered = games.answerRiddle(ctx.threadID, ctx.senderID, arg);
      if (!answered.ok) {
        const started = games.riddle(ctx.threadID, ctx.senderID);
        return box("DEVINETTE", [
          `${ICONS.target} ${started.question}`,
          "",
          `${ICONS.pin} Réponds avec ${cmd("riddle ta réponse", ctx.prefix)}`
        ]);
      }
      if (answered.correct) {
        return box("DEVINETTE", [
          `${ICONS.ok} Exact ! La réponse était « ${answered.answer} ».`,
          `${ICONS.xp} +${num(answered.gains.xp)} XP • ${ICONS.money} +${num(answered.gains.coinsGiven)} ${config.currency.symbol}`
        ]);
      }
      return box("DEVINETTE", [
        `${ICONS.no} Non — la réponse était « ${answered.answer} ».`,
        `${ICONS.xp} +${num(answered.gains.xp)} XP de participation`
      ]);
    }

    if (arg.toLowerCase().startsWith("stop")) {
      const revealed = games.riddle(ctx.threadID, ctx.senderID);
      if (revealed.ended) return box("DEVINETTE", [`Réponse : ${revealed.answer}`, "", `Nouvelle devinette : ${revealed.question}`]);
    }

    const started = games.riddle(ctx.threadID, ctx.senderID);
    if (started.ended) {
      return lightBox("DEVINETTE", [`Partie précédente terminée (réponse : ${started.answer}).`, "", `${ICONS.target} ${started.question}`]);
    }
    return box(
      "DEVINETTE",
      [
        `${ICONS.target} ${started.question}`,
        "",
        `${ICONS.pin} Réponds avec ${cmd("riddle ta réponse", ctx.prefix)}`,
        `${ICONS.info} ${cmd("riddle stop", ctx.prefix)} pour révéler et enchaîner`
      ],
      { icon: "🧩" }
    );
  }
};

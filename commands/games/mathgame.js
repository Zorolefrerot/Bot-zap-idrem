"use strict";

/**
 * /mathgame — défi de calcul mental chronométré.
 *   /mathgame            → niveau normal
 *   /mathgame hard       → niveau difficile
 *   /mathgame 42         → réponse
 *   /mathgame stop       → abandonne
 */

const { box, lightBox, cmd, ICONS, num } = require("../../utils/text");

const LEVELS = { easy: "facile", normal: "normal", hard: "difficile" };

module.exports = {
  name: "mathgame",
  aliases: ["math", "calcul", "maths"],
  category: "games",
  description: "Défi de calcul mental : résous l'opération en 3 essais.",
  usage: "/mathgame [easy|normal|hard|réponse|stop]",
  examples: ["/mathgame", "/mathgame hard", "/mathgame 42"],
  permissions: "public",
  cooldown: 3,

  async execute(ctx, bag) {
    const { services, config } = bag;
    const games = services.games;
    const arg = String(ctx.args[0] || "").trim().toLowerCase();
    const session = games.active(ctx.threadID, "math");

    if (session && arg) {
      if (["stop", "fin", "abandon"].includes(arg)) {
        const { expression, answer } = session.payload;
        games.cancel(ctx.threadID, "math");
        return box("DÉFI ARRÊTÉ", [`${expression} = ${num(answer)}`]);
      }

      const answered = games.answerMath(ctx.threadID, ctx.senderID, arg);
      if (!answered.ok) return lightBox("CALCUL", [answered.error]);

      if (answered.correct) {
        return box(
          "CALCUL JUSTE",
          [
            `${ICONS.ok} ${answered.expression} = ${num(answered.answer)}`,
            `${ICONS.target} Réussi en ${answered.attempts} essai${answered.attempts > 1 ? "s" : ""}`,
            `${ICONS.xp} +${num(answered.gains.xp)} XP • ${ICONS.money} +${num(answered.gains.coinsGiven)} ${config.currency.symbol}`,
            answered.gains.leveledUp ? `⭐ Niveau ${answered.gains.level} atteint !` : ""
          ].filter(Boolean)
        );
      }
      if (answered.exhausted) {
        return box("CALCUL", [
          `${ICONS.no} Trop d'essais utilisés.`,
          `${ICONS.ok} ${answered.expression} = ${num(answered.answer)}`,
          `${ICONS.xp} +${num(answered.gains.xp)} XP de participation`
        ]);
      }
      return lightBox("CALCUL", [
        `${ICONS.no} Ce n'est pas ça — c'est ${answered.hint}.`,
        `${ICONS.target} ${answered.expression} = ? (essai ${answered.attempts}, ${answered.remaining} restant${answered.remaining > 1 ? "s" : ""})`,
        "",
        `${ICONS.pin} Réponds avec ${cmd(`mathgame ${num(answered.attempts * 7)}`, ctx.prefix)}`
      ]);
    }

    if (session) {
      return lightBox("DÉFI EN COURS", [
        `${ICONS.target} ${session.payload.expression} = ?`,
        `Essais restants : ${session.payload.maxAttempts - session.payload.attempts}`,
        "",
        `${ICONS.pin} ${cmd("mathgame 42", ctx.prefix)} pour répondre`
      ]);
    }

    const level = LEVELS[arg] ? arg : "normal";
    const started = games.startMath(ctx.threadID, ctx.senderID, { level });
    if (!started.ok) return lightBox("CALCUL", [started.error]);

    return box(
      `CALCUL MENTAL — ${LEVELS[level].toUpperCase()}`,
      [
        `${ICONS.target} ${started.expression} = ?`,
        `${ICONS.info} 3 essais maximum.`,
        "",
        `${ICONS.pin} Réponds avec ${cmd("mathgame 12", ctx.prefix)}`,
        `${ICONS.gear} Autres niveaux : ${Object.keys(LEVELS).map((key) => cmd(`mathgame ${key}`, ctx.prefix)).join("  ")}`
      ],
      { icon: ICONS.game }
    );
  }
};

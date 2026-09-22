"use strict";

/**
 * /qcm — série de questions avec score cumulé.
 *   /qcm            → série de 3 questions
 *   /qcm 5          → série de 5 questions
 *   /qcm espace     → série dans une catégorie
 *   /qcm C          → répond à la question courante
 *   /qcm stop       → arrête la série
 */

const { box, lightBox, cmd, ICONS, num, progress } = require("../../utils/text");

const LETTERS = ["A", "B", "C", "D"];

module.exports = {
  name: "qcm",
  aliases: ["serie", "série"],
  category: "games",
  description: "Série de questions à choix multiples avec score et récompenses.",
  usage: "/qcm [nombre|catégorie|A-D|stop]",
  examples: ["/qcm", "/qcm 5", "/qcm C"],
  permissions: "public",
  cooldown: 3,

  async execute(ctx, bag) {
    const { services, config } = bag;
    const games = services.games;
    const arg = String(ctx.args[0] || "").trim();
    const session = games.active(ctx.threadID, "serie");

    if (session && arg) {
      if (["stop", "fin", "abandon"].includes(arg.toLowerCase())) {
        const cancelled = games.cancelSerie(ctx.threadID);
        return box("SÉRIE ARRÊTÉE", [`Score final : ${num(cancelled.score)}/${num(cancelled.answered)}`]);
      }

      const result = games.answerSerie(ctx.threadID, ctx.senderID, arg);
      if (!result.ok) return lightBox("QCM", [result.error, "", `Réponses possibles : ${LETTERS.join(" / ")}`]);

      const lines = [
        result.correct ? `${ICONS.ok} Bonne réponse !` : `${ICONS.no} Raté — c'était : ${result.goodAnswer}`,
        `${ICONS.chart} Score : ${num(result.score)}/${num(result.total)}`
      ];

      if (result.finished) {
        const medal = result.outcome === "win" ? "🥇 Sans faute !" : result.outcome === "draw" ? "🥈 Bien joué." : "🥉 Peut mieux faire.";
        lines.push("", medal, `${ICONS.xp} +${num(result.gains.xp)} XP • ${ICONS.money} +${num(result.gains.coinsGiven)} ${config.currency.symbol}`);
        if (result.gains.leveledUp) lines.push(`⭐ Niveau ${result.gains.level} atteint !`);
        return box("QCM TERMINÉ", lines);
      }

      lines.push("", `${ICONS.target} Question ${result.index + 1}/${result.total} : ${result.question.question}`, "");
      lines.push(...result.question.answers.map((answer, index) => `${LETTERS[index]}. ${answer}`));
      lines.push("", progress(result.score, result.total), `${ICONS.pin} Réponds avec ${cmd("qcm A", ctx.prefix)} … ${cmd("qcm D", ctx.prefix)}`);
      return box("QCM", lines);
    }

    const count = Number(arg) || 3;
    const started = games.startSerie(ctx.threadID, ctx.senderID, { count, category: Number(arg) ? "" : arg });
    if (!started.ok) {
      const lines = [started.error];
      if (Array.isArray(started.categories)) lines.push("", `${ICONS.pin} Catégories : ${started.categories.join(", ")}`);
      return lightBox("QCM", lines);
    }

    return box(
      `QCM — ${started.total} QUESTIONS`,
      [
        `${ICONS.target} Question 1/${started.total} : ${started.first.question}`,
        "",
        ...started.first.answers.map((answer, index) => `${LETTERS[index]}. ${answer}`),
        "",
        `${ICONS.pin} Réponds avec ${cmd("qcm A", ctx.prefix)} … ${cmd("qcm D", ctx.prefix)}`,
        `${ICONS.info} Sans faute : récompense maximale`
      ],
      { icon: ICONS.game, footer: [`⏱️ Chaque réponse doit arriver dans les ${Math.round(config.games.sessionTimeoutMs / 1000)} s`] }
    );
  }
};

"use strict";

/**
 * /quiz — une question, quatre réponses, réponse par lettre.
 *   /quiz               → démarre (ou affiche la question en cours)
 *   /quiz culture       → démarre dans une catégorie
 *   /quiz B             → répond
 *   /quiz stop          → abandonne et révèle la réponse
 */

const { box, lightBox, cmd, ICONS, num } = require("../../utils/text");

const LETTERS = ["A", "B", "C", "D"];

module.exports = {
  name: "quiz",
  aliases: ["quizz", "jeuquiz"],
  category: "games",
  description: "Quiz à choix multiples : une question, gagne de l'XP et des pièces.",
  usage: "/quiz [catégorie|A-D|stop]",
  examples: ["/quiz", "/quiz espace", "/quiz B"],
  permissions: "public",
  cooldown: 3,

  async execute(ctx, bag) {
    const { services, config } = bag;
    const games = services.games;

    if (config.conversation && ctx.settings && ctx.settings.games === false) {
      return lightBox("JEUX DÉSACTIVÉS", ["Les jeux sont désactivés dans cette conversation.", `${ICONS.gear} Un admin peut les réactiver avec ${cmd("settings", ctx.prefix)}.`]);
    }

    const arg = String(ctx.args[0] || "").trim();
    const session = games.active(ctx.threadID, "quiz");

    // Réponse à une question en cours ?
    if (session && arg) {
      if (["stop", "fin", "abandon", "quit"].includes(arg.toLowerCase())) {
        const revealed = games.revealQuiz(ctx.threadID);
        return box("QUIZ TERMINÉ", [`⏹️ Partie abandonnée.`, "", `${ICONS.ok} Bonne réponse : ${revealed.goodAnswer}`]);
      }
      const result = games.answerQuiz(ctx.threadID, ctx.senderID, arg);
      if (!result.ok) return lightBox("QUIZ", [result.error, "", `Réponses possibles : ${LETTERS.join(" / ")}`]);

      if (result.correct) {
        return box(
          "BONNE RÉPONSE",
          [
            `${ICONS.ok} Exact ! (${result.attempts || 1} tentative${result.attempts > 1 ? "s" : ""})`,
            `${ICONS.xp} +${num(result.gains.xp)} XP • ${ICONS.money} +${num(result.gains.coinsGiven)} ${config.currency.symbol}`,
            result.gains.leveledUp ? `⭐ Niveau ${result.gains.level} atteint !` : ""
          ].filter(Boolean)
        );
      }
      return box(
        "RATÉ",
        [
          `${ICONS.no} Ce n'était pas la bonne réponse.`,
          `${ICONS.ok} Bonne réponse : ${result.goodAnswer}`,
          `${ICONS.xp} +${num(result.gains.xp)} XP de consolation`
        ]
      );
    }

    // Lancement (ou relance si l'argument est une catégorie).
    const started = games.startQuiz(ctx.threadID, ctx.senderID, { category: arg });
    if (!started.ok) {
      const lines = [started.error];
      if (Array.isArray(started.categories)) lines.push("", `${ICONS.pin} Catégories : ${started.categories.join(", ")}`);
      if (session) lines.push("", `Question en cours : ${session.payload.question}`, `Réponds avec ${cmd(`quiz ${LETTERS[0]}`, ctx.prefix)} à ${LETTERS[LETTERS.length - 1]}.`);
      return lightBox("QUIZ", lines);
    }

    const payload = started.session.payload;
    return box(
      `QUIZ — ${String(payload.category).toUpperCase()}`,
      [
        `${ICONS.target} ${payload.question}`,
        "",
        ...payload.answers.map((answer, index) => `${LETTERS[index]}. ${answer}`),
        "",
        `${ICONS.pin} Réponds avec ${cmd("quiz A", ctx.prefix)} … ${cmd("quiz D", ctx.prefix)}`,
        `${ICONS.info} ${cmd("quiz stop", ctx.prefix)} pour abandonner`
      ],
      { footer: [`⏱️ Expire dans ${Math.round(config.games.sessionTimeoutMs / 1000)} s • ${num(payload.attempts || 0)} tentative(s)`] }
    );
  }
};

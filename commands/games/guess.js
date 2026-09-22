"use strict";

/**
 * /guess — devine le nombre secret (1 à 100, 8 essais).
 *   /guess         → démarre
 *   /guess 42      → propose un nombre
 *   /guess 500     → démarre avec un maximum différent
 *   /guess stop    → abandonne
 */

const { box, lightBox, cmd, ICONS, num, progress } = require("../../utils/text");

module.exports = {
  name: "guess",
  aliases: ["devine", "nombre", "highlow"],
  category: "games",
  description: "Devine le nombre secret entre 1 et 100 en 8 essais maximum.",
  usage: "/guess [nombre|stop]",
  examples: ["/guess", "/guess 42"],
  permissions: "public",
  cooldown: 3,

  async execute(ctx, bag) {
    const { services, config } = bag;
    const games = services.games;
    const arg = String(ctx.args[0] || "").trim();
    const session = games.active(ctx.threadID, "guess");

    if (session && arg) {
      if (["stop", "fin", "abandon"].includes(arg.toLowerCase())) {
        const target = session.payload.target;
        games.cancel(ctx.threadID, "guess");
        return box("PARTIE ARRÊTÉE", [`Le nombre secret était ${num(target)}.`]);
      }

      const played = games.playGuess(ctx.threadID, ctx.senderID, arg);
      if (!played.ok) return lightBox("DEVINETTE", [played.error]);

      if (played.result === "win") {
        return box(
          "TROUVÉ",
          [
            `${ICONS.ok} Bravo, c'était bien ${num(played.target)} !`,
            `${ICONS.target} ${played.attempts} essai${played.attempts > 1 ? "s" : ""}`,
            `${ICONS.xp} +${num(played.gains.xp)} XP • ${ICONS.money} +${num(played.gains.coinsGiven)} ${config.currency.symbol}`
          ]
        );
      }
      if (played.result === "lose") {
        return box(
          "PERDU",
          [
            `${ICONS.no} Plus d'essais disponibles.`,
            `${ICONS.ok} Le nombre était ${num(played.target)}.`,
            `${ICONS.xp} +${num(played.gains.xp)} XP de participation`
          ]
        );
      }

      const hint = played.result === "higher" ? "📈 C'est plus grand." : "📉 C'est plus petit.";
      return box(
        "DEVINETTE",
        [
          hint,
          `${ICONS.target} Essai ${played.attempts}/8 — ${progress(played.attempts, 8)}`,
          "",
          `${ICONS.pin} Propose un nombre avec ${cmd("guess 50", ctx.prefix)}`
        ]
      );
    }

    if (session) {
      return lightBox("PARTIE EN COURS", [
        `Une devinette est déjà lancée (1 à ${session.payload.max}).`,
        "",
        `${ICONS.pin} Propose un nombre : ${cmd("guess 50", ctx.prefix)}`,
        `${ICONS.info} Pour arrêter : ${cmd("guess stop", ctx.prefix)}`
      ]);
    }

    const max = Number(arg) > 10 ? Number(arg) : 100;
    const started = games.startGuess(ctx.threadID, ctx.senderID, { max: Math.min(1000, max) });
    if (!started.ok) return lightBox("DEVINETTE", [started.error]);

    return box(
      "DEVINE LE NOMBRE",
      [
        `${ICONS.target} J'ai choisi un nombre entre 1 et ${num(started.max)}.`,
        `${ICONS.info} 8 essais maximum.`,
        "",
        `${ICONS.pin} Commence avec ${cmd("guess 50", ctx.prefix)}`
      ],
      { icon: ICONS.game }
    );
  }
};

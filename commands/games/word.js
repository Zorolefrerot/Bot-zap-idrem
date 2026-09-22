"use strict";

/**
 * /word — pendu : devine le mot lettre par lettre.
 *   /word       → démarre (ou affiche l'état)
 *   /word a     → propose une lettre
 *   /word stop  → abandonne
 */

const { box, lightBox, cmd, mono, ICONS } = require("../../utils/text");

module.exports = {
  name: "word",
  aliases: ["pendu", "hangman", "mot"],
  category: "games",
  description: "Jeu du pendu : trouve le mot lettre par lettre (7 erreurs maximum).",
  usage: "/word [lettre|stop]",
  examples: ["/word", "/word a"],
  permissions: "public",
  cooldown: 2,

  async execute(ctx, bag) {
    const { services, config } = bag;
    const games = services.games;
    const arg = String(ctx.args[0] || "").trim().toLowerCase();
    const session = games.active(ctx.threadID, "word");

    if (!session) {
      const started = games.startWord(ctx.threadID, ctx.senderID);
      if (!started.ok) return lightBox("PENDU", [started.error]);
      return box(
        "PENDU",
        [
          `${ICONS.game} Un mot de ${started.length} lettres a été choisi.`,
          "",
          mono(started.mask),
          "",
          started.stage,
          "",
          `${ICONS.pin} Propose une lettre : ${cmd("word a", ctx.prefix)}`
        ]
      );
    }

    if (["stop", "fin", "abandon"].includes(arg)) {
      const word = session.payload.word;
      games.cancel(ctx.threadID, "word");
      return box("PENDU ARRÊTÉ", [`Le mot était : ${word.toUpperCase()}`]);
    }

    if (!arg) {
      return lightBox("PARTIE EN COURS", [
        mono(games.maskWord(session.payload.word, session.payload.guessed)),
        "",
        session.payload.errors ? `Erreurs : ${session.payload.errors}/${session.payload.maxErrors}` : "Aucune erreur pour l'instant.",
        session.payload.guessed.length ? `Lettres jouées : ${session.payload.guessed.sort().join(" ").toUpperCase()}` : "",
        "",
        `${ICONS.pin} ${cmd("word a", ctx.prefix)} pour jouer une lettre`
      ].filter(Boolean));
    }

    const played = games.playWord(ctx.threadID, ctx.senderID, arg);
    if (!played.ok) return lightBox("PENDU", [played.error]);

    if (played.result === "win") {
      return box(
        "MOT TROUVÉ",
        [
          `${ICONS.ok} Bravo ! Le mot était ${played.word.toUpperCase()}.`,
          `${ICONS.target} Erreurs : ${played.errors}/${played.maxErrors}`,
          `${ICONS.xp} +${played.gains.xp} XP • ${ICONS.money} +${played.gains.coinsGiven} ${config.currency.symbol}`
        ]
      );
    }
    if (played.result === "lose") {
      return box(
        "PENDU",
        [
          `${ICONS.no} Trop d'erreurs — partie perdue.`,
          `${ICONS.ok} Le mot était : ${played.word.toUpperCase()}`,
          "",
          played.stage,
          `${ICONS.xp} +${played.gains.xp} XP de participation`
        ]
      );
    }

    return box(
      "PENDU",
      [
        played.result === "hit" ? `${ICONS.ok} Oui, « ${arg.toUpperCase()} » est dans le mot.` : `${ICONS.no} « ${arg.toUpperCase()} » n'est pas dans le mot.`,
        "",
        mono(played.mask),
        "",
        played.stage,
        "",
        `Erreurs : ${played.errors}/${played.maxErrors}`,
        played.guessed && played.guessed.length ? `Jouées : ${played.guessed.join(" ").toUpperCase()}` : "",
        "",
        `${ICONS.pin} ${cmd("word b", ctx.prefix)} pour continuer`
      ].filter(Boolean)
    );
  }
};

"use strict";

/**
 * /duel — combat au tour par tour.
 *   /duel @adversaire  → défie un joueur du groupe
 *   /duel bot          → défie le bot
 *   /duel attack       → attaque (quand c'est ton tour)
 *   /duel status       → affiche les points de vie
 *   /duel stop         → annule
 */

const { box, lightBox, cmd, ICONS, num, progress } = require("../../utils/text");

const { DUEL_LINES } = require("../../services/corpus");
const { pick } = require("../../utils/random");

module.exports = {
  name: "duel",
  aliases: ["combat", "fight", "battle"],
  category: "games",
  description: "Duel au tour par tour contre un joueur ou contre le bot (XP et pièces).",
  usage: "/duel [@adversaire|bot|attack|status|stop]",
  examples: ["/duel bot", "/duel @quelquun", "/duel attack"],
  permissions: "public",
  cooldown: 3,

  async execute(ctx, bag) {
    const { services, config } = bag;
    const games = services.games;
    const arg = String(ctx.args[0] || "").trim().toLowerCase();
    const state = games.duelState(ctx.threadID);

    // --- Partie en cours ---------------------------------------------------
    if (state) {
      if (["stop", "fin", "abandon"].includes(arg)) {
        games.cancel(ctx.threadID, "duel");
        return box("DUEL ANNULÉ", ["Le duel s'arrête là, personne n'est blessé."]);
      }

      if (["status", "hp", "pv", "etat", "état", ""].includes(arg) && !["attack", "attaquer", "go", "play"].includes(arg)) {
        if (arg === "" || ["status", "hp", "pv", "etat", "état"].includes(arg)) {
          const challengerName = ctx.displayName(state.challenger.id);
          const opponentName = state.opponent.id ? ctx.displayName(state.opponent.id) : `${config.identity.short} (bot)`;
          return box(
            "DUEL EN COURS",
            [
              `⚔️ ${challengerName} ${progress(state.challenger.hp, 100)}`,
              `🛡️ ${opponentName} ${progress(state.opponent.hp, 100)}`,
              "",
              `Manche ${state.rounds}/${state.maxRounds}`,
              `Au tour de : ${state.turn === ctx.senderID ? "toi" : ctx.displayName(state.turn)}`,
              "",
              `${ICONS.pin} ${cmd("duel attack", ctx.prefix)} pour frapper`
            ]
          );
        }
      }

      const turn = games.duelTurn(ctx.threadID, ctx.senderID);
      if (!turn.ok) {
        return lightBox("DUEL", [turn.error, turn.turn ? `Au tour de : ${ctx.displayName(turn.turn)}` : ""]);
      }

      const challengerName = ctx.displayName(state.challenger.id);
      const opponentName = state.opponent.id ? ctx.displayName(state.opponent.id) : `${config.identity.short} (bot)`;
      const lines = [];

      const template = pick(DUEL_LINES[turn.kind] || DUEL_LINES.hit);
      lines.push(
        template
          .replace(/\{a\}/g, ctx.displayName(ctx.senderID))
          .replace(/\{b\}/g, ctx.senderID === state.challenger.id ? opponentName : challengerName)
          .replace(/\{damage\}/g, turn.damage)
      );

      if (turn.botDamage !== undefined && turn.botDamage !== null) {
        const botTemplate = pick(DUEL_LINES[turn.botKind] || DUEL_LINES.hit);
        lines.push(botTemplate.replace(/\{a\}/g, `${config.identity.short} (bot)`).replace(/\{b\}/g, challengerName).replace(/\{damage\}/g, turn.botDamage));
      }

      lines.push("", `⚔️ ${challengerName} ${progress(turn.hp.challenger, 100)}`, `🛡️ ${opponentName} ${progress(turn.hp.opponent || turn.hp.challenger, 100)}`);

      if (turn.finished) {
        const winnerName =
          turn.outcome.type === "draw"
            ? null
            : turn.outcome.winnerId === "bot"
              ? `${config.identity.short} (bot)`
              : ctx.displayName(turn.outcome.winnerId);
        lines.push("");
        lines.push(
          turn.outcome.type === "draw"
            ? "🤝 Match nul après la limite de manches."
            : pick(DUEL_LINES.win).replace(/\{a\}/g, winnerName).replace(/\{b\}/g, turn.outcome.loserId === "bot" ? `${config.identity.short} (bot)` : ctx.displayName(turn.outcome.loserId))
        );
        lines.push(`${ICONS.xp} +${num(turn.gains.xp)} XP • ${ICONS.money} +${num(turn.gains.coinsGiven)} ${config.currency.symbol}`);
        if (turn.gains.leveledUp) lines.push(`⭐ Niveau ${turn.gains.level} atteint !`);
        return box("DUEL TERMINÉ", lines, { icon: turn.outcome.type === "win" && turn.outcome.winnerId === ctx.senderID ? ICONS.ok : ICONS.game });
      }

      lines.push("", `Manche ${turn.rounds}/${turn.maxRounds}`);
      lines.push(`${ICONS.pin} ${turn.turn === ctx.senderID ? cmd("duel attack", ctx.prefix) : `Au tour de ${ctx.displayName(turn.turn)}`}`);
      return box("DUEL", lines, { icon: ICONS.game });
    }

    // --- Démarrage ---------------------------------------------------------
    if (!arg) {
      return lightBox("DUEL", [
        `${ICONS.pin} Choisis ton adversaire :`,
        "",
        `${cmd("duel bot", ctx.prefix)} — affronter ${config.identity.short}`,
        `${cmd("duel @quelquun", ctx.prefix)} — défier un joueur (groupe)`,
        "",
        `${ICONS.info} 12 manches maximum, 100 PV chacun.`
      ]);
    }

    const isBotFight = ["bot", "idrem", "cpu", "ia"].includes(arg);
    let opponentID = "";
    let opponentName = `${config.identity.short} (bot)`;

    if (!isBotFight) {
      if (!ctx.isGroup) {
        return lightBox("DUEL", ["En message privé, seul le duel contre le bot est possible.", "", `${cmd("duel bot", ctx.prefix)}`]);
      }
      const target = ctx.resolveTarget(arg);
      if (!target.explicit || target.id === ctx.senderID) {
        return lightBox("DUEL", [
          `${ICONS.warn} Mentionne ton adversaire pour le défier.`,
          "",
          `${cmd("duel @quelquun", ctx.prefix)} ou ${cmd("duel bot", ctx.prefix)}`
        ]);
      }
      opponentID = target.id;
      opponentName = target.name || ctx.displayName(target.id);
    }

    const started = games.startDuel(ctx.threadID, ctx.senderID, opponentID, opponentName);
    if (!started.ok) return lightBox("DUEL", [started.error]);

    const challengerName = ctx.senderName || ctx.displayName(ctx.senderID);
    return box(
      "DUEL",
      [
        pick(DUEL_LINES.start).replace(/\{a\}/g, challengerName).replace(/\{b\}/g, opponentName),
        "",
        `⚔️ ${challengerName} ${progress(100, 100)}`,
        `🛡️ ${opponentName} ${progress(100, 100)}`,
        "",
        `${ICONS.pin} ${cmd("duel attack", ctx.prefix)} pour porter le premier coup`,
        `${ICONS.info} ${cmd("duel status", ctx.prefix)} pour l'état, ${cmd("duel stop", ctx.prefix)} pour annuler`
      ],
      { icon: ICONS.game }
    );
  }
};

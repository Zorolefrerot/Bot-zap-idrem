"use strict";

/**
 * /leaderboard — classements (XP, pièces, messages, commandes).
 */

const { box, cmd, num, ICONS, progress } = require("../../utils/text");

const MODES = {
  xp: { label: "XP", field: "xp", icon: ICONS.xp, source: "users" },
  level: { label: "Niveau", field: "level", icon: ICONS.level, source: "users" },
  coins: { label: "Pièces", field: "balance", icon: ICONS.money, source: "economy" },
  messages: { label: "Messages", field: "messages", icon: ICONS.chart, source: "users" },
  commands: { label: "Commandes", field: "commandsUsed", icon: ICONS.bolt, source: "users" },
  games: { label: "Victoires", field: "gamesWon", icon: ICONS.game, source: "users" }
};

const MEDALS = ["🥇", "🥈", "🥉"];

module.exports = {
  name: "leaderboard",
  aliases: ["classement", "top", "ranking"],
  category: "games",
  description: "Classement des utilisateurs (XP, niveau, pièces, messages, victoires).",
  usage: "/leaderboard [xp|level|coins|messages|commands|games]",
  examples: ["/leaderboard", "/leaderboard coins"],
  permissions: "public",
  cooldown: 6,

  async execute(ctx, bag) {
    const { services, config } = bag;
    const arg = String(ctx.args[0] || "xp").trim().toLowerCase();
    const mode = MODES[arg] || MODES.xp;
    const limit = 10;

    let entries = [];
    if (mode.source === "economy") {
      entries = services.economy.top(limit).map((entry, index) => ({
        id: entry.userID,
        value: entry.balance,
        name: ctx.displayName(entry.userID),
        rank: index + 1
      }));
    } else {
      entries = services.users.top(mode.field, limit).map((entry, index) => ({
        id: entry.userID,
        value: entry[mode.field] || 0,
        name: entry.name || ctx.displayName(entry.userID),
        rank: index + 1
      }));
    }

    if (!entries.length) {
      return box("CLASSEMENT", [
        "Aucun classement disponible pour le moment.",
        "",
        `${ICONS.pin} Joue et utilise des commandes pour apparaître ici (${cmd("quiz", ctx.prefix)}, ${cmd("daily", ctx.prefix)}…)`
      ]);
    }

    const lines = entries.map((entry) => {
      const medal = MEDALS[entry.rank - 1] || `${String(entry.rank).padStart(2, " ")}.`;
      const value = mode.source === "economy" ? services.economy.fmt(entry.value) : num(entry.value);
      const suffix = mode.source === "economy" ? "" : ` ${mode.label.toLowerCase()}`;
      return `${medal} ${String(entry.name).slice(0, 18)} — ${value}${suffix}`;
    });

    const mine = entries.find((entry) => entry.id === ctx.senderID);
    const myRank = mine
      ? mine.rank
      : mode.source === "economy"
        ? services.economy.top(9999).findIndex((entry) => entry.userID === ctx.senderID) + 1
        : services.users.rank(ctx.senderID, mode.field);

    return box(
      `CLASSEMENT — ${mode.label.toUpperCase()}`,
      [
        ...lines,
        "",
        myRank
          ? `${ICONS.target} Ta position : #${num(myRank)} ${myRank > limit ? "(hors du top 10)" : ""}`
          : `${ICONS.target} Tu n'es pas encore classé.`
      ],
      {
        icon: mode.icon,
        footer: [`${ICONS.gear} Autres classements : ${Object.keys(MODES).map((key) => cmd(`leaderboard ${key}`, ctx.prefix)).join("  ")}`]
      }
    );
  }
};

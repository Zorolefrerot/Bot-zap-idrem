"use strict";

/**
 * /topusers — classement des utilisateurs.
 *   /topusers            → top 10 par XP
 *   /topusers 25         → top 25
 *   /topusers coins      → par solde
 *   /topusers messages   → par messages
 *   /topusers games      → par victoires
 */

const { box, lightBox, cmd, num, progress, ICONS } = require("../../utils/text");

const KEYS = {
  xp: { field: "xp", label: "XP", icon: ICONS.xp },
  level: { field: "level", label: "NIVEAU", icon: ICONS.level },
  coins: { field: "coins", label: "SOLDE", icon: ICONS.money },
  messages: { field: "messages", label: "MESSAGES", icon: ICONS.chart },
  commands: { field: "commandsUsed", label: "COMMANDES", icon: ICONS.bolt },
  games: { field: "gamesWon", label: "VICTOIRES", icon: ICONS.game }
};

module.exports = {
  name: "topusers",
  aliases: ["topuser", "meilleurs", "topplayers", "topjoueurs"],
  category: "stats",
  description: "Classement des utilisateurs par XP, niveau, solde, messages ou victoires.",
  usage: "/topusers [xp|level|coins|messages|commands|games] [nombre]",
  examples: ["/topusers", "/topusers coins", "/topusers games 20"],
  permissions: "public",
  cooldown: 8,

  async execute(ctx, bag) {
    const { services, config } = bag;
    const args = ctx.args.map((a) => String(a).trim().toLowerCase());
    const keyName = args.find((a) => a in KEYS) || "xp";
    const key = KEYS[keyName];
    const limitArg = args.find((a) => /^\d{1,2}$/.test(a));
    const limit = Math.max(1, Math.min(50, Number(limitArg) || 10));

    const users = services.users.top(key.field, limit);
    if (!users.length) {
      return lightBox("CLASSEMENT", [
        `${ICONS.info} Aucun utilisateur enregistré pour l'instant.`,
        "",
        `${ICONS.pin} Le classement se remplit dès les premières commandes.`
      ]);
    }

    const max = users[0][key.field] || 1;
    const myRank = services.users.rank(ctx.senderID, key.field);
    const suffix = keyName === "coins" ? ` ${config.currency.symbol}` : "";

    return box(`TOP — ${key.label}`, [
      `${key.icon} ${num(users.length)} utilisateur(s) classé(s) sur ${num(services.users.count())}`,
      "",
      ...users.map((user, index) => {
        const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${String(index + 1).padStart(2, " ")}.`;
        const value = keyName === "level" ? `niveau ${num(user.level)}` : `${num(user[key.field])}${suffix}`;
        const name = String(user.name || user.userID).slice(0, 22);
        return `${medal} ${name}${user.role !== "user" ? ` ${user.role === "owner" ? ICONS.crown : "🛡️"}` : ""} — ${value}`;
      }),
      "",
      progress(max, max, 12),
      myRank ? `${ICONS.target} Ta position : ${num(myRank)}${myRank <= users.length ? " (affiché ci-dessus)" : ""}` : "",
      "",
      `${ICONS.info} Autres classements : ${Object.keys(KEYS).map((name) => cmd(`topusers ${name}`, ctx.prefix)).join(" • ")}`
    ].filter((line) => line !== ""));
  }
};

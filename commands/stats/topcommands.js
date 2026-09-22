"use strict";

/**
 * /topcommands — classement des commandes les plus utilisées.
 *   /topcommands          → top 10 global
 *   /topcommands 25       → top 25
 *   /topcommands unknown  → commandes inconnues les plus tapées
 */

const { box, lightBox, cmd, num, progress, ICONS } = require("../../utils/text");

module.exports = {
  name: "topcommands",
  aliases: ["topcmd", "bestcommands", "populaires"],
  category: "stats",
  description: "Classement des commandes les plus utilisées (et des inconnues les plus tapées).",
  usage: "/topcommands [nombre|unknown]",
  examples: ["/topcommands", "/topcommands 25", "/topcommands unknown"],
  permissions: "public",
  cooldown: 8,

  async execute(ctx, bag) {
    const { services, registry } = bag;
    const stats = services.stats;
    const arg = String(ctx.args[0] || "").trim().toLowerCase();

    if (arg === "unknown" || arg === "inconnues" || arg === "erreurs") {
      const unknown = stats.unknownTop(10);
      const summary = stats.summary();
      if (!unknown.length) {
        return box("COMMANDES INCONNUES", [`${ICONS.ok} Personne n'a tapé de commande inconnue depuis la réinitialisation des statistiques.`]);
      }
      return box("COMMANDES INCONNUES LES PLUS TAPÉES", [
        `${ICONS.warn} ${num(summary.totalUnknown)} tentative(s) au total`,
        "",
        ...unknown.map((entry) => {
          const close = registry.resolve(entry.name);
          return `• ${entry.name.padEnd(14, " ")} ${num(entry.count)}×${close ? "" : ""}`;
        }),
        "",
        `${ICONS.info} Ces tentatives reçoivent un message d'aide avec la commande la plus proche.`
      ]);
    }

    const limit = Math.max(1, Math.min(50, Number(arg) || 10));
    const top = stats.topCommands(limit);
    const summary = stats.summary();
    if (!top.length) {
      return lightBox("TOP COMMANDES", [
        `${ICONS.info} Aucune commande n'a encore été exécutée.`,
        "",
        `${ICONS.pin} Lance ${cmd("menu", ctx.prefix)} pour découvrir le bot.`
      ]);
    }

    const max = top[0].count || 1;
    const categories = stats.topCategories(6);

    return box("TOP COMMANDES", [
      `${ICONS.bolt} ${num(summary.totalCommands)} exécutions • ${num(summary.uniqueCommands)} commandes distinctes`,
      "",
      ...top.map((entry, index) => {
        const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${String(index + 1).padStart(2, " ")}.`;
        const known = registry.has(entry.name) ? "" : " (retirée)";
        return `${medal} ${cmd(entry.name, ctx.prefix)}${known} — ${num(entry.count)} ${progress(entry.count, max, 8)}`;
      }),
      "",
      `${ICONS.chart} Catégories les plus utilisées :`,
      ...categories.map((entry) => `   • ${String(entry.name).padEnd(12, " ")} ${num(entry.count)}`),
      "",
      `${ICONS.info} Compteurs remis à zéro par ${cmd("reset stats", ctx.prefix)} (administrateurs).`
    ]);
  }
};

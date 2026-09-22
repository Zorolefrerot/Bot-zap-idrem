"use strict";

/**
 * /reload — recharge les commandes depuis le disque (cache Node purgé).
 * Utile après un ajout de fichier sans redémarrer le processus.
 *
 *   /reload           → recharge tout
 *   /reload status    → état du registre (erreurs de chargement incluses)
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");

module.exports = {
  name: "reload",
  aliases: ["reloadcommands", "refresh", "recharger"],
  category: "admin",
  description: "Recharge les fichiers de commandes à chaud et signale les erreurs.",
  usage: "/reload [status]",
  examples: ["/reload", "/reload status"],
  permissions: "admin",
  cooldown: 20,

  async execute(ctx, bag) {
    const { registry, logger } = bag;
    const arg = String(ctx.args[0] || "").trim().toLowerCase();

    if (arg === "status" || arg === "etat" || arg === "état") {
      const errors = registry.errors();
      const categories = registry.categories();
      return box("REGISTRE", [
        `${ICONS.book} ${num(registry.count())} commandes chargées • ${num(categories.length)} catégories`,
        ...categories.map((category) => `   • ${category.label || category.key} : ${num(category.count)}`),
        "",
        errors.length ? `${ICONS.warn} ${num(errors.length)} problème(s) de chargement :` : `${ICONS.ok} Aucun problème de chargement.`,
        ...errors.slice(0, 8).map((entry) => `   • ${entry.file} → ${entry.error}`)
      ]);
    }

    const before = registry.count();
    const started = Date.now();
    let errors = [];
    try {
      registry.load({ clearCache: true });
      errors = registry.errors();
    } catch (err) {
      logger.error(`Rechargement des commandes en échec : ${err.message}`, "registry");
      return lightBox("RECHARGEMENT", [
        `${ICONS.error} Le rechargement a échoué : ${err.message.slice(0, 140)}`,
        "",
        `${ICONS.info} Les commandes précédentes restent utilisables (le bot n'est pas arrêté).`
      ]);
    }

    const after = registry.count();
    const elapsed = Date.now() - started;
    bag.logs.info("admin", `Commandes rechargées : ${after} (avant ${before}) en ${elapsed} ms.`, { userID: ctx.senderID, command: "reload" });

    const lines = [
      `${ICONS.ok} ${num(after)} commandes rechargées en ${num(elapsed)} ms.`,
      after !== before ? `${ICONS.chart} Avant : ${num(before)} • Après : ${num(after)}` : "",
      "",
      errors.length ? `${ICONS.warn} ${num(errors.length)} fichier(s) ignoré(s) :` : `${ICONS.ok} Aucun fichier rejeté.`,
      ...errors.slice(0, 8).map((entry) => `   • ${entry.file} → ${entry.error}`),
      errors.length > 8 ? `   … et ${num(errors.length - 8)} autre(s).` : "",
      "",
      `${ICONS.info} ${cmd("reload status", ctx.prefix)} pour l'état détaillé du registre.`
    ].filter((line) => line !== "");

    return box("RECHARGEMENT", lines);
  }
};

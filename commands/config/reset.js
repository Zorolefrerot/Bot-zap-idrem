"use strict";

/**
 * /reset — remises à zéro explicites, jamais silencieuses.
 *
 *   /reset                       → options disponibles
 *   /reset settings              → réglages de CE groupe (admin du groupe)
 *   /reset profile               → TON profil (XP, coins, inventaire…)
 *   /reset warns <@user|uid>     → avertissements d'un membre (admin du groupe)
 *   /reset stats                 → statistiques d'usage (admin du bot)
 *   /reset data --force          → TOUTES les données (propriétaire uniquement)
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");
const { target, record } = require("../../utils/moderation");

const COLLECTIONS = ["users", "groups", "settings", "economy", "warnings", "stats", "logs"];

module.exports = {
  name: "reset",
  aliases: ["reinit", "réinit", "wipe", "erase", "effacer"],
  category: "config",
  description: "Réinitialise les réglages du groupe, ton profil, ou toutes les données (propriétaire).",
  usage: "/reset [settings|profile|warns <uid>|stats|data --force]",
  examples: ["/reset", "/reset profile", "/reset settings", "/reset data --force"],
  permissions: "public",
  cooldown: 20,

  async execute(ctx, bag) {
    const { services, permissions } = bag;
    const action = String(ctx.args[0] || "").trim().toLowerCase();

    if (!action) {
      return box("RÉINITIALISATION", [
        `${ICONS.warn} Aucune réinitialisation n'est faite sans cible explicite.`,
        "",
        `${ICONS.pin} ${cmd("reset profile", ctx.prefix)} — efface TON profil (tout le monde)`,
        `${ICONS.pin} ${cmd("reset settings", ctx.prefix)} — réglages de ce groupe (admins du groupe)`,
        `${ICONS.pin} ${cmd("reset warns <@user>", ctx.prefix)} — avertissements d'un membre (admins du groupe)`,
        `${ICONS.pin} ${cmd("reset stats", ctx.prefix)} — compteurs d'usage (admins du bot)`,
        `${ICONS.pin} ${cmd("reset data --force", ctx.prefix)} — TOUTES les données (propriétaire)`
      ]);
    }

    // --- Profil personnel ----------------------------------------------------
    if (action === "profile" || action === "moi" || action === "me") {
      const confirm = String(ctx.args[1] || "").toLowerCase();
      if (confirm !== "--force" && confirm !== "oui") {
        const user = services.users.get(ctx.senderID);
        return lightBox("RÉINITIALISER MON PROFIL", [
          `${ICONS.warn} Cette action efface définitivement :`,
          `   • niveau ${num(user.level)} et ${num(user.xp)} XP`,
          `   • ${num(user.coins)} ${bag.config.currency.symbol} et ton inventaire`,
          `   • mariages, amis et statistiques de jeux`,
          "",
          `${ICONS.pin} Confirme avec : ${cmd("reset profile --force", ctx.prefix)}`
        ]);
      }
      const removed = services.users.remove(ctx.senderID);
      record(bag, ctx, "reset-profile", ctx.senderID);
      return box("PROFIL RÉINITIALISÉ", [
        `${removed ? ICONS.ok : ICONS.warn} Ton profil a été ${removed ? "effacé" : "remis à zéro"}.`,
        "",
        `${ICONS.info} Un profil neuf sera recréé dès ta prochaine commande.`,
        `${ICONS.pin} ${cmd("profile", ctx.prefix)} pour le vérifier.`
      ]);
    }

    // --- Réglages du groupe --------------------------------------------------
    if (action === "settings" || action === "reglages" || action === "réglages") {
      if (!ctx.isGroup) return lightBox("RÉINITIALISATION", [`${ICONS.warn} Aucun réglage de groupe en conversation privée.`]);
      if (!permissions.isGroupAdmin(ctx.senderID, ctx.groupAdminIDs)) {
        return bag.text.denied("groupadmin", "Seuls les administrateurs du groupe réinitialisent ses réglages.");
      }
      const okReset = services.settings.reset(ctx.threadID);
      record(bag, ctx, "reset-settings", ctx.threadID);
      return box("RÉGLAGES RÉINITIALISÉS", [
        `${okReset ? ICONS.ok : ICONS.info} ${okReset ? "Les réglages personnalisés de ce groupe ont été effacés." : "Ce groupe n'avait aucun réglage personnalisé."}`,
        "",
        `${ICONS.pin} Préfixe effectif : ${services.settings.prefixFor(ctx.threadID)}`,
        `${ICONS.info} Les valeurs par défaut s'appliquent de nouveau (${cmd("settings", ctx.prefix)}).`
      ]);
    }

    // --- Avertissements d'un membre -----------------------------------------
    if (action === "warns" || action === "warnings" || action === "avertissements") {
      if (!ctx.isGroup) return lightBox("RÉINITIALISATION", [`${ICONS.warn} Les avertissements sont liés à un groupe.`]);
      if (!permissions.isGroupAdmin(ctx.senderID, ctx.groupAdminIDs)) {
        return bag.text.denied("groupadmin", "Seuls les administrateurs du groupe effacent les avertissements.");
      }
      const sub = target({ ...ctx, args: ctx.args.slice(1) });
      if (!sub.id || !sub.explicit) {
        return lightBox("RÉINITIALISATION", [`${ICONS.warn} Indique pour qui effacer les avertissements.`, "", cmd("reset warns @quelquun", ctx.prefix)]);
      }
      const result = services.warnings.clearWarns(ctx.threadID, sub.id);
      if (!result.ok) return lightBox("RÉINITIALISATION", [`${ICONS.info} ${result.error}`]);
      record(bag, ctx, "reset-warns", `${sub.id} (${result.removed})`);
      return box("AVERTISSEMENTS EFFACÉS", [`${ICONS.ok} ${num(result.removed)} avertissement(s) effacé(s) pour ${sub.name || sub.id}.`]);
    }

    // --- Statistiques (admins du bot) ---------------------------------------
    if (action === "stats" || action === "statistiques") {
      if (!permissions.isAdmin(ctx.senderID)) return bag.text.denied("admin", "Les statistiques globales sont réservées aux administrateurs du bot.");
      const before = services.stats.summary().totalCommands;
      services.stats.reset();
      record(bag, ctx, "reset-stats", `${before} commandes comptées avant réinitialisation`);
      return box("STATISTIQUES RÉINITIALISÉES", [
        `${ICONS.ok} Compteurs d'usage remis à zéro (${num(before)} commandes étaient comptées).`,
        "",
        `${ICONS.info} Les profils, l'économie et les groupes ne sont pas touchés.`,
        `${ICONS.pin} L'uptime repart de maintenant.`
      ]);
    }

    // --- Toutes les données (propriétaire) ----------------------------------
    if (action === "data" || action === "donnees" || action === "données" || action === "all") {
      if (!permissions.isOwner(ctx.senderID)) return bag.text.denied("owner", "L'effacement complet des données est réservé au propriétaire.");
      if (!ctx.args.some((arg) => String(arg).toLowerCase() === "--force")) {
        return box("EFFACEMENT TOTAL", [
          `${ICONS.no} Cette commande efface TOUTES les données du bot :`,
          `   • ${num(services.users.count())} profils (XP, niveaux, coins, inventaires)`,
          `   • ${num(services.groups.groupCount())} groupes et leurs réglages`,
          `   • avertissements, bannissements, mutes`,
          `   • statistiques et journaux`,
          "",
          `${ICONS.warn} Action irréversible, y compris sur le snapshot distant au prochain envoi.`,
          `${ICONS.pin} Confirme avec : ${cmd("reset data --force", ctx.prefix)}`
        ]);
      }

      const totals = {};
      for (const name of COLLECTIONS) {
        const collection = services.store.get(name);
        totals[name] = Array.isArray(collection.data) ? collection.data.length : Object.keys(collection.data || {}).length;
        collection.data = Array.isArray(collection.data) ? [] : {};
        collection.save();
      }

      bag.logs.warn("admin", `Toutes les données ont été effacées par ${ctx.senderID}.`, { userID: ctx.senderID, threadID: ctx.threadID, command: "reset" });
      bag.logger.warn("Effacement complet des données demandé par le propriétaire.", "admin");

      return box("DONNÉES EFFACÉES", [
        `${ICONS.ok} Toutes les collections ont été vidées :`,
        ...Object.entries(totals).map(([name, count]) => `   • ${name} : ${num(count)} entrée(s) effacée(s)`),
        "",
        `${ICONS.info} Le bot continue de fonctionner : les données se recréent à l'usage.`,
        `${ICONS.warn} Les réglages globaux (préfixe, mode) sont aussi effacés.`
      ]);
    }

    return lightBox("RÉINITIALISATION", [
      `${ICONS.warn} Cible inconnue : « ${action.slice(0, 20)} ».`,
      "",
      `${ICONS.pin} Cibles : profile, settings, warns, stats, data`
    ]);
  }
};

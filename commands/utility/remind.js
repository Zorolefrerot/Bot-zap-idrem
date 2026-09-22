"use strict";

/**
 * /remind — rappelle quelque chose plus tard (persisté entre redémarrages).
 *   /remind 30s sortir le pain du four
 *   /remind 2h réunion d'équipe
 *   /remind list
 *   /remind cancel <id>
 *   /remind clear
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");
const { parseDuration } = require("../../services/scheduler");

module.exports = {
  name: "remind",
  aliases: ["rappel", "reminder", "rappelemoi"],
  category: "utility",
  description: "Programme un rappel (30s, 5m, 2h, 1j…) envoyé dans cette conversation.",
  usage: "/remind <durée> <texte> | list | cancel <id> | clear",
  examples: ["/remind 30s vérifier le four", "/remind 2h réunion", "/remind list"],
  permissions: "public",
  cooldown: 4,

  async execute(ctx, bag) {
    const { services } = bag;
    const scheduler = services.scheduler;
    const action = String(ctx.args[0] || "").toLowerCase();

    // --- Gestion des rappels existants ------------------------------------
    if (["list", "liste", "ls"].includes(action)) {
      const mine = scheduler.list(ctx.threadID, ctx.senderID);
      if (!mine.length) {
        return lightBox("RAPPELS", [
          "Aucun rappel programmé ici.",
          "",
          `${cmd("remind 5m prendre une pause", ctx.prefix)}`
        ]);
      }
      const lines = mine.map((reminder) => {
        const when = new Date(reminder.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
        return `#${reminder.id} — ${when} — ${reminder.text || "(sans texte)"}`;
      });
      return box(
        "MES RAPPELS",
        [...lines, "", `${ICONS.info} ${num(mine.length)}/${scheduler.MAX_PER_USER} rappels actifs`, `${cmd("remind cancel <id>", ctx.prefix)} pour en annuler un`]
      );
    }

    if (["cancel", "annuler", "delete", "supprimer"].includes(action)) {
      const id = String(ctx.args[1] || "").trim();
      if (!id) return lightBox("RAPPELS", [`${ICONS.warn} Indique l'identifiant du rappel.`, "", cmd("remind list", ctx.prefix)]);
      const cancelled = scheduler.cancel(id, ctx.senderID);
      if (!cancelled.ok) return lightBox("RAPPELS", [`${ICONS.no} ${cancelled.error}`]);
      return box("RAPPEL ANNULÉ", [`${ICONS.ok} « ${cancelled.reminder.text || cancelled.reminder.id} » ne sera pas envoyé.`], { icon: ICONS.ok });
    }

    if (["clear", "tout", "all"].includes(action)) {
      const removed = scheduler.clear(ctx.threadID);
      return box("RAPPELS", [removed ? `${ICONS.ok} ${num(removed)} rappel(s) supprimé(s) dans cette conversation.` : "Aucun rappel à supprimer."]);
    }

    // --- Création ---------------------------------------------------------
    const durationText = ctx.args[0];
    const textContent = ctx.args.slice(1).join(" ").trim();

    if (!durationText || !textContent) {
      return lightBox("RAPPEL", [
        `${ICONS.warn} Format attendu : ${cmd("remind <durée> <texte>", ctx.prefix)}`,
        "",
        `${cmd("remind 30s vérifier le four", ctx.prefix)}`,
        `${cmd("remind 5m appeler maman", ctx.prefix)}`,
        `${cmd("remind 2h réunion d'équipe", ctx.prefix)}`,
        `${cmd("remind 1j rendre le rapport", ctx.prefix)}`,
        "",
        `${ICONS.info} Unités : s, m, h, j (minimum 10 s, maximum 30 jours)`,
        `${ICONS.pin} ${cmd("remind list", ctx.prefix)} pour voir tes rappels`
      ]);
    }

    const duration = parseDuration(durationText);
    if (!duration.ok) {
      return lightBox("RAPPEL", [
        `${ICONS.no} ${duration.error}`,
        "",
        `${ICONS.pin} Exemples : ${cmd("remind 45s test", ctx.prefix)}, ${cmd("remind 3h test", ctx.prefix)}`
      ]);
    }

    const created = scheduler.add({ threadID: ctx.threadID, userID: ctx.senderID, text: textContent, delayMs: duration.ms });
    if (!created.ok) return lightBox("RAPPEL", [`${ICONS.no} ${created.error}`]);

    const when = new Date(created.reminder.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
    return box(
      "RAPPEL PROGRAMMÉ",
      [
        `${ICONS.ok} #${created.reminder.id} — ${textContent}`,
        `${ICONS.time} Dans ${duration.label} (le ${when})`,
        "",
        `${ICONS.info} ${num(scheduler.list(ctx.threadID, ctx.senderID).length)}/${scheduler.MAX_PER_USER} rappels actifs`,
        `${cmd("remind list", ctx.prefix)} · ${cmd(`remind cancel ${created.reminder.id}`, ctx.prefix)}`
      ],
      { icon: ICONS.clock }
    );
  }
};

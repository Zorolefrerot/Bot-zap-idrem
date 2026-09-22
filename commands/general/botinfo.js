"use strict";

/**
 * /botinfo — identité, version, capacités et état honnête des services.
 */

const { box, num, cmd, ICONS, progress } = require("../../utils/text");

module.exports = {
  name: "botinfo",
  aliases: ["info", "about", "bot"],
  category: "general",
  description: "Présente le bot : identité, version, statistiques et services externes.",
  usage: "/botinfo",
  examples: ["/botinfo"],
  permissions: "public",
  cooldown: 5,

  async execute(ctx, bag) {
    const { config, services, registry } = bag;
    const stats = services.stats.summary();
    const readiness = services.external.readiness();
    const memory = process.memoryUsage();

    const serviceLines = services.external.status().map((service) => {
      const icon = service.kind === "missing" ? ICONS.no : service.kind === "configured" ? ICONS.ok : ICONS.info;
      return `${icon} ${service.name}`;
    });

    return box(
      `${config.identity.name}`,
      [
        `${ICONS.robot} ${config.identity.tagline}`,
        `Version : ${config.identity.version}`,
        "",
        `${ICONS.chart} ${num(stats.totalCommands)} commandes exécutées`,
        `${ICONS.user} ${num(services.users.count())} utilisateurs • ${ICONS.group} ${num(services.groups.count())} conversations`,
        `${ICONS.time} En ligne depuis ${bag.helpers.formatDuration(stats.uptimeMs)}`,
        `${ICONS.gear} Préfixe : ${cmd("", ctx.prefix) || ctx.prefix} • Langue : ${config.language}`,
        `${ICONS.bolt} Mémoire : ${num(Math.round(memory.rss / 1024 / 1024))} Mo`,
        "",
        `${ICONS.plug} Services (${readiness.ready}/${readiness.total} opérationnels) :`,
        progress(readiness.ready, readiness.total),
        serviceLines.join("  ")
      ],
      {
        footer: [
          `${ICONS.book} ${cmd("menu", ctx.prefix)} pour les commandes`,
          readiness.missing.length ? `${ICONS.info} Non configurés : ${readiness.missing.join(", ")}` : ""
        ].filter(Boolean)
      }
    );
  }
};

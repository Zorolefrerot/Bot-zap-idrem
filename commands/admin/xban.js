'use strict';
/*
 * 🧬 MeR~NeL — commands/admin/xban.js
 * Bannissement : l'admin répond au message d'un membre puis tape « Xban ».
 * Si l'API Messenger ne permet pas l'expulsion réelle, le bot l'affiche
 * clairement et applique la sanction côté bot (membre ignoré) — jamais
 * de succès simulé.
 */

module.exports = {
  name: 'xban',
  description: 'Bannit le membre dont le message est cité (admin)',
  usage: 'Réponds à un message puis tape Xban',
  category: 'admin',
  aliases: [],
  adminOnly: true,
  cooldownMs: 3000,
  run: async (ctx) => {
    if (!ctx.isGroup) {
      return ctx.send(ctx.fmt.frame('🛡️ XBAN', '⚠️ ' + ctx.fmt.bold('À utiliser dans un groupe.')));
    }
    const reply = ctx.event.messageReply;
    const mentions = ctx.event.mentions || {};
    const targetID = String((reply && reply.senderID) || Object.keys(mentions)[0] || '');
    if (!targetID) {
      return ctx.send(
        ctx.fmt.frame('🛡️ XBAN', [
          '📌 ' + ctx.fmt.bold('Réponds au message du membre à bannir, puis tape Xban.'),
          '(ou taggue-le : ' + ctx.fmt.bold('Xban @membre') + ')',
        ])
      );
    }
    if (targetID === ctx.adapter.botID) {
      return ctx.send(ctx.fmt.frame('🛡️ XBAN', '🤖 ' + ctx.fmt.bold('Système auto-défense : impossible de m’auto-détruire.')));
    }
    if (ctx.isAdmin(targetID)) {
      return ctx.send(ctx.fmt.frame('🛡️ XBAN', '⛔ ' + ctx.fmt.bold('Un administrateur ne peut pas être banni par le bot.')));
    }

    const targetName = await ctx.getUserName(targetID);
    const target = ctx.economy.ensureUser(targetID, targetName);

    /* Tentative d'expulsion réelle si la plateforme le permet */
    let removed = false;
    if (ctx.capabilities.removeUser) {
      try {
        await ctx.adapter.removeUser(targetID, ctx.threadID);
        removed = true;
      } catch (err) {
        ctx.logger.warn('[xban] removeUser:', err.message);
      }
    }

    /* Sanction persistante côté bot : ses messages sont ignorés. */
    target.banned = true;
    target.bannedBy = ctx.senderID;
    target.bannedAt = Date.now();
    ctx.db.users.save();
    ctx.db.bumpStat('bansIssued');

    await ctx.send(
      ctx.fmt.frame('⚠️ SYSTÈME : 𝗟𝗜𝗕𝗘𝗥𝗧𝗘́ 𝗥𝗘𝗩𝗢𝗤𝗨𝗘́𝗘', [
        '☠️ ' + ctx.fmt.bold('PROFIL TROP PESANT POUR CE SERVEUR.'),
        '',
        `🎯 ${ctx.fmt.bold('Cible')} : ${ctx.fmt.bold(targetName)}`,
        removed
          ? '🚫 ' + ctx.fmt.bold('Le membre a été retiré du groupe par l’API.')
          : 'ℹ️ ' + ctx.fmt.bold('Messenger n’autorise pas l’expulsion via l’API.'),
        removed ? '' : '🔇 ' + ctx.fmt.bold('Sanction appliquée côté bot : ses messages seront ignorés.'),
      ].filter(Boolean))
    );
  },
};

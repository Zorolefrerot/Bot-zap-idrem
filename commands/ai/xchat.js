'use strict';
/*
 * 🧬 MeR~NeL — commands/ai/xchat.js
 * Mode discussion automatique — état persistant par groupe (groups.json).
 */

const { isGroupAdmin } = require('../../utils/permissions');

module.exports = {
  name: 'xchat',
  description: 'Active/désactive la discussion automatique du groupe',
  usage: 'Xchat on | Xchat off | Xchat status',
  category: 'ai',
  aliases: [],
  adminOnly: false,
  cooldownMs: 3000,
  run: async (ctx) => {
    if (!ctx.isGroup) {
      return ctx.send(ctx.fmt.frame('💬 XCHAT', '⚠️ ' + ctx.fmt.bold('Ce mode fonctionne uniquement dans un groupe.')));
    }
    const group = ctx.db.ensureGroup(ctx.threadID);
    const arg = (ctx.args[0] || '').toLowerCase();

    // Réservé aux admins du bot ou du groupe (évite les activations sauvages).
    if (!ctx.isAdmin(ctx.senderID) && !(await isGroupAdmin(ctx.api, ctx.threadID, ctx.senderID))) {
      return ctx.send(
        ctx.fmt.frame('⛔ ACCÈS REFUSÉ', '🛡️ ' + ctx.fmt.bold('Réservé aux administrateurs du groupe ou du bot.'))
      );
    }

    if (arg === 'on' || arg === 'off') {
      const on = arg === 'on';
      group.chatMode = on;
      ctx.db.groups.save();
      if (!on) ctx.services.chat.clear(ctx.threadID);
      await ctx.send(
        on
          ? ctx.fmt.frame('💬 𝗫𝗖𝗛𝗔𝗧', [
              '🟢 ' + ctx.fmt.bold('MODE DISCUSSION ACTIVÉ.'),
              '',
              '🤖 ' + ctx.fmt.bold('Je peux maintenant répondre naturellement, sans préfixe.'),
              '🧠 ' + ctx.fmt.bold('Je filtre : je ne réponds pas à tout, je réponds à l’essentiel.'),
            ])
          : ctx.fmt.frame('💬 𝗫𝗖𝗛𝗔𝗧', [
              '🔴 ' + ctx.fmt.bold('MODE DISCUSSION DÉSACTIVÉ.'),
              '',
              '💤 ' + ctx.fmt.bold('Retour au mode veille silencieuse.'),
            ])
      );
      ctx.db.bumpStat(on ? 'chatActivated' : 'chatDeactivated');
      return;
    }

    if (arg === 'status' || arg === '') {
      const on = Boolean(group.chatMode);
      return ctx.send(
        ctx.fmt.frame('💬 𝗫𝗖𝗛𝗔𝗧', [
          '📶 ' + ctx.fmt.bold('État') + ' : ' + (on ? ctx.fmt.bold('ACTIF 🟢') : ctx.fmt.bold('INACTIF 🔴')),
          `📌 ${ctx.fmt.bold('Usage')} : ${ctx.fmt.bold('Xchat on')} / ${ctx.fmt.bold('Xchat off')}`,
        ])
      );
    }

    await ctx.send(
      ctx.fmt.frame('💬 XCHAT', `⚠️ ${ctx.fmt.bold('Argument inconnu.')} ${ctx.fmt.bold('Xchat on | off | status')}`)
    );
  },
};

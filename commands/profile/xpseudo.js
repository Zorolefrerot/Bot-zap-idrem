'use strict';
/*
 * 🧬 MeR~NeL — commands/profile/xpseudo.js
 * Changement de pseudo (surnom de groupe) :
 *   Xpseudo <nouveau pseudo>       → pour soi
 *   Xpseudo @Paul Homme Fort       → pour un membre taggué
 *   Xpseudo reset                  → restaure le nom d'origine
 */

module.exports = {
  name: 'xpseudo',
  description: 'Change ton pseudo (ou celui d’un membre taggué)',
  usage: 'Xpseudo <pseudo> | Xpseudo @Paul <pseudo> | Xpseudo reset',
  category: 'profile',
  aliases: ['xnick', 'xnickname'],
  adminOnly: false,
  cooldownMs: 4000,
  run: async (ctx) => {
    if (!ctx.isGroup) {
      return ctx.send(ctx.fmt.frame('✏️ XPSEUDO', '⚠️ ' + ctx.fmt.bold('Le pseudo se change dans un groupe.')));
    }

    const mentions = ctx.event.mentions || {};
    const mentionIds = Object.keys(mentions);
    const user = ctx.economy.ensureUser(ctx.senderID);

    /* ── Reset ── */
    if ((ctx.args[0] || '').toLowerCase() === 'reset') {
      const targetID = mentionIds[0] || ctx.senderID;
      const target = ctx.economy.ensureUser(targetID);
      if (!target.nickname && !target.previousName) {
        return ctx.send(ctx.fmt.frame('✏️ XPSEUDO', 'ℹ️ ' + ctx.fmt.bold('Aucun pseudo à réinitialiser.')));
      }
      target.nickname = '';
      ctx.db.users.save();
      let restored = 'ℹ️ ' + ctx.fmt.bold('Pseudo réinitialisé côté bot.');
      if (target.previousName && ctx.capabilities.changeNickname) {
        try {
          await ctx.adapter.changeNickname(target.previousName, ctx.threadID, targetID);
          restored = `↩️ ${ctx.fmt.bold('Nom d’origine restauré')} : ${ctx.fmt.bold(target.previousName)}`;
        } catch (_) {
          restored = `↩️ ${ctx.fmt.bold('Réinitialisé côté bot')} — ${ctx.fmt.bold('Messenger refuse le changement direct.')}`;
        }
      }
      return ctx.send(ctx.fmt.frame('✏️ XPSEUDO', restored));
    }

    /* ── Définition ── */
    let targetID = ctx.senderID;
    let nameParts = ctx.args.slice();
    if (mentionIds.length > 0) {
      targetID = mentionIds[0];
      const tag = mentions[targetID] || '';
      nameParts = ctx.args.join(' ').replace(tag, '').trim().split(/\s+/).filter(Boolean);
    }
    const newName = ctx.fmt.clean(nameParts.join(' '), 30);
    if (!newName) {
      return ctx.send(
        ctx.fmt.frame('✏️ XPSEUDO', [
          '⚠️ ' + ctx.fmt.bold('Indique un pseudo.'),
          `📌 ${ctx.fmt.bold('Exemples')} : ${ctx.fmt.bold('Xpseudo Fortiche')} · ${ctx.fmt.bold('Xpseudo @Paul Homme Fort')} · ${ctx.fmt.bold('Xpseudo reset')}`,
        ])
      );
    }
    if (/@|𝗔|admin/i.test(newName) && !ctx.isAdmin(ctx.senderID)) {
      return ctx.send(ctx.fmt.frame('✏️ XPSEUDO', '⛔ ' + ctx.fmt.bold('Tu ne peux pas te faire passer pour l’administration.')));
    }

    const target = ctx.economy.ensureUser(targetID);
    if (!target.previousName) target.previousName = await ctx.getUserName(targetID);
    target.nickname = newName;
    ctx.db.users.save();

    let note = '';
    if (ctx.capabilities.changeNickname) {
      try {
        await ctx.adapter.changeNickname(newName, ctx.threadID, targetID);
      } catch (_) {
        note = '\nℹ️ ' + ctx.fmt.bold('(Messenger n’autorise pas le bot à renommer ici — pseudo enregistré côté bot.)');
      }
    } else {
      note = '\nℹ️ ' + ctx.fmt.bold('(Pseudo enregistré côté bot — renommage direct indisponible.)');
    }

    await ctx.send(
      ctx.fmt.frame('✏️ XPSEUDO', [
        '⚡ ' + ctx.fmt.bold('𝗣𝗦𝗘𝗨𝗗𝗢 𝗠𝗢𝗗𝗜𝗙𝗜𝗘́.'),
        `🆕 ${ctx.fmt.bold('Nouveau pseudo')} : ${ctx.fmt.bold(newName)}` + note,
      ])
    );
  },
};

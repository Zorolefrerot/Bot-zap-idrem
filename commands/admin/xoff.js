'use strict';
/*
 * 🧬 MeR~NeL — commands/admin/xoff.js
 * 🔌 Interrupteur par groupe (admins uniquement) :
 *  - Xoff → MeR~NeL s'ÉTEINT dans ce groupe (silence total : aucun message,
 *    aucune commande, aucune bienvenue, aucune annonce) ;
 *  - Xoff (ou Xon) retapé par un admin → il se RALLUME.
 * L'état est persisté sur disque : le bot reste éteint même après redémarrage.
 */

const TOGGLE_TOKENS = ['xoff', 'xon', 'xshutdown', 'xeteindre', 'xpoweroff'];

module.exports = {
  name: 'xoff',
  description: 'Éteint / rallume MeR~NeL dans CE groupe (admins) — interrupteur',
  usage: 'Xoff (éteindre) · Xoff ou Xon (rallumer)',
  category: 'admin',
  aliases: TOGGLE_TOKENS.filter((t) => t !== 'xoff'),
  adminOnly: true,
  cooldownMs: 2000,
  run: async (ctx) => {
    if (!ctx.isGroup) {
      return ctx.send(ctx.fmt.frame('🔌 XOFF', '⚠️ ' + ctx.fmt.bold('Cet interrupteur ne fonctionne que dans un groupe.')));
    }

    const group = ctx.db.ensureGroup(ctx.threadID);
    const turningOn = Boolean(group.disabled);

    if (turningOn) {
      group.disabled = false;
      group.disabledBy = null;
      group.disabledAt = null;
      ctx.db.groups.saveNow();
      return ctx.send(
        ctx.fmt.frame('🔌 REDÉMARRAGE', [
          '✅ ' + ctx.fmt.bold('MeR~NeL est RALLUMÉ dans ce groupe.'),
          '⚡ ' + ctx.fmt.bold('Toutes les commandes redeviennent actives.'),
          '🧬 ' + ctx.fmt.bold('Systèmes opérationnels. En ligne.'),
        ])
      );
    }

    group.disabled = true;
    group.disabledBy = String(ctx.senderID);
    group.disabledAt = Date.now();
    ctx.db.groups.saveNow();

    // Purger les sessions du groupe (quiz / duel / Xid en cours → terminés).
    try {
      const prefix = `${String(ctx.threadID)}::`;
      for (const key of [...ctx.sessions.sessions.keys()]) {
        if (String(key).startsWith(prefix)) {
          const session = ctx.sessions.sessions.get(key);
          if (session && typeof session._clearTimers === 'function') session._clearTimers();
          ctx.sessions.sessions.delete(key);
        }
      }
    } catch (_) { /* jamais bloquer l'extinction */ }

    return ctx.send(
      ctx.fmt.frame('🛑 EXTINCTION', [
        '🔌 ' + ctx.fmt.bold('MeR~NeL s’ÉTEINT dans ce groupe.'),
        '🔇 ' + ctx.fmt.bold('Aucun message ni commande ne sera traité.'),
        '⚡ ' + ctx.fmt.bold('Seul un admin peut rallumer') + ' : ' + ctx.fmt.bold('Xoff') + ' ou ' + ctx.fmt.bold('Xon') + '.',
      ])
    );
  },
};

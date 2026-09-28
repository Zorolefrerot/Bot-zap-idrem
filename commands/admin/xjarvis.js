'use strict';
/*
 * 🧬 MeR~NeL — commands/admin/xjarvis.js
 * Xjarvis on/off — transforme MeR~NeL en JARVIS (admins du BOT uniquement) :
 * plus besoin de commandes — il comprend le langage naturel, exécute
 * lui-même ses commandes à la demande, retient les conversations avec
 * chaque utilisateur et répond à tout.
 */

module.exports = {
  name: 'xjarvis',
  description: 'Mode JARVIS on/off (admins du bot) — le bot exécute tout à la voix',
  usage: 'Xjarvis on|off|status',
  category: 'admin',
  aliases: ['xjarvis-mode'],
  adminOnly: true,
  cooldownMs: 3000,
  run: async (ctx) => {
    if (!ctx.isGroup) {
      return ctx.send(ctx.fmt.frame('🤖 XJARVIS', '⚠️ ' + ctx.fmt.bold('Le mode JARVIS se gère par groupe — va dans un groupe.')));
    }
    const group = ctx.db.ensureGroup(ctx.threadID);
    const arg = String(ctx.args[0] || '').toLowerCase();
    const turningOn = arg === 'on' ? true : arg === 'off' ? false : !group.jarvis;

    group.jarvis = turningOn;
    ctx.db.groups.saveNow();

    if (turningOn) {
      await ctx.send(
        ctx.fmt.frame('🤖 JARVIS — ACTIVÉ', [
          '🧠 ' + ctx.fmt.bold('Je suis Mernel, fils de Merdi, de la RDC et du Bénin — Nelson.'),
          '⚡ ' + ctx.fmt.bold('Plus besoin de commandes : parle-moi naturellement.'),
          '🎮 ' + ctx.fmt.bold('Ex') + ' : ' + ctx.fmt.bold('« lance nous un quiz manga multivers »'),
          '🧬 ' + ctx.fmt.bold("Je connais toutes mes commandes, je réfléchis et j'exécute."),
          '🔓 ' + ctx.fmt.bold('Pour me rendre normal') + ' : ' + ctx.fmt.bold('Xjarvis off'),
        ])
      );
    } else {
      await ctx.send(
        ctx.fmt.frame('🤖 JARVIS — DÉSACTIVÉ', [
          '✅ ' + ctx.fmt.bold('Je redeviens MeR~NeL classique — commandes avec préfixe X.'),
          '🔒 ' + ctx.fmt.bold('Pour me réveiller') + ' : ' + ctx.fmt.bold('Xjarvis on'),
        ])
      );
    }
  },
};

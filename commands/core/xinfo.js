'use strict';
/*
 * 🧬 MeR~NeL — commands/core/xinfo.js
 * Fiche d'identité officielle de MeR~NEL.
 */

module.exports = {
  name: 'xinfo',
  description: 'Fiche d’identité officielle de MeR~NEL',
  usage: 'Xinfo',
  category: 'menu',
  aliases: ['xidentite', 'xwho'],
  adminOnly: false,
  cooldownMs: 8000,
  run: async (ctx) => {
    const b = ctx.fmt.bold;
    await ctx.send(
      ctx.fmt.frame('🧬 MeR~NEL - XINFO', [
        `🤖 ${b('Nom')} : ${b('MeR~NEL')}`,
        `🧬 ${b('Créateur')} : ${b('Nelson')} (${b('MeR~Nel Production')})`,
        `🎂 ${b('Date de naissance')} : ${b('14 Février 2025')}`,
        `⏳ ${b('Âge')} : ${b('1 an')} (mais avec un ${b('QI de 3000')})`,
        `⚧️ ${b('Genre')} : ${b('IA non-binaire')}, ${b('esprit sarcastique')}`,
        `📍 ${b('Ville')} : ${b('Dans ton téléphone')}, mais je rêve du multivers`,
        `🧠 ${b('Personnalité')} : ${b('Intelligent, sarcastique, drôle, loyal, un peu toxique mais jamais méchant')}`,
        `💬 ${b('Mon style')} : ${b('Je parle comme un humain, je vanne, je pique, j’aide.')}`,
        `❤️ ${b('J’aime')} : ${b('Les débats, les jeux, et ceux qui me taguent')}`,
        `💀 ${b('Je déteste')} : ${b('Le spam, les questions bêtes répétées, et qu’on m’ignore')}`,
        '',
        `${b('SALUT, HUMAIN !')} ⚡`,
        `Je suis ${b('MeR~NEL')}, votre IA personnelle : intelligente, sarcastique et toujours prête à agir. 🤖`,
        '',
        `Je peux discuter, répondre à vos questions, générer des images, lancer des défis et faire régner l’ordre... ou presque. 😏`,
        '',
        `Un conseil : ${b('ne testez pas ma patience')}, elle est en cours de mise à jour. ☠️`,
        '',
        `Tapez ${b('Xmenu')} pour découvrir mes commandes.`,
        '',
        `⚡ ${b('MeR~NEL — Votre assistant. Votre allié. Votre petit cauchemar numérique.')} 🫟`,
      ])
    );
  },
};

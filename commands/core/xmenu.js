'use strict';
/*
 * 🧬 MeR~NeL — commands/xmenu.js
 * Menu officiel — organisation exacte.
 */

module.exports = {
  name: 'xmenu',
  description: 'Affiche le menu complet de MeR~NeL',
  usage: 'Xmenu',
  category: 'menu',
  aliases: ['xhelp', 'help'],
  adminOnly: false,
  cooldownMs: 4000,
  run: async (ctx) => {
    const b = ctx.fmt.bold;
    const body = [
      '🧬 ' + b('𝗠𝗲𝗥~𝗡𝗘𝗟') + ' 🫟',
      '━━━━━━━━━━━━━━',
      '',
      '🧠 ' + b('𝗜𝗻𝘁𝗲𝗹𝗹𝗶𝗴𝗲𝗻𝗰𝗲 & 𝗖𝗵𝗮𝘁'),
      '├ ' + b('𝗫𝗰𝗵𝗮𝘁'),
      '├ ' + b('𝗫𝗮𝘀𝗸'),
      '└ ' + b('𝗫𝗮𝗶'),
      '',
      '💰 ' + b('𝗘́𝗰𝗼𝗻𝗼𝗺𝗶𝗲'),
      '├ ' + b('𝗫𝗱𝗮𝗶𝗹𝘆'),
      '├ ' + b('𝗫𝗰𝗼𝗶𝗻𝘀'),
      '├ ' + b('𝗫𝗽'),
      '└ ' + b('𝗫𝗿𝗮𝗻𝗸'),
      '',
      '🎮 ' + b('𝗝𝗲𝘂𝘅'),
      '├ ' + b('𝗫𝗾𝘂𝗶𝘇'),
      '├ ' + b('𝗫𝗱𝘂𝗲𝗹'),
      '└ ' + b('𝗫𝗴𝗮𝗺𝗲'),
      '',
      '🖼️ ' + b('𝗠𝗲́𝗱𝗶𝗮𝘀'),
      '├ ' + b('𝗫𝗶𝗺𝗴'),
      '├ ' + b('𝗫𝗽𝗹𝗮𝘆'),
      '└ ' + b('𝗫𝘃𝗶𝗱𝗲𝗼'),
      '',
      '👤 ' + b('𝗣𝗿𝗼𝗳𝗶𝗹'),
      '├ ' + b('𝗫𝗽𝗿𝗼𝗳𝗶𝗹'),
      '└ ' + b('𝗫𝗽𝘀𝗲𝘂𝗱𝗼'),
      '',
      '📢 ' + b('𝗚𝗿𝗼𝘂𝗽𝗲'),
      '├ ' + b('𝗫𝘁𝗮𝗴 𝗮𝗹𝗹'),
      '└ ' + b('𝗫𝗮𝗻𝗻𝗼𝗻𝗰𝗲'),
      '',
      '🛡️ ' + b('𝗔𝗱𝗺𝗶𝗻'),
      '├ ' + b('𝗫𝗯𝗮𝗻'),
      '├ ' + b('𝗫𝘄𝗮𝗿𝗻'),
      '├ ' + b('𝗫𝗸𝗶𝗰𝗸'),
      '├ ' + b('𝗫𝗰𝗹𝗲𝗮𝗿'),
      '└ ' + b('𝗫𝗼𝗳𝗳'),
      '',
      '━━━━━━━━━━━━━━',
      ctx.fmt.pick([
        '⚡ ' + b('Tu demandes, j’analyse… et j’agis.'),
        '⚡ ' + b('Système rapide. Ne le surcharge pas.'),
        '⚡ ' + b('Écris simplement : je comprends le contexte.'),
      ]),
    ];
    await ctx.send(ctx.fmt.frame('📋 𝗠𝗘𝗡𝗨', body.join('\n')));
  },
};

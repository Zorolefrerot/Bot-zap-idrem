'use strict';
/*
 * 🧬 MeR~NeL — commands/media/xplay.js
 * Xplay : trouve et envoie un extrait audio (≤ 2 minutes).
 * Jamais de contournement des restrictions des sources.
 */

const fs = require('fs');

module.exports = {
  name: 'xplay',
  description: 'Recherche et envoie un audio (2 min max)',
  usage: 'Xplay <morceau / artiste>',
  category: 'media',
  aliases: ['xaudio', 'xsong'],
  adminOnly: false,
  cooldownMs: 12000,
  run: async (ctx) => {
    const query = ctx.fmt.clean(ctx.args.join(' '), 200);
    if (!query) {
      return ctx.send(
        ctx.fmt.frame('🎵 XPLAY', [
          '⚠️ ' + ctx.fmt.bold('Indique un morceau ou un artiste.'),
          `📌 ${ctx.fmt.bold('Exemple')} : ${ctx.fmt.bold('Xplay Imagine Dragons Believer')}`,
        ])
      );
    }
    if (!ctx.services.audio.available()) {
      return ctx.send(
        ctx.fmt.frame('⚠️ SYSTÈME EN PAUSE', [
          '🎵 ' + ctx.fmt.bold('Module audio indisponible sur ce serveur.'),
          `🧾 ${ctx.fmt.bold('CODE')} : ${ctx.fmt.bold('MEDIA_SERVICE_UNAVAILABLE')}`,
        ])
      );
    }

    await ctx.send('🎧 ' + ctx.fmt.bold('Recherche du morceau…'));

    try {
      const result = await ctx.services.audio.search(query);
      if (!result.ok) {
        if (result.reason === 'TOO_LONG') {
          const top = result.top || {};
          const minutes = Math.round((top.seconds || 0) / 60);
          return ctx.send(
            ctx.fmt.frame('🎵 LIMITE DE 2 MINUTES', [
              `⏱️ ${ctx.fmt.bold(`Le morceau trouvé dure ${minutes} min.`)}`,
              '🚫 ' + ctx.fmt.bold('Dépasse la limite de 2 minutes — aucun contournement.'),
              top.url ? `🔗 ${top.url}` : '',
            ].filter(Boolean))
          );
        }
        return ctx.send(ctx.fmt.frame('🎵 XPLAY', '❌ ' + ctx.fmt.bold('Aucun morceau trouvé pour cette recherche.')));
      }

      const { video } = result;
      await ctx.send('⬇️ ' + ctx.fmt.bold('Téléchargement de l’extrait…'));
      const dl = await ctx.services.audio.download(video);
      ctx.db.bumpStat('audiosSent');
      try {
        await ctx.send({
          body: ctx.fmt.frame('🎵 𝗫𝗣𝗟𝗔𝗬', [
            `🎧 ${ctx.fmt.bold(ctx.fmt.truncate(dl.title, 120))}`,
            `⏱️ ${ctx.fmt.bold(ctx.services.audio.formatDuration(dl.seconds))}`,
            video.author ? `👤 ${video.author}` : '',
          ].filter(Boolean)),
          attachment: dl.file,
        });
      } finally {
        fs.unlink(dl.file, () => {});
      }
    } catch (err) {
      ctx.logger.warn('[xplay]', err.code || err.message);
      await ctx.send(
        ctx.fmt.frame('⚠️ SYSTÈME EN PAUSE', [
          '🎵 ' + ctx.fmt.bold('Ce contenu n’est pas disponible ou la source refuse l’accès.'),
          `🧾 ${ctx.fmt.bold('CODE')} : ${ctx.fmt.bold(String(err.code || 'MEDIA_ERROR').toUpperCase())}`,
        ])
      );
    }
  },
};

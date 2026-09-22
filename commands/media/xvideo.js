'use strict';
/*
 * 🧬 MeR~NeL — commands/media/xvideo.js
 * Xvideo : trouve et envoie une vidéo courte (≤ 2 minutes).
 */

const fs = require('fs');

module.exports = {
  name: 'xvideo',
  description: 'Recherche et envoie une vidéo (2 min max)',
  usage: 'Xvideo <recherche>',
  category: 'media',
  aliases: ['xvid'],
  adminOnly: false,
  cooldownMs: 15000,
  run: async (ctx) => {
    const query = ctx.fmt.clean(ctx.args.join(' '), 200);
    if (!query) {
      return ctx.send(
        ctx.fmt.frame('🎬 XVIDEO', [
          '⚠️ ' + ctx.fmt.bold('Indique une recherche.'),
          `📌 ${ctx.fmt.bold('Exemple')} : ${ctx.fmt.bold('Xvideo dark bien début')}`,
        ])
      );
    }
    if (!ctx.services.video.available()) {
      return ctx.send(
        ctx.fmt.frame('⚠️ SYSTÈME EN PAUSE', [
          '🎬 ' + ctx.fmt.bold('Module vidéo indisponible sur ce serveur.'),
          `🧾 ${ctx.fmt.bold('CODE')} : ${ctx.fmt.bold('MEDIA_SERVICE_UNAVAILABLE')}`,
        ])
      );
    }

    await ctx.send('🎬 ' + ctx.fmt.bold('Recherche de la vidéo…'));

    try {
      const result = await ctx.services.video.search(query);
      if (!result.ok) {
        if (result.reason === 'TOO_LONG') {
          const top = result.top || {};
          const minutes = Math.round((top.seconds || 0) / 60);
          return ctx.send(
            ctx.fmt.frame('🎬 LIMITE DE 2 MINUTES', [
              `⏱️ ${ctx.fmt.bold(`La vidéo trouvée dure ${minutes} min.`)}`,
              '🚫 ' + ctx.fmt.bold('Dépasse la limite de 2 minutes — aucun contournement.'),
              top.url ? `🔗 ${top.url}` : '',
            ].filter(Boolean))
          );
        }
        return ctx.send(ctx.fmt.frame('🎬 XVIDEO', '❌ ' + ctx.fmt.bold('Aucune vidéo trouvée pour cette recherche.')));
      }

      const { video } = result;
      await ctx.send('⬇️ ' + ctx.fmt.bold('Téléchargement de la vidéo…'));
      const dl = await ctx.services.video.download(video);
      ctx.db.bumpStat('videosSent');
      try {
        await ctx.send({
          body: ctx.fmt.frame('🎬 𝗫𝗩𝗜𝗗𝗘𝗢', [
            `🎞️ ${ctx.fmt.bold(ctx.fmt.truncate(dl.title, 120))}`,
            `⏱️ ${ctx.fmt.bold(ctx.services.audio.formatDuration(dl.seconds))}`,
          ]),
          attachment: dl.file,
        });
      } finally {
        fs.unlink(dl.file, () => {});
      }
    } catch (err) {
      ctx.logger.warn('[xvideo]', err.code || err.message);
      await ctx.send(
        ctx.fmt.frame('⚠️ SYSTÈME EN PAUSE', [
          '🎬 ' + ctx.fmt.bold('Vidéo indisponible ou trop lourde pour l’envoi.'),
          `🧾 ${ctx.fmt.bold('CODE')} : ${ctx.fmt.bold(String(err.code || 'MEDIA_ERROR').toUpperCase())}`,
        ])
      );
    }
  },
};

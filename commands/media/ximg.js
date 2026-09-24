'use strict';
/*
 * 🧬 MeR~NeL — commands/media/ximg.js
 * Génération d'images (Agnes API) + repli automatique sur la recherche
 * d'images (clairement signalée) si la génération est indisponible.
 * Syntaxe : Ximg <description> [nombre] — max 5 par commande.
 */

const { sanitizeQuery, safeInt } = require('../../utils/sanitize');

module.exports = {
  name: 'ximg',
  description: 'Génère une ou plusieurs images à partir d’une description',
  usage: 'Ximg <description> [1-5]',
  category: 'media',
  aliases: ['ximage', 'xgen'],
  adminOnly: false,
  cooldownMs: 15000,
  run: async (ctx) => {
    const args = ctx.args.slice();
    let count = 1;
    if (args.length > 1) {
      const last = safeInt(args[args.length - 1], { min: 1, max: 99 });
      if (last) {
        count = last;
        args.pop();
      }
    }
    const description = sanitizeQuery(args.join(' '), 400);

    if (!description) {
      return ctx.send(
        ctx.fmt.frame('🖼️ XIMG', [
          '⚠️ ' + ctx.fmt.bold('Décris l’image à créer.'),
          `📌 ${ctx.fmt.bold('Exemple')} : ${ctx.fmt.bold('Ximg Sukuna 2')}`,
        ])
      );
    }

    if (count > ctx.config.media.maxImages) {
      return ctx.send(
        ctx.fmt.frame('🖼️ XIMG', [
          '⚠️ ' + ctx.fmt.bold('𝗟𝗜𝗠𝗜𝗧𝗘 𝗔𝗧𝗧𝗘𝗜𝗡𝗧𝗘'),
          `📌 ${ctx.fmt.bold('MAXIMUM')} : ${ctx.fmt.boldNum(ctx.config.media.maxImages)} ${ctx.fmt.bold('IMAGES PAR COMMANDE.')}`,
        ])
      );
    }

    await ctx.send(
      '「⚡ ' + ctx.fmt.bold('𝗦𝗬𝗦𝗧𝗘𝗠 𝗢𝗡𝗟𝗜𝗡𝗘') + '\n' + ctx.fmt.bold('𝗜𝗠𝗔𝗚𝗜𝗡𝗔𝗧𝗜𝗢𝗡 𝗜𝗡𝗧𝗢 𝗥𝗘𝗔𝗟𝗜𝗧𝗬...」')
    );

    /* Envoie une liste de fichiers avec la source annoncée honnêtement. */
    const sendFiles = async (files, sourceLabel) => {
      let sent = 0;
      for (const file of files) {
        try {
          await ctx.send({
            body: ctx.fmt.frame('🖼️ 𝗫𝗜𝗠𝗚', [
              `🎨 ${ctx.fmt.bold(description)}`,
              `#${ctx.fmt.boldNum(++sent)}/${ctx.fmt.boldNum(files.length)} — ${ctx.fmt.bold(sourceLabel)}`,
            ]),
            attachment: file,
          });
        } catch (err) {
          ctx.logger.warn('[ximg] envoi:', err.message);
        }
      }
      return sent;
    };

    /* 1) Génération SANS clé (Pollinations) — primaire */
    try {
      const files = await ctx.services.imageGen.generateFree(description, count);
      ctx.db.bumpStat('imagesGenerated', files.length);
      if ((await sendFiles(files, 'IA générative — Pollinations')) > 0) return;
    } catch (err) {
      ctx.logger.warn('[ximg] pollinations:', err.code || err.message);
    }

    /* 2) Génération Agnes (clé configurée) — secondaire */
    if (ctx.services.imageGen.available()) {
      try {
        const files = await ctx.services.imageGen.generate(description, count);
        ctx.db.bumpStat('imagesGenerated', files.length);
        if ((await sendFiles(files, 'IA générative')) > 0) return;
      } catch (err) {
        ctx.logger.warn('[ximg] agnes:', err.code || err.message);
      }
    }

    /* 3) Recherche web — repli clairement signalé */
    try {
      const urls = await ctx.services.imageSearch.search(description, count);
      ctx.db.bumpStat('imagesSearched', urls.length);
      let sent = 0;
      for (const url of urls) {
        try {
          await ctx.send({
            body: ctx.fmt.frame('🖼️ 𝗫𝗜𝗠𝗚', [
              `🔎 ${ctx.fmt.bold(description)}`,
              `#${ctx.fmt.boldNum(++sent)} — ${ctx.fmt.bold('source : recherche web')}`,
            ]),
            attachment: url,
          });
        } catch (err) {
          ctx.logger.warn('[ximg] envoi recherche:', err.message);
        }
      }
      if (sent === 0) throw Object.assign(new Error('no image sent'), { code: 'IMAGE_SEND_FAILED' });
    } catch (err) {
      await ctx.send(
        ctx.fmt.frame('⚠️ SYSTÈME EN PAUSE', [
          '🖼️ ' + ctx.fmt.bold('Impossible de produire cette image pour le moment.'),
          `🧾 ${ctx.fmt.bold('CODE')} : ${ctx.fmt.bold(String(err.code || 'IMAGE_ERROR').toUpperCase())}`,
        ])
      );
    }

  },
};

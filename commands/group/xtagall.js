'use strict';
/*
 * 🧬 MeR~NeL — commands/group/xtagall.js
 * Xtag all — mentionne les membres du groupe (par lots).
 * Utilise uniquement les mentions réellement supportées par l'API ;
 * en cas d'échec → repli texte propre, jamais de crash ni de faux succès.
 */

const CHUNK_SIZE = 25;
const MAX_MEMBERS = 120;

/**
 * Construit un payload avec mentions par lots.
 * @returns {Promise<Array<{body, mentions}>>} lots à envoyer
 */
async function buildMentionChunks(bot, threadID, headerText, footerText) {
  const info = await bot.adapter.getThreadInfo(threadID).catch(() => null);
  const participantIDs = ((info && (info.participantIDs || (info.userInfo || []).map((u) => u.id))) || [])
    .map(String)
    .filter((uid) => uid && uid !== bot.adapter.botID)
    .slice(0, MAX_MEMBERS);
  if (participantIDs.length === 0) return [];

  const infos = await bot.adapter.userCache.fetch(participantIDs).catch(() => ({}));
  const chunks = [];
  for (let i = 0; i < participantIDs.length; i += CHUNK_SIZE) {
    const slice = participantIDs.slice(i, i + CHUNK_SIZE);
    let body = headerText ? headerText + '\n' : '';
    const mentions = {};
    for (const uid of slice) {
      const name = (infos[uid] && infos[uid].name) || 'Membre';
      const tag = `@${name.split(/\s+/)[0]} `;
      const from = body.length;
      body += tag;
      mentions[uid] = { tag: tag.trim(), from };
    }
    if (footerText) body += '\n\n' + footerText;
    chunks.push({ body, mentions });
  }
  return chunks;
}

module.exports = {
  name: 'xtag',
  description: 'Mentionne tous les membres du groupe',
  usage: 'Xtag all',
  category: 'group',
  aliases: ['xtagall', 'xtous'],
  adminOnly: false,
  cooldownMs: 30000,
  buildMentionChunks,

  run: async (ctx) => {
    if (!ctx.isGroup) {
      return ctx.send(ctx.fmt.frame('📢 XTAG', '⚠️ ' + ctx.fmt.bold('À utiliser dans un groupe.')));
    }
    if ((ctx.args[0] || '').toLowerCase() !== 'all') {
      return ctx.send(ctx.fmt.frame('📢 XTAG', `📌 ${ctx.fmt.bold('Usage')} : ${ctx.fmt.bold('Xtag all')}`));
    }

    const header = ctx.fmt.pick([
      '📢 ' + ctx.fmt.bold('APPEL GÉNÉRAL — TOUS SUR LE PONT ⚡'),
      '🛰️ ' + ctx.fmt.bold('SIGNAL GROUPE — ACTIVATION DES MEMBRES 🧬'),
      '📣 ' + ctx.fmt.bold('BIP BIP — LE SYSTÈME RÉCLAME VOTRE ATTENTION ⚡'),
    ]);
    const footer = ctx.fmt.bold(`— ${ctx.senderName} via ${ctx.config.botName}`);

    try {
      const chunks = await module.exports.buildMentionChunks(ctx.bot, ctx.threadID, header, footer);
      if (chunks.length === 0) {
        return ctx.send(ctx.fmt.frame('📢 XTAG', '⚠️ ' + ctx.fmt.bold('Impossible de lire la liste des membres.')));
      }
      for (const chunk of chunks) {
        await ctx.send(chunk);
        await new Promise((r) => setTimeout(r, 1500));
      }
      ctx.db.bumpStat('tagAllRuns');
    } catch (err) {
      ctx.logger.warn('[xtagall] mentions:', err.message);
      // Repli honnête : message simple, sans prétendre avoir tout mentionné.
      await ctx.send(ctx.fmt.frame('📢 XTAG', `${header}\n⚠️ ${ctx.fmt.bold('Les mentions directes sont limitées ici — message envoyé sans tags.')}`));
    }
  },
};

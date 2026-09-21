import { phoneSchema, parseOrBotError } from '../../utils/validate.js';
import { BotError } from '../../utils/errors.js';
import { jidToPhone } from '../../utils/phone.js';
import { formatPhone } from '../../utils/format.js';

const CLEAR_WORDS = new Set(['none', 'off', 'reset', 'clear', 'aucun', '-', 'vide']);

export default {
  name: 'setadmin',
  aliases: ['setowner', 'admin', 'owner-number'],
  category: 'admin',
  description: 'Définit le numéro de l’administrateur du bot',
  usage: '/setadmin <numéro international> (ou @membre, ou en répondant à un message)',
  ownerOnly: true,
  examples: ['/setadmin 243970000000', '/setadmin none'],

  async execute(ctx) {
    const raw = String(ctx.args[0] || '').trim();

    if (CLEAR_WORDS.has(raw.toLowerCase())) {
      ctx.db.updateSettings({ adminNumber: '' });
      return ctx.reply(
        '✅ Numéro administrateur effacé.\nℹ️ Tant qu’aucun numéro n’est configuré, le compte WhatsApp connecté au bot est considéré comme administrateur.',
      );
    }

    const mention = ctx.msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const source = raw || (mention ? jidToPhone(mention) : '') || (ctx.quoted?.participant ? jidToPhone(ctx.quoted.participant) : '');

    if (!source) {
      throw new BotError(
        `ℹ️ Administrateur actuel : ${ctx.settings.adminNumber ? formatPhone(ctx.settings.adminNumber) : 'aucun'}\n\n` +
          `Usage : \`${ctx.prefix}setadmin <numéro international>\`\n` +
          `Exemple : \`${ctx.prefix}setadmin 243970000000\`\n` +
          `Vous pouvez aussi répondre à un message ou mentionner la personne.`,
      );
    }

    const phone = parseOrBotError(phoneSchema, source, `${ctx.prefix}setadmin 243970000000`);
    ctx.db.updateSettings({ adminNumber: phone });

    await ctx.reply(`✅ Administrateur défini : *${ctx.settings.adminName || phone}*\n📱 ${formatPhone(phone)}`);
  },
};

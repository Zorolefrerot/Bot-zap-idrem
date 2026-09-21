import { BotError } from '../../utils/errors.js';

const MAX_BYTES = 8 * 1024 * 1024;

/** Récupère la photo de profil (mécanisme public Baileys). */
async function fetchProfilePicture(sock, jid, size = 'image') {
  const url = await sock.profilePictureUrl(jid, size);
  if (!url) return null;

  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) return null;

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_BYTES) return null;
  return buffer;
}

export default {
  name: 'pp',
  aliases: ['profilepic', 'getpp', 'avatar'],
  category: 'tools',
  description: 'Envoie la photo de profil (soi, un membre cité ou mentionné)',
  usage: '/pp [@membre] (ou en répondant à un message)',
  examples: ['/pp', '/pp @quelquun'],

  async execute(ctx) {
    const mentioned = ctx.msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const target = mentioned || ctx.quoted?.participant || ctx.sender;

    let buffer = null;
    try {
      buffer = await fetchProfilePicture(ctx.sock, target);
    } catch {
      buffer = null;
    }

    if (!buffer) {
      // Certains comptes n'exposent leur avatar qu'en HD.
      try {
        buffer = await fetchProfilePicture(ctx.sock, target, 'hd');
      } catch {
        buffer = null;
      }
    }

    if (!buffer) throw new BotError('❌ Aucune photo de profil accessible pour ce compte.');

    await ctx.sendImage(buffer, '🖼️ Photo de profil récupérée.');
  },
};

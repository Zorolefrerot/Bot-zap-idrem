import { BotError } from '../../utils/errors.js';

const DELAY_MS = 700;
const MAX_TARGETS = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function resolveTarget(args) {
  const flags = args.filter((a) => a.startsWith('--'));
  if (flags.includes('--group') || flags.includes('--groups')) return 'groups';
  if (flags.includes('--private') || flags.includes('--pm')) return 'private';
  return 'all';
}

export default {
  name: 'broadcast',
  aliases: ['bc', 'bcast'],
  category: 'admin',
  description: 'Diffuse un message (et/ou un média) aux conversations connues',
  usage: '/bc <texte> [--group|--private] (ou en répondant à un média)',
  ownerOnly: true,
  examples: ['/bc Maintenance prévue à 20h', '/bc --group Nouveau sticker disponible'],

  async execute(ctx) {
    const target = resolveTarget(ctx.args);
    const text = ctx.argText.replace(/--(group|groups|private|pm)\b/g, '').trim();
    const hasMedia = Boolean(ctx.quoted?.media || ctx.media);

    if (!text && !hasMedia) {
      throw new BotError(
        `❌ Message manquant.\n\nUsage : \`${ctx.prefix}bc <texte>\`\n` +
          `Cibles : \`--group\` (groupes), \`--private\` (privés), défaut = tout.\n` +
          `💡 Vous pouvez aussi répondre à un média avec \`${ctx.prefix}bc <texte>\`.`,
      );
    }

    let media;
    if (hasMedia) {
      const downloaded = ctx.quoted?.media ? await ctx.downloadQuoted() : await ctx.downloadMedia();
      media = { buffer: downloaded.buffer, info: downloaded.info };
    }

    const targets = ctx.db.broadcastTargets({ target }).slice(0, MAX_TARGETS);
    if (!targets.length) {
      throw new BotError('❌ Aucune conversation connue pour la diffusion.');
    }

    await ctx.reply(`📣 Diffusion vers ${targets.length} conversation(s)…`);

    let sent = 0;
    let failed = 0;

    for (const chat of targets) {
      try {
        const content = { ...(text ? { text } : {}) };
        if (media) {
          switch (media.info.kind) {
            case 'image':
              Object.assign(content, { image: media.buffer, caption: text || undefined });
              break;
            case 'video':
              Object.assign(content, { video: media.buffer, caption: text || undefined });
              break;
            case 'audio':
              Object.assign(content, { audio: media.buffer, mimetype: media.info.mimetype || 'audio/mpeg' });
              break;
            case 'sticker':
              Object.assign(content, { sticker: media.buffer });
              break;
            default:
              Object.assign(content, {
                document: media.buffer,
                mimetype: media.info.mimetype || 'application/octet-stream',
                fileName: media.info.fileName || 'document.bin',
              });
          }
        }

        await ctx.sock.sendMessage(chat.jid, content);
        sent += 1;
      } catch {
        failed += 1;
      }
      await sleep(DELAY_MS);
    }

    await ctx.reply(`✅ Diffusion terminée : ${sent} envoyée(s), ${failed} échec(s).`);
  },
};

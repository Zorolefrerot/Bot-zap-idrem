import { downloadMediaMessage as baileysDownloadMediaMessage } from '@whiskeysockets/baileys';
import db from '../database/index.js';
import { baileysLogger, createLogger } from '../utils/logger.js';
import { BotError, boomStatus } from '../utils/errors.js';
import { extractText, getMediaInfo, getQuotedInfo, isIgnorableMessage, toDownloadable } from '../utils/message.js';
import { isGroupJid } from '../utils/phone.js';
import { buildHelp } from '../utils/menu.js';
import { categoryMeta } from './loader.js';

const logger = createLogger('handler');

const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024;
const GROUP_META_TTL_MS = 60_000;
const DEFAULT_COOLDOWN_MS = 800;

const groupMetaCache = new Map();
const cooldowns = new Map();

async function getGroupMetadata(sock, jid) {
  const cached = groupMetaCache.get(jid);
  if (cached && Date.now() - cached.at < GROUP_META_TTL_MS) return cached.data;
  try {
    const data = await sock.groupMetadata(jid);
    groupMetaCache.set(jid, { data, at: Date.now() });
    return data;
  } catch (error) {
    logger.debug('groupMetadata indisponible', { reason: error.message });
    return cached?.data || null;
  }
}

function translateDownloadError(error) {
  const status = boomStatus(error);
  if (status === 404 || status === 410) {
    return new BotError('❌ Média expiré ou déjà supprimé des serveurs WhatsApp.');
  }
  if (status === 401 || status === 403) {
    return new BotError('❌ Accès refusé par WhatsApp pour ce média.');
  }
  return new BotError(`❌ Téléchargement du média impossible : ${error.message || 'erreur inconnue'}`);
}

/**
 * Réinitialise les caches d'exécution (cooldowns, métadonnées de groupe).
 * Utile aux tests automatisés ; sans effet sur le comportement en production.
 */
export function resetRuntimeCaches() {
  groupMetaCache.clear();
  cooldowns.clear();
}

function checkCooldown(command, sender) {
  const ttl = command.cooldownMs || DEFAULT_COOLDOWN_MS;
  if (!ttl) return 0;
  const id = `${sender}:${command.name}`;
  const now = Date.now();
  const last = cooldowns.get(id) || 0;
  const remaining = last + ttl - now;
  if (remaining > 0) return remaining;
  cooldowns.set(id, now);
  if (cooldowns.size > 2000) {
    for (const [key, value] of cooldowns) if (value < now - 60_000) cooldowns.delete(key);
  }
  return 0;
}

/**
 * Construit le processeur de messages pour un socket donné.
 *
 * `deps` permet l'injection de dépendances (téléchargement média) : utile pour
 * les tests automatisés, sans rien simuler en production.
 */
export function createProcessor(sock, manager, deps = {}) {
  const downloadMediaMessage = deps.downloadMediaMessage || baileysDownloadMediaMessage;

  async function buildContext(msg) {
    const settings = db.getSettings();
    const key = msg.key;
    const from = key.remoteJid;
    const isGroup = isGroupJid(from);
    const sender = isGroup ? key.participant || from : from;

    const groupMetadata = isGroup ? await getGroupMetadata(sock, from) : null;
    const participants = groupMetadata?.participants || [];
    const selfPhone = sock.user?.id ? String(sock.user.id).split('@')[0].split(':')[0] : null;
    const senderParticipant = participants.find((p) => p.id === sender) || null;
    const botParticipant = selfPhone ? participants.find((p) => String(p.id).split('@')[0].split(':')[0] === selfPhone) : null;

    const body = extractText(msg.message);
    const prefix = settings.prefix || '/';
    const startsWithPrefix = body.startsWith(prefix);
    const withoutPrefix = startsWithPrefix ? body.slice(prefix.length).trim() : '';
    const [commandName = '', ...args] = withoutPrefix.length ? withoutPrefix.split(/\s+/) : [];

    const quoted = getQuotedInfo(msg.message);
    const media = getMediaInfo(msg.message);

    const reply = (text, options = {}) =>
      sock.sendMessage(from, { text: String(text), ...options }, { quoted: msg });

    const downloadMedia = async (source = 'self') => {
      const useQuoted = source === 'quoted';
      const info = useQuoted ? quoted?.media : media;
      const downloadable = useQuoted ? toDownloadable(quoted, from) : msg;

      if (!info || !downloadable) {
        throw new BotError('❌ Aucun média détecté dans ce message.');
      }

      try {
        const buffer = await downloadMediaMessage(
          downloadable,
          'buffer',
          {},
          { logger: baileysLogger, reuploadRequest: sock.updateMediaMessage?.bind(sock) },
        );
        if (!buffer?.length) throw new BotError('❌ Média vide ou illisible.');
        if (buffer.length > MAX_DOWNLOAD_BYTES) throw new BotError('❌ Média trop volumineux (limite 64 Mo).');
        return { buffer, info };
      } catch (error) {
        if (error instanceof BotError) throw error;
        throw translateDownloadError(error);
      }
    };

    return {
      // --- infrastructure
      sock,
      manager,
      db,
      logger,
      settings,
      prefix,

      // --- message
      msg,
      key,
      from,
      sender,
      pushName: msg.pushName || senderParticipant?.name || null,
      isGroup,
      groupName: groupMetadata?.subject || null,
      groupMetadata,
      body,
      text: body,
      args,
      argText: args.join(' '),
      commandName: commandName.toLowerCase(),
      usedPrefix: startsWithPrefix ? prefix : null,
      isCommand: startsWithPrefix,
      timestamp: Number(msg.messageTimestamp) * 1000 || Date.now(),

      // --- média
      media,
      quoted,
      downloadMedia,
      downloadQuoted: () => downloadMedia('quoted'),

      // --- permissions
      isOwner: manager.isOwner(sender),
      isSelf: manager.isSelf(sender),
      isGroupAdmin: Boolean(senderParticipant?.admin),
      isBotAdmin: Boolean(botParticipant?.admin),
      adminNumber: settings.adminNumber || null,

      // --- envois
      reply,
      send: (content, options = {}) => sock.sendMessage(from, content, { quoted: msg, ...options }),
      sendText: (text, options = {}) => reply(text, options),
      sendImage: (buffer, caption, options = {}) =>
        sock.sendMessage(from, { image: buffer, caption: caption || undefined, ...options }, { quoted: msg }),
      sendVideo: (buffer, caption, options = {}) =>
        sock.sendMessage(from, { video: buffer, caption: caption || undefined, ...options }, { quoted: msg }),
      sendAudio: (buffer, options = {}) =>
        sock.sendMessage(
          from,
          { audio: buffer, mimetype: options.mimetype || 'audio/mp4', ptt: Boolean(options.ptt), ...options },
          { quoted: msg },
        ),
      sendDocument: (buffer, fileName, mimetype, options = {}) =>
        sock.sendMessage(
          from,
          { document: buffer, fileName, mimetype: mimetype || 'application/octet-stream', ...options },
          { quoted: msg },
        ),
      sendSticker: (buffer, options = {}) => sock.sendMessage(from, { sticker: buffer, ...options }, { quoted: msg }),
      react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key } }),
      typing: async () => {
        try {
          await sock.presenceSubscribe?.(from);
          await sock.sendPresenceUpdate?.('composing', from);
        } catch {
          /* la présence n'est pas critique */
        }
      },

      // --- utilitaires
      utils: { buildHelp, categoryMeta, BotError },
    };
  }

  async function dispatch(ctx, command) {
    const remaining = checkCooldown(command, ctx.sender);
    if (remaining > 0) return { skipped: 'cooldown' }; // silencieux : évite le spam

    if (command.groupOnly && !ctx.isGroup) {
      await ctx.reply('👥 Cette commande fonctionne uniquement dans un groupe.');
      return { skipped: 'group-only' };
    }
    if (command.privateOnly && ctx.isGroup) {
      await ctx.reply('💬 Cette commande fonctionne uniquement en message privé.');
      return { skipped: 'private-only' };
    }
    if (command.ownerOnly && !ctx.isOwner) {
      await ctx.reply('⛔ Commande réservée à l’administrateur du bot.');
      return { skipped: 'owner-only' };
    }
    if (command.adminOnly && !(ctx.isGroupAdmin || ctx.isOwner)) {
      await ctx.reply('⛔ Commande réservée aux administrateurs du groupe.');
      return { skipped: 'admin-only' };
    }

    await ctx.typing();
    db.incrementCommand(command.name);

    try {
      await command.execute(ctx);
      return { executed: command.name };
    } catch (error) {
      if (error instanceof BotError) {
        await ctx.reply(error.message).catch(() => {});
        if (!error.silent) logger.warn('commande en erreur fonctionnelle', { command: command.name, reason: error.message });
        return { failed: command.name, reason: error.message };
      }
      logger.error('commande en erreur', { command: command.name, reason: error.message });
      await ctx
        .reply(`❌ Une erreur est survenue pendant l’exécution de ${ctx.prefix}${command.name}.`)
        .catch(() => {});
      return { failed: command.name, reason: error.message };
    }
  }

  async function handle(msg) {
    if (!msg?.key || msg.key.fromMe) return { ignored: 'fromMe' };
    if (!msg.key.remoteJid || msg.key.remoteJid === 'status@broadcast') return { ignored: 'broadcast' };
    if (isIgnorableMessage(msg)) return { ignored: 'content' };

    db.incrementMessages();
    db.trackChat({ jid: msg.key.remoteJid, isGroup: isGroupJid(msg.key.remoteJid), pushName: msg.pushName });

    const ctx = await buildContext(msg);
    if (!ctx.isCommand) return { ignored: 'no-prefix' };

    const command = manager.resolveCommand(ctx.commandName);
    if (!command) {
      if (ctx.commandName) {
        await ctx.reply(`❌ Commande inconnue : ${ctx.prefix}${ctx.commandName}\n💡 Tapez ${ctx.prefix}menu pour voir la liste.`);
        return { unknown: ctx.commandName };
      }
      return { ignored: 'empty-command' };
    }

    return dispatch(ctx, command);
  }

  return { buildContext, dispatch, handle };
}

/**
 * Enregistre le routeur de messages sur le socket Baileys.
 */
export function registerMessageHandler(sock, manager) {
  const { handle } = createProcessor(sock, manager);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify' && type !== 'append') return;

    for (const msg of messages || []) {
      try {
        await handle(msg);
      } catch (error) {
        logger.error('traitement de message échoué', { reason: error.message });
      }
    }
  });
}

export default registerMessageHandler;

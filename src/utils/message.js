import { extractMessageContent, getContentType, normalizeMessageContent } from '@whiskeysockets/baileys';

/**
 * Lecture/normalisation des messages WhatsApp.
 * Centralise le "déballage" des messages imbriqués (éphémères, View Once,
 * documents avec légende, réponses) utilisé par les commandes.
 */

const VIEW_ONCE_KEYS = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'];
const WRAPPER_KEYS = [...VIEW_ONCE_KEYS, 'ephemeralMessage', 'documentWithCaptionMessage', 'editedMessage'];

export const MEDIA_KINDS = {
  imageMessage: 'image',
  videoMessage: 'video',
  audioMessage: 'audio',
  stickerMessage: 'sticker',
  documentMessage: 'document',
};

/** Le message brut contient-il un média en "vue unique" ? */
export function hasViewOnceWrapper(message) {
  if (!message || typeof message !== 'object') return false;
  return VIEW_ONCE_KEYS.some((key) => Boolean(message[key]));
}

export function unwrapMessage(message) {
  let content = message;
  for (let i = 0; i < 6 && content; i += 1) {
    const wrapper = WRAPPER_KEYS.find((key) => content[key]?.message);
    if (!wrapper) break;
    content = content[wrapper].message;
  }
  return normalizeMessageContent(content) || content || message;
}

export function extractText(message) {
  const content = unwrapMessage(message);
  if (!content) return '';
  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentWithCaptionMessage?.message?.extendedTextMessage?.text ||
    content.buttonsResponseMessage?.selectedDisplayText ||
    content.listResponseMessage?.title ||
    content.templateButtonReplyMessage?.selectedDisplayText ||
    ''
  ).trim();
}

/** Type de contenu "réel" d'un message (après déballage). */
export function resolveContentType(message) {
  const content = unwrapMessage(message);
  return getContentType(content) || null;
}

/**
 * Retourne les infos média d'un message (ou null).
 * `content` est l'objet Baileys déballé, `isViewOnce` indique si le média
 * d'origine était en vue unique.
 */
export function getMediaInfo(message) {
  const raw = message || {};
  const content = unwrapMessage(raw);
  if (!content) return null;

  const type = getContentType(content);
  const kind = MEDIA_KINDS[type];
  if (!kind) return null;

  const node = content[type];
  const isViewOnce = hasViewOnceWrapper(raw) || node?.viewOnce === true;

  return {
    kind,
    type,
    node,
    mimetype: node?.mimetype || null,
    seconds: node?.seconds ?? node?.duration ?? null,
    fileName: node?.fileName || node?.title || null,
    isGif: Boolean(node?.gifPlayback) || (node?.mimetype || '').includes('gif'),
    isViewOnce,
    caption: node?.caption || '',
  };
}

/** Récupère le message cité (quote) avec sa clé pour re-upload éventuel. */
export function getQuotedInfo(message) {
  const content = unwrapMessage(message);
  const contextInfo = content?.extendedTextMessage?.contextInfo;
  const quotedMessage = contextInfo?.quotedMessage;
  if (!quotedMessage) return null;

  return {
    message: quotedMessage,
    stanzaId: contextInfo.stanzaId || null,
    participant: contextInfo.participant || contextInfo.remoteJid || null,
    fromMe: contextInfo.stanzaId ? false : undefined,
    text: extractText(quotedMessage),
    media: getMediaInfo(quotedMessage),
    isViewOnce: hasViewOnceWrapper(quotedMessage),
  };
}

/** Construit un objet message Baileys minimal pour downloadMediaMessage. */
export function toDownloadable(quoted, remoteJid) {
  if (!quoted) return null;
  return {
    key: {
      remoteJid: remoteJid || quoted.participant || 'status@broadcast',
      fromMe: false,
      id: quoted.stanzaId || 'QUOTED',
      participant: quoted.participant || undefined,
    },
    message: quoted.message,
  };
}

const IGNORED_TYPES = new Set([
  'protocolMessage',
  'reactionMessage',
  'senderKeyDistributionMessage',
  'pollUpdateMessage',
  'pollCreationMessage',
  'callLogMessage',
  'placeholderMessage',
]);

/** Contenus à ignorer (protocole, réactions, sondages...). */
export function isIgnorableMessage(msg) {
  if (!msg || !msg.message) return true;
  if (msg.key?.remoteJid === 'status@broadcast') return true;
  const type = resolveContentType(msg.message);
  if (!type) return true;
  return IGNORED_TYPES.has(type);
}

export { extractMessageContent, getContentType, normalizeMessageContent };

/**
 * Doubles de test pour la couche WhatsApp.
 *
 * IMPORTANT : seule la frontière réseau est simulée (socket Baileys et
 * téléchargement de média). Toute la logique métier testée (routage des
 * commandes, permissions, détection View Once, conversion sticker, menu)
 * est la vraie implémentation du projet.
 */
import { EventEmitter } from 'node:events';

export const OWNER_PHONE = '243970000000';
export const OWNER_JID = `${OWNER_PHONE}@s.whatsapp.net`;
export const USER_PHONE = '243811112222';
export const USER_JID = `${USER_PHONE}@s.whatsapp.net`;
export const GROUP_JID = '120363000000000000@g.us';

export function createFakeSock({ user = { id: `${OWNER_PHONE}:12@s.whatsapp.net`, name: 'IDREM TERESHKOVA BOT' }, participants = [] } = {}) {
  const sent = [];
  const ev = new EventEmitter();
  ev.setMaxListeners(50);

  const sock = {
    user,
    ev,
    sent,
    ws: { readyState: 3 },

    async sendMessage(jid, content, options) {
      sent.push({ jid, content, options });
      return { key: { remoteJid: jid, fromMe: true, id: `SENT${sent.length}` }, message: content };
    },
    async sendPresenceUpdate() {},
    async presenceSubscribe() {},
    async groupMetadata(jid) {
      return { id: jid, subject: 'Groupe de test', participants };
    },
    async updateMediaMessage(message) {
      return message;
    },
    async profilePictureUrl(jid) {
      return `https://example.invalid/${jid}.jpg`;
    },
    async logout() {},
    async end() {},
    async waitForSocketOpen() {},
  };

  sock.texts = () => sent.filter((m) => typeof m.content?.text === 'string').map((m) => m.content.text);
  sock.lastText = () => sock.texts().at(-1) || null;
  sock.reset = () => {
    sent.length = 0;
  };

  return sock;
}

let messageCounter = 0;
function nextId(prefix = 'MSG') {
  messageCounter += 1;
  return `${prefix}${messageCounter.toString(36).toUpperCase().padStart(6, '0')}`;
}

function envelope(remoteJid, message, { participant, fromMe = false, pushName = 'Utilisateur Test' } = {}) {
  return {
    key: { remoteJid, fromMe, id: nextId(), ...(participant ? { participant } : {}) },
    message,
    messageTimestamp: Math.floor(Date.now() / 1000),
    pushName,
  };
}

export function textMessage(text, opts = {}) {
  return envelope(opts.remoteJid || USER_JID, { conversation: text }, opts);
}

export function imageMessage(opts = {}) {
  return envelope(
    opts.remoteJid || USER_JID,
    {
      imageMessage: {
        url: 'https://mmg.whatsapp.net/o1/v/t45/f1/m200',
        directPath: '/v/t45.5600-29/x.bin',
        mimetype: 'image/jpeg',
        caption: opts.caption,
        fileSha256: 'sha',
        fileLength: '12345',
        mediaKey: 'key',
        fileEncSha256: 'enc',
      },
    },
    opts,
  );
}

/** Média en vue unique : image enveloppée dans viewOnceMessageV2. */
export function viewOnceImageMessage(opts = {}) {
  const inner = imageMessage(opts).message;
  return envelope(opts.remoteJid || USER_JID, { viewOnceMessageV2: { message: inner } }, opts);
}

export function viewOnceVideoMessage(opts = {}) {
  return envelope(
    opts.remoteJid || USER_JID,
    {
      viewOnceMessageV2: {
        message: {
          videoMessage: {
            url: 'https://mmg.whatsapp.net/v/t45/x',
            directPath: '/v/t45/x.bin',
            mimetype: 'video/mp4',
            seconds: 7,
            mediaKey: 'key',
            fileSha256: 'sha',
            fileEncSha256: 'enc',
            fileLength: '99999',
          },
        },
      },
    },
    opts,
  );
}

export function viewOnceAudioMessage(opts = {}) {
  return envelope(
    opts.remoteJid || USER_JID,
    {
      viewOnceMessageV2Extension: {
        message: {
          audioMessage: {
            url: 'https://mmg.whatsapp.net/a/t45/x',
            directPath: '/v/t45/x.bin',
            mimetype: 'audio/ogg; codecs=opus',
            seconds: 3,
            ptt: true,
            mediaKey: 'key',
            fileSha256: 'sha',
            fileEncSha256: 'enc',
            fileLength: '5000',
          },
        },
      },
    },
    opts,
  );
}

/** Réponse (/vv) à un média en vue unique. */
export function quotedViewOnce({ command = '/vv', kind = 'image', remoteJid = USER_JID, sender = USER_JID } = {}) {
  let inner;
  if (kind === 'video') inner = viewOnceVideoMessage({ remoteJid: sender }).message;
  else if (kind === 'audio') inner = viewOnceAudioMessage({ remoteJid: sender }).message;
  else inner = viewOnceImageMessage({ remoteJid: sender }).message;

  return envelope(
    remoteJid,
    {
      extendedTextMessage: {
        text: command,
        contextInfo: {
          stanzaId: nextId('VO'),
          participant: sender,
          quotedMessage: inner,
        },
      },
    },
    { participant: remoteJid.endsWith('@g.us') ? sender : undefined },
  );
}

/** Réponse à un sticker (pour /toimg, /tovideo). */
export function quotedSticker({ command = '/toimg', remoteJid = USER_JID } = {}) {
  return envelope(remoteJid, {
    extendedTextMessage: {
      text: command,
      contextInfo: {
        stanzaId: nextId('STK'),
        participant: remoteJid,
        quotedMessage: {
          stickerMessage: {
            url: 'https://mmg.whatsapp.net/s/x',
            directPath: '/v/t45/x.bin',
            mimetype: 'image/webp',
            mediaKey: 'key',
            fileSha256: 'sha',
            fileEncSha256: 'enc',
            fileLength: '4096',
          },
        },
      },
    },
  });
}

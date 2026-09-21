import db from '../database/index.js';
import { createLogger } from '../utils/logger.js';
import { isSameJid } from '../utils/phone.js';

const logger = createLogger('event:groups');

/**
 * Événements de groupe.
 * - journalise les changements (sans stocker de contenu de message),
 * - présente le bot lorsqu'il est ajouté à un groupe.
 */
export function registerGroupEvents(sock, manager) {
  sock.ev.on('groups.update', (updates) => {
    for (const group of updates || []) {
      logger.debug('groupe mis à jour', { jid: group.id, subject: group.subject });
      db.trackChat({ jid: group.id, name: group.subject, isGroup: true });
    }
  });

  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    const botJid = sock.user?.id;
    logger.debug('participants', { jid: id, action, count: participants?.length || 0 });

    if (action !== 'add' || !botJid) return;
    if (!participants?.some((jid) => isSameJid(jid, botJid))) return;

    const settings = db.getSettings();
    const text = [
      `👋 Bonjour, je suis *${settings.botName}*.`,
      ``,
      `Utilisez \`${settings.prefix}menu\` pour voir toutes les commandes.`,
      `Astuce : \`${settings.prefix}vv\` récupère un média envoyé en vue unique.`,
    ].join('\n');

    try {
      await sock.sendMessage(id, { text });
    } catch (error) {
      logger.warn('présentation au groupe impossible', { reason: error.message });
    }
  });
}

export default registerGroupEvents;

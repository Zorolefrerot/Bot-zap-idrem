import { createLogger } from '../utils/logger.js';

const logger = createLogger('event:connection');

/**
 * Événements de connexion Baileys.
 * Toute la logique d'état vit dans le BotManager : ce module ne fait
 * que relayer les événements et marquer la présence du bot.
 */
export function registerConnectionEvents(sock, manager) {
  sock.ev.on('connection.update', (update) => {
    try {
      manager.handleConnectionUpdate(update);
    } catch (error) {
      logger.error('gestion connection.update échouée', { reason: error.message });
    }

    if (update?.connection === 'open') {
      sock
        .sendPresenceUpdate('available')
        .catch(() => {});
    }
  });

  sock.ev.on('chats.set', ({ chats }) => logger.debug('chats synchronisés', { count: chats?.length || 0 }));
  sock.ev.on('contacts.set', ({ contacts }) => logger.debug('contacts synchronisés', { count: contacts?.length || 0 }));
}

export default registerConnectionEvents;

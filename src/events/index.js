import { registerConnectionEvents } from './connectionUpdate.js';
import { registerGroupEvents } from './groupsUpdate.js';

/**
 * Point d'entrée des événements Baileys.
 * Les messages sont traités séparément dans `src/bot/handler.js`.
 */
export function registerBotEvents(sock, manager) {
  registerConnectionEvents(sock, manager);
  registerGroupEvents(sock, manager);
}

export { registerConnectionEvents, registerGroupEvents };
export default registerBotEvents;

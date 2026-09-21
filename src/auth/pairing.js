import env from '../config/env.js';
import { formatPairCode } from '../utils/format.js';
import { digitsOnly } from '../utils/phone.js';
import { BotError } from '../utils/errors.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('pairing');

/** Durée de validité d'un Pair Code WhatsApp (~60 s côté serveurs). */
export const PAIR_CODE_TTL_MS = env.whatsapp.pairingCodeTtlMs || 60_000;

/** Délai maximal d'ouverture du socket avant l'appel à requestPairingCode. */
const SOCKET_OPEN_TIMEOUT_MS = 45_000;

/**
 * Attend que la connexion WebSocket du socket soit ouverte.
 * Rejette dès que Baileys signale une fermeture (raison propagée telle
 * quelle pour le mapping d'erreurs réseau du manager).
 */
function waitForSocketOpen(sock) {
  return new Promise((resolve, reject) => {
    // Socket déjà ouvert (reconnexion rapide) : ne pas attendre.
    if (sock.user) return resolve();

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      sock.ev.off('connection.update', onUpdate);
      reject(new BotError(`Délai dépassé en attendant l'ouverture de la connexion WhatsApp (${SOCKET_OPEN_TIMEOUT_MS / 1000}s).`));
    }, SOCKET_OPEN_TIMEOUT_MS);
    if (timer.unref) timer.unref();

    function onUpdate(update) {
      if (settled) return;
      const { connection, lastDisconnect } = update || {};

      if (connection === 'open' || sock.user) {
        settled = true;
        clearTimeout(timer);
        sock.ev.off('connection.update', onUpdate);
        resolve();
        return;
      }

      if (connection === 'close') {
        settled = true;
        clearTimeout(timer);
        sock.ev.off('connection.update', onUpdate);
        const error = lastDisconnect?.error;
        reject(
          error instanceof Error
            ? error
            : new BotError(`Connexion WhatsApp fermée pendant l'appairage (code ${lastDisconnect?.error?.output?.statusCode ?? 'inconnu'}).`),
        );
      }
    }

    sock.ev.on('connection.update', onUpdate);
  });
}

/**
 * Demande un Pair Code à WhatsApp pour le numéro donné.
 *
 * Utilise le mécanisme officiel de Baileys (`sock.requestPairingCode`) :
 * aucun contournement, le code est généré par les serveurs WhatsApp pour
 * être saisi dans « Appareils connectés → Connecter avec un numéro ».
 *
 * @returns {{ code: string, display: string }} code brut (8 car.) + forme affichable (XXXX-XXXX)
 */
export async function requestPairCode(sock, phoneNumber) {
  const digits = digitsOnly(phoneNumber);
  if (!digits || digits.length < 7) {
    throw new BotError('Numéro invalide pour l’appairage (format international attendu, ex. 243970000000).');
  }

  await waitForSocketOpen(sock);

  let code;
  try {
    code = await sock.requestPairingCode(digits);
  } catch (error) {
    logger.warn('requestPairingCode a échoué', { reason: error?.message });
    if (error instanceof BotError) throw error;
    throw error instanceof Error ? error : new BotError(String(error));
  }

  if (!code || typeof code !== 'string' || code.length < 4) {
    throw new BotError('WhatsApp n’a pas renvoyé de Pair Code valide. Réessayez.');
  }

  const display = formatPairCode(code);
  // Le code lui-même n'est jamais loggé (donnée à durée de vie courte mais sensible).
  logger.info('pair code obtenu', { length: display.length, expiresAt: new Date(Date.now() + PAIR_CODE_TTL_MS).toISOString() });
  return { code: String(code).toUpperCase(), display };
}

export default { requestPairCode, PAIR_CODE_TTL_MS };

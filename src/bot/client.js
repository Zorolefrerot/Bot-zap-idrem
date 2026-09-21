import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import env from '../config/env.js';
import { baileysLogger, createLogger } from '../utils/logger.js';
import { loadAuthState } from '../auth/sessionStore.js';

const logger = createLogger('wa-client');

let cachedVersion = null;

async function resolveVersion() {
  if (env.whatsapp.forcedVersion) return env.whatsapp.forcedVersion;
  if (cachedVersion) return cachedVersion;
  try {
    const { version } = await fetchLatestBaileysVersion();
    cachedVersion = version;
    logger.info('version WhatsApp résolue', { version: version.join('.') });
    return version;
  } catch (error) {
    logger.warn('version WhatsApp indisponible, utilisation du défaut Baileys', { reason: error.message });
    return undefined;
  }
}

/**
 * Crée un client WhatsApp (Baileys) configuré pour l'appairage par code.
 * Aucun credential n'est exposé : l'état d'auth reste sur le disque serveur.
 */
export async function createWhatsAppClient({ authDir, onCredentialsUpdate } = {}) {
  const { state, saveCreds, dir } = await loadAuthState(authDir);
  const version = await resolveVersion();

  const browser = Browsers.ubuntu(env.whatsapp.browserName || 'IDREM Tereshkova');

  const sock = makeWASocket({
    // Baileys 6.x : `makeCacheableSignalKeyStore` ne met en cache que le
    // magasin de clés Signal ; `creds` doit être fourni séparément.
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
    },
    version,
    browser,
    printQRInTerminal: false,
    mobile: false,
    logger: baileysLogger,
    markOnlineOnConnect: true,
    syncFullHistory: env.whatsapp.syncFullHistory,
    generateHighQualityLinkPreview: true,
    emitOwnEvents: false,
    connectTimeoutMs: 30_000,
    keepAliveIntervalMs: 30_000,
    retryRequestDelayMs: 500,
    fireInitQueries: true,
    shouldSyncHistoryMessage: () => false,
    getMessage: async () => undefined,
  });

  sock.ev.on('creds.update', async () => {
    try {
      await saveCreds();
      onCredentialsUpdate?.();
    } catch (error) {
      logger.error('sauvegarde des credentials échouée', { reason: error.message });
    }
  });

  return { sock, authDir: dir };
}

export { DisconnectReason };
export default createWhatsAppClient;

/**
 * Valeurs par défaut du projet IDREM TERESHKOVA BOT.
 * Aucune donnée sensible ici : uniquement des constantes publiques.
 */

export const PROJECT_NAME = 'IDREM TERESHKOVA BOT';

export const DEFAULTS = Object.freeze({
  botName: 'IDREM TERESHKOVA BOT',
  prefix: '/',
  stickerName: 'IDREM TERESHKOVA',
  stickerAuthor: '',
  adminNumber: '',
  adminName: '',
});

/** Préfixe OBLIGATOIRE de toute Session ID générée par le projet. */
export const SESSION_ID_PREFIX = 'IDREM-TERESHKOVA-';

/** Entropie (en octets) utilisée pour générer une Session ID. */
export const SESSION_ID_ENTROPY_BYTES = 32;

export const CATEGORIES = Object.freeze([
  { id: 'admin', label: 'ADMIN', icon: '👑', order: 1 },
  { id: 'bot', label: 'BOT', icon: '⚡', order: 2 },
  { id: 'tools', label: 'TOOLS', icon: '🛠️', order: 3 },
  { id: 'sticker', label: 'STICKER', icon: '🎨', order: 4 },
  { id: 'media', label: 'MEDIA', icon: '📥', order: 5 },
]);

export const WA_STATUS = Object.freeze({
  IDLE: 'idle',
  WAITING: 'waiting',
  PAIRING: 'pairing',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  LOGGED_OUT: 'logged_out',
  ERROR: 'error',
});

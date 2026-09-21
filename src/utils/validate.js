import { z } from 'zod';
import { SESSION_ID_PREFIX } from '../config/defaults.js';
import { normalizePhone } from './phone.js';
import { BotError } from './errors.js';

/**
 * Validation centralisée des entrées (API + commandes).
 * Toute valeur entrante passe par ici : aucune donnée non validée
 * n'atteint la configuration persistée.
 */

const INVALID_PHONE = 'Numéro invalide. Utilisez le format international sans "+", ex. 243970000000.';

/** Chaîne brute -> chiffres normalisés (ou échec). Absent = chaîne vide. */
const phoneLike = z
  .union([z.string(), z.number(), z.undefined(), z.null()])
  .transform((value) => String(value ?? '').trim());

/** Chaîne brute pour les noms : absent = chaîne vide. */
const nameLike = z
  .union([z.string(), z.undefined(), z.null()])
  .transform((value) => String(value ?? '').trim());

export const phoneSchema = phoneLike
  .refine((value) => value.length > 0, { message: 'Numéro requis.' })
  .refine((value) => normalizePhone(value) !== null, { message: INVALID_PHONE })
  .transform((value) => normalizePhone(value));

export const optionalPhoneSchema = phoneLike
  .refine((value) => value === '' || normalizePhone(value) !== null, { message: INVALID_PHONE })
  .transform((value) => (value === '' ? undefined : normalizePhone(value)));

export const prefixSchema = z
  .string()
  .trim()
  .min(1, 'Le préfixe doit faire 1 à 3 caractères.')
  .max(3, 'Le préfixe doit faire 1 à 3 caractères.')
  .refine((value) => !/\s/.test(value), { message: 'Le préfixe ne peut pas contenir d’espace.' })
  .refine((value) => /^[^\w]+$/.test(value) || /^[A-Za-z0-9]{1,2}$/.test(value), {
    message: 'Préfixe invalide (ex. / ! . # :: ou une lettre).',
  });

export const nameSchema = nameLike
  .refine((value) => value.length >= 1, { message: 'Nom requis.' })
  .refine((value) => value.length <= 48, { message: 'Trop long (48 caractères maximum).' });

export const optionalNameSchema = nameLike
  .refine((value) => value.length <= 48, { message: 'Trop long (48 caractères maximum).' })
  .transform((value) => (value === '' ? undefined : value));

export const loginSchema = z.object({
  password: z.string().min(1, 'Mot de passe requis.'),
});

export const pairSchema = z.object({
  phoneNumber: phoneSchema,
  adminNumber: optionalPhoneSchema,
  adminName: optionalNameSchema,
  prefix: prefixSchema.optional(),
  stickerName: optionalNameSchema,
  stickerAuthor: optionalNameSchema,
  botName: optionalNameSchema,
});

/**
 * Variantes "settings" : une chaîne vide est conservée telle quelle afin de
 * permettre l'EFFACEMENT d'une valeur depuis le dashboard (`undefined` =
 * champ non fourni = inchangé).
 */
const settingsNameSchema = nameLike.refine((value) => value.length <= 48, {
  message: 'Trop long (48 caractères maximum).',
});

const settingsPhoneSchema = phoneLike
  .refine((value) => value === '' || normalizePhone(value) !== null, { message: INVALID_PHONE })
  .transform((value) => (value === '' ? '' : normalizePhone(value)));

export const settingsSchema = z
  .object({
    botName: settingsNameSchema.optional(),
    prefix: prefixSchema.optional(),
    stickerName: settingsNameSchema.optional(),
    stickerAuthor: settingsNameSchema.optional(),
    adminNumber: settingsPhoneSchema.optional(),
    adminName: settingsNameSchema.optional(),
    autoReconnect: z.boolean().optional(),
  })
  .strict();

export const sessionIdSchema = z
  .string()
  .trim()
  .refine((value) => value.startsWith(SESSION_ID_PREFIX), {
    message: `Une Session ID doit commencer par ${SESSION_ID_PREFIX}`,
  });

export const broadcastSchema = z.object({
  text: z.string().trim().min(1).max(4000).optional(),
  target: z.enum(['all', 'groups', 'private']).optional(),
});

/** Traduit une ZodError en message lisible (utilisé par l'API et le bot). */
export function formatZodError(error) {
  if (!error?.issues?.length) return 'Données invalides.';
  const lines = error.issues.slice(0, 6).map((issue) => {
    const field = issue.path.length ? issue.path.join('.') : 'champ';
    return `• ${field} : ${issue.message}`;
  });
  return lines.join('\n');
}

export function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const error = new Error(formatZodError(result.error));
    error.name = 'ValidationError';
    error.issues = result.error.issues;
    throw error;
  }
  return result.data;
}

/**
 * Version "bot" : transforme une erreur de validation en message WhatsApp
 * directement affichable à l'utilisateur.
 */
export function parseOrBotError(schema, data, usage) {
  try {
    return parse(schema, data);
  } catch (error) {
    const detail = error.issues?.[0]?.message || error.message;
    throw new BotError(`❌ ${detail}${usage ? `\n\nUsage : \`${usage}\`` : ''}`);
  }
}

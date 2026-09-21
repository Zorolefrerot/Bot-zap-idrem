/** Formate une durée (ms) en "3j 4h 12m 09s". */
export function formatUptime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0s';
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  const parts = [];
  if (days) parts.push(`${days}j`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

export function formatDate(value = Date.now()) {
  try {
    return new Date(value).toISOString().replace('T', ' ').slice(0, 19);
  } catch {
    return String(value);
  }
}

/** "ABCD1234" -> "ABCD-1234" */
export function formatPairCode(code) {
  const clean = String(code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (clean.length === 8) return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  return clean;
}

/** "243970000000" -> "+243 970 000 000" (groupement simple pour l'affichage). */
export function formatPhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return '';

  const cc = digits.slice(0, Math.min(3, digits.length));
  const rest = digits.slice(cc.length);
  const chunks = rest.match(/.{1,3}/g) || [];
  return ['+' + cc, ...chunks].join(' ').trim();
}

export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '0 o';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Masque un numéro : 243970000000 -> 243••••••000 */
export function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length <= 6) return '•'.repeat(digits.length);
  return `${digits.slice(0, 3)}${'•'.repeat(Math.max(4, digits.length - 6))}${digits.slice(-3)}`;
}

export function escapeMarkdown(text) {
  return String(text ?? '').replace(/([*_~`])/g, '\\$1');
}

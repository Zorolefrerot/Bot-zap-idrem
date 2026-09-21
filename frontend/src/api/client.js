/**
 * Client API IDREM TERESHKOVA BOT.
 *
 * `VITE_API_URL` permet d'héberger le frontend séparément (GitHub Pages,
 * Vercel...) ; laissé vide, l'API est appelée en same-origin (déploiement
 * unique sur Render / Railway / VPS).
 *
 * Aucune donnée WhatsApp n'est manipulée ici : uniquement des métadonnées
 * et la Session ID (référence opaque).
 */

const RAW_API_URL = import.meta.env.VITE_API_URL ?? '';
export const API_URL = String(RAW_API_URL).replace(/\/+$/, '');

const TOKEN_KEY = 'idrem.dashboard.token';

export function getAuthToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* stockage indisponible (navigation privée) : le cookie prend le relais */
  }
}

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  get isUnauthorized() {
    return this.status === 401;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
      signal,
    });
  } catch (error) {
    throw new ApiError(0, 'Serveur injoignable. Vérifiez l’URL de l’API (VITE_API_URL).');
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new ApiError(response.status, data?.error?.message || `Erreur HTTP ${response.status}`, data?.error?.details);
  }

  return data;
}

export const api = {
  health: () => request('/api/health'),
  me: () => request('/api/auth/me'),
  login: (password) => request('/api/auth/login', { method: 'POST', body: { password } }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),

  pair: (payload) => request('/api/pair', { method: 'POST', body: payload }),
  pairInfo: () => request('/api/pair'),
  status: () => request('/api/status'),
  session: () => request('/api/session'),
  regenerateSession: () => request('/api/session/regenerate', { method: 'POST', body: {} }),

  reconnect: () => request('/api/reconnect', { method: 'POST', body: {} }),
  disconnect: (logout = true) => request('/api/disconnect', { method: 'POST', body: { logout } }),
  qr: () => request('/api/qr'),

  getConfig: () => request('/api/config'),
  updateConfig: (payload) => request('/api/config', { method: 'POST', body: payload }),

  commands: () => request('/api/commands'),
  logs: (limit = 60) => request(`/api/logs?limit=${limit}`),
};

export default api;

'use strict';
/*
 * 🧬 MeR~NeL — services/aiPool.js
 * Pool d'IA « texte » SANS clé obligatoire, avec ROTATION automatique :
 * si un fournisseur tombe (panne, timeout, 429), le suivant prend le relais.
 * Le point de départ tourne à chaque appel (round-robin) pour répartir la
 * charge. Aucune clé n'est requise : les clés publiques/optionnelles restent
 * dans la config.
 */

const config = require('../core/config');

function createAiPool(logger, opts = {}) {
  const fetchImpl = opts.fetchImpl || global.fetch;
  let rotationIndex = 0;

  function typedError(code, message) {
    const e = new Error(message || code);
    e.code = code;
    return e;
  }

  /* Retire d'éventuelles balises résiduelles d'un texte censé être du texte. */
  function stripHtml(text) {
    const out = String(text).replace(/<\/(?:p|div|br|h[1-6]|li)>\s*/gi, '\n').replace(/<br\s*\/?>/gi, '\n');
    return out
      .replace(/<[^>]{1,200}>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#\d{1,5};/g, '')
      .trim();
  }

  /* Extrait le texte d'une réponse JSON hétérogène (commun aux fournisseurs). */
  function extractText(data) {
    if (typeof data === 'string') return data.trim() ? data.trim() : null;
    if (!data || typeof data !== 'object') return null;
    for (const key of ['content', 'response', 'answer', 'result', 'message', 'text', 'data']) {
      if (typeof data[key] === 'string' && data[key].trim()) return data[key].trim();
    }
    if (data.data && typeof data.data === 'object' && typeof data.data.content === 'string') {
      return data.data.content.trim();
    }
    return null;
  }

  async function httpText(url, { method = 'GET', body = null, timeoutMs = 25000, headers = null } = {}) {
    let res;
    try {
      res = await fetchImpl(url, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
        headers: headers || (body ? { 'Content-Type': 'application/json' } : { Accept: '*/*' }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) throw typedError('API_TIMEOUT');
      throw typedError('API_UNREACHABLE');
    }
    if (!res.ok) throw typedError(res.status === 429 ? 'AI_RATE_LIMIT' : 'AI_UNAVAILABLE', `HTTP ${res.status}`);
    const contentType = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
    // 🚫 Page d'erreur HTML (clé morte, 429 en HTML, gateway…) → JAMAIS envoyée
    // dans le chat : erreur typée → le fournisseur suivant prend le relais.
    if (contentType.includes('text/html')) throw typedError('AI_BAD_RESPONSE', 'page HTML au lieu du texte');
    if (contentType.includes('application/json')) {
      const data = await res.json().catch(() => null);
      const text = extractText(data);
      if (!text) throw typedError('AI_BAD_RESPONSE');
      return stripHtml(text);
    }
    const raw = (await res.text().catch(() => '')) || '';
    if (!raw.trim()) throw typedError('AI_BAD_RESPONSE');
    // Corps HTML déguisé en texte brut → même traitement.
    if (/\s*<(?:!doctype|html|[\w-]+:[\w-]+)[\s>]/i.test(raw) || /<\/html>/i.test(raw)) {
      throw typedError('AI_BAD_RESPONSE', 'page HTML au lieu du texte');
    }
    return stripHtml(raw.trim());
  }

  /*
   * Fournisseurs — tous utilisables SANS clé personnelle.
   * `full` = question (+ persona éventuellement déjà fusionnée).
   */
  const PROVIDERS = [
    {
      name: 'gemini-proxy',
      label: 'Gemini (proxy)',
      ask: (full) =>
        httpText(config.geminiChatUrl, {
          method: 'POST',
          body: { q: full },
          timeoutMs: config.chatTimeoutMs,
        }),
    },
    {
      name: 'pollinations',
      label: 'Pollinations',
      ask: (full) => httpText(`https://text.pollinations.ai/${encodeURIComponent(full)}`, { timeoutMs: 30000 }),
    },
    {
      name: 'shizo',
      label: 'Shizo',
      ask: (full) => {
        const url = new URL(config.shizo.baseUrl);
        url.searchParams.set('apikey', config.shizo.apiKey);
        url.searchParams.set('q', full);
        return httpText(url, { timeoutMs: config.shizo.timeoutMs });
      },
    },
    {
      name: 'paxsenix',
      label: 'Paxsenix',
      ask: (full) =>
        httpText(`https://api.paxsenix.biz.id/ai/gpt4o?q=${encodeURIComponent(full)}`, { timeoutMs: 30000 }),
    },
    {
      name: 'ryzendesu',
      label: 'Ryzendesu',
      ask: (full) =>
        httpText(`https://api.ryzendesu.vip/api/ai/gpt?text=${encodeURIComponent(full)}`, { timeoutMs: 30000 }),
    },
  ];

  /**
   * Pose une question avec rotation automatique des fournisseurs.
   * @param {string} question question validée
   * @param {{system?: string}} opts persona éventuelle
   * @returns {Promise<{text: string, provider: string}>}
   */
  async function ask(question, opts = {}) {
    if (!question || !String(question).trim()) throw typedError('AI_EMPTY_QUESTION');
    const full = opts.system ? `${opts.system}\n\nQuestion : ${question}` : question;

    const order = [];
    for (let i = 0; i < PROVIDERS.length; i++) {
      order.push(PROVIDERS[(rotationIndex + i) % PROVIDERS.length]);
    }

    const errors = [];
    for (const provider of order) {
      try {
        const text = await provider.ask(full);
        rotationIndex = (PROVIDERS.indexOf(provider) + 1) % PROVIDERS.length; // le suivant démarre
        return { text, provider: provider.label || provider.name };
      } catch (err) {
        errors.push(`${provider.name}:${err.code || err.message}`);
        logger.warn(`[aiPool] ${provider.name} indisponible → fournisseur suivant (${err.code || err.message})`);
      }
    }
    throw typedError('AI_ALL_PROVIDERS_DOWN', `Tous les fournisseurs IA sont indisposables (${errors.join(', ')})`);
  }

  function providersList() {
    return PROVIDERS.map((p) => p.label || p.name);
  }

  return { ask, providersList };
}

module.exports = { createAiPool };

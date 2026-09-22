'use strict';
/*
 * 🧬 MeR~NeL — services/ai.js
 * Toutes les requêtes IA « ponctuelles » (Xask / Xai) passent par ici.
 * Double source : shizo (primaire) → bascule automatique sur le proxy
 * Gemini (secondaire) si le primaire est indisponible.
 * Les clés API n'apparaissent jamais dans un message utilisateur ou une erreur.
 */

const config = require('../core/config');

function createAiService(logger) {
  function extractText(data) {
    if (typeof data === 'string') return data;
    if (!data || typeof data !== 'object') return null;
    if (typeof data.content === 'string') return data.content;
    if (typeof data.response === 'string') return data.response;
    if (typeof data.answer === 'string') return data.answer;
    if (typeof data.result === 'string') return data.result;
    if (typeof data.message === 'string') return data.message;
    if (data.data && typeof data.data.content === 'string') return data.data.content;
    return null;
  }

  function typedError(code, message) {
    const e = new Error(message || code);
    e.code = code;
    return e;
  }

  /* ── Source primaire : shizo GPT ── */
  async function askShizo(question, opts = {}) {
    const url = new URL(config.shizo.baseUrl);
    url.searchParams.set('apikey', config.shizo.apiKey);
    url.searchParams.set(
      'q',
      opts.mode === 'advanced'
        ? `Tu es ${config.botName}, une IA futuriste calme et brillante. Réponds en français de façon structurée et utile. Question : ${question}`
        : question
    );
    let res;
    try {
      res = await fetch(url, {
        signal: AbortSignal.timeout(config.shizo.timeoutMs),
        headers: { Accept: 'application/json' },
      });
    } catch (err) {
      if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) throw typedError('API_TIMEOUT');
      throw typedError('API_UNREACHABLE');
    }
    if (!res.ok) throw typedError(res.status === 429 ? 'AI_RATE_LIMIT' : 'AI_UNAVAILABLE', `HTTP ${res.status}`);
    let data;
    try {
      data = await res.json();
    } catch (_) {
      throw typedError('AI_BAD_RESPONSE');
    }
    const text = extractText(data);
    if (!text || !String(text).trim()) throw typedError('AI_BAD_RESPONSE');
    return String(text).trim();
  }

  /* ── Source secondaire : proxy Gemini ── */
  async function askGemini(question, opts = {}) {
    const prompt =
      opts.mode === 'advanced'
        ? `Tu es ${config.botName}, une IA futuriste calme et brillante. Réponds en français de façon structurée et utile. Question : ${question}`
        : question;
    let res;
    try {
      res = await fetch(config.geminiChatUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: prompt }),
        signal: AbortSignal.timeout(config.chatTimeoutMs),
      });
    } catch (err) {
      if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) throw typedError('API_TIMEOUT');
      throw typedError('API_UNREACHABLE');
    }
    if (!res.ok) throw typedError(res.status === 429 ? 'AI_RATE_LIMIT' : 'AI_UNAVAILABLE', `HTTP ${res.status}`);
    const contentType = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
    let text = null;
    if (contentType.includes('application/json')) {
      const data = await res.json().catch(() => null);
      text = extractText(data);
    } else {
      const raw = await res.text().catch(() => '');
      if (raw.trim()) text = raw.trim();
    }
    if (!text || !String(text).trim()) throw typedError('AI_BAD_RESPONSE');
    return String(text).trim();
  }

  /**
   * Pose une question à l'IA — bascule automatique shizo → Gemini.
   * @param {string} question question validée (sanitizée en amont)
   * @param {{mode?: 'short'|'advanced'}} opts
   * @returns {Promise<string>} texte de réponse
   */
  async function ask(question, opts = {}) {
    if (!question || !question.trim()) throw typedError('AI_EMPTY_QUESTION');
    try {
      return await askShizo(question, opts);
    } catch (shizoErr) {
      // L'API GPT ne répond pas → bascule transparente sur Gemini.
      logger.warn('[ai] shizo indisponible (' + (shizoErr.code || shizoErr.message) + ') → bascule Gemini.');
      try {
        return await askGemini(question, opts);
      } catch (geminiErr) {
        logger.error('[ai] gemini aussi indisponible (' + (geminiErr.code || geminiErr.message) + ').');
        // Les deux sources sont en panne : erreur typée du primaire.
        throw shizoErr;
      }
    }
  }

  return { ask };
}

module.exports = { createAiService };

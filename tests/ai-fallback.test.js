'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

/* Logger muet pour les tests */
const silentLogger = { warn() {}, error() {}, info() {} };

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

const realFetch = globalThis.fetch;

test('Xask : shizo répond → pas de bascule', async () => {
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    assert.ok(String(url).includes('api.shizo.top'), '1er appel = shizo');
    return jsonResponse({ content: 'Tokyo' });
  };
  const { createAiService } = require('../services/ai');
  const ai = createAiService(silentLogger);
  const answer = await ai.ask('capitale du Japon ?');
  assert.strictEqual(answer, 'Tokyo');
  assert.strictEqual(calls, 1);
  globalThis.fetch = realFetch;
});

test('Xask : shizo en panne → bascule automatique sur Gemini', async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push(String(url));
    if (String(url).includes('api.shizo.top')) {
      // Timeout simulé côté shizo
      const e = new Error('The operation was aborted due to timeout');
      e.name = 'TimeoutError';
      throw e;
    }
    assert.ok(String(url).includes('gemini-proxy2'), '2e appel = gemini-proxy2');
    assert.strictEqual(init.method, 'POST');
    assert.ok(String(init.body).includes('capitale du Japon'), 'la question est transmise');
    return jsonResponse({ response: 'Tokyo, Japon.' });
  };
  const { createAiService } = require('../services/ai');
  const ai = createAiService(silentLogger);
  const answer = await ai.ask('capitale du Japon ?', { mode: 'short' });
  assert.strictEqual(answer, 'Tokyo, Japon.');
  assert.strictEqual(calls.length, 2);
  globalThis.fetch = realFetch;
});

test('Xask : les deux sources en panne → erreur typée propre', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes('api.shizo.top')) {
      const e = new Error('boom');
      e.name = 'TimeoutError';
      throw e;
    }
    return { ok: false, status: 503, headers: { get: () => 'text/plain' }, text: async () => 'down' };
  };
  const { createAiService } = require('../services/ai');
  const ai = createAiService(silentLogger);
  await assert.rejects(() => ai.ask('test'), /API_TIMEOUT/);
  globalThis.fetch = realFetch;
});

test('Xai mode avancé : le prompt persona est bien transmis', async () => {
  globalThis.fetch = async (url, init = {}) => {
    assert.ok(String(init.body).includes('futuriste'), 'persona avancé présent');
    return jsonResponse({ content: 'Explication complète.' });
  };
  const { createAiService } = require('../services/ai');
  const ai = createAiService(silentLogger);
  const answer = await ai.ask('explique les trous noirs', { mode: 'advanced' });
  assert.strictEqual(answer, 'Explication complète.');
  globalThis.fetch = realFetch;
});

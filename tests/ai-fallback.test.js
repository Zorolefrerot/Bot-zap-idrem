'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { createAiPool } = require('../services/aiPool');
const { createAiService } = require('../services/ai');

/* Logger muet pour les tests */
const silentLogger = { warn() {}, error() {}, info() {}, debug() {} };

function jsonRes(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

test('Pool IA : le 1er fournisseur (gemini-proxy2) répond → pas de bascule', async () => {
  let calls = 0;
  const fetchImpl = async (url, init = {}) => {
    calls++;
    assert.ok(String(url).includes('gemini-proxy2'), '1er appel = gemini-proxy2');
    assert.strictEqual(init.method, 'POST');
    assert.ok(String(init.body).includes('capitale du Japon'), 'question transmise dans {q}');
    return jsonRes({ response: 'Tokyo, Japon.' });
  };
  const pool = createAiPool(silentLogger, { fetchImpl });
  const res = await pool.ask('capitale du Japon ?');
  assert.strictEqual(res.text, 'Tokyo, Japon.');
  assert.strictEqual(res.provider, 'Gemini (proxy)');
  assert.strictEqual(calls, 1);
});

test('Pool IA : fournisseur en panne → bascule automatique sur le suivant', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push(String(url));
    if (String(url).includes('gemini-proxy2')) {
      const e = new Error('The operation was aborted due to timeout');
      e.name = 'TimeoutError';
      throw e;
    }
    assert.ok(String(url).includes('text.pollinations.ai'), '2e appel = pollinations');
    void init;
    return jsonRes({ response: 'Tokyo !' });
  };
  const pool = createAiPool(silentLogger, { fetchImpl });
  const res = await pool.ask('capitale du Japon ?', { system: 'réponds court' });
  assert.strictEqual(res.text, 'Tokyo !');
  assert.strictEqual(res.provider, 'Pollinations');
  assert.strictEqual(calls.length, 2);
});

test('Pool IA : tous en panne → erreur typée AI_ALL_PROVIDERS_DOWN', async () => {
  const fetchImpl = async () => {
    throw new Error('ECONNREFUSED');
  };
  const pool = createAiPool(silentLogger, { fetchImpl });
  await assert.rejects(() => pool.ask('test'), (err) => err.code === 'AI_ALL_PROVIDERS_DOWN');
});

test('Service IA : ask() enveloppe le pool et renvoie le texte', async () => {
  const fetchImpl = async (url) => {
    assert.ok(String(url).includes('gemini-proxy2'));
    return jsonRes({ content: 'Réponse courte.' });
  };
  const pool = createAiPool(silentLogger, { fetchImpl });
  const ai = createAiService(silentLogger, pool);
  const answer = await ai.ask('salut', { mode: 'short' });
  assert.strictEqual(answer, 'Réponse courte.');
});

test('Service IA : mode avancé → la persona est transmise au pool', async () => {
  const fetchImpl = async (url, init = {}) => {
    assert.ok(String(init.body).includes('futuriste'), 'persona avancée présente dans la requête');
    return jsonRes({ content: 'Explication complète.' });
  };
  const pool = createAiPool(silentLogger, { fetchImpl });
  const ai = createAiService(silentLogger, pool);
  const answer = await ai.ask('explique les trous noirs', { mode: 'advanced' });
  assert.strictEqual(answer, 'Explication complète.');
});

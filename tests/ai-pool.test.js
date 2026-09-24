'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { createAiPool } = require('../services/aiPool');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };

function jsonRes(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function stubFetch(routes) {
  /* routes : [[pattern, make]] ; toute autre URL → erreur réseau */
  return async (url, opts = {}) => {
    void opts;
    for (const [pattern, make] of routes) {
      if (String(url).includes(pattern)) return make();
    }
    throw new Error('ECONNREFUSED');
  };
}

test('aiPool : le 1er fournisseur en panne → rotation vers le suivant', async () => {
  const calls = [];
  const fetchImpl = stubFetch([
    ['gemini-proxy2', () => { calls.push('gemini'); throw new Error('down'); }],
    ['pollinations', () => { calls.push('pollinations'); return jsonRes({ response: 'salut !' }); }],
  ]);
  const pool = createAiPool(noopLogger, { fetchImpl, timeoutMs: 500 });
  const res = await pool.ask('bonjour');
  assert.strictEqual(res.provider, 'Pollinations');
  assert.strictEqual(res.text, 'salut !');
  assert.ok(calls.includes('gemini') && calls.includes('pollinations'), `ordre de rotation: ${calls.join('→')}`);
});

test('aiPool : rotation round-robin — la charge est répartie entre fournisseurs', async () => {
  const hits = [];
  const fetchImpl = stubFetch([
    ['gemini-proxy2', () => { hits.push('gemini'); return jsonRes({ content: 'G' }); }],
    ['pollinations', () => { hits.push('poll'); return jsonRes({ response: 'P' }); }],
  ]);
  const pool = createAiPool(noopLogger, { fetchImpl, timeoutMs: 500 });
  const r1 = await pool.ask('un');
  const r2 = await pool.ask('deux');
  const r3 = await pool.ask('trois');
  assert.strictEqual(r1.provider, 'Gemini (proxy)');
  assert.strictEqual(r2.provider, 'Pollinations'); // rotation après chaque succès
  assert.strictEqual(r3.provider, 'Gemini (proxy)');
  assert.deepStrictEqual(hits, ['gemini', 'poll', 'gemini']);
});

test('aiPool : TOUS les fournisseurs en panne → erreur typée AI_ALL_PROVIDERS_DOWN', async () => {
  const pool = createAiPool(noopLogger, { fetchImpl: stubFetch([]), timeoutMs: 300 });
  await assert.rejects(() => pool.ask('test'), (err) => err.code === 'AI_ALL_PROVIDERS_DOWN');
});

test('aiPool : réponse 429 partout → AI_ALL_PROVIDERS_DOWN (rate limit géré)', async () => {
  const fetchImpl = stubFetch([
    ['gemini', () => jsonRes({}, 429)],
    ['pollinations', () => jsonRes({}, 429)],
    ['shizo', () => jsonRes({}, 429)],
    ['paxsenix', () => jsonRes({}, 429)],
    ['ryzendesu', () => jsonRes({}, 429)],
  ]);
  const pool = createAiPool(noopLogger, { fetchImpl, timeoutMs: 300 });
  await assert.rejects(() => pool.ask('test'), (err) => err.code === 'AI_ALL_PROVIDERS_DOWN');
});

test('aiPool : 5 fournisseurs déclarés (gemini-proxy + pollinations + shizo + paxsenix + ryzendesu)', () => {
  const pool = createAiPool(noopLogger, { fetchImpl: stubFetch([]), timeoutMs: 100 });
  const list = pool.providersList();
  assert.strictEqual(list.length, 5);
  assert.ok(list.some((p) => /Gemini/i.test(p)));
  assert.ok(list.some((p) => /Pollinations/i.test(p)));
  assert.ok(list.some((p) => /Shizo/i.test(p)));
  assert.ok(list.some((p) => /Paxsenix/i.test(p)));
  assert.ok(list.some((p) => /Ryzendesu/i.test(p)));
});

test('aiPool : page HTML (clé morte / 429 HTML) → JAMAIS renvoyée, rotation vers le suivant', async () => {
  const calls = [];
  const htmlRes = {
    ok: true,
    status: 200,
    headers: { get: () => 'text/html; charset=utf-8' },
    json: async () => { throw new Error('pas du JSON'); },
    text: async () => '<html><body>Error 429 — quota exceeded</body></html>',
  };
  const fetchImpl = stubFetch([
    ['gemini-proxy2', () => { calls.push('gemini-html'); return htmlRes; }],
    ['pollinations', () => { calls.push('poll'); return jsonRes({ response: 'vraie réponse' }); }],
  ]);
  const pool = createAiPool(noopLogger, { fetchImpl, timeoutMs: 500 });
  const res = await pool.ask('salut');
  assert.strictEqual(res.text, 'vraie réponse');
  assert.strictEqual(res.provider, 'Pollinations');
  assert.deepStrictEqual(calls, ['gemini-html', 'poll'], 'le fournisseur HTML a été contourné');
});

test('aiPool : corps HTML déguisé en text/plain → rejeté aussi', async () => {
  const plainHtml = {
    ok: true,
    status: 200,
    headers: { get: () => 'text/plain' },
    json: async () => { throw new Error('pas du JSON'); },
    text: async () => '<!DOCTYPE html><html><body><h1>Service unavailable</h1></body></html>',
  };
  const fetchImpl = stubFetch([
    ['gemini-proxy2', () => plainHtml],
    ['pollinations', () => jsonRes({ response: 'ok texte propre' })],
  ]);
  const pool = createAiPool(noopLogger, { fetchImpl, timeoutMs: 500 });
  const res = await pool.ask('test');
  assert.strictEqual(res.text, 'ok texte propre');
});

test('aiPool : si le fournisseur en tête échoue, on repart du suivant SANS le rater', async () => {
  // gemini réussit une fois puis tombe → la rotation doit passer à pollinations
  let geminiUp = true;
  const fetchImpl = stubFetch([
    ['gemini-proxy2', () => { if (geminiUp) return jsonRes({ content: 'ok' }); throw new Error('crash'); }],
    ['pollinations', () => jsonRes({ response: 'fallback ok' })],
  ]);
  const pool = createAiPool(noopLogger, { fetchImpl, timeoutMs: 400 });
  const r1 = await pool.ask('a');
  assert.strictEqual(r1.provider, 'Gemini (proxy)');
  geminiUp = false;
  const r2 = await pool.ask('b');
  assert.strictEqual(r2.provider, 'Pollinations');
});

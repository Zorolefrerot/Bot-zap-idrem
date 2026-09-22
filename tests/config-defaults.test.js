'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

test('valeurs par défaut intégrées : le bot tourne sans .env (seul APPSTATE_JSON requis)', () => {
  // Simuler un environnement Render vierge
  const savedAdmin = process.env.ADMIN_UIDS;
  const savedOwner = process.env.OWNER_UID;
  const savedAgnes = process.env.AGNES_API_KEY;
  delete process.env.ADMIN_UIDS;
  delete process.env.OWNER_UID;
  delete process.env.AGNES_API_KEY;
  delete require.cache[require.resolve('../core/config')];

  try {
    const cfg = require('../core/config');
    assert.deepStrictEqual(cfg.adminUids, ['61569333774600', '100065927401614']);
    assert.strictEqual(cfg.ownerUid, '100065927401614');
    assert.strictEqual(cfg.isAdmin('61569333774600'), true);
    assert.strictEqual(cfg.isAdmin('100065927401614'), true);
    // Clé Agnes par défaut intégrée → Ximg disponible sans variable
    assert.strictEqual(cfg.agnes.hasKey(), true);
    // URLs par défaut présentes
    assert.strictEqual(cfg.geminiChatUrl, 'https://arychauhann.onrender.com/api/gemini-proxy2');
    assert.strictEqual(cfg.shizo.baseUrl, 'https://api.shizo.top/ai/gpt');
    assert.strictEqual(cfg.agnes.baseUrl, 'https://apihub.agnes-ai.com/v1');
    assert.strictEqual(cfg.economy.dailyReward, 350);
    assert.strictEqual(cfg.prefix, 'X');
  } finally {
    // Restaurer l'environnement et le module pour les tests suivants
    if (savedAdmin !== undefined) process.env.ADMIN_UIDS = savedAdmin;
    if (savedOwner !== undefined) process.env.OWNER_UID = savedOwner;
    if (savedAgnes !== undefined) process.env.AGNES_API_KEY = savedAgnes;
    delete require.cache[require.resolve('../core/config')];
    require('../core/config');
  }
});

test('surcharge par .env toujours possible (ADMIN_UIDS gagne toujours)', () => {
  const savedAdmin = process.env.ADMIN_UIDS;
  process.env.ADMIN_UIDS = '99999';
  delete require.cache[require.resolve('../core/config')];
  try {
    const cfg = require('../core/config');
    assert.deepStrictEqual(cfg.adminUids, ['99999']);
  } finally {
    if (savedAdmin !== undefined) process.env.ADMIN_UIDS = savedAdmin;
    else delete process.env.ADMIN_UIDS;
    delete require.cache[require.resolve('../core/config')];
    require('../core/config');
  }
});

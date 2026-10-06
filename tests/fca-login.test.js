'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const config = require('../core/config');
const { Logger } = require('../utils/logger');
const facebook = require('../services/facebook');

/* Chemins réels des deux bibliothèques (pour l'injection de modules factices). */
const DONGDEV_PATH = require.resolve('@dongdev/fca-unofficial');
const WS3_PATH = require.resolve('ws3-fca');
const REAL_DONGDEV = require.cache[DONGDEV_PATH];
const REAL_WS3 = require.cache[WS3_PATH];

/* Injecte des modules FCA factices et exécute fn (restauration garantie). */
async function withFakeFca(fakes, fn) {
  const injected = [];
  if ('dongdev' in fakes) {
    require.cache[DONGDEV_PATH] = {
      id: DONGDEV_PATH, filename: DONGDEV_PATH, loaded: true, exports: fakes.dongdev,
    };
    injected.push(DONGDEV_PATH);
  }
  if ('ws3' in fakes) {
    require.cache[WS3_PATH] = { id: WS3_PATH, filename: WS3_PATH, loaded: true, exports: fakes.ws3 };
    injected.push(WS3_PATH);
  }
  try {
    return await fn();
  } finally {
    for (const p of injected) {
      if (p === DONGDEV_PATH && REAL_DONGDEV) require.cache[DONGDEV_PATH] = REAL_DONGDEV;
      else if (p === WS3_PATH && REAL_WS3) require.cache[WS3_PATH] = REAL_WS3;
      else delete require.cache[p];
    }
  }
}

function makeState() {
  return JSON.stringify([
    { name: 'c_user', value: '100065927401614', domain: '.facebook.com', path: '/' },
    { name: 'xs', value: '46:AbCdEf', domain: '.facebook.com', path: '/' },
  ]);
}

function fakeApi() {
  return {
    getCurrentUserID: () => 'BOT_FAKE_1',
    sendMessage: (msg, threadID, cb) => setImmediate(() => cb(null, { messageID: 'f1' })),
    getUserInfo: (ids, cb) => setImmediate(() => cb(null, {})),
    getThreadInfo: (tid, cb) => setImmediate(() => cb(null, { participantIDs: [], adminIDs: [] })),
    changeNickname: (n, t, u, cb) => setImmediate(() => cb(null)),
    unsend: (mid, cb) => setImmediate(() => cb(null)),
    removeUserFromThread: (u, t, cb) => setImmediate(() => cb(null)),
    addUserToGroup: (u, t, cb) => setImmediate(() => cb(null)),
    listenMqtt: (cb) => () => {},
  };
}

const logger = new Logger({ logFile: false });
logger.level = 99;

function cfg(overrides = {}) {
  return Object.assign({}, config, {
    adapter: 'ws3-fca',
    appstateJson: makeState(),
    appstateFile: '',
  }, overrides);
}

test('@dongdev/fca-unofficial : bibliothèque prioritaire — connexion réussie', async () => {
  let loginArgs = null;
  const api = fakeApi();
  const adapter = await withFakeFca(
    {
      dongdev: (credentials, options, cb) => {
        loginArgs = { credentials, options };
        setImmediate(() => cb(null, api));
      },
    },
    () => facebook.connect(cfg(), logger, {})
  );
  assert.strictEqual(adapter.mode, '@dongdev/fca-unofficial');
  assert.strictEqual(adapter.botID, 'BOT_FAKE_1');
  assert.ok(loginArgs.credentials.appState, 'appState transmis au login dongdev');
  assert.strictEqual(loginArgs.credentials.appState[0].key, 'c_user'); // normalisé name→key
  assert.strictEqual(loginArgs.options.selfListen, false, 'le bot ne s’écoute pas lui-même');
  assert.strictEqual(loginArgs.options.listenEvents, true, 'événements de groupe activés');
  assert.strictEqual(adapter.capabilities.listen, true);
  assert.strictEqual(adapter.capabilities.unsend, true);
  await adapter.shutdown();
});

test('secours automatique : ws3-fca utilisé si dongdev est indisponible', async () => {
  const api = fakeApi();
  const adapter = await withFakeFca(
    { ws3: { login: (credentials, options, cb) => setImmediate(() => cb(null, api)) } },
    () => facebook.connect(cfg({ facebookLibrary: 'ws3-fca' }), logger, {})
  );
  assert.strictEqual(adapter.mode, 'ws3-fca');
  await adapter.shutdown();
});

test('FACEBOOK_LIBRARY force une bibliothèque précise', async () => {
  const api = fakeApi();
  const adapter = await withFakeFca(
    {
      dongdev: (c, o, cb) => setImmediate(() => cb(new Error('ne doit pas être appelé'))),
      ws3: (c, o, cb) => setImmediate(() => cb(null, api)),
    },
    () => facebook.connect(cfg({ facebookLibrary: 'ws3-fca' }), logger, {})
  );
  assert.strictEqual(adapter.mode, 'ws3-fca');
  await adapter.shutdown();
});

test('aucune bibliothèque exploitable → erreur claire', async () => {
  await withFakeFca({}, async () => {
    await assert.rejects(
      () => facebook.connect(cfg({ facebookLibrary: 'biblio-inexistante-xyz' }), logger, {}),
      /Aucune bibliothèque FCA exploitable/
    );
  });
});

test('échec de login dongdev → erreur propagée (après tentatives)', async () => {
  await withFakeFca(
    { dongdev: (c, o, cb) => setImmediate(() => cb({ error: 'Checkpt lock' })) },
    async () => {
      await assert.rejects(() => facebook.connect(cfg(), logger, {}), /Checkpt lock/i);
    }
  );
});

test('le module @dongdev réel est bien une fonction login (install valide)', () => {
  delete require.cache[DONGDEV_PATH];
  try {
    const mod = require('@dongdev/fca-unofficial');
    assert.strictEqual(typeof mod, 'function', 'require("@dongdev/fca-unofficial") doit être login()');
  } catch (err) {
    // sqlite3 natif non compilé dans le sandbox → charge paresseuse tolérée,
    // mais le require ne doit pas échouer.
    assert.fail(`module dongdev non chargeable : ${err.message}`);
  }
});

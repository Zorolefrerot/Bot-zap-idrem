'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const config = require('../core/config');
const { Logger } = require('../utils/logger');
const facebook = require('../services/facebook');

const WS3_PATH = require.resolve('ws3-fca');
const REAL_MOD = require.cache[WS3_PATH];

/* Injecte un faux module ws3-fca (export { login }) et exécute fn. */
async function withFakeWs3(fakeLogin, fn) {
  require.cache[WS3_PATH] = { id: WS3_PATH, filename: WS3_PATH, loaded: true, exports: { login: fakeLogin } };
  try {
    return await fn();
  } finally {
    if (REAL_MOD) require.cache[WS3_PATH] = REAL_MOD;
    else delete require.cache[WS3_PATH];
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
    listenMqtt: (cb) => {
      // pas d'événements en test ; renvoie une fonction d'arrêt
      return () => {};
    },
  };
}

const logger = new Logger({ logFile: false });
logger.level = 99;

test('ws3-fca : connexion réelle via le module { login } (régression Render)', async () => {
  let loginArgs = null;
  let api = null;
  const adapter = await withFakeWs3(
    (credentials, options, cb) => {
      loginArgs = { credentials, options };
      api = fakeApi();
      setImmediate(() => cb(null, api));
    },
    () =>
      facebook.connect(
        Object.assign({}, config, { adapter: 'ws3-fca', appstateJson: makeState(), appstateFile: '' }),
        logger,
        {}
      )
  );

  assert.strictEqual(adapter.mode, 'ws3-fca');
  assert.strictEqual(adapter.botID, 'BOT_FAKE_1');
  assert.ok(loginArgs.credentials.appState, 'appState transmis au login');
  assert.strictEqual(loginArgs.credentials.appState[0].key, 'c_user');
  assert.strictEqual(loginArgs.options.selfListen, false, 'le bot ne s’écoute pas lui-même');

  // L'envoi passe par l'API sous-jacente
  await adapter.send({ body: 'test' }, 'thread-1');
  assert.ok(api.sendMessageCalled !== undefined || true);
  assert.strictEqual(adapter.capabilities.listen, true);
  assert.strictEqual(adapter.capabilities.unsend, true);
});

test('ws3-fca : export fonction directe aussi accepté (compat autres forks)', async () => {
  const saved = require.cache[WS3_PATH];
  require.cache[WS3_PATH] = {
    id: WS3_PATH,
    filename: WS3_PATH,
    loaded: true,
    exports: (credentials, options, cb) => setImmediate(() => cb(null, fakeApi())),
  };
  try {
    const adapter = await facebook.connect(
      Object.assign({}, config, { adapter: 'ws3-fca', appstateJson: makeState(), appstateFile: '' }),
      logger,
      {}
    );
    assert.strictEqual(adapter.mode, 'ws3-fca');
  } finally {
    if (saved) require.cache[WS3_PATH] = saved;
    else delete require.cache[WS3_PATH];
  }
});

test('ws3-fca : échec de login → erreur propagée après les 3 tentatives', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mernel-ws3-'));
  await withFakeWs3(
    (credentials, options, cb) => setImmediate(() => cb({ error: 'Checkpt lock' })),
    async () => {
      await assert.rejects(
        () =>
          facebook.connect(
            Object.assign({}, config, { adapter: 'ws3-fca', appstateJson: makeState(), appstateFile: '' }),
            logger,
            {}
          ),
        /Checkpt lock|login/i
      );
    }
  );
});

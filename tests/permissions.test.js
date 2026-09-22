'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { isAdmin, isOwner } = require('../utils/permissions');
const config = require('../core/config');

test('isAdmin retourne true uniquement pour les UIDs autorisés', () => {
  assert.strictEqual(isAdmin('61569333774600'), true);
  assert.strictEqual(isAdmin('100065927401614'), true);
  assert.strictEqual(isAdmin('111111111111111'), false);
  assert.strictEqual(isAdmin(undefined), false);
  assert.strictEqual(isAdmin(''), false);
  assert.strictEqual(isOwner('100065927401614'), true);
  assert.strictEqual(isOwner('61569333774600'), false);
});

test('la liste admin supporte les espaces autour des virgules', () => {
  const original = process.env.ADMIN_UIDS;
  delete require.cache[require.resolve('../core/config')];
  process.env.ADMIN_UIDS = ' 12345 , 67890 ';
  const cfg2 = require('../core/config');
  assert.deepStrictEqual(cfg2.adminUids, ['12345', '67890']);
  assert.strictEqual(cfg2.isAdmin('12345'), true);
  assert.strictEqual(cfg2.isAdmin('67890'), true);
  assert.strictEqual(cfg2.isAdmin('99999'), false);
  process.env.ADMIN_UIDS = original;
  delete require.cache[require.resolve('../core/config')];
  require('../core/config'); // restaure
});

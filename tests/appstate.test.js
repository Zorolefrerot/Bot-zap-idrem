'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { readAppState, normalizeCookie } = require('../services/facebook');

const FULL_STATE = [
  { name: 'c_user', value: '100065927401614', domain: '.facebook.com', path: '/' },
  { name: 'xs', value: '46:AbCdEf123456', domain: '.facebook.com', path: '/' },
  { name: 'datr', value: 'XYZ123', domain: '.facebook.com', path: '/' },
];

test("normalizeCookie : export Cookie Editor (name) converti au format FCA (key)", () => {
  const out = normalizeCookie({ name: 'xs', value: 46, sameSite: 'no_restriction' });
  assert.strictEqual(out.key, 'xs');
  assert.strictEqual(out.value, '46'); // valeur convertie en chaîne
  assert.strictEqual(out.sameSite, 'none'); // valeur normalisée tough-cookie
  assert.ok(!('name' in out));
  assert.strictEqual(normalizeCookie(null), null);
  assert.strictEqual(normalizeCookie({ foo: 1 }), null);
});

test('readAppState : accepte le fichier appstate.json à la racine (format Cookie Editor)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mernel-state-'));
  const file = path.join(dir, 'appstate.json');
  fs.writeFileSync(file, JSON.stringify(FULL_STATE));
  const state = readAppState({ appstateFile: file, appstateJson: '' });
  assert.strictEqual(state.length, 3);
  assert.strictEqual(state[0].key, 'c_user');
});

test('readAppState : accepte APPSTATE_JSON sur une ligne', () => {
  const state = readAppState({ appstateFile: 'appstate.json', appstateJson: JSON.stringify(FULL_STATE) });
  assert.strictEqual(state[1].key, 'xs');
});

test('readAppState : accepte l’enveloppe {"cookies":[...]}', () => {
  const state = readAppState({ appstateFile: '', appstateJson: JSON.stringify({ cookies: FULL_STATE }) });
  assert.strictEqual(state.length, 3);
});

test('readAppState : erreur claire si cookies essentiels absents', () => {
  assert.throws(
    () => readAppState({ appstateFile: '', appstateJson: JSON.stringify([{ name: 'datr', value: 'x' }]) }),
    /c_user, xs/
  );
  assert.throws(() => readAppState({ appstateFile: '', appstateJson: '{oops' }), SyntaxError);
});

test('readAppState : erreur claire si aucun appstate fourni', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mernel-state2-'));
  assert.throws(
    () => readAppState({ root: dir, appstateFile: 'fichier-inexistant.json', appstateJson: '' }),
    /Aucun appstate trouvé/
  );
});

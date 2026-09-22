'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fmt = require('../utils/formatter');

test('bold transforme lettres et chiffres en Unicode gras', () => {
  assert.strictEqual(fmt.bold('abc'), '𝗮𝗯𝗰');
  assert.strictEqual(fmt.bold('XYZ'), '𝗫𝗬𝗭');
  assert.strictEqual(fmt.bold('350'), '𝟯𝟱𝟬');
  assert.strictEqual(fmt.bold('MeR~NeL'), '𝗠𝗲𝗥~𝗡𝗲𝗟');
  // Les accents sont conservés visuellement
  assert.ok(fmt.bold('Déjà').includes('𝗗'));
});

test('boldNum groupe les grands nombres', () => {
  assert.strictEqual(fmt.boldNum(350), '𝟯𝟱𝟬');
  assert.ok(fmt.boldNum(15400).includes('𝟭𝟱'));
});

test('frame produit un cadre avec titre gras et variantes', () => {
  const f1 = fmt.frame('XASK', 'réponse', { style: 0 });
  assert.ok(f1.includes('╭━━〔'));
  assert.ok(f1.includes('𝗫𝗔𝗦𝗞'));
  assert.ok(f1.includes('𝗠𝗲𝗥~𝗡𝗘𝗟'));
  const f2 = fmt.frame('XAI', ['ligne 1', 'ligne 2'], { style: 2, footer: null });
  assert.ok(f2.includes('┏━━〔'));
  assert.ok(!f2.includes('╰'));
});

test('progressBar remplit proportionnellement', () => {
  assert.strictEqual(fmt.progressBar(0, 100, 4), '▱▱▱▱');
  assert.strictEqual(fmt.progressBar(100, 100, 4), '▰▰▰▰');
  assert.strictEqual(fmt.progressBar(50, 100, 4), '▰▰▱▱');
});

test('answerMatches tolère casse, accents et faute légère', () => {
  assert.ok(fmt.answerMatches('Tokyo', 'Tokyo'));
  assert.ok(fmt.answerMatches('  tOkYo ! ', 'Tokyo'));
  assert.ok(fmt.answerMatches('Le Fémur', 'Le femur'));
  assert.ok(fmt.answerMatches('Monkey D Luffy', 'Monkey D. Luffy'));
  assert.ok(fmt.answerMatches('Kakashii', 'Kakashi')); // faute légère tolérée (mot long)
  assert.ok(!fmt.answerMatches('Osaka', 'Tokyo'));
  assert.ok(!fmt.answerMatches('a', 'b'));
});

test('normalizeAnswer supprime accents et ponctuation', () => {
  assert.strictEqual(fmt.normalizeAnswer('Écôle!'), 'ecole');
});

test('clean supprime caractères de contrôle et limite la longueur', () => {
  assert.strictEqual(fmt.clean('  salut\u0000\u001f  '), 'salut');
  assert.strictEqual(fmt.clean('x'.repeat(3000), 10).length, 10);
});

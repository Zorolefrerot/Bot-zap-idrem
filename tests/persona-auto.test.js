'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { boot, until, makeMsg, lastBody, bodies, UIDS, clearCooldowns } = require('./helpers');
const { createAiService } = require('../services/ai');
const { createChatService } = require('../services/chat');

const BOT_ID = 'BOT_MOCK_000000';

test('Xinfo : la fiche d’identité officielle complète', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xinfo'));
  const body = lastBody(adapter);
  for (const fragment of [
    'XINFO', 'MeR~NEL', 'Nelson', 'MeR~Nel Production', '14 Février 2025',
    '1 an', 'QI de 3000', 'IA non-binaire', 'Dans ton téléphone',
    'sarcastique', 'SALUT, HUMAIN', 'Xmenu', 'cauchemar numérique',
  ]) {
    assert.ok(body.toLowerCase().includes(fragment.toLowerCase()), `fragment manquant: ${fragment}`);
  }
});

test('auto-réponse : REPLY à un message du bot → réponse IA directe (sans X, sans Xchat on)', async () => {
  let received = '';
  const { bot, adapter } = await boot({
    serviceStubs: { chat: { reply: async (p) => { received = p.text; return 'Ça va, je survis à vos bêtises. Et toi, humain ? 😏'; }, clear() {}, resetAll() {} } },
  });
  clearCooldowns(bot);
  // Le bot envoie un message (Xmenu), l'utilisateur y répond
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xmenu'));
  await until(() => adapter.sent.length > 0, 3000);
  const botMsg = adapter.sent[adapter.sent.length - 1];
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'et sinon ca va ?', {
    messageReply: { senderID: BOT_ID, messageID: botMsg.id },
  }));
  await until(() => bodies(adapter).some((b) => b.includes('survis à vos bêtises')), 3000);
  assert.ok(bodies(adapter).some((b) => b.includes('survis à vos bêtises')), 'le bot a répondu au reply');
  assert.strictEqual(received, 'et sinon ca va ?', 'le texte transmis est la question brute');
});

test('auto-réponse : TAG @MeR~NeL + message → réponse directe, tag retiré de la question', async () => {
  let received = '';
  const { bot, adapter } = await boot({
    serviceStubs: { chat: { reply: async (p) => { received = p.text; return 'Présent. 😏'; }, clear() {}, resetAll() {} } },
  });
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '@MeR~NeL comment tu vas ?', {
    mentions: { [BOT_ID]: { tag: '@MeR~NeL', from: 0 } },
  }));
  await until(() => bodies(adapter).some((b) => b.includes('Présent')), 3000);
  assert.ok(bodies(adapter).some((b) => b.includes('Présent')), 'le bot répond au tag');
  assert.strictEqual(received, 'comment tu vas ?', 'le tag est retiré de la question');
});

test('auto-réponse : reply à un message d’un AUTRE utilisateur → pas de réponse IA (mode off)', async () => {
  const { bot, adapter } = await boot({
    serviceStubs: { chat: { reply: async () => 'NE DOIT PAS APPARAÎTRE', clear() {}, resetAll() {} } },
  });
  clearCooldowns(bot);
  const userMsg = makeMsg('thread-1', UIDS.shadow, 'message humain');
  await bot.handleMessage(userMsg);
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, 'je réponds à shadow', {
    messageReply: { senderID: UIDS.shadow, messageID: userMsg.messageID },
  }));
  await new Promise((r) => setTimeout(r, 400));
  assert.ok(!bodies(adapter).some((b) => b.includes('NE DOIT PAS APPARAÎTRE')), 'pas d’IA hors reply-bot/tag');
});

test('IA totalement saturée → « Mon cerveau a bugué » (jamais de HTML brut)', async () => {
  const fail = async () => {
    const e = new Error('Tous les fournisseurs IA sont indisposables');
    e.code = 'AI_ALL_PROVIDERS_DOWN';
    throw e;
  };
  const { bot, adapter } = await boot({
    serviceStubs: { chat: { reply: fail, clear() {}, resetAll() {} } },
  });
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '@MeR~NeL tu es là ?', {
    mentions: { [BOT_ID]: { tag: '@MeR~NeL', from: 0 } },
  }));
  await until(() => bodies(adapter).some((b) => b.toLowerCase().includes('cerveau')), 3000);
  const body = lastBody(adapter);
  assert.ok(body.toLowerCase().includes('cerveau a bugué'), 'message demandé');
  assert.ok(body.includes('AI_ALL_PROVIDERS_DOWN'), 'code typé affiché');
  assert.ok(!body.includes('<html'), 'jamais de HTML');
});

test('persona : le prompt système embarque l’identité MeR~NEL (ni ChatGPT, sarcastique, court)', async () => {
  const captured = { ai: '', chat: '' };
  const fakePool = {
    ask: async (q, opts = {}) => {
      void q;
      captured.ai = captured.chat = opts.system || '';
      return { text: 'ok', provider: 'test' };
    },
  };
  const silent = { warn() {}, error() {}, info() {}, debug() {} };
  const ai = createAiService(silent, fakePool);
  await ai.ask('coucou');
  assert.ok(captured.ai.includes("PAS ChatGPT"), 'identité « pas ChatGPT »');
  assert.ok(captured.ai.toLowerCase().includes('sarcastique'), 'sarcastique');
  assert.ok(captured.ai.toLowerCase().includes('court'), 'réponses courtes');
  const chat = createChatService(silent, fakePool);
  await chat.reply({ threadID: 't', userID: 'u', userName: 'U', text: 'salut' });
  assert.ok(captured.chat.includes("PAS ChatGPT"), 'chat : même identité');
});

test('cohabitation : une RÉPONSE au quiz (libre) reste un ANSWER (pas de dérive vers l’IA)', async () => {
  const { bot, adapter } = await boot({
    serviceStubs: { chat: { reply: async () => 'PAS POUR LE QUIZ', clear() {}, resetAll() {} } },
  });
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'CG'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '5'));
  await until(() => bodies(adapter).some((b) => /QUESTION 1\/5/.test(b)), 15000);
  const session = bot.sessions.get('thread-1', 'quiz');
  assert.ok(session && session.questions && session.questions[0], 'question active');
  const item = session.questions[0];
  // Réponse directe (sans reply — moteur Xid) au milieu d'un quiz
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, item.a));
  await until(() => session.scores && session.scores.get(UIDS.paul), 15000);
  assert.ok(session.scores.get(UIDS.paul), 'la réponse au quiz marque le point');
  assert.ok(!bodies(adapter).some((b) => b.includes('PAS POUR LE QUIZ')), 'l’IA n’intervient pas sur le quiz');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cancel'));
});

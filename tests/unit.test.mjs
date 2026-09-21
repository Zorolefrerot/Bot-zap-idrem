import './helpers/env.mjs';

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test, { describe } from 'node:test';

import { SESSION_ID_PREFIX } from '../src/config/defaults.js';
import env from '../src/config/env.js';
import {
  constantTimeEqual,
  createSignedToken,
  generateSessionId,
  isValidSessionIdFormat,
  splitSessionId,
  verifySignedToken,
} from '../src/utils/crypto.js';
import { formatPairCode, formatPhone, formatUptime, maskPhone } from '../src/utils/format.js';
import { digitsOnly, isGroupJid, isSameJid, isSamePhone, jidToPhone, normalizePhone, phoneToJid } from '../src/utils/phone.js';
import { sanitize, createLogger, getLogBuffer } from '../src/utils/logger.js';
import { ApiError, BotError } from '../src/utils/errors.js';
import { JsonStore } from '../src/database/jsonStore.js';
import {
  nameSchema,
  pairSchema,
  parse,
  phoneSchema,
  prefixSchema,
  settingsSchema,
} from '../src/utils/validate.js';

describe('normalisation des numéros', () => {
  test('accepte les formats internationaux courants', () => {
    assert.equal(normalizePhone('+243 970 000 000'), '243970000000');
    assert.equal(normalizePhone('00243970000000'), '243970000000');
    assert.equal(normalizePhone('243970000000'), '243970000000');
    assert.equal(normalizePhone('(33) 6 12 34 56 78'), '33612345678');
  });

  test('refuse les formats nationaux et invalides', () => {
    assert.equal(normalizePhone('0970000000'), null, 'un numéro commençant par 0 doit être refusé');
    assert.equal(normalizePhone('12345'), null, 'trop court');
    assert.equal(normalizePhone(''), null);
    assert.equal(normalizePhone(undefined), null);
    assert.equal(normalizePhone('abcdefg'), null);
  });

  test('conversion JID <-> numéro', () => {
    assert.equal(phoneToJid('+243 970 000 000'), '243970000000@s.whatsapp.net');
    assert.equal(jidToPhone('243970000000:12@s.whatsapp.net'), '243970000000');
    assert.equal(isGroupJid('120363@g.us'), true);
    assert.equal(isGroupJid('243970000000@s.whatsapp.net'), false);
    assert.equal(isSameJid('243970000000:1@s.whatsapp.net', '243970000000@s.whatsapp.net'), true);
    assert.equal(isSamePhone('+243970000000', '243970000000'), true);
    assert.equal(digitsOnly('+243 970'), '243970');
  });

  test('affichage formaté et masqué', () => {
    assert.equal(formatPhone('243970000000'), '+243 970 000 000');
    assert.equal(formatPhone(''), '');
    assert.match(maskPhone('243970000000'), /^243•+000$/);
    assert.ok(!maskPhone('243970000000').includes('970'), 'le numéro masqué ne doit pas révéler les chiffres centraux');
  });
});

describe('Session ID', () => {
  test('préfixe obligatoire IDREM-TERESHKOVA-', () => {
    const id = generateSessionId();
    assert.ok(id.startsWith(SESSION_ID_PREFIX), `préfixe manquant : ${id}`);
    assert.equal(SESSION_ID_PREFIX, 'IDREM-TERESHKOVA-');
  });

  test('longueur, alphabet et caractère aléatoire', () => {
    const ids = new Set(Array.from({ length: 500 }, () => generateSessionId()));
    assert.equal(ids.size, 500, 'les Session ID doivent être uniques');

    for (const id of ids) {
      const body = id.slice(SESSION_ID_PREFIX.length);
      assert.equal(body.length, 43, '32 octets en base64url => 43 caractères');
      assert.match(body, /^[A-Za-z0-9_-]+$/, 'alphabet base64url uniquement');
      assert.ok(id.length >= 59, 'Session ID suffisamment longue');
    }
  });

  test('validation de format', () => {
    assert.equal(isValidSessionIdFormat(generateSessionId()), true);
    assert.equal(isValidSessionIdFormat('PREFIXE-INVALIDE-abc'), false);
    assert.equal(isValidSessionIdFormat(`${SESSION_ID_PREFIX}court`), false);
    assert.equal(isValidSessionIdFormat(''), false);
    assert.equal(isValidSessionIdFormat(null), false);
  });

  test('découpage affichage', () => {
    const id = generateSessionId();
    const parts = splitSessionId(id);
    assert.equal(parts.prefix, SESSION_ID_PREFIX);
    assert.equal(parts.prefix + parts.body, id);
  });
});

describe('Pair Code', () => {
  test('formatage XXXX-XXXX', () => {
    assert.equal(formatPairCode('ABCD1234'), 'ABCD-1234');
    assert.equal(formatPairCode('abcd1234'), 'ABCD-1234');
    assert.equal(formatPairCode('AB CD 12 34'), 'ABCD-1234');
    assert.equal(formatPairCode('ABC'), 'ABC', 'code non standard renvoyé tel quel');
  });
});

describe('durées', () => {
  test('formatUptime', () => {
    assert.equal(formatUptime(0), '0s');
    assert.equal(formatUptime(1000), '1s');
    assert.equal(formatUptime(65_000), '1m 5s');
    assert.equal(formatUptime(3_725_000), '1h 2m 5s');
    assert.equal(formatUptime(90_061_000), '1j 1h 1m 1s');
    assert.equal(formatUptime(-5), '0s');
    assert.equal(formatUptime(Number.NaN), '0s');
  });
});

describe('jetons signés (dashboard)', () => {
  test('création et vérification', () => {
    const token = createSignedToken({ sub: 'dashboard' }, env.security.sessionSecret, 60_000);
    const payload = verifySignedToken(token, env.security.sessionSecret);
    assert.equal(payload.sub, 'dashboard');
    assert.ok(payload.exp > Date.now());
  });

  test('jeton falsifié refusé', () => {
    const token = createSignedToken({ sub: 'dashboard' }, env.security.sessionSecret, 60_000);
    const [body, signature] = token.split('.');
    const forged = `${Buffer.from(JSON.stringify({ sub: 'dashboard', role: 'superadmin' })).toString('base64url')}.${signature}`;
    assert.equal(verifySignedToken(forged, env.security.sessionSecret), null);
    assert.equal(verifySignedToken(`${body}.AAAAAAAA`, env.security.sessionSecret), null);
    assert.equal(verifySignedToken(token, 'autre-secret'), null);
    assert.equal(verifySignedToken('nimporte', env.security.sessionSecret), null);
    assert.equal(verifySignedToken('', env.security.sessionSecret), null);
  });

  test('jeton expiré refusé', () => {
    const token = createSignedToken({ sub: 'dashboard' }, env.security.sessionSecret, -1000);
    assert.equal(verifySignedToken(token, env.security.sessionSecret), null);
  });

  test('comparaison à temps constant', () => {
    assert.equal(constantTimeEqual('abc', 'abc'), true);
    assert.equal(constantTimeEqual('abc', 'abd'), false);
    assert.equal(constantTimeEqual('abc', 'ab'), false);
    assert.equal(constantTimeEqual('', ''), true);
  });
});

describe('validation des entrées', () => {
  test('préfixe', () => {
    assert.equal(parse(prefixSchema, '/'), '/');
    assert.equal(parse(prefixSchema, '!'), '!');
    assert.equal(parse(prefixSchema, '::'), '::');
    assert.equal(parse(prefixSchema, '  .  '), '.');
    assert.throws(() => parse(prefixSchema, ''), /1 à 3 caractères/);
    assert.throws(() => parse(prefixSchema, 'troplong'), /1 à 3 caractères/);
    assert.throws(() => parse(prefixSchema, 'a b'), /espace/);
  });

  test('noms', () => {
    assert.equal(parse(nameSchema, '  Merdi  '), 'Merdi');
    assert.throws(() => parse(nameSchema, ''), /Nom requis/);
    assert.throws(() => parse(nameSchema, 'x'.repeat(60)), /Trop long/);
  });

  test('numéros', () => {
    assert.equal(parse(phoneSchema, '+243 970 000 000'), '243970000000');
    assert.throws(() => parse(phoneSchema, '0970000000'), /Numéro invalide/);
  });

  test('configuration du dashboard (champs inconnus rejetés)', () => {
    const parsed = parse(settingsSchema, {
      adminName: 'Merdi',
      prefix: '/',
      stickerName: 'IDREM TERESHKOVA',
      adminNumber: '243970000000',
      stickerAuthor: '',
    });
    assert.equal(parsed.adminName, 'Merdi');
    assert.equal(parsed.adminNumber, '243970000000');
    assert.equal(parsed.stickerAuthor, '', 'une chaîne vide doit pouvoir effacer une valeur');
    assert.throws(() => parse(settingsSchema, { injecte: true }), /injecte/);
    assert.throws(() => parse(settingsSchema, { prefix: 'toolongprefix' }), /préfixe/i);
  });

  test('formulaire Pair Code', () => {
    const parsed = parse(pairSchema, {
      phoneNumber: '+243970000000',
      adminNumber: '',
      adminName: 'Merdi',
      prefix: '/',
      stickerName: 'IDREM TERESHKOVA',
      stickerAuthor: '',
      botName: '',
    });
    assert.equal(parsed.phoneNumber, '243970000000');
    assert.equal(parsed.adminNumber, undefined, 'champ vide => non fourni');
    assert.equal(parsed.adminName, 'Merdi');
    assert.throws(() => parse(pairSchema, { phoneNumber: '123' }), /Numéro invalide/);
    assert.throws(() => parse(pairSchema, {}), /Numéro requis/);
  });
});

describe('journalisation sécurisée', () => {
  test('censure les champs sensibles', () => {
    const cleaned = sanitize({
      sessionId: generateSessionId(),
      pairCode: 'ABCD-1234',
      password: 'sup3r-s3cret',
      creds: { noiseKey: { private: 'xxx' } },
      apiKey: 'key-123456789',
      phone: '243970000000',
      message: 'bonjour',
    });

    assert.ok(!JSON.stringify(cleaned).includes('sup3r-s3cret'), 'le mot de passe ne doit pas apparaître');
    assert.ok(!JSON.stringify(cleaned).includes('ABCD-1234'), 'le Pair Code ne doit pas apparaître');
    assert.ok(!JSON.stringify(cleaned).includes('key-123456789'), 'la clé API ne doit pas apparaître');
    assert.ok(!JSON.stringify(cleaned).includes('xxx'), 'les credentials ne doivent pas apparaître');
    assert.equal(cleaned.phone, '243970000000', 'les données non sensibles sont conservées');
    assert.equal(cleaned.message, 'bonjour');
  });

  test('tronque les longues chaînes et gère les types complexes', () => {
    const cleaned = sanitize({ note: 'a'.repeat(5000), buffer: Buffer.alloc(12), error: new Error('boom'), nested: { deep: { key: 'v' } } });
    assert.ok(cleaned.note.length < 300);
    assert.equal(cleaned.buffer, '<Buffer 12b>');
    assert.equal(cleaned.error.message, 'boom');
    assert.equal(cleaned.nested.deep.key, 'v');
  });

  test('le ring buffer du dashboard ne contient pas de secret', () => {
    const logger = createLogger('test');
    logger.info('événement sensible', { password: 'motdepasse', sessionId: generateSessionId(), ok: true });

    const entries = getLogBuffer(20);
    const last = entries.at(-1);
    assert.equal(last.msg, 'événement sensible');
    assert.equal(last.meta.ok, true);
    assert.ok(!JSON.stringify(last).includes('motdepasse'));
  });
});

describe('erreurs', () => {
  test('ApiError porte un statut HTTP', () => {
    assert.equal(ApiError.badRequest('x').status, 400);
    assert.equal(ApiError.unauthorized().status, 401);
    assert.equal(ApiError.forbidden().status, 403);
    assert.equal(ApiError.notFound().status, 404);
    assert.equal(ApiError.conflict().status, 409);
    assert.equal(ApiError.tooMany().status, 429);
    assert.equal(ApiError.unavailable().status, 503);
  });

  test('BotError est destinée à l’utilisateur WhatsApp', () => {
    const error = new BotError('❌ message');
    assert.equal(error.name, 'BotError');
    assert.equal(error.message, '❌ message');
  });
});

describe('persistance JSON', () => {
  test('écriture atomique et rechargement', async () => {
    const file = path.join(env.paths.data, 'store-test.json');
    const store = new JsonStore(file, { count: 0, nested: { a: 1 } });
    await store.load();

    store.set('count', 5);
    store.update('nested', (n) => ({ ...n, b: 2 }));
    await store.flush();

    const reloaded = new JsonStore(file, { count: 0, nested: { a: 1 } });
    await reloaded.load();
    assert.equal(reloaded.get('count'), 5);
    assert.deepEqual(reloaded.get('nested'), { a: 1, b: 2 });

    const raw = await fs.readFile(file, 'utf8');
    assert.ok(!raw.includes('.tmp'), 'aucun fichier temporaire résiduel dans le contenu');
    await store.close();
  });

  test('un fichier corrompu est réinitialisé sans planter', async () => {
    const file = path.join(env.paths.data, 'store-broken.json');
    await fs.writeFile(file, '{ pas du json', 'utf8');

    const store = new JsonStore(file, { value: 'default' });
    await store.load();
    assert.equal(store.get('value'), 'default');
    await store.close();
  });
});

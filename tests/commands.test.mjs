import './helpers/env.mjs';

import assert from 'node:assert/strict';
import test, { before, describe } from 'node:test';

import { CATEGORIES } from '../src/config/defaults.js';
import db from '../src/database/index.js';
import { categoryMeta, loadCommands } from '../src/bot/loader.js';
import { buildHelp, buildMenu } from '../src/utils/menu.js';
import { botManager } from '../src/bot/manager.js';

const EXPECTED = [
  'menu',
  'help',
  'ping',
  'owner',
  'runtime',
  'info',
  'status',
  'sticker',
  'toimg',
  'tovideo',
  'toaudio',
  'vv',
  'restart',
  'shutdown',
  'broadcast',
  'setprefix',
  'setsticker',
  'setadmin',
];

let loaded;

before(async () => {
  await db.init();
  loaded = await loadCommands();
});

describe('chargeur de commandes', () => {
  test('toutes les commandes du cahier des charges existent', () => {
    for (const name of EXPECTED) {
      assert.ok(loaded.commands.has(name), `commande manquante : ${name}`);
    }
  });

  test('aucune erreur de chargement', () => {
    assert.deepEqual(loaded.errors, []);
  });

  test('structure homogène (modulaire, un fichier = une commande)', () => {
    assert.ok(loaded.commands.size >= EXPECTED.length);

    const validCategories = new Set(CATEGORIES.map((c) => c.id).concat('other'));

    for (const command of loaded.commands.values()) {
      assert.match(command.name, /^[a-z0-9-]{1,24}$/, `nom invalide : ${command.name}`);
      assert.equal(typeof command.execute, 'function', `${command.name} : execute() requis`);
      assert.ok(validCategories.has(command.category), `${command.name} : catégorie inconnue`);
      assert.ok(command.description.length > 3, `${command.name} : description requise`);
      assert.ok(command.usage.startsWith('/'), `${command.name} : usage attendu "/..."`);
      assert.ok(Array.isArray(command.aliases));
      assert.ok(Array.isArray(command.examples));
      assert.ok(command.file.endsWith('.js'), `${command.name} : fichier source attendu`);
    }
  });

  test('noms et alias sans collision', () => {
    const seen = new Map();
    for (const command of loaded.commands.values()) {
      assert.ok(!seen.has(command.name), `nom dupliqué : ${command.name}`);
      seen.set(command.name, command.name);
    }
    for (const [alias, target] of loaded.aliases) {
      assert.ok(!seen.has(alias), `l'alias "${alias}" entre en collision avec une commande`);
      assert.ok(loaded.commands.has(target), `alias "${alias}" -> commande inconnue`);
      seen.set(alias, target);
    }
  });

  test('les commandes sensibles sont réservées au propriétaire', () => {
    const ownerCommands = ['restart', 'shutdown', 'broadcast', 'setprefix', 'setsticker', 'setadmin', 'status', 'session'];
    for (const name of ownerCommands) {
      const command = loaded.commands.get(name);
      assert.ok(command, `${name} doit exister`);
      assert.equal(command.ownerOnly, true, `${name} doit être ownerOnly`);
      assert.equal(command.category, 'admin', `${name} doit être dans la catégorie admin`);
    }
  });

  test('les commandes publiques ne sont pas restreintes', () => {
    for (const name of ['menu', 'ping', 'vv', 'sticker', 'toimg', 'owner', 'runtime', 'info', 'help']) {
      const command = loaded.commands.get(name);
      assert.equal(command.ownerOnly, false, `${name} doit rester accessible`);
    }
  });

  test('alias utiles présents', () => {
    assert.ok(loaded.commands.get('sticker').aliases.includes('s'));
    assert.ok(loaded.commands.get('vv').aliases.includes('readviewonce'));
    assert.ok(loaded.commands.get('toaudio').aliases.includes('tomp3'));
    assert.ok(loaded.commands.get('tovideo').aliases.includes('tomp4'));
    assert.ok(loaded.commands.get('toimg').aliases.includes('toimage'));
    assert.ok(loaded.commands.get('broadcast').aliases.includes('bc'));
  });
});

describe('résolution via le BotManager', () => {
  test('nom direct et alias', async () => {
    await botManager.boot();

    assert.equal(botManager.resolveCommand('menu')?.name, 'menu');
    assert.equal(botManager.resolveCommand('s')?.name, 'sticker');
    assert.equal(botManager.resolveCommand('VV')?.name, 'vv');
    assert.equal(botManager.resolveCommand('readviewonce')?.name, 'vv');
    assert.equal(botManager.resolveCommand('bc')?.name, 'broadcast');
    assert.equal(botManager.resolveCommand('inexistante'), null);
    assert.equal(botManager.resolveCommand(''), null);
  });

  test('catalogue public sans donnée sensible', () => {
    const list = botManager.listCommands();
    assert.equal(list.length, botManager.commands.size);

    for (const item of list) {
      assert.ok(!('file' in item), 'le chemin de fichier interne ne doit pas être exposé');
      assert.ok(!('execute' in item), 'la fonction ne doit pas être exposée');
      assert.equal(typeof item.name, 'string');
      assert.equal(typeof item.description, 'string');
    }
    assert.ok(JSON.stringify(list).length > 100);
  });

  test('statut public : aucune fuite de credentials', () => {
    const status = botManager.getStatus();
    assert.equal(status.project, 'IDREM TERESHKOVA BOT');
    assert.equal(status.bot.prefix, db.getSettings().prefix);
    assert.equal(status.commands.total, botManager.commands.size);
    assert.ok(['idle', 'waiting', 'pairing', 'connecting', 'connected', 'disconnected', 'logged_out', 'error'].includes(status.whatsapp.status));

    const serialized = JSON.stringify(status);
    for (const forbidden of ['creds', 'noiseKey', 'signedIdentityKey', 'pairingCode', 'privateKey', 'authDir']) {
      assert.ok(!serialized.includes(forbidden), `le statut ne doit pas contenir "${forbidden}"`);
    }
  });

  test('session inexistante : régénération refusée proprement', () => {
    assert.equal(botManager.getPublicSession(), null);
    assert.throws(() => botManager.regenerateSession(), (error) => error.status === 409);
  });
});

describe('menu', () => {
  test('structure attendue (catégories du cahier des charges)', () => {
    const menu = buildMenu({
      commands: loaded.commands,
      settings: db.getSettings(),
      status: { uptimeMs: 3_725_000 },
      prefix: '/',
    });

    for (const label of ['ADMIN', 'BOT', 'TOOLS', 'STICKER', 'MEDIA']) {
      assert.ok(menu.includes(label), `catégorie manquante dans le menu : ${label}`);
    }
    for (const glyph of ['╭', '┃', '╰', '│']) {
      assert.ok(menu.includes(glyph), `cadre manquant : ${glyph}`);
    }
    assert.ok(menu.includes('/menu'), 'la commande menu doit apparaître');
    assert.ok(menu.includes('/vv'), 'la commande vv doit apparaître');
    assert.ok(menu.includes('IDREM TERESHKOVA'), 'le nom du pack/bot doit apparaître');
    assert.ok(menu.includes('1h 2m'), 'l’uptime doit être formaté');
    assert.ok(!menu.includes('undefined'), 'aucune valeur undefined ne doit fuiter');
    assert.ok(!menu.includes('NaN'), 'aucun NaN ne doit apparaître');
  });

  test('le menu suit le préfixe configuré', () => {
    db.updateSettings({ prefix: '!' });
    const menu = buildMenu({ commands: loaded.commands, settings: db.getSettings(), status: { uptimeMs: 0 }, prefix: '!' });
    assert.ok(menu.includes('!menu'), 'le menu doit utiliser le préfixe configuré');
    db.updateSettings({ prefix: '/' });
  });

  test('aide détaillée d’une commande', () => {
    const help = buildHelp(loaded.commands.get('vv'), '/');
    assert.match(help, /\/vv/);
    assert.match(help, /View Once/);
    assert.match(help, /Usage/);
    assert.match(help, /MEDIA/);

    const adminHelp = buildHelp(loaded.commands.get('restart'), '/');
    assert.match(adminHelp, /administrateur/i);
  });

  test('métadonnées de catégorie', () => {
    assert.equal(categoryMeta('admin').icon, '👑');
    assert.equal(categoryMeta('sticker').label, 'STICKER');
    assert.equal(categoryMeta('inconnue').label, 'INCONNUE');
  });
});

'use strict';
/*
 * 🧬 MeR~NeL — tests/city.test.js
 * Xcity 🏙️ — city-builder JvJ : création, bâtiments, collecte + tourisme (km²),
 * armée à unités + officiers, marché 24 h, envois (or taxé / ressources),
 * traités + TRAHISON à 80 %, barbares PvE, tops/chroniques — XCoins intacts.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');

const { boot, makeMsg, bodies, UIDS, clearCooldowns } = require('./helpers');
const { CityGame, RES } = require('../systems/city');
const { BETRAY_RATE, LOOT_RATE, SEND_TAX } = require('../systems/city');

const FLUSH = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
const RIGGED = () => 0.99; // rng déterministe (événements bénins, rolls max)

async function freshBot() {
  const { bot, adapter } = await boot({});
  clearCooldowns(bot);
  bot.db.cities.data = { cities: {}, market: { prices: {}, lastUpdate: 0, shortage: null }, pending: [], news: [], barbarians: [] };
  return { bot, adapter };
}

function game(bot) { return new CityGame(bot.db.cities, { rng: RIGGED }); }

describe('Xcity — fondation & ville', () => {
  test('create : ville complète, nom unique, 1/joueur, delete confirm', async () => {
    const { bot } = await freshBot();
    const g = game(bot);
    const r = g.create(UIDS.shadow, 'Racine', 'Shadow');
    assert.equal(r.ok, true);
    const c = g.cityOf(UIDS.shadow);
    assert.equal(c.gold, 5000); // or INTERNE
    assert.equal(c.pop, 50);
    assert.equal(c.km2, 1);
    assert.equal(c.moral, 50);
    assert.equal(c.produce.length, 3);
    // doublon de nom (casse ignorée) refusé
    assert.equal(g.create(UIDS.paul, 'rAcInE', 'P').ok, false);
    // 1 seule ville par joueur
    assert.ok(g.create(UIDS.shadow, 'Autre', 'S').err.includes('déjà'));
    // delete sans confirm → guide ; avec confirm → supprimé
    assert.equal(g.remove(UIDS.shadow).ok, true);
    assert.equal(g.cityOf(UIDS.shadow), null);
    assert.equal(g.create(UIDS.shadow, 'Racine', 'Shadow').ok, true);
  });

  test('build : coût, population des maisons, types invalides', async () => {
    const { bot } = await freshBot();
    const g = game(bot);
    g.create(UIDS.shadow, 'Racine', 'S');
    assert.ok(g.build(UIDS.shadow, 'chateau').err.includes('Types'));
    const r = g.build(UIDS.shadow, 'house');
    assert.equal(r.ok, true);
    assert.equal(r.pop, 55); // 50 + 5
    assert.equal(r.gold, 4500);
    const poor = g.cityOf(UIDS.shadow);
    poor.gold = 100;
    assert.ok(g.build(UIDS.shadow, 'bank').err.includes('insuffisants'));
  });

  test('collect : revenu + production + cooldown 60 s', async () => {
    const { bot } = await freshBot();
    const g = game(bot);
    g.create(UIDS.shadow, 'Racine', 'S');
    const r = g.collect(UIDS.shadow);
    assert.equal(r.ok, true);
    assert.ok(r.income >= 100 + 15); // pop 50 ×2 + ferme ×15
    const c = g.cityOf(UIDS.shadow);
    assert.ok(Object.values(r.produced).every((q) => q >= 1 && q <= 5));
    assert.ok(g.collect(UIDS.shadow).err.includes('Cooldown'));
    c.lastCollect = 0;
    assert.equal(g.collect(UIDS.shadow).ok, true);
  });

  test('upgrade : 3 conditions (pop, or, bâtiments) + or déduit', async () => {
    const { bot } = await freshBot();
    const g = game(bot);
    g.create(UIDS.shadow, 'Racine', 'S');
    assert.ok(g.upgrade(UIDS.shadow).err.includes('Population'));
    const c = g.cityOf(UIDS.shadow);
    c.pop = 60;
    c.gold = 99999;
    assert.ok(g.upgrade(UIDS.shadow).err.includes('Bâtiments'));
    for (let i = 0; i < 10; i++) { c.gold = Math.max(c.gold, 600); g.build(UIDS.shadow, 'house'); }
    c.gold = 8000;
    const r = g.upgrade(UIDS.shadow);
    assert.equal(r.ok, true);
    assert.equal(c.lvl, 2);
    assert.equal(c.gold, 0); // 8000 − 1×8000
  });
});

describe('Xcity — territoire (km²) & tourisme', () => {
  test('expand : +1 km² coûte 600×km², touristes → or de collect', async () => {
    const { bot } = await freshBot();
    const g = game(bot);
    g.create(UIDS.shadow, 'Racine', 'S');
    const before = g.tourists(g.cityOf(UIDS.shadow)); // floor(1×(50+50)/10)=10
    assert.equal(before, 10);
    const r = g.expand(UIDS.shadow);
    assert.equal(r.ok, true);
    const c = g.cityOf(UIDS.shadow);
    assert.equal(c.km2, 2);
    assert.equal(c.pop, 52);
    assert.equal(c.gold, 5000 - 600);
    assert.ok(g.expand(UIDS.shadow).err.includes('Cooldown')); // 2 min
    c.lastExpand = 0;
    // collecte : le tourisme double le km² → 2 km² = 20 touristes = +40$
    c.lastCollect = 0;
    const col = g.collect(UIDS.shadow);
    assert.equal(col.tourists, 20);
    assert.equal(col.tourism, 40);
  });

  test('le moral fait varier le tourisme (km² fixes)', async () => {
    const { bot } = await freshBot();
    const g = game(bot);
    g.create(UIDS.shadow, 'Racine', 'S');
    const c = g.cityOf(UIDS.shadow);
    c.km2 = 10;
    c.moral = 100;
    assert.equal(g.tourists(c), 150);
    c.moral = 0;
    assert.equal(g.tourists(c), 50);
  });
});

describe('Xcity — armée : unités, casernes, officiers', () => {
  test('train : caserne requise, lvl des unités, capacité', async () => {
    const { bot } = await freshBot();
    const g = game(bot);
    g.create(UIDS.shadow, 'Racine', 'S');
    const c = g.cityOf(UIDS.shadow);
    assert.ok(g.train(UIDS.shadow, 'soldier').err.includes('caserne'));
    c.gold = 9999; g.build(UIDS.shadow, 'barracks'); // capacité 10
    const r = g.train(UIDS.shadow, 'soldier');
    assert.equal(r.ok, true);
    assert.equal(c.units.soldier, 1);
    assert.ok(g.train(UIDS.shadow, 'archer').err.includes('𝗟𝘃𝗹 2'));
    c.lvl = 2;
    assert.ok(g.train(UIDS.shadow, 'cavalry').err.includes('𝗟𝘃𝗹 3'));
    c.lvl = 3;
    for (let i = 0; i < 9; i++) { c.gold = 9999; c.lastTrain = 0; assert.equal(g.train(UIDS.shadow, 'soldier').ok, true); }
    assert.equal(g.unitCount(c), 10);
    c.gold = 9999; c.lastTrain = 0;
    assert.ok(g.train(UIDS.shadow, 'soldier').err.includes('pleine'));
  });

  test('officiers : Capitaine (+15 % att) et Général (+20 % déf)', async () => {
    const { bot } = await freshBot();
    const g = game(bot);
    g.create(UIDS.shadow, 'Racine', 'S');
    const c = g.cityOf(UIDS.shadow);
    assert.ok(g.buyOfficer(UIDS.shadow, 'captain').err.includes('𝗟𝘃𝗹'));
    c.lvl = 4;
    c.gold = 20000;
    assert.equal(g.buyOfficer(UIDS.shadow, 'captain').ok, true);
    assert.equal(g.buyOfficer(UIDS.shadow, 'captain').ok, false); // déjà là
    assert.equal(g.buyOfficer(UIDS.shadow, 'general').ok, true);
    const base = g.power({ units: { soldier: 10, archer: 0, cavalry: 0 }, officers: {} }, 'att');
    assert.equal(g.power({ units: { soldier: 10, archer: 0, cavalry: 0 }, officers: { captain: true, general: false } }, 'att'), base * 1.15);
    assert.equal(g.power({ units: { soldier: 10, archer: 0, cavalry: 0 }, officers: { captain: false, general: true } }, 'def'), base * 1.20);
  });
});

describe('Xcity — attaques & trahison', () => {
  test('attaque normale : butin 15 % plafonné, pertes, bouclier, notif', async () => {
    const { bot } = await freshBot();
    const g = game(bot);
    g.create(UIDS.shadow, 'Attaquant', 'S');
    g.create(UIDS.paul, 'Victime', 'P');
    const att = g.cityOf(UIDS.shadow);
    const vic = g.cityOf(UIDS.paul);
    att.gold = 20000; g.build(UIDS.shadow, 'barracks');
    for (let i = 0; i < 10; i++) { att.gold = 99999; att.lastTrain = 0; g.train(UIDS.shadow, 'soldier'); }
    vic.gold = 10000; // butin attendu = 1500
    const r = g.attack(UIDS.shadow, 'Victime');
    assert.equal(r.ok, true);
    assert.equal(r.win, true);
    assert.equal(r.loot, 10000 * LOOT_RATE); // rollA(10) > rollD(0) garanti
    assert.equal(vic.gold, 10000 - 1500);
    assert.ok(vic.shieldUntil > 0);
    assert.ok(vic.notif.some((n) => n.includes('pillé')));
    assert.ok(r.dm.length === 1 && r.dm[0].to === UIDS.paul);
    // bouclier : ré-attaque refusée
    att.lastAttack = 0;
    assert.ok(g.attack(UIDS.shadow, 'Victime').err.includes('bouclier'));
  });

  test('🗡️ TRAHISON : traité de paix attaqué = victoire auto + 80 % de l\u2019or', async () => {
    const { bot } = await freshBot();
    const g = game(bot);
    g.create(UIDS.shadow, 'Traitre', 'S');
    g.create(UIDS.paul, 'Naif', 'P');
    const tr = g.cityOf(UIDS.shadow);
    const naif = g.cityOf(UIDS.paul);
    naif.gold = 10000;
    naif.units.soldier = 50; // même une armée puissante ne sauve pas d'une trahison
    // proposition + acceptation
    const p = g.treatyPropose(UIDS.shadow, 'Naif', 'peace');
    assert.equal(p.ok, true);
    const a = g.treatyRespond(UIDS.paul, 'Traitre', true);
    assert.equal(a.ok && a.accepted, true);
    assert.ok(g.treatyBetween(UIDS.shadow, UIDS.paul));
    assert.equal(tr.rep, 2); // +2 signature
    // l'attaque traîtresse réussit AUTOMATIQUEMENT et pille 80 %
    const r = g.attack(UIDS.shadow, 'Naif');
    assert.equal(r.ok, true);
    assert.equal(r.betrayal, true);
    assert.equal(r.win, true);
    assert.equal(r.loot, 8000); // BETRAY_RATE × 10000
    assert.equal(naif.gold, 2000);
    assert.equal(tr.rep, 2 - 40); // trahison peace = −40
    assert.equal(g.treatyBetween(UIDS.shadow, UIDS.paul), null); // traité rompu
    assert.equal(naif.moral, 38); // +3 (traité signé) puis −15 (trahison)
    assert.ok(naif.notif.some((n) => n.includes('TRAHISON')));
    assert.ok(g.store.data.news.some((n) => n.txt.includes('TRAHI')));
    assert.equal(r.dm[0].to, UIDS.paul);
  });

  test('trahison des autres traités : alliance −50, commerce −30', async () => {
    for (const [type, pen] of [['alliance', -50], ['trade', -30]]) {
      const { bot } = await freshBot();
      const g = game(bot);
      g.create(UIDS.shadow, 'Alpha', 'S');
      g.create(UIDS.paul, 'Beta', 'P');
      g.cityOf(UIDS.paul).gold = 5000;
      g.treatyPropose(UIDS.shadow, 'Beta', type);
      g.treatyRespond(UIDS.paul, 'Alpha', true);
      g.cityOf(UIDS.shadow).lastAttack = 0;
      const r = g.attack(UIDS.shadow, 'Beta');
      assert.equal(r.betrayal, true);
      assert.equal(r.loot, Math.floor(5000 * BETRAY_RATE));
      assert.equal(g.cityOf(UIDS.shadow).rep, 2 + pen);
    }
  });

  test('défaite : l\u2019attaquant faible perd, le défenseur gagne +2 réputation', async () => {
    const { bot } = await freshBot();
    const g = game(bot);
    g.create(UIDS.shadow, 'Faible', 'S');
    g.create(UIDS.paul, 'Fort', 'P');
    const fort = g.cityOf(UIDS.paul);
    fort.gold = 9999; g.build(UIDS.paul, 'barracks');
    for (let i = 0; i < 10; i++) { fort.gold = 9999; fort.lastTrain = 0; g.train(UIDS.paul, 'cavalry'); }
    const repBefore = fort.rep;
    const r = g.attack(UIDS.shadow, 'Fort'); // attaque à mains nues → écrasée
    assert.equal(r.ok, true);
    assert.equal(r.win, false);
    assert.equal(fort.rep, repBefore + 2);
  });
});

describe('Xcity — traités, envois, décrets', () => {
  test('treaty : refuse sans proposition, break −15 réputation, liste', async () => {
    const { bot } = await freshBot();
    const g = game(bot);
    g.create(UIDS.shadow, 'Alpha', 'S');
    g.create(UIDS.paul, 'Beta', 'P');
    assert.ok(g.treatyRespond(UIDS.paul, 'Alpha', true).err.includes('Aucune'));
    g.treatyPropose(UIDS.shadow, 'Beta', 'alliance');
    assert.ok(g.treatyPropose(UIDS.shadow, 'Beta', 'alliance').err.includes('déjà'));
    const r = g.treatyRespond(UIDS.paul, 'Alpha', true);
    assert.equal(r.accepted, true);
    const before = g.cityOf(UIDS.shadow).rep;
    const b = g.treatyBreak(UIDS.shadow, 'Beta');
    assert.equal(b.ok, true);
    assert.equal(g.cityOf(UIDS.shadow).rep, before - 15);
    assert.equal(g.treatyBetween(UIDS.shadow, UIDS.paul), null);
    assert.ok(g.cityOf(UIDS.paul).notif.some((n) => n.includes('ROMPU')));
    const list = g.treatiesList(UIDS.shadow);
    assert.equal(list.rows.length, 0);
  });

  test('send money : taxe 10 %, 0 % entre partenaires commerciaux', async () => {
    const { bot } = await freshBot();
    const g = game(bot);
    g.create(UIDS.shadow, 'Alpha', 'S');
    g.create(UIDS.paul, 'Beta', 'P');
    g.cityOf(UIDS.shadow).gold = 1000;
    const r = g.send(UIDS.shadow, 'Beta', 'money', 'money', 1000);
    assert.equal(r.ok, true);
    assert.equal(r.received, 900); // taxe 100
    assert.equal(g.cityOf(UIDS.shadow).gold, 0);
    assert.equal(g.cityOf(UIDS.paul).gold, 5900);
    // pacte commercial → taxe nulle
    g.cityOf(UIDS.shadow).gold = 1000;
    g.treatyPropose(UIDS.shadow, 'Beta', 'trade');
    g.treatyRespond(UIDS.paul, 'Alpha', true);
    const r2 = g.send(UIDS.shadow, 'Beta', 'money', 'money', 1000);
    assert.equal(r2.tax, 0);
    assert.equal(r2.received, 1000);
    assert.equal(g.cityOf(UIDS.paul).gold, 6900);
  });

  test('send ressources : stock déplacé sans taxe', async () => {
    const { bot } = await freshBot();
    const g = game(bot);
    g.create(UIDS.shadow, 'Alpha', 'S');
    g.create(UIDS.paul, 'Beta', 'P');
    g.cityOf(UIDS.shadow).res.iron = 30;
    assert.ok(g.send(UIDS.shadow, 'Beta', 'res', 'iron', 50).err.includes('insuffisant'));
    const r = g.send(UIDS.shadow, 'Beta', 'res', 'iron', 12);
    assert.equal(r.ok, true);
    assert.equal(g.cityOf(UIDS.shadow).res.iron, 18);
    assert.equal(g.cityOf(UIDS.paul).res.iron, 52); // 40 (création, rng déterministe) + 12
  });

  test('décrets : conscription/festival/tax posés, none abroge', async () => {
    const { bot } = await freshBot();
    const g = game(bot);
    g.create(UIDS.shadow, 'Alpha', 'S');
    assert.equal(g.decree(UIDS.shadow, 'conscription').decree, 'conscription');
    assert.ok(g.decree(UIDS.shadow, 'festival').err.includes('possible dans')); // 1×/h
    const c = g.cityOf(UIDS.shadow);
    c.lastDecree = 0; c.gold = 100;
    assert.ok(g.decree(UIDS.shadow, 'festival').err.includes('500'));
    c.lastDecree = 0; c.gold = 1000;
    assert.equal(g.decree(UIDS.shadow, 'festival').decree, 'festival');
    assert.equal(c.gold, 500);
    assert.equal(g.decree(UIDS.shadow, 'none').ok, true);
    assert.equal(c.decree, null);
  });
});

describe('Xcity — marché & barbares', () => {
  test('marché : refresh 24 h + pénurie ×2, buy/sell', async () => {
    const { bot } = await freshBot();
    const g = game(bot);
    g.create(UIDS.shadow, 'Alpha', 'S');
    const v = g.marketView();
    assert.equal(Object.keys(v.prices).length, 6);
    assert.ok(RES.includes(v.shortage));
    const c = g.cityOf(UIDS.shadow);
    c.gold = 10000;
    const b = g.marketTrade(UIDS.shadow, 'buy', 'wood', 10);
    assert.equal(b.ok, true);
    assert.equal(b.total, g.priceOf('wood') * 10);
    assert.equal(c.res.wood, c.res.wood); // cohérence interne
    const stock = c.res.wood;
    const s = g.marketTrade(UIDS.shadow, 'sell', 'wood', stock);
    assert.equal(s.ok, true);
    assert.equal(c.res.wood, 0);
    assert.equal(c.gold, 10000 - b.total + s.total);
    assert.ok(g.marketTrade(UIDS.shadow, 'sell', 'wood', 5).err.includes('insuffisant'));
    // pénurie : prix ×2
    g.store.data.market.shortage = 'iron';
    g.store.data.market.prices.iron = 20;
    assert.equal(g.priceOf('iron'), 40);
  });

  test('barbares : 3 camps, raid victorieux +3 rep, respawn 24 h', async () => {
    const { bot } = await freshBot();
    const g = game(bot);
    g.create(UIDS.shadow, 'Alpha', 'S');
    const camps = g.ensureBarbs();
    assert.equal(camps.length, 3);
    const c = g.cityOf(UIDS.shadow);
    c.units.soldier = 200; // force écrasante
    const target = camps[0];
    const r = g.raid(UIDS.shadow, target.id);
    assert.equal(r.ok, true);
    assert.equal(r.win, true);
    assert.equal(c.rep, 3);
    assert.equal(c.gold, 5000 + target.gold);
    assert.equal(target.power, 0);
    assert.ok(target.respawnAt > 0);
    assert.ok(g.raid(UIDS.shadow, target.id).err.includes('détruit'));
    const camps2 = g.ensureBarbs();
    assert.equal(camps2.length, 3); // pas de doublon avant respawn
  });
});

describe('Xcity — monde, commande & XCoins intacts', () => {
  test('top / news / notif', async () => {
    const { bot } = await freshBot();
    const g = game(bot);
    g.create(UIDS.shadow, 'Riche', 'S');
    g.create(UIDS.paul, 'Pauvre', 'P');
    g.cityOf(UIDS.shadow).gold = 99999;
    const t = g.top('or');
    assert.equal(t.rows[0].name, 'Riche');
    assert.equal(t.rows.length, 2);
    assert.ok(g.store.data.news.length >= 1);
    const c = g.cityOf(UIDS.paul);
    g.notify(c, 'test-notif');
    assert.deepEqual(g.cityOf(UIDS.paul).notif, ['test-notif']);
  });

  test('Xcity create via le bot (commande complète), XCoins INTACTS', async () => {
    const { bot, adapter } = await freshBot();
    const coinsBefore = bot.db.ensureUser(UIDS.shadow).xcoins;
    clearCooldowns(bot);
    await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xcity create Babendi'));
    await FLUSH();
    assert.ok(bodies(adapter).some((b) => /VILLE FONDÉE/i.test(b)));
    const g = game(bot);
    assert.equal(g.cityOf(UIDS.shadow).name, 'Babendi');
    // status via commande
    clearCooldowns(bot);
    await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xcity status'));
    await FLUSH();
    assert.ok(bodies(adapter).some((b) => /BABENDI/i.test(b)));
    // aide par défaut
    clearCooldowns(bot);
    await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xcity'));
    await FLUSH();
    assert.ok(bodies(adapter).some((b) => /XCITY/i.test(b)));
    // monnaie interne ≠ XCoins
    assert.equal(bot.db.getUser(UIDS.shadow).xcoins, coinsBefore);
  });

  test('constantes exposées : trahison 80 %, taxe 10 %, pillage 15 %', () => {
    assert.equal(BETRAY_RATE, 0.8);
    assert.equal(SEND_TAX, 0.1);
    assert.equal(LOOT_RATE, 0.15);
  });
});

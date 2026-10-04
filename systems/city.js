'use strict';
/*
 * 🧬 MeR~NeL — systems/city.js
 * Xcity 🏙️ — City-Builder Joueur vs Joueur : fonde ta ville, bâtis, collecte,
 * commerce au GRAND MARCHÉ (prix re-tirés chaque 24 h + 1 ressource en pénurie),
 * AGRANDIS ton territoire (km² → touristes → or), recrute une armée à unités
 * (soldats/archers/cavaliers + 🎖️ Capitaine / 🛡️ Général), attaque les autres
 * villes… ou signe des TRAITÉS (paix / alliance / commerce).
 * ⚔️ TRAHISON : attaquer une ville liée par traité = victoire automatique
 *    et 80 % de son or pillé — mais réputation détruite (titre 😈 Tyran).
 * 💰 L'OR CITY est une monnaie INTERNE, TOTALEMENT séparée des XCoins.
 * Persistance : db.cities (JSON database/data/cities.json + miroir Neon) —
 * tout survit aux redémarrages. Aucune API externe, 100 % local.
 */

const RES = ['wood', 'stone', 'iron', 'copper', 'coal', 'goldOre'];
const RES_LABEL = {
  wood: '🪵 Bois', stone: '🪨 Pierre', iron: '⛓️ Fer',
  copper: '🥉 Cuivre', coal: '⚫ Charbon', goldOre: '🪙 Minerai d’or',
};
const RANGE = { wood: [4, 9], stone: [6, 11], iron: [15, 30], copper: [12, 25], coal: [10, 20], goldOre: [35, 55] };

const BUILD_COST = { house: 500, farm: 700, mine: 900, factory: 1500, bank: 2000, school: 1200, transport: 1000, barracks: 2500 };
const BUILD_INCOME = { farm: 15, mine: 25, factory: 100, bank: 150, school: 30, transport: 20 };
const BUILD_LABEL = {
  house: '🏠 Maisons', farm: '🌾 Fermes', mine: '⛏️ Mines', factory: '🏭 Usines',
  bank: '🏦 Banques', school: '🎓 Écoles', transport: '🚉 Transports', barracks: '🪖 Casernes',
};

const UNITS = {
  soldier: { label: '🪖 Soldat', cost: 200, pow: 1, minLvl: 1 },
  archer: { label: '🏹 Archer', cost: 350, pow: 1.5, minLvl: 2 },
  cavalry: { label: '🐎 Cavalier', cost: 800, pow: 2.5, minLvl: 3 },
};
const OFFICERS = {
  captain: { label: '🎖️ Capitaine', cost: 5000, minLvl: 2, txt: '+15 % puissance d’ATTAQUE' },
  general: { label: '🛡️ Général', cost: 8000, minLvl: 4, txt: '+20 % DÉFENSE de la ville' },
};
const TREATY_TYPES = {
  peace: { label: '🤝 Paix', hours: 48 },
  alliance: { label: '⚔️ Alliance', hours: 48 },
  trade: { label: '💱 Commerce', hours: 48 },
};
const BETRAY_REP = { peace: -40, alliance: -50, trade: -30 };
const BETRAY_RATE = 0.80;   // 🗡️ trahison de traité = 80 % de l'or de la victime
const LOOT_RATE = 0.15;     // attaque normale : 15 % de l'or (plafonnée)
const LOOT_CAP = 15000;
const SEND_TAX = 0.10;      // taxe de convoi sur l'or envoyé (0 entre partenaires commerciaux)

const COLLECT_CD = 60_000;
const ATTACK_CD = 60_000;
const EXPAND_CD = 120_000;
const TRAIN_CD = 30_000;
const DECREE_CD = 3_600_000;
const SHIELD_MS = 10 * 60_000;        // bouclier de la victime après une attaque
const BETRAY_SHIELD_MS = 30 * 60_000; // bouclier long après une trahison
const MARKET_MS = 86_400_000;
const TREATY_MS = 48 * 3_600_000;
const PENDING_MS = 24 * 3_600_000;
const EXPAND_BASE = 600;              // coût du prochain km² = 600 × km² actuels

const TITLES = [
  [-Infinity, -30, '😈 Tyran'],
  [-30, 0, '🗡️ Belliqueux'],
  [0, 30, '🧑‍⚖️ Neutre'],
  [30, 60, '🕊️ Diplomate'],
  [60, Infinity, '🛡️ Protecteur du peuple'],
];

const BARB_NAMES = ['Camp Sanglier 🐗', 'Repère des Corbeaux 🐦‍⬛', 'Horde de Sable 🏜️', 'Clan du Loup 🐺'];
const BARB_SLOTS = 3;
const BARB_RESPAWN_MS = 24 * 3_600_000;

const EVENTS = [
  { txt: '🚨 Cambriolage : −2000$', gold: -2000 },
  { txt: '🔥 Incendie : −5 bois', res: { wood: -5 } },
  { txt: '💥 Séisme : −1000$', gold: -1000 },
  { txt: '🦠 Épidémie : −40 habitants', pop: -40, moral: -5 },
  { txt: '🎁 Nouveau filon : +20 fer', res: { iron: 20 } },
  { txt: '💎 Gisement d’or : +1000$', gold: 1000 },
  { txt: '🎪 Fête foraine : moral +10', moral: 10 },
  { txt: '🚚 Convoi marchand : +10 pierre', res: { stone: 10 } },
  { txt: '🏅 Journée nationale : +500$, moral +5', gold: 500, moral: 5 },
  { txt: '🐭 Rats dans les silos : −8 bois', res: { wood: -8 } },
  { txt: '⛏️ Veine de cuivre : +15 cuivre', res: { copper: 15 } },
  { txt: '🌧️ Pluies diluviennes : −6 charbon', res: { coal: -6 } },
  { txt: '🎓 Nouveaux diplômés : +10 habitants', pop: 10 },
  { txt: '🛡️ Des mercenaires s’enrôlent : +1 soldat', unit: 'soldier' },
];

const DECREES = {
  conscription: { label: '🪖 Conscription', txt: '+1 soldat gratuit par collect, mais −20 % de revenus' },
  festival: { label: '🎪 Fête nationale', txt: 'coûte 500$ — moral +6 et +2 habitants par collect' },
  tax: { label: '💰 Impôt exceptionnel', txt: '+50 % d’or par collect, mais moral −5' },
};

const nf = (n) => String(Math.floor(Number(n) || 0));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const randInt = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

function titleFor(rep) {
  for (const [lo, hi, t] of TITLES) if (rep >= lo && rep < hi) return t;
  return '🧑‍⚖️ Neutre';
}

class CityGame {
  /**
   * @param {object} store JsonStore (db.cities) — store.data est la vérité.
   * @param {object} opts { rng, now } injectables pour les tests.
   */
  constructor(store, opts = {}) {
    this.store = store;
    this.rng = opts.rng || Math.random;
    this.now = opts.now || (() => Date.now());
    this._ensureShape();
  }

  /* ── Forme des données (tolère les vieux fichiers) ── */
  _ensureShape() {
    const d = this.store.data;
    if (!d.cities || typeof d.cities !== 'object') d.cities = {};
    if (!d.market || typeof d.market !== 'object') d.market = {};
    if (!d.market.prices) d.market.prices = {};
    if (typeof d.market.lastUpdate !== 'number') d.market.lastUpdate = 0;
    if (typeof d.market.shortage !== 'string') d.market.shortage = null;
    if (!Array.isArray(d.pending)) d.pending = [];
    if (!Array.isArray(d.news)) d.news = [];
    if (!Array.isArray(d.barbarians)) d.barbarians = [];
    for (const c of Object.values(d.cities)) this._fixCity(c);
  }

  _fixCity(c) {
    c.b = c.b || {};
    c.res = c.res || {};
    c.units = c.units || { soldier: 0, archer: 0, cavalry: 0 };
    c.officers = c.officers || { captain: false, general: false };
    c.treaties = c.treaties || {};
    c.notif = Array.isArray(c.notif) ? c.notif : [];
    if (typeof c.moral !== 'number') c.moral = 50;
    if (typeof c.km2 !== 'number') c.km2 = 1;
    if (typeof c.rep !== 'number') c.rep = 0;
    if (!c.produce) c.produce = [];
    if (typeof c.shieldUntil !== 'number') c.shieldUntil = 0;
  }

  save() { this.store.save(); }

  /* ── Accès ── */
  cityOf(uid) { return this.store.data.cities[String(uid)] || null; }
  allCities() { return Object.entries(this.store.data.cities); } // [uid, city]
  byName(name) {
    const n = String(name || '').trim().toLowerCase();
    if (!n) return null;
    for (const [uid, c] of this.allCities()) {
      if (String(c.name).toLowerCase() === n) return { uid, city: c };
    }
    return null;
  }
  nameOf(uid, fallback) {
    const c = this.cityOf(uid);
    return c ? c.name : String(fallback || 'Ville inconnue');
  }

  addNews(txt) {
    const d = this.store.data;
    d.news.unshift({ at: this.now(), txt });
    if (d.news.length > 40) d.news.length = 40;
  }

  notify(city, txt) {
    city.notif.push(txt);
    if (city.notif.length > 25) city.notif.splice(0, city.notif.length - 25);
  }

  /* ══════════════ CRÉATION / SUPPRESSION ══════════════ */

  create(uid, name, mayor) {
    name = String(name || '').trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 24) return { ok: false, err: 'Le nom doit faire 2 à 24 caractères.' };
    if (this.byName(name)) return { ok: false, err: `Le nom « ${name} » est déjà pris par une autre ville.` };
    if (this.cityOf(uid)) return { ok: false, err: 'Tu possèdes déjà une ville (Xcity delete confirm pour la raser).' };
    const rng = this.rng;
    const city = {
      uid: String(uid),
      name,
      mayor: String(mayor || 'Maire'),
      founded: this.now(),
      gold: 5000, pop: 50, lvl: 1, moral: 50, km2: 1,
      rep: 0,
      b: { house: 1, farm: 1, mine: 0, factory: 0, bank: 0, school: 0, transport: 0, barracks: 0 },
      res: Object.fromEntries(RES.map((r) => [r, randInt(rng, 20, 40)])),
      produce: [],
      units: { soldier: 0, archer: 0, cavalry: 0 },
      officers: { captain: false, general: false },
      decree: null,
      treaties: {}, notif: [],
      lastCollect: 0, lastAttack: 0, lastExpand: 0, lastTrain: 0, lastDecree: 0,
      shieldUntil: 0,
      wins: 0, losses: 0, betrayals: 0, barbRaids: 0, treatiesSigned: 0, sentGold: 0, touristsTotal: 0,
    };
    const picks = [...RES];
    for (let i = 0; i < 3; i++) city.produce.push(picks.splice(Math.floor(rng() * picks.length), 1)[0]);
    this.store.data.cities[String(uid)] = city;
    this.addNews(`🏙️ ${name} est fondée par ${city.mayor}.`);
    this.save();
    return { ok: true, city };
  }

  remove(uid) {
    const city = this.cityOf(uid);
    if (!city) return { ok: false, err: 'Tu n’as pas de ville.' };
    // Rupture propre de tous les traités
    for (const peer of Object.keys(city.treaties)) {
      const other = this.cityOf(peer);
      if (other) { delete other.treaties[String(uid)]; this.notify(other, `🏚️ ${city.name} a été rasée — traité annulé.`); }
    }
    this.addNews(`🏚️ ${city.name} a été rasée.`);
    delete this.store.data.cities[String(uid)];
    this.save();
    return { ok: true };
  }

  /* ══════════════ BÂTIR / COLLECTER / AMÉLIORER ══════════════ */

  build(uid, type) {
    const c = this.cityOf(uid);
    if (!c) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    if (!BUILD_COST[type]) return { ok: false, err: `Types : ${Object.keys(BUILD_COST).join(', ')}` };
    if (c.gold < BUILD_COST[type]) return { ok: false, err: `Fonds insuffisants (${nf(BUILD_COST[type])}$ nécessaires).` };
    c.gold -= BUILD_COST[type];
    c.b[type] = (c.b[type] || 0) + 1;
    if (type === 'house') c.pop += 5;
    this.save();
    return { ok: true, type, count: c.b[type], gold: c.gold, pop: c.pop };
  }

  /* Revenu de base (or) hors tourisme — utilisé par collect et par status. */
  baseIncome(c) {
    let income = c.pop * 2;
    for (const [k, n] of Object.entries(c.b)) income += (BUILD_INCOME[k] || 0) * n;
    if (c.decree === 'conscription') income = Math.floor(income * 0.8);
    if (c.decree === 'tax') income = Math.floor(income * 1.5);
    return income;
  }

  bankBonus(c, income) {
    const banks = Math.min(5, c.b.bank || 0);
    return Math.floor(income * banks * 0.02); // +2 %/banque, cap 10 %
  }

  /* 🧳 Tourisme : les km² attirent des touristes (moral boostant). */
  tourists(c) { return Math.floor(c.km2 * (50 + c.moral) / 10); }

  collect(uid) {
    const c = this.cityOf(uid);
    if (!c) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    const now = this.now();
    if (now - c.lastCollect < COLLECT_CD) {
      return { ok: false, err: `Cooldown collect : ${Math.ceil((COLLECT_CD - (now - c.lastCollect)) / 1000)} s` };
    }
    c.lastCollect = now;
    let income = this.baseIncome(c);
    income += this.bankBonus(c, income);

    // Moral : effets de seuil
    let moralMult = 1;
    if (c.moral >= 90) moralMult = 1.10;
    else if (c.moral < 30) moralMult = 0.80;
    income = Math.floor(income * moralMult);

    // 🧳 Tourisme (km² × moral)
    const tourists = this.tourists(c);
    const tourism = tourists * 2;
    c.gold += income + tourism;
    c.touristsTotal += tourists;

    // Production des ressources de spécialité
    const produced = {};
    for (const r of c.produce) {
      const q = randInt(this.rng, 1, 5);
      c.res[r] = (c.res[r] || 0) + q;
      produced[r] = q;
    }

    // Décrets
    let decreeNote = null;
    if (c.decree === 'conscription') { c.units.soldier += 1; decreeNote = '🪖 Conscription : +1 soldat'; }
    if (c.decree === 'festival') { c.pop += 2; c.moral = clamp(c.moral + 6, 0, 100); decreeNote = '🎪 Fête : +2 habitants, moral +6'; }
    if (c.decree === 'tax') { c.moral = clamp(c.moral - 5, 0, 100); decreeNote = '💰 Impôt : moral −5'; }
    if (!c.decree) c.moral = clamp(c.moral + 1, 0, 100);

    // Fuite de population si le moral est effondré
    let exodus = 0;
    if (c.moral < 30 && this.rng() < 0.10) { exodus = 5; c.pop = Math.max(10, c.pop - 5); }

    // 🎲 Événement (10 %)
    let event = null;
    if (this.rng() < 0.10) {
      event = pick(this.rng, EVENTS);
      if (event.gold) c.gold = Math.max(0, c.gold + event.gold);
      if (event.pop) c.pop = Math.max(10, c.pop + event.pop);
      if (event.moral) c.moral = clamp(c.moral + event.moral, 0, 100);
      if (event.res) for (const [k, v] of Object.entries(event.res)) c.res[k] = Math.max(0, (c.res[k] || 0) + v);
      if (event.unit) c.units[event.unit] += 1;
    }

    this.save();
    return {
      ok: true, income, tourism, tourists, produced, event: event ? event.txt : null,
      decreeNote, exodus, gold: c.gold, moral: c.moral,
    };
  }

  upgrade(uid) {
    const c = this.cityOf(uid);
    if (!c) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    const cost = c.lvl * 8000;
    const needPop = c.lvl * 60;
    const totalB = Object.values(c.b).reduce((s, v) => s + v, 0);
    const needB = c.lvl * 6;
    if (c.pop < needPop) return { ok: false, err: `Population insuffisante : ${c.pop}/${needPop}.` };
    if (c.gold < cost) return { ok: false, err: `Fonds insuffisants : ${nf(c.gold)}/${nf(cost)}$.` };
    if (totalB < needB) return { ok: false, err: `Bâtiments insuffisants : ${totalB}/${needB}.` };
    c.gold -= cost;
    c.lvl += 1;
    this.addNews(`🏛️ ${c.name} passe au 𝗟𝘃𝗹 ${c.lvl} !`);
    this.save();
    return { ok: true, lvl: c.lvl, cost, gold: c.gold };
  }

  /* ══════════════ TERRITOIRE (km²) & TOURISME ══════════════ */

  expand(uid) {
    const c = this.cityOf(uid);
    if (!c) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    const now = this.now();
    if (now - c.lastExpand < EXPAND_CD) {
      return { ok: false, err: `Cooldown expansion : ${Math.ceil((EXPAND_CD - (now - c.lastExpand)) / 1000)} s` };
    }
    const cost = EXPAND_BASE * c.km2;
    if (c.gold < cost) return { ok: false, err: `L’annexion de 1 km² coûte ${nf(cost)}$ (fonds : ${nf(c.gold)}$).` };
    c.gold -= cost;
    c.km2 += 1;
    c.pop += 2;
    c.lastExpand = now;
    const before = this.tourists(c) - Math.floor(((50 + c.moral) / 10)); // ≈ gain de touristes/collect
    let news = false;
    if ([5, 10, 20, 30, 50].includes(c.km2)) {
      this.addNews(`📐 ${c.name} s’étend désormais sur ${c.km2} km² !`);
      news = true;
    }
    this.save();
    return { ok: true, km2: c.km2, cost, gold: c.gold, pop: c.pop, tourists: this.tourists(c), touristGain: before, news };
  }

  /* ══════════════ ARMÉE : UNITÉS & OFFICIERS ══════════════ */

  unitCapacity(c) { return Math.min(60, (c.b.barracks || 0) * 10); }
  unitCount(c) { return (c.units.soldier || 0) + (c.units.archer || 0) + (c.units.cavalry || 0); }

  train(uid, unit) {
    const c = this.cityOf(uid);
    if (!c) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    const u = UNITS[unit];
    if (!u) return { ok: false, err: `Unités : ${Object.keys(UNITS).join(', ')}` };
    if (c.lvl < u.minLvl) return { ok: false, err: `${u.label} débloqué au 𝗟𝘃𝗹 ${u.minLvl} (tu es ${c.lvl}).` };
    if (!(c.b.barracks > 0)) return { ok: false, err: 'Construis d’abord une 🪖 caserne (Xcity build barracks).' };
    if (this.unitCount(c) >= this.unitCapacity(c)) {
      return { ok: false, err: `Caserne pleine (${this.unitCount(c)}/${this.unitCapacity(c)}) — construis-en plus.` };
    }
    const now = this.now();
    if (now - c.lastTrain < TRAIN_CD) return { ok: false, err: 'Cooldown recrutement : 30 s' };
    c.lastTrain = now;
    if (c.gold < u.cost) return { ok: false, err: `Fonds insuffisants (${nf(u.cost)}$).` };
    c.gold -= u.cost;
    c.units[unit] += 1;
    this.save();
    return { ok: true, unit, cost: u.cost, count: c.units[unit], gold: c.gold, capacity: this.unitCapacity(c), total: this.unitCount(c) };
  }

  buyOfficer(uid, which) {
    const c = this.cityOf(uid);
    if (!c) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    const o = OFFICERS[which];
    if (!o) return { ok: false, err: 'Officiers : capitaine, general' };
    if (c.officers[which]) return { ok: false, err: `${o.label} est déjà à ton service.` };
    if (c.lvl < o.minLvl) return { ok: false, err: `${o.label} débloqué au 𝗟𝘃𝗹 ${o.minLvl}.` };
    if (c.gold < o.cost) return { ok: false, err: `Fonds insuffisants (${nf(o.cost)}$).` };
    c.gold -= o.cost;
    c.officers[which] = true;
    this.addNews(`${o.label} rejoint la ville de ${c.name}.`);
    this.save();
    return { ok: true, officer: which, cost: o.cost, gold: c.gold };
  }

  /* Puissance militaire effective. */
  power(c, mode) {
    let p = 0;
    for (const [k, n] of Object.entries(c.units || {})) p += (Number(n) || 0) * (UNITS[k] ? UNITS[k].pow : 0);
    if (mode === 'att' && c.officers.captain) p *= 1.15;
    if (mode === 'def' && c.officers.general) p *= 1.20;
    return p;
  }

  armyRating(c) {
    const p = this.power(c, 'def');
    if (p <= 0) return '🐤 inexistante';
    if (p < 10) return '🪃 faible';
    if (p < 30) return '⚔️ moyenne';
    if (p < 80) return '🛡️ solide';
    return '🏰 redoutable';
  }

  _applyLosses(c, pct) {
    let lost = 0;
    for (const k of Object.keys(c.units)) {
      const n = c.units[k] || 0;
      if (n <= 0) continue;
      const l = Math.min(n, Math.max(1, Math.ceil(n * pct)));
      c.units[k] = n - l;
      lost += l;
    }
    return lost;
  }

  /* ══════════════ ATTAQUES ══════════════ */

  treatyBetween(uidA, uidB) {
    const a = this.cityOf(uidA);
    if (!a) return null;
    const t = a.treaties[String(uidB)];
    if (!t) return null;
    if (this.now() > t.until) { // expiré de lui-même
      delete a.treaties[String(uidB)];
      const b = this.cityOf(uidB);
      if (b) delete b.treaties[String(uidA)];
      return null;
    }
    return t;
  }

  attack(uid, targetName) {
    const me = this.cityOf(uid);
    if (!me) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    const found = this.byName(targetName);
    if (!found) return { ok: false, err: 'Ville introuvable — vérifie le nom (Xcity top).' };
    const { uid: targetUid, city: target } = found;
    if (String(targetUid) === String(uid)) return { ok: false, err: 'Pas toi-même 🙃' };
    const now = this.now();
    if (now - me.lastAttack < ATTACK_CD) return { ok: false, err: 'Cooldown attaque : 60 s' };
    if (now < target.shieldUntil) {
      return { ok: false, err: `🛡️ ${target.name} est sous bouclier (${Math.ceil((target.shieldUntil - now) / 60000)} min).` };
    }
    me.lastAttack = now;

    const treaty = this.treatyBetween(uid, targetUid);

    /* 🗡️ TRAHISON : attaquer une ville liée par traité = victoire automatique,
     * 80 % de son or pillé, réputation en ruine. */
    if (treaty) {
      const type = treaty.type;
      const loot = Math.floor(target.gold * BETRAY_RATE);
      target.gold -= loot;
      me.gold += loot;
      // Rupture immédiate et bilatérale
      delete me.treaties[String(targetUid)];
      delete target.treaties[String(uid)];
      me.rep += BETRAY_REP[type];
      me.betrayals += 1;
      me.wins += 1;
      target.moral = clamp(target.moral - 15, 0, 100);
      target.shieldUntil = now + BETRAY_SHIELD_MS;
      const victimTxt = `🗡️ TRAHISON ! ${me.name} (traité ${TREATY_TYPES[type].label}) a pillé ${nf(loot)}$ — 80 % de ton or !`;
      this.notify(target, victimTxt);
      this.addNews(`🗡️ ${me.name} a TRAHI son traité avec ${target.name} : ${nf(loot)}$ volés !`);
      this.save();
      return {
        ok: true, betrayal: true, treatyType: type, win: true, loot,
        rep: me.rep, title: titleFor(me.rep),
        dm: [{ to: targetUid, txt: victimTxt }],
      };
    }

    /* Combat normal : puissance × aléa (0,8–1,2), léger avantage défenseur. */
    const rollA = this.power(me, 'att') * (0.8 + 0.4 * this.rng());
    const rollD = this.power(target, 'def') * 1.1 * (0.8 + 0.4 * this.rng());
    let win;
    if (this.power(me, 'att') <= 0 && this.power(target, 'def') <= 0) win = this.rng() < 0.5;
    else win = rollA > rollD;

    if (win) {
      let loot = Math.min(LOOT_CAP, Math.floor(target.gold * LOOT_RATE));
      // Pillage de ressources en plus
      const pillage = {};
      const pool = [...RES];
      for (let i = 0; i < 2 && pool.length; i++) {
        const r = pool.splice(Math.floor(this.rng() * pool.length), 1)[0];
        const q = Math.min(10, target.res[r] || 0);
        if (q > 0) { target.res[r] -= q; me.res[r] = (me.res[r] || 0) + q; pillage[r] = q; }
      }
      target.gold -= loot;
      me.gold += loot;
      // Butin partagé entre alliés de l'attaquant
      let shareNote = null;
      for (const [peer, t] of Object.entries(me.treaties)) {
        if (t.type !== 'alliance' || this.now() > t.until) continue;
        const ally = this.cityOf(peer);
        if (!ally || String(peer) === String(targetUid)) continue;
        const share = Math.floor(loot * 0.10);
        if (share > 0) {
          me.gold -= share; ally.gold += share;
          this.notify(ally, `⚔️ Ton allié ${me.name} a pillé ${target.name} — ta part : +${nf(share)}$`);
          shareNote = `${this.nameOf(peer)} touche ${nf(share)}$ (alliance)`;
        }
        break;
      }
      const lostA = this._applyLosses(me, 0.05);
      const lostD = this._applyLosses(target, 0.25);
      target.armyBefore = undefined;
      me.wins += 1; target.losses += 1;
      target.moral = clamp(target.moral - 8, 0, 100);
      me.moral = clamp(me.moral + 3, 0, 100);
      target.shieldUntil = now + SHIELD_MS;
      const victimTxt = `⚔️ ${me.name} a pillé ${target.name} : −${nf(loot)}$ (défense débordée).`;
      this.notify(target, victimTxt);
      this.addNews(`⚔️ ${me.name} a pillé ${target.name} (+${nf(loot)}$).`);
      this.save();
      return {
        ok: true, win: true, loot, pillage, lostA, lostD,
        rollA: Math.round(rollA * 10) / 10, rollD: Math.round(rollD * 10) / 10,
        shareNote, gold: me.gold,
        dm: [{ to: targetUid, txt: victimTxt }],
      };
    }

    // Défaite
    const lostA = this._applyLosses(me, 0.25);
    const lostD = this._applyLosses(target, 0.05);
    me.losses += 1; target.wins += 1;
    me.moral = clamp(me.moral - 5, 0, 100);
    target.rep += 2; // défense victorieuse
    const victimTxt = `🛡️ ${target.name} a repoussé l’attaque de ${me.name} ! (+2 réputation)`;
    this.notify(target, victimTxt);
    this.addNews(`🛡️ ${target.name} a repoussé ${me.name}.`);
    this.save();
    return {
      ok: true, win: false, loot: 0, lostA, lostD,
      rollA: Math.round(rollA * 10) / 10, rollD: Math.round(rollD * 10) / 10,
      dm: [{ to: targetUid, txt: victimTxt }],
    };
  }

  /* ══════════════ TRAITÉS & DIPLOMATIE ══════════════ */

  treatyPropose(uid, targetName, type) {
    const me = this.cityOf(uid);
    if (!me) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    const t = TREATY_TYPES[type];
    if (!t) return { ok: false, err: 'Types de traités : peace (paix), alliance, trade (commerce).' };
    const found = this.byName(targetName);
    if (!found) return { ok: false, err: 'Ville cible introuvable.' };
    const { uid: targetUid, city: target } = found;
    if (String(targetUid) === String(uid)) return { ok: false, err: 'Pas toi-même 🙃' };
    if (this.treatyBetween(uid, targetUid)) return { ok: false, err: `Un traité existe déjà avec ${target.name}.` };
    const d = this.store.data;
    d.pending = d.pending.filter((p) => this.now() - p.at < PENDING_MS);
    if (d.pending.some((p) => (p.from === String(uid) && p.to === String(targetUid)) || (p.from === String(targetUid) && p.to === String(uid)))) {
      return { ok: false, err: `Une proposition est déjà en attente avec ${target.name}.` };
    }
    d.pending.push({ id: `${now32()}`, from: String(uid), to: String(targetUid), type, at: this.now() });
    const txt = `📜 ${me.name} te propose un traité ${t.label} — accepte : Xcity treaty accept ${me.name}`;
    this.notify(target, txt);
    this.save();
    return { ok: true, type, targetName: target.name, dm: [{ to: targetUid, txt }] };
  }

  treatyRespond(uid, fromName, accept) {
    const me = this.cityOf(uid);
    if (!me) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    const d = this.store.data;
    d.pending = d.pending.filter((p) => this.now() - p.at < PENDING_MS);
    const idx = d.pending.findIndex((p) => p.to === String(uid) && this.byName(fromName) && p.from === this.byName(fromName).uid);
    if (idx === -1) return { ok: false, err: `Aucune proposition de ${fromName} — vérifie le nom exact.` };
    const prop = d.pending.splice(idx, 1)[0];
    const from = this.cityOf(prop.from);
    if (!from) return { ok: false, err: 'Cette ville n’existe plus.' };
    if (!accept) {
      this.notify(from, `❌ ${me.name} a REFUSÉ ton traité ${TREATY_TYPES[prop.type].label}.`);
      this.save();
      return { ok: true, accepted: false, fromName: from.name, type: prop.type };
    }
    const until = this.now() + TREATY_MS;
    me.treaties[prop.from] = { type: prop.type, since: this.now(), until };
    from.treaties[String(uid)] = { type: prop.type, since: this.now(), until };
    me.rep += 2; from.rep += 2;
    me.treatiesSigned += 1; from.treatiesSigned += 1;
    me.moral = clamp(me.moral + 3, 0, 100); from.moral = clamp(from.moral + 3, 0, 100);
    this.addNews(`📜 Traité ${TREATY_TYPES[prop.type].label} signé : ${from.name} × ${me.name}.`);
    this.save();
    return { ok: true, accepted: true, fromName: from.name, type: prop.type };
  }

  treatyBreak(uid, targetName) {
    const me = this.cityOf(uid);
    if (!me) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    const found = this.byName(targetName);
    if (!found) return { ok: false, err: 'Ville introuvable.' };
    const t = this.treatyBetween(uid, found.uid);
    if (!t) return { ok: false, err: `Aucun traité avec ${found.city.name}.` };
    delete me.treaties[String(found.uid)];
    delete found.city.treaties[String(uid)];
    me.rep -= 15;
    const txt = `💔 ${me.name} a ROMPU le traité ${TREATY_TYPES[t.type].label} (${found.city.name} prévenue).`;
    this.notify(found.city, txt);
    this.addNews(`💔 ${me.name} a rompu son traité avec ${found.city.name}.`);
    this.save();
    return { ok: true, brokenType: t.type, rep: me.rep, title: titleFor(me.rep), dm: [{ to: found.uid, txt }] };
  }

  treatiesList(uid) {
    const me = this.cityOf(uid);
    if (!me) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    const rows = [];
    for (const [peer, t] of Object.entries(me.treaties)) {
      if (this.now() > t.until) continue;
      rows.push({ name: this.nameOf(peer), type: t.type, hoursLeft: Math.max(0, Math.ceil((t.until - this.now()) / 3_600_000)) });
    }
    const invites = this.store.data.pending.filter((p) => p.to === String(uid) && this.now() - p.at < PENDING_MS);
    return { ok: true, rows, invites };
  }

  /* ══════════════ ENVOIS (or & ressources) ══════════════ */

  send(uid, targetName, kind, key, qty) {
    const me = this.cityOf(uid);
    if (!me) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    const found = this.byName(targetName);
    if (!found) return { ok: false, err: 'Ville cible introuvable.' };
    const { uid: targetUid, city: target } = found;
    if (String(targetUid) === String(uid)) return { ok: false, err: 'Pas toi-même 🙃' };
    qty = Math.floor(Number(qty));
    if (!Number.isFinite(qty) || qty <= 0) return { ok: false, err: 'Format : Xcity send <ville> money <somme> | Xcity send <ville> <res> <qté>' };

    if (kind === 'money') {
      if (qty < 100) return { ok: false, err: 'Minimum 100$ par envoi.' };
      if (me.gold < qty) return { ok: false, err: `Fonds insuffisants (${nf(me.gold)}$).` };
      const partner = this.treatyBetween(uid, targetUid) && this.treatyBetween(uid, targetUid).type === 'trade';
      const tax = partner ? 0 : Math.floor(qty * SEND_TAX);
      me.gold -= qty;
      target.gold += qty - tax;
      me.sentGold += qty;
      if (qty >= 1000) me.rep += 1; // générosité
      const txt = `💱 ${me.name} t’a envoyé ${nf(qty - tax)}$${tax ? ` (taxe de convoi : ${nf(tax)}$)` : ' (pacte commercial : 0 taxe)'}.`;
      this.notify(target, txt);
      this.save();
      return { ok: true, kind, amount: qty, tax, received: qty - tax, targetName: target.name, rep: me.rep, dm: [{ to: targetUid, txt }] };
    }

    if (!RES.includes(key)) return { ok: false, err: `Ressources : ${RES.join(', ')}` };
    if ((me.res[key] || 0) < qty) return { ok: false, err: `${RES_LABEL[key]} : stock insuffisant (${me.res[key] || 0}).` };
    me.res[key] -= qty;
    target.res[key] = (target.res[key] || 0) + qty;
    const txt = `📦 ${me.name} t’a envoyé ${qty} × ${RES_LABEL[key]}.`;
    this.notify(target, txt);
    this.save();
    return { ok: true, kind: 'res', key, qty, targetName: target.name, dm: [{ to: targetUid, txt }] };
  }

  /* ══════════════ DÉCRETS ══════════════ */

  decree(uid, type) {
    const c = this.cityOf(uid);
    if (!c) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    if (type === 'none') { c.decree = null; this.save(); return { ok: true, decree: null }; }
    const dec = DECREES[type];
    if (!dec) return { ok: false, err: 'Décrets : conscription, festival, tax — ou none.' };
    const now = this.now();
    if (now - c.lastDecree < DECREE_CD) {
      return { ok: false, err: `Changement de décret possible dans ${Math.ceil((DECREE_CD - (now - c.lastDecree)) / 60000)} min.` };
    }
    if (type === 'festival' && c.gold < 500) return { ok: false, err: 'La fête coûte 500$.' };
    if (type === 'festival') c.gold -= 500;
    c.decree = type;
    c.lastDecree = now;
    this.save();
    return { ok: true, decree: type, label: dec.label };
  }

  /* ══════════════ GRAND MARCHÉ ══════════════ */

  refreshMarket() {
    const m = this.store.data.market;
    const now = this.now();
    if (now - m.lastUpdate < MARKET_MS && Object.keys(m.prices).length === RES.length) return false;
    m.prices = {};
    for (const r of RES) m.prices[r] = randInt(this.rng, RANGE[r][0], RANGE[r][1]);
    m.shortage = pick(this.rng, RES);
    m.lastUpdate = now;
    this.save();
    return true;
  }

  priceOf(r) {
    const m = this.store.data.market;
    const base = m.prices[r] || RANGE[r][0];
    return r === m.shortage ? base * 2 : base; // pénurie : ×2
  }

  marketView() {
    this.refreshMarket();
    return { prices: { ...this.store.data.market.prices }, shortage: this.store.data.market.shortage };
  }

  marketTrade(uid, action, res, qty) {
    const c = this.cityOf(uid);
    if (!c) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    this.refreshMarket();
    if (!RES.includes(res)) return { ok: false, err: `Ressources : ${RES.join(', ')}` };
    qty = Math.floor(Number(qty));
    if (!Number.isFinite(qty) || qty <= 0) return { ok: false, err: 'Format : Xcity buy <res> <qté>' };
    const unit = this.priceOf(res);
    const total = unit * qty;
    if (action === 'buy') {
      if (c.gold < total) return { ok: false, err: `Coût : ${nf(total)}$ — fonds : ${nf(c.gold)}$.` };
      c.gold -= total;
      c.res[res] = (c.res[res] || 0) + qty;
      this.save();
      return { ok: true, action, res, qty, total, gold: c.gold, shortage: this.store.data.market.shortage };
    }
    if ((c.res[res] || 0) < qty) return { ok: false, err: `${RES_LABEL[res]} : stock insuffisant (${c.res[res] || 0}).` };
    c.res[res] -= qty;
    c.gold += total;
    this.save();
    return { ok: true, action, res, qty, total, gold: c.gold, shortage: this.store.data.market.shortage };
  }

  /* ══════════════ BARBARES (PvE) ══════════════ */

  ensureBarbs() {
    const d = this.store.data;
    const now = this.now();
    let spawned = false;
    while (d.barbarians.length < BARB_SLOTS) {
      const topLvl = Math.max(1, ...this.allCities().map(([, c]) => c.lvl || 1));
      d.barbarians.push({
        id: d.barbarians.length + 1,
        name: BARB_NAMES[d.barbarians.length % BARB_NAMES.length],
        power: randInt(this.rng, 4 + topLvl, 8 + topLvl * 3),
        gold: randInt(this.rng, 800, 1200) * Math.max(1, topLvl),
        res: { [pick(this.rng, RES)]: randInt(this.rng, 10, 25) },
        power0: 0,
        respawnAt: 0,
      });
      spawned = true;
    }
    for (const b of d.barbarians) {
      if (b.power <= 0 && now >= b.respawnAt) {
        const topLvl = Math.max(1, ...this.allCities().map(([, c]) => c.lvl || 1));
        b.power = randInt(this.rng, 4 + topLvl, 8 + topLvl * 3);
        b.power0 = 0;
        b.gold = randInt(this.rng, 800, 1200) * Math.max(1, topLvl);
        b.res = { [pick(this.rng, RES)]: randInt(this.rng, 10, 25) };
        b.respawnAt = 0;
        spawned = true;
      }
    }
    if (spawned) this.save();
    return d.barbarians;
  }

  raid(uid, slotNo) {
    const me = this.cityOf(uid);
    if (!me) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    const camps = this.ensureBarbs();
    const camp = camps.find((b) => b.id === Number(slotNo));
    if (!camp) return { ok: false, err: `Camps : 1-${camps.length} (Xcity barbarians).` };
    if (camp.power <= 0) return { ok: false, err: `${camp.name} est détruit — retour dans ~24 h.` };
    const now = this.now();
    if (now - me.lastAttack < ATTACK_CD) return { ok: false, err: 'Cooldown raid : 60 s' };
    me.lastAttack = now;
    const rollA = this.power(me, 'att') * (0.8 + 0.4 * this.rng());
    const rollD = camp.power * (0.8 + 0.4 * this.rng());
    const win = this.power(me, 'att') > 0 ? rollA > rollD : this.rng() < 0.35;
    if (win) {
      const gold = camp.gold;
      me.gold += gold;
      for (const [r, q] of Object.entries(camp.res)) me.res[r] = (me.res[r] || 0) + q;
      const lostA = this._applyLosses(me, 0.05);
      camp.power = 0;
      camp.respawnAt = now + BARB_RESPAWN_MS;
      me.wins += 1; me.barbRaids += 1; me.rep += 3;
      this.addNews(`🏕️ ${me.name} a rasé ${camp.name} !`);
      this.save();
      return { ok: true, win: true, camp: camp.name, gold, res: { ...camp.res }, lostA, rep: me.rep };
    }
    const lostA = this._applyLosses(me, 0.25);
    me.losses += 1;
    me.moral = clamp(me.moral - 3, 0, 100);
    this.save();
    return { ok: true, win: false, camp: camp.name, lostA, rollA: Math.round(rollA * 10) / 10, rollD: Math.round(rollD * 10) / 10 };
  }

  /* ══════════════ VUES ══════════════ */

  status(uid) {
    const c = this.cityOf(uid);
    if (!c) return null;
    const buildings = Object.entries(c.b).filter(([, v]) => v > 0).map(([k, v]) => `${BUILD_LABEL[k]} ×${v}`).join(' · ') || '—';
    const ress = RES.map((r) => `${RES_LABEL[r].split(' ')[0]}${c.res[r] || 0}`).join(' ');
    const units = `🪖${c.units.soldier || 0} 🏹${c.units.archer || 0} 🐎${c.units.cavalry || 0}`;
    const treaties = Object.entries(c.treaties)
      .filter(([, t]) => this.now() <= t.until)
      .map(([peer, t]) => `${TREATY_TYPES[t.type].label} ${this.nameOf(peer)}`).join(' · ') || 'aucun';
    return {
      city: c, title: titleFor(c.rep),
      lines: {
        main: `💰 ${nf(c.gold)}$ · 👥 ${nf(c.pop)} · 😊 moral ${c.moral}/100 · 🪖 ${units}`,
        land: `📐 ${c.km2} km² · 🧳 ${this.tourists(c)} touristes/collect (+${nf(this.tourists(c) * 2)}$) · revenu ≈ ${nf(this.baseIncome(c) + this.bankBonus(c, this.baseIncome(c)) + this.tourists(c) * 2)}$`,
        buildings: `🏗️ ${buildings}`,
        ress: `📦 ${ress} — spécialités : ${c.produce.map((r) => RES_LABEL[r]).join(', ')}`,
        army: `🎖️ ${this.armyRating(c)}${c.officers.captain ? ' · Capitaine' : ''}${c.officers.general ? ' · Général' : ''}`,
        decree: `📜 Décret : ${c.decree ? DECREES[c.decree].label : 'aucun'}`,
        treaties: `🤝 Traités : ${treaties}`,
        rep: `⭐ Réputation ${c.rep} (${titleFor(c.rep)}) — ✅${c.wins} ❌${c.losses} 🗡️${c.betrayals}`,
      },
    };
  }

  profile(targetName) {
    const found = this.byName(targetName);
    if (!found) return null;
    const c = found.city;
    return {
      name: c.name, mayor: c.mayor, lvl: c.lvl, pop: c.pop, km2: c.km2,
      gold: c.gold, moral: c.moral, rep: c.rep, title: titleFor(c.rep),
      buildings: Object.entries(c.b).filter(([, v]) => v > 0).map(([k, v]) => `${BUILD_LABEL[k]} ×${v}`).join(' · '),
      army: this.armyRating(c),
      wins: c.wins, losses: c.losses,
    };
  }

  top(kind) {
    const key = { or: 'gold', pop: 'pop', rep: 'rep', armee: 'army' }[kind] || 'gold';
    const rows = this.allCities().map(([uid, c]) => ({
      name: c.name, mayor: c.mayor, title: titleFor(c.rep),
      gold: c.gold, pop: c.pop, rep: c.rep, army: this.power(c, 'def'),
    }));
    rows.sort((a, b) => (b[key] || 0) - (a[key] || 0));
    return { kind, rows: rows.slice(0, 5) };
  }
}

/* id de proposition court et suffisant */
let _seq = 0;
function now32() { _seq = (_seq + 1) % 10000; return Date.now().toString(36) + _seq.toString(36); }

module.exports = {
  CityGame,
  RES, RES_LABEL, RANGE, BUILD_COST, BUILD_INCOME, BUILD_LABEL,
  UNITS, OFFICERS, TREATY_TYPES, DECREES, EVENTS, TITLES,
  BETRAY_RATE, BETRAY_REP, LOOT_RATE, LOOT_CAP, SEND_TAX, EXPAND_BASE,
  COLLECT_CD, ATTACK_CD, EXPAND_CD, TRAIN_CD, MARKET_MS, TREATY_MS, SHIELD_MS,
  titleFor,
};

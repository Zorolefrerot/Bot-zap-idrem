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

const BUILD_COST = { house: 500, farm: 700, mine: 900, factory: 1500, bank: 2000, school: 1200, transport: 1000, barracks: 2500, lab: 3000 };
const BUILD_INCOME = { farm: 15, mine: 25, factory: 100, bank: 150, school: 30, transport: 20 };
const BUILD_LABEL = {
  house: '🏠 Maisons', farm: '🌾 Fermes', mine: '⛏️ Mines', factory: '🏭 Usines',
  bank: '🏦 Banques', school: '🎓 Écoles', transport: '🚉 Transports', barracks: '🪖 Casernes',
  lab: '🧪 Laboratoires',
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
/* 🧪 Éléments chimiques (découverts en laboratoire) — 6 communs, 3 rares. */
const ELEMENTS = {
  carbone: { label: '⚫ Carbone', rare: false },
  oxygene: { label: '💧 Oxygène', rare: false },
  azote: { label: '🌫️ Azote', rare: false },
  soufre: { label: '🟡 Soufre', rare: false },
  phosphore: { label: '🟣 Phosphore', rare: false },
  calcium: { label: '🦴 Calcium', rare: false },
  mercure: { label: '🔴 Mercure', rare: true },
  cesium: { label: '☢️ Césium', rare: true },
  plutonium: { label: '☣️ Plutonium', rare: true },
};
const LAB_SCI_PER = 3;          // scientifiques par laboratoire
const HIRE_COST = 800;          // embauche d’un scientifique
const RESEARCH_CD = 90_000;     // campagne de recherche
const RESEARCH_COST = 200;
const SYNTH_CD = 5 * 60_000;    // « pas des virus à tout moment »
const VIRUS_LAUNCH_CD = 3 * 60_000;
const VIRUS_COST = 500;
const PANDEMIC_COST = 2000;
const CURE_PRICE = 100;         // soins urgents / habitant infecté
const DEATH_BOUNTY = 200;       // $ au créateur par habitant mort
const DEATH_RATE = 0.6;         // part des infectés qui meurt sans remède
const VIRUS_LIFE_MIN = [20, 35];       // durée de vie d’un virus (min)
const PANDEMIC_LIFE_MIN = [45, 60];    // durée de vie d’une pandémie (min)
const RANSOM_MIN = 500;

/* 🏛️ Assemblée des villes — élections du PRÉSIDENT GÉNÉRAL. */
const CANDIDACY_FEE = 50_000;      // caution de candidature (versée au trésor de l'Assemblée)
const CANDIDACY_MS = 30 * 60_000;  // période de candidature
const VOTING_MS = 24 * 3_600_000;  // période de vote
const MANDATE_MS = 72 * 3_600_000; // mandat du Président : 3 JOURS
const PRES_SALARY = 50_000;        // salaire horaire du Président (frappé par le Gouvernement Supérieur)
const SALARY_MS = 3_600_000;
const VOTE_WEIGHT = 20;            // le vote d'un maire vaut 20 points
const PRES_TAX = 10;               // $/min/ville versés au trésor de l'Assemblée
const SCANDAL_PENALTY = 1000;      // malus par scandale au comptage des voix
const CURRENCIES = ['$', '€', '¥', '¢', '£', 'XOF', 'FC', 'FCFA', 'CFA', '₣', '₦'];
const QUARANTINE_MS = 30 * 60_000;
const VACCINE_PRICE = 80;          // marché noir : remède revendu 80$/habitant (au lieu de 100$)

/* 🏗️ Grands Travaux communautaires : étapes → bonus mondiaux 24 h. */
const WORKS = {
  pont: { label: '🌉 Grand Pont', stages: [15000, 25000, 40000], buff: 'pont', txt: '+10 % de touristes pour toutes les villes (24 h)' },
  aqueduc: { label: '🚰 Grand Aqueduc', stages: [20000, 35000], buff: 'aqueduc', txt: '+5 habitants par collect partout (24 h)' },
  universite: { label: '🎓 Université mondiale', stages: [20000, 30000, 50000], buff: 'universite', txt: '+5 % de revenus partout (24 h)' },
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
    if (!Array.isArray(d.viruses)) d.viruses = [];
    if (!d.virusArchive || typeof d.virusArchive !== 'object') d.virusArchive = {};
    if (!d.assembly || typeof d.assembly !== 'object') d.assembly = {};
    const A = d.assembly;
    if (typeof A.treasury !== 'number') A.treasury = 0;
    if (typeof A.currency !== 'string' || !A.currency) A.currency = '$';
    if (typeof A.lastTick !== 'number') A.lastTick = 0;
    if (typeof A.lastSalary !== 'number') A.lastSalary = 0;
    if (typeof A.decreeUsed !== 'boolean') A.decreeUsed = false;
    if (A.worldDecree === undefined) A.worldDecree = null;
    if (A.tribunal === undefined) A.tribunal = null;
    if (A.loi === undefined) A.loi = null;
    if (!Array.isArray(A.constitution)) A.constitution = [];
    if (A.works === undefined) A.works = null;
    if (!Array.isArray(A.worksDone)) A.worksDone = [];
    if (A.catastrophe === undefined) A.catastrophe = null;
    if (A.sommet === undefined) A.sommet = null;
    if (typeof A.lastBulletin !== 'number') A.lastBulletin = 0;
    if (typeof A.garde !== 'number') A.garde = 0;
    if (!A.buffs || typeof A.buffs !== 'object') A.buffs = {};
    if (typeof A.until !== 'number') A.until = 0;
    if (A.president === undefined) A.president = null;
    if (!A.election || typeof A.election !== 'object') A.election = null;
    for (const [k, c] of Object.entries(d.cities)) { if (!c.uid) c.uid = String(k); this._fixCity(c); }
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
    if (!c.elements || typeof c.elements !== 'object') c.elements = {};
    if (typeof c.scientists !== 'number') c.scientists = 0;
    if (typeof c.lastResearch !== 'number') c.lastResearch = 0;
    if (typeof c.lastSynth !== 'number') c.lastSynth = 0;
    if (typeof c.lastVirus !== 'number') c.lastVirus = 0;
    if (!c.cds || typeof c.cds !== 'object') c.cds = {};
    if (typeof c.nukes !== 'number') c.nukes = 0;
    if (typeof c.scandals !== 'number') c.scandals = 0;
    if (typeof c.immuneUntil !== 'number') c.immuneUntil = 0;
    if (typeof c.farmBlight !== 'number') c.farmBlight = 0;
    if (typeof c.sabotaged !== 'number') c.sabotaged = 0;
    if (typeof c.quarantineUntil !== 'number') c.quarantineUntil = 0;
    if (typeof c.lastVirusHit !== 'string') c.lastVirusHit = '';
    if (typeof c.guard !== 'number') c.guard = 0;
    if (typeof c.embargoUntil !== 'number') c.embargoUntil = 0;
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
      lastResearch: 0, lastSynth: 0, lastVirus: 0,
      elements: {}, scientists: 0,
      cds: {}, nukes: 0, scandals: 0, immuneUntil: 0,
      farmBlight: 0, sabotaged: 0, quarantineUntil: 0, lastVirusHit: '',
      guard: 0, embargoUntil: 0,
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
    // Ses virus non lancés s’éteignent avec leur créateur
    const d = this.store.data;
    d.viruses = d.viruses.filter((v) => !(String(v.creator) === String(uid) && !v.deadline));
    delete this.store.data.cities[String(uid)];
    this.save();
    return { ok: true };
  }

  /* ══════════════ BÂTIR / COLLECTER / AMÉLIORER ══════════════ */

  build(uid, type) {
    const c = this.cityOf(uid);
    if (!c) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    if (!BUILD_COST[type]) return { ok: false, err: `Types : ${Object.keys(BUILD_COST).join(', ')}` };
    const cost = this.catastropheFor(uid) ? Math.ceil(BUILD_COST[type] / 2) : BUILD_COST[type];
    if (c.gold < cost) return { ok: false, err: `Fonds insuffisants (${nf(cost)}${this.cur()} nécessaires).` };
    c.gold -= cost;
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
    if (this.buffActive('universite')) income = Math.floor(income * 1.05); // 🎓 Grands Travaux
    if (this.decreeActive('corvee')) income = Math.floor(income * 1.3);    // ⚒️ Décret mondial
    return income;
  }

  bankBonus(c, income) {
    const banks = Math.min(5, c.b.bank || 0);
    return Math.floor(income * banks * 0.02); // +2 %/banque, cap 10 %
  }

  /* 🧳 Tourisme : les km² attirent des touristes (moral boostant). */
  tourists(c) { const base = Math.floor(c.km2 * (50 + c.moral) / 10); return this.buffActive('pont') ? Math.floor(base * 1.1) : base; }

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

    // 🥀 Biotoxine : fermes improductives — 🧨 Sabotage : revenus divisés par 2
    let blightNote = null, sabNote = null;
    if (c.farmBlight > 0) {
      income -= (BUILD_INCOME.farm || 0) * (c.b.farm || 0);
      c.farmBlight -= 1;
      blightNote = `🥀 Biotoxine : fermes improductives (${c.farmBlight} collect(s) restantes)`;
    }
    if (c.sabotaged > 0) {
      income = Math.floor(income * 0.5);
      c.sabotaged -= 1;
      sabNote = `🧨 Sabotage : revenus réduits de moitié (${c.sabotaged} collect(s) restantes)`;
    }
    if (income < 0) income = 0;

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
    let aqueducNote = null;
    if (this.buffActive('aqueduc')) { c.pop += 5; aqueducNote = '🚰 Aqueduc mondial : +5 habitants'; }

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
      decreeNote, exodus, blightNote, sabNote, aqueducNote, gold: c.gold, moral: c.moral,
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
    if (c.gold < cost) return { ok: false, err: `Fonds insuffisants : ${nf(c.gold)}/${nf(cost)}${this.cur()}.` };
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
    if (c.gold < cost) return { ok: false, err: `L’annexion de 1 km² coûte ${nf(cost)}${this.cur()} (fonds : ${nf(c.gold)}${this.cur()}).` };
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

  unitCapacity(c) { return (c.b.barracks || 0) * 15; } // plus de plafond : chaque caserne agrandit l'armée
  unitCount(c) { return (c.units.soldier || 0) + (c.units.archer || 0) + (c.units.cavalry || 0); }

  train(uid, unit) {
    const c = this.cityOf(uid);
    if (!c) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    const u = UNITS[unit];
    if (!u) return { ok: false, err: 'Unités : soldat, archer, cavalier' };
    if (c.lvl < u.minLvl) return { ok: false, err: `${u.label} débloqué au 𝗟𝘃𝗹 ${u.minLvl} (tu es ${c.lvl}).` };
    if (!(c.b.barracks > 0)) return { ok: false, err: 'Construis d’abord une 🪖 caserne (Xcity build barracks).' };
    if (this.unitCount(c) >= this.unitCapacity(c)) {
      return { ok: false, err: `Caserne pleine (${this.unitCount(c)}/${this.unitCapacity(c)}) — construis-en plus.` };
    }
    const now = this.now();
    if (now - c.lastTrain < TRAIN_CD) return { ok: false, err: 'Cooldown recrutement : 30 s' };
    c.lastTrain = now;
    if (c.gold < u.cost) return { ok: false, err: `Fonds insuffisants (${nf(u.cost)}${this.cur()}).` };
    c.gold -= u.cost;
    c.units[unit] += 1;
    this.save();
    return { ok: true, unit, cost: u.cost, count: c.units[unit], gold: c.gold, capacity: this.unitCapacity(c), total: this.unitCount(c) };
  }

  buyOfficer(uid, which) {
    const c = this.cityOf(uid);
    if (!c) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    const o = OFFICERS[which];
    if (!o) return { ok: false, err: 'Officiers : capitaine, général' };
    if (c.officers[which]) return { ok: false, err: `${o.label} est déjà à ton service.` };
    if (c.lvl < o.minLvl) return { ok: false, err: `${o.label} débloqué au 𝗟𝘃𝗹 ${o.minLvl}.` };
    if (c.gold < o.cost) return { ok: false, err: `Fonds insuffisants (${nf(o.cost)}${this.cur()}).` };
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
    if (mode === 'def') p += Number(c.guard) || 0; // 🛡️ Garde de l'Assemblée
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
    if (now < me.quarantineUntil) return { ok: false, err: '🚧 Ta ville est en QUARANTAINE — aucune opération militaire.' };
    if (now < target.quarantineUntil) return { ok: false, err: `🚧 ${target.name} est en quarantaine — inaccessible.` };
    if (now - me.lastAttack < ATTACK_CD) return { ok: false, err: 'Cooldown attaque : 60 s' };
    if (now < target.shieldUntil) {
      return { ok: false, err: `🛡️ ${target.name} est sous bouclier (${Math.ceil((target.shieldUntil - now) / 60000)} min).` };
    }
    if (this.decreeActive('paix')) return { ok: false, err: '🕊️ JOUR DE PAIX : les attaques sont suspendues par décret mondial.' };
    if (this.ruleAdopted('novice') && target.lvl <= 2) return { ok: false, err: '🛡️ CONSTITUTION : les villes de niveau 1-2 sont protégées.' };
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
      const victimTxt = `🗡️ TRAHISON ! ${me.name} (traité ${TREATY_TYPES[type].label}) a pillé ${nf(loot)}${this.cur()} — 80 % de ton or !`;
      this.notify(target, victimTxt);
      this.addNews(`🗡️ ${me.name} a TRAHI son traité avec ${target.name} : ${nf(loot)}${this.cur()} volés !`);
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
      let loot = Math.min(this.ruleAdopted('butin') ? Math.floor(LOOT_CAP / 2) : LOOT_CAP, Math.floor(target.gold * LOOT_RATE));
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
          this.notify(ally, `⚔️ Ton allié ${me.name} a pillé ${target.name} — ta part : +${nf(share)}${this.cur()}`);
          shareNote = `${this.nameOf(peer)} touche ${nf(share)}${this.cur()} (alliance)`;
        }
        break;
      }
      const lostA = this._applyLosses(me, 0.05);
      const lostD = this._applyLosses(target, 0.25);
      if (target.guard > 0) target.guard -= Math.ceil(target.guard * 0.10); // défense réussie : pertes légères
      target.armyBefore = undefined;
      me.wins += 1; target.losses += 1;
      target.moral = clamp(target.moral - 8, 0, 100);
      me.moral = clamp(me.moral + 3, 0, 100);
      target.shieldUntil = now + SHIELD_MS;
      const victimTxt = `⚔️ ${me.name} a pillé ${target.name} : −${nf(loot)}${this.cur()} (défense débordée).`;
      this.notify(target, victimTxt);
      this.addNews(`⚔️ ${me.name} a pillé ${target.name} (+${nf(loot)}${this.cur()}).`);
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
    if (target.guard > 0) target.guard -= Math.ceil(target.guard * 0.30); // mur franchi : pertes lourdes
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
    /* 🗝️ Destination = nom d’un VIRUS actif → paiement de la rançon (anonyme). */
    const vTarget = this._virusByName(targetName);
    if (vTarget && kind === 'money') return this._ransomFlow(uid, vTarget, Math.floor(Number(qty)));
    const found = this.byName(targetName);
    if (!found) return { ok: false, err: 'Ville cible introuvable.' };
    const { uid: targetUid, city: target } = found;
    if (String(targetUid) === String(uid)) return { ok: false, err: 'Pas toi-même 🙃' };
    qty = Math.floor(Number(qty));
    if (!Number.isFinite(qty) || qty <= 0) return { ok: false, err: 'Format : Xcity send <ville> money <somme> | Xcity send <ville> <res> <qté>' };

    if (kind === 'money') {
      if (qty < 100) return { ok: false, err: 'Minimum 100$ par envoi.' };
      if (me.gold < qty) return { ok: false, err: `Fonds insuffisants (${nf(me.gold)}${this.cur()}).` };
      const partner = this.treatyBetween(uid, targetUid) && this.treatyBetween(uid, targetUid).type === 'trade';
      const tax = partner ? 0 : Math.floor(qty * SEND_TAX);
      me.gold -= qty;
      target.gold += qty - tax;
      me.sentGold += qty;
      if (this.catastropheFor(targetUid)) me.moral = clamp(me.moral + 4, 0, 100); // 🚨 état de catastrophe
      if (qty >= 1000) me.rep += 1; // générosité
      const txt = `💱 ${me.name} t’a envoyé ${nf(qty - tax)}${this.cur()}${tax ? ` (taxe de convoi : ${nf(tax)}${this.cur()})` : ' (pacte commercial : 0 taxe)'}.`;
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
    if (this.now() < (c.embargoUntil || 0)) return { ok: false, err: '⚖️ EMBARGO : ton marché est fermé par le tribunal mondial.' };
    this.refreshMarket();
    if (!RES.includes(res)) return { ok: false, err: `Ressources : ${RES.join(', ')}` };
    qty = Math.floor(Number(qty));
    if (!Number.isFinite(qty) || qty <= 0) return { ok: false, err: 'Format : Xcity buy <res> <qté>' };
    const unit = this.priceOf(res);
    let total = unit * qty;
    if (action === 'sell' && this.decreeActive('foire')) total = Math.floor(total * 1.2); // 🎪 Foire mondiale
    if (action === 'buy') {
      if (c.gold < total) return { ok: false, err: `Coût : ${nf(total)}${this.cur()} — fonds : ${nf(c.gold)}${this.cur()}.` };
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

  /* ══════════════ LABORATOIRE & SCIENTIFIQUES ══════════════ */

  labCapacity(c) { return (c.b.lab || 0) * LAB_SCI_PER; }

  hire(uid, n) {
    const c = this.cityOf(uid);
    if (!c) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    n = Math.floor(Number(n));
    if (!Number.isInteger(n) || n < 1 || n > 10) return { ok: false, err: 'Combien de scientifiques ? (1 à 10)' };
    if (!(c.b.lab > 0)) return { ok: false, err: 'Construis d’abord un 🧪 laboratoire (Xcity build lab).' };
    if (this.labCapacity(c) < c.scientists + n) {
      return { ok: false, err: `Laboratoire plein (${c.scientists}/${this.labCapacity(c)}) — agrandis-le : Xcity build lab.` };
    }
    const cost = HIRE_COST * n;
    if (c.gold < cost) return { ok: false, err: `Coût : ${nf(cost)}${this.cur()} — fonds : ${nf(c.gold)}${this.cur()}.` };
    c.gold -= cost;
    c.scientists += n;
    this.save();
    return { ok: true, hired: n, scientists: c.scientists, capacity: this.labCapacity(c), cost, gold: c.gold };
  }

  research(uid) {
    const c = this.cityOf(uid);
    if (!c) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    if (!(c.b.lab > 0)) return { ok: false, err: 'Il faut un 🧪 laboratoire (Xcity build lab).' };
    if (c.scientists < 1) return { ok: false, err: 'Embauche des scientifiques : Xcity hire <n>' };
    const now = this.now();
    if (now - c.lastResearch < RESEARCH_CD) {
      return { ok: false, err: `Recherches en cours : réessaie dans ${Math.ceil((RESEARCH_CD - (now - c.lastResearch)) / 1000)} s` };
    }
    if (c.gold < RESEARCH_COST) return { ok: false, err: `Campagne de recherche : ${nf(RESEARCH_COST)}${this.cur()} (fonds : ${nf(c.gold)}${this.cur()}).` };
    c.gold -= RESEARCH_COST;
    c.lastResearch = now;
    // Plus il y a de scientifiques, plus les découvertes sont fréquentes
    const findChance = Math.min(0.75, 0.30 + 0.05 * c.scientists);
    const found = [];
    for (let i = 0; i < c.scientists && found.length < 2; i++) {
      if (this.rng() < findChance) {
        const rare = this.rng() < 0.12;
        const pool = Object.keys(ELEMENTS).filter((k) => (ELEMENTS[k].rare ? rare : !rare));
        const key = pick(this.rng, pool);
        c.elements[key] = (c.elements[key] || 0) + 1;
        found.push(key);
      }
    }
    this.save();
    return { ok: true, found, elements: { ...c.elements }, gold: c.gold };
  }

  /* ══════════════ VIRUS & PANDEMIES ☣️ ══════════════ */

  _virusByName(name) {
    const n = String(name || '').trim().toLowerCase();
    return this.store.data.viruses.find((v) => v.name.toLowerCase() === n) || null;
  }

  labView(uid) {
    const c = this.cityOf(uid);
    if (!c) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    const mine = this.store.data.viruses.filter((v) => String(v.creator) === String(uid));
    const infectedBy = this.store.data.viruses.filter((v) => v.infected && v.infected[String(uid)]);
    return {
      ok: true, labs: c.b.lab || 0, scientists: c.scientists, capacity: this.labCapacity(c),
      elements: { ...c.elements }, viruses: mine, infectedBy, stock: this.stockTxt(c),
    };
  }

  stockTxt(c) {
    return Object.keys(ELEMENTS).map((k) => `${ELEMENTS[k].label} ${c.elements[k] || 0}`).join(' · ') || 'vide';
  }

  synth(uid, name, eltArgs, ransomArg) {
    const c = this.cityOf(uid);
    if (!c) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    name = String(name || '').trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 24) return { ok: false, err: 'Nom du virus : 2 à 24 caractères.' };
    if (this._virusByName(name)) return { ok: false, err: `Le virus « ${name} » existe déjà — pas deux virus du même nom.` };
    if (this.byName(name)) return { ok: false, err: 'Ce nom est celui d’une ville — choisis-en un autre.' };
    if (!(c.b.lab > 0)) return { ok: false, err: 'Il faut un 🧪 laboratoire (Xcity build lab).' };
    const now = this.now();
    if (now - c.lastSynth < SYNTH_CD) {
      return { ok: false, err: `Synthèse trop rapprochée : réessaie dans ${Math.ceil((SYNTH_CD - (now - c.lastSynth)) / 60000)} min.` };
    }
    // Éléments fournis (distincts, valides, en stock)
    const wanted = [...new Set(eltArgs.map((e) => String(e || '').toLowerCase().trim()))].filter((e) => ELEMENTS[e]);
    const invalid = eltArgs.map((e) => String(e || '').toLowerCase().trim()).filter((e) => !ELEMENTS[e]);
    if (invalid.length) return { ok: false, err: `Éléments inconnus : ${invalid.join(', ')} — liste : Xcity lab` };
    if (wanted.length !== eltArgs.length) return { ok: false, err: 'Éléments DISTINCTS uniquement (pas deux fois le même).' };
    const missing = wanted.filter((k) => (c.elements[k] || 0) < 1);
    if (missing.length) return { ok: false, err: `Éléments manquants : ${missing.map((k) => ELEMENTS[k].label).join(', ')} — cherche : Xcity research` };

    const tier = wanted.length >= 6 ? 'pandemic' : wanted.length === 3 ? 'virus' : null;
    if (!tier) return { ok: false, err: 'Formule : 3 éléments = ☣️ VIRUS · 6 éléments (dont 1 rare) = 🦠 PANDEMIE.' };
    const isPandemic = tier === 'pandemic';
    if (isPandemic) {
      if (!(c.b.lab >= 2)) return { ok: false, err: 'Pandémie : il faut 🧪 2 laboratoires (agrandis : Xcity build lab).' };
      if (c.scientists < 4) return { ok: false, err: 'Pandémie : il faut au moins 🔬 4 scientifiques.' };
      if (!wanted.some((k) => ELEMENTS[k].rare)) return { ok: false, err: 'Pandémie : au moins un élément RARE (🔴 Mercure, ☢️ Césium, ☣️ Plutonium).' };
    } else if (c.scientists < 2) return { ok: false, err: 'Virus : il faut au moins 🔬 2 scientifiques.' };
    const cost = isPandemic ? PANDEMIC_COST : VIRUS_COST;
    if (c.gold < cost) return { ok: false, err: `Synthèse : ${nf(cost)}${this.cur()} — fonds : ${nf(c.gold)}${this.cur()}.` };
    let ransom = 0;
    if (isPandemic) {
      ransom = Math.floor(Number(ransomArg));
      if (!Number.isFinite(ransom) || ransom < RANSOM_MIN) {
        return { ok: false, err: `Fixe la rançon par ville (min ${nf(RANSOM_MIN)}${this.cur()}) : … rancon <prix>` };
      }
    }
    // Tout est validé : consommation
    for (const k of wanted) c.elements[k] -= 1;
    c.gold -= cost;
    c.lastSynth = now;
    const sci = c.scientists;
    const lifeMin = isPandemic ? randInt(this.rng, PANDEMIC_LIFE_MIN[0], PANDEMIC_LIFE_MIN[1]) : randInt(this.rng, VIRUS_LIFE_MIN[0], VIRUS_LIFE_MIN[1]);
    const power = isPandemic ? 120 + sci * 8 + randInt(this.rng, 0, 60) : 25 + sci * 3 + randInt(this.rng, 0, 20);
    const virus = {
      id: `v${Math.floor(this.rng() * 1e9).toString(36)}`,
      name, creator: String(uid), tier,
      power, ransom, life: lifeMin * 60_000, deadline: 0, bornAt: now,
      infected: {}, cured: {},
    };
    this.store.data.viruses.push(virus);
    this.store.data.virusArchive[name] = String(uid); // pour les enquêtes de presse 📰
    this.save();
    return { ok: true, virus, cost, tier };
  }

  infect(uid, cityName, virusName) {
    const me = this.cityOf(uid);
    if (!me) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    const v = this._virusByName(virusName);
    if (!v || String(v.creator) !== String(uid)) return { ok: false, err: `Virus « ${virusName} » introuvable dans ton laboratoire (Xcity lab).` };
    if (v.deadline) return { ok: false, err: `« ${v.name} » a déjà été relâché — sa course est en cours.` };
    if (v.tier !== 'virus') return { ok: false, err: 'C’est une PANDEMIE — utilise : Xcity unleash <nom>' };
    const found = this.byName(cityName);
    if (!found) return { ok: false, err: 'Ville cible introuvable.' };
    if (String(found.uid) === String(uid)) return { ok: false, err: 'Pas ta propre ville 🙃' };
    const now = this.now();
    if (now < me.quarantineUntil) return { ok: false, err: '🚧 Ta ville est en QUARANTAINE — impossible de relâcher un virus.' };
    if (now < found.city.immuneUntil) return { ok: false, err: `💉 ${found.city.name} est VACCINÉE (immunité nationale) — ton virus rebondit.` };
    if (now - me.lastVirus < VIRUS_LAUNCH_CD) return { ok: false, err: 'Cooldown contamination : 3 min' };
    me.lastVirus = now;
    const target = found.city;
    target.lastVirusHit = v.name;
    const cnt = Math.max(1, Math.min(target.pop - 10, v.power + randInt(this.rng, -Math.floor(v.power * 0.2), Math.floor(v.power * 0.2))));
    v.deadline = now + v.life;
    v.infected[String(found.uid)] = cnt;
    const mins = Math.round(v.life / 60_000);
    const txt = `☣️ ALERTE : le virus « ${v.name} » frappe ta ville ! ${cnt} habitants infectés — soins urgents : ${nf(CURE_PRICE)}${this.cur()}/habitant (${nf(cnt * CURE_PRICE)}${this.cur()}) → Xcity cure ${v.name} — sans remède dans ~${mins} min, des morts à déplorer…`;
    this.notify(target, txt);
    this.addNews(`☣️ Un virus inconnu nommé « ${v.name} » frappe ${target.name} !`);
    this.save();
    return { ok: true, virus: v, targetName: target.name, infected: cnt, mins, dm: [{ to: found.uid, txt }] };
  }

  unleash(uid, virusName) {
    const me = this.cityOf(uid);
    if (!me) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    const v = this._virusByName(virusName);
    if (!v || String(v.creator) !== String(uid)) return { ok: false, err: `Pandémie « ${virusName} » introuvable dans ton laboratoire (Xcity lab).` };
    if (v.deadline) return { ok: false, err: `« ${v.name} » sévit déjà dans le monde…` };
    if (v.tier !== 'pandemic') return { ok: false, err: 'C’est un virus simple — utilise : Xcity infect <ville> <nom>' };
    const now = this.now();
    if (now - me.lastVirus < VIRUS_LAUNCH_CD) return { ok: false, err: 'Cooldown contamination : 3 min' };
    me.lastVirus = now;
    v.deadline = now + v.life;
    const mins = Math.round(v.life / 60_000);
    let hits = 0;
    for (const [cityUid, city] of this.allCities()) {
      if (String(cityUid) === String(uid)) continue; // le créateur est épargné
      const cnt = Math.max(1, Math.min(city.pop - 10, Math.round(v.power * (0.8 + 0.4 * this.rng()))));
      v.infected[String(cityUid)] = cnt;
      city.lastVirusHit = v.name;
      hits += 1;
      this.notify(city, `🦠 PANDÉMIE « ${v.name} » ! ${cnt} habitants infectés. Soins : ${nf(CURE_PRICE)}${this.cur()}/habitant (Xcity cure ${v.name}) — ou rançon : ${nf(v.ransom)}${this.cur()} → Xcity send ${v.name} money ${v.ransom} (~${mins} min avant des morts)`);
    }
    this.addNews(`🦠 PANDÉMIE MONDIALE « ${v.name} » ! Toutes les villes sont touchées — le berger du virus exige ${nf(v.ransom)}${this.cur()} par ville pour le remède.`);
    this.save();
    return { ok: true, virus: v, hits, mins };
  }

  cure(uid, virusName) {
    const c = this.cityOf(uid);
    if (!c) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    const v = this._virusByName(virusName);
    if (!v || !v.infected[String(uid)]) return { ok: false, err: `Ta ville n’est pas infectée par « ${virusName} ».` };
    const cnt = v.infected[String(uid)];
    const cost = cnt * CURE_PRICE;
    if (c.gold < cost) return { ok: false, err: `Soins urgents : ${nf(cost)}${this.cur()} (${cnt} infectés × ${nf(CURE_PRICE)}${this.cur()}) — fonds : ${nf(c.gold)}${this.cur()}.` };
    c.gold -= cost;
    delete v.infected[String(uid)];
    v.cured[String(uid)] = true;
    const creator = this.cityOf(v.creator);
    if (creator) {
      creator.gold += cost;
      this.notify(creator, `💰 +${nf(cost)}${this.cur()} — soins urgents payés pour « ${v.name} » (ville anonyme).`);
    }
    this.save();
    return { ok: true, virus: v, cost, cnt };
  }

  _ransomFlow(uid, v, qty) {
    const c = this.cityOf(uid);
    if (!c) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    if (!v.infected || !v.infected[String(uid)] || v.cured[String(uid)]) {
      return { ok: false, err: `Ta ville n’est pas touchée par « ${v.name} ».` };
    }
    if (v.ransom > 0 && qty < v.ransom) {
      return { ok: false, err: `🗝️ La rançon exigée par « ${v.name} » est ${nf(v.ransom)}${this.cur()} par ville — Xcity send ${v.name} money ${v.ransom}` };
    }
    if (c.gold < qty) return { ok: false, err: `Fonds insuffisants (${nf(c.gold)}${this.cur()}).` };
    c.gold -= qty;
    delete v.infected[String(uid)];
    v.cured[String(uid)] = true;
    const creator = this.cityOf(v.creator);
    if (creator) {
      creator.gold += qty; // 0 taxe : l’argent sale va intégralement au créateur
      this.notify(creator, `💰 +${nf(qty)}${this.cur()} — rançon reçue pour « ${v.name} » (ville anonyme).`);
    }
    this.notify(c, `💊 Remède reçu ! Ta ville échappe au virus « ${v.name} » (−${nf(qty)}${this.cur()}).`);
    this.addNews(`💊 Une ville a payé le remède de la pandémie « ${v.name} ».`);
    this.save();
    return { ok: true, ransom: true, paid: qty, virus: v };
  }

  /* 🧹 Résolution paresseuse : les virus dont le délai expire font des morts. */
  sweepViruses() {
    const d = this.store.data;
    const now = this.now();
    let touched = false;
    for (const v of [...d.viruses]) {
      if (!v.deadline || now < v.deadline) continue;
      const creator = this.cityOf(v.creator);
      let totalDeaths = 0;
      for (const uidS of Object.keys(v.infected)) {
        if (v.cured[uidS]) continue;
        const victim = this.cityOf(uidS);
        if (!victim) continue;
        const cnt = v.infected[uidS];
        const deaths = Math.max(1, Math.ceil(cnt * DEATH_RATE));
        victim.pop = Math.max(10, victim.pop - deaths);
        totalDeaths += deaths;
        const deduct = Math.min(victim.gold, deaths * DEATH_BOUNTY);
        victim.gold -= deduct;
        this.notify(victim, `☠️ ${deaths} habitants ont succombé au virus « ${v.name} »…`);
        if (v.tier === 'virus') this.addNews(`☠️ Le virus « ${v.name} » a tué ${deaths} habitants à ${victim.name}.`);
      }
      if (creator && totalDeaths > 0) {
        const payout = totalDeaths * DEATH_BOUNTY;
        creator.gold += payout;
        this.notify(creator, `☣️ Votre virus « ${v.name} » a fait son œuvre : +${nf(payout)}${this.cur()} (${totalDeaths} morts).`);
      }
      if (v.tier === 'pandemic' && totalDeaths > 0) {
        this.addNews(`☠️ La pandémie « ${v.name} » s’éteint : ${totalDeaths} morts au total.`);
      }
      d.viruses.splice(d.viruses.indexOf(v), 1);
      touched = true;
    }
    if (touched) this.save();
    return touched;
  }

  infectionsOn(uid) {
    let total = 0;
    for (const v of this.store.data.viruses) {
      if (v.infected && v.infected[String(uid)]) total += v.infected[String(uid)];
    }
    return total;
  }

  /* ══════════════ ASSEMBLÉE DES VILLES — PRÉSIDENT GÉNÉRAL 🏛️ ══════════════ */

  /* Rouages paresseux : taxes par minute + transitions de phases. */
  assembly() {
    this._maybeBulletin();
    this._assemblyTick();
    this._assemblyPhase();
    return this.store.data.assembly;
  }

  cur() { return this.store.data.assembly.currency || '$'; }

  presidentUid() {
    const A = this.store.data.assembly;
    return A.president && this.now() < A.until ? String(A.president) : null;
  }

  _assemblyTick() {
    const A = this.store.data.assembly;
    if (!A.president || !A.until || this.now() >= A.until) return;
    const now = this.now();
    if (!A.lastTick) { A.lastTick = now; A.lastSalary = now; return; }
    const ticks = Math.floor((now - A.lastTick) / 60_000);
    if (ticks > 0) {
      /* Le trésor de l'Assemblée est alimenté par le GOUVERNEMENT SUPÉRIEUR :
       * l'argent apparaît, JAMAIS pris sur les villes. */
      A.treasury += ticks * PRES_TAX * Math.max(1, this.allCities().length);
      A.lastTick += ticks * 60_000;
    }
    /* 💵 Salaire présidentiel : 50 000/heure, versé au trésor personnel du
     * Président, avec notification de reçu. */
    if (!A.lastSalary) A.lastSalary = now;
    const salaries = Math.floor((now - A.lastSalary) / SALARY_MS);
    if (salaries > 0) {
      const pres = this.cityOf(A.president);
      A.lastSalary += salaries * SALARY_MS;
      if (pres) {
        pres.gold += salaries * PRES_SALARY;
        this.notify(pres, `💵 Salaire présidentiel reçu : +${nf(salaries * PRES_SALARY)}${this.cur()} (Gouvernement Supérieur).`);
      }
    }
    this.save();
  }

  _assemblyPhase() {
    this._resolveTribunal();
    this._resolveLoi();
    this._resolveSummit();
    const A = this.store.data.assembly;
    const now = this.now();
    if (A.president && now >= A.until) {
      const name = this.nameOf(A.president);
      A.president = null; A.until = 0; A.lastTick = 0;
      this.addNews(`🏛️ Le mandat du Président ${name} est terminé — de nouvelles élections s’ouvrent !`);
      this.save();
    }
    const E = A.election;
    if (!E) return;
    if (E.phase === 'candidacy' && now >= E.deadline) {
      if (!Object.keys(E.candidates).length) { A.election = null; this.save(); return; }
      E.phase = 'voting';
      E.deadline = now + VOTING_MS;
      this.addNews('🗳️ ÉLECTIONS — le vote des maires est OUVERT : Xcity vote <ville du candidat> !');
      for (const [, c] of this.allCities()) this.notify(c, '🗳️ Élections présidentielles : Xcity vote <ville du candidat> — ta voix vaut ' + VOTE_WEIGHT + ' points !');
      this.save();
      return;
    }
    if (E.phase === 'voting' && now >= E.deadline) this._closeElection();
  }

  assemblyView() {
    const A = this.assembly();
    const E = A.election;
    const candRows = [];
    if (E) {
      for (const uidS of Object.keys(E.candidates)) {
        const c = this.cityOf(uidS);
        if (!c) continue;
        let votes = 0;
        for (const voter of Object.values(E.votes)) if (String(voter) === uidS) votes += 1;
        candRows.push({ name: c.name, pop: c.pop, votes, score: c.pop + VOTE_WEIGHT * votes - SCANDAL_PENALTY * (c.scandals || 0), scandals: c.scandals || 0 });
      }
    }
    return {
      president: this.presidentUid() ? (() => { const h = Math.max(0, Math.ceil((A.until - this.now()) / 3_600_000)); return { name: this.nameOf(A.president), hoursLeft: h, label: h >= 24 ? `${Math.floor(h / 24)} j ${h % 24} h` : `${h} h` }; })() : null,
      treasury: A.treasury, currency: A.currency,
      phase: E ? E.phase : null,
      minutesLeft: E ? Math.max(0, Math.ceil((E.deadline - this.now()) / 60_000)) : null,
      candidates: candRows,
      myVote: E && E.votes[String(this._viewerUid || '')],
    };
  }

  openElection(uid) {
    const c = this.cityOf(uid);
    if (!c) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    const A = this.assembly();
    if (A.election) return { ok: false, err: 'Une élection est déjà en cours (phase ' + A.election.phase + ').' };
    if (A.president) return { ok: false, err: 'Un Président est en exercice — les élections s’ouvriront à la fin de son mandat.' };
    A.election = { phase: 'candidacy', deadline: this.now() + CANDIDACY_MS, candidates: {}, votes: {}, openedAt: this.now() };
    this.addNews('🏛️ Les CANDIDATURES à la Présidence de l’Assemblée sont ouvertes (30 min) — caution : ' + nf(CANDIDACY_FEE) + this.cur());
    this.save();
    return { ok: true };
  }

  candidater(uid) {
    const c = this.cityOf(uid);
    if (!c) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    const A = this.assembly();
    if (this.presidentUid() === String(uid)) return { ok: false, err: 'Tu présides déjà l’Assemblée — tu pourras te représenter à la prochaine élection.' };
    const E = A.election;
    if (!E || E.phase !== 'candidacy') return { ok: false, err: 'Aucune candidature ouverte — Xcity assemblee ouvrir (ou attends).' };
    if (E.candidates[String(uid)]) return { ok: false, err: 'Tu es déjà candidat.' };
    if (c.gold < CANDIDACY_FEE) return { ok: false, err: `La caution de candidature coûte ${nf(CANDIDACY_FEE)}${this.cur()} (fonds : ${nf(c.gold)}).` };
    c.gold -= CANDIDACY_FEE;
    A.treasury += CANDIDACY_FEE;
    E.candidates[String(uid)] = true;
    this.addNews(`🏛️ ${c.name} (${c.mayor}) se porte CANDIDAT à la Présidence de l’Assemblée !`);
    this.save();
    return { ok: true, treasury: A.treasury };
  }

  castVote(uid, candidateCityName) {
    const c = this.cityOf(uid);
    if (!c) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    const E = this.assembly().election;
    if (!E || E.phase !== 'voting') return { ok: false, err: 'Aucun vote en cours (Xcity assemblee pour le statut).' };
    const found = this.byName(candidateCityName);
    if (!found || !E.candidates[String(found.uid)]) return { ok: false, err: 'Ce n’est pas une candidate valide — Xcity assemblee pour la liste.' };
    E.votes[String(uid)] = String(found.uid); // dernier vote compte : trahir est possible
    this.save();
    return { ok: true, forCity: found.city.name, weight: VOTE_WEIGHT };
  }

  _closeElection() {
    const A = this.store.data.assembly;
    const E = A.election;
    if (!E || E.phase !== 'voting') return;
    let best = null, bestScore = -Infinity, tie = false;
    for (const uidS of Object.keys(E.candidates)) {
      const c = this.cityOf(uidS);
      if (!c) continue;
      let votes = 0;
      for (const voter of Object.values(E.votes)) if (String(voter) === uidS) votes += 1;
      const score = c.pop + VOTE_WEIGHT * votes - SCANDAL_PENALTY * (c.scandals || 0);
      if (score > bestScore) { bestScore = score; best = uidS; tie = false; }
      else if (score === bestScore) tie = true;
    }
    A.election = null;
    A.decreeUsed = false; // nouveau mandat → nouveau décret mondial possible
    if (!best || tie) {
      this.addNews('🗳️ L’Assemblée n’a pas réussi à élire de Président (égalité ou sans candidate valide).');
      this.save();
      return;
    }
    A.president = best;
    A.until = this.now() + MANDATE_MS;
    A.lastTick = this.now();
    A.lastSalary = this.now();
    const c = this.cityOf(best);
    this.addNews(`🏛️ ${c.name} (${c.mayor}) est élu PRÉSIDENT GÉNÉRAL de l’Assemblée des villes — mandat de 3 JOURS !`);
    for (const [, cc] of this.allCities()) this.notify(cc, `🏛️ ${c.name} est le nouveau PRÉSIDENT GÉNÉRAL (3 jours) — il gère le trésor de l’Assemblée.`);
    this.save();
  }

  /* 💰 Transferts du Président : bien public… ou détournement. */
  _presGuard(uid) {
    if (this.presidentUid() !== String(uid)) return { ok: false, err: 'Seul le PRÉSIDENT GÉNÉRAL de l’Assemblée peut faire cela.' };
    return { ok: true };
  }

  don(uid, cityName, amount) {
    const g = this._presGuard(uid);
    if (!g.ok) return g;
    const A = this.assembly();
    const found = this.byName(cityName);
    if (!found) return { ok: false, err: 'Ville bénéficiaire introuvable.' };
    amount = Math.floor(Number(amount));
    if (!Number.isFinite(amount) || amount < 100) return { ok: false, err: 'Minimum 100 par transfert.' };
    if (A.treasury < amount) return { ok: false, err: `Trésor de l’Assemblée : ${nf(A.treasury)}${this.cur()} (insuffisant).` };
    A.treasury -= amount;
    found.city.gold += amount;
    found.city.moral = clamp(found.city.moral + 2, 0, 100);
    this.addNews(`🏛️ Le Président a versé ${nf(amount)}${this.cur()} à ${found.city.name} (fonds de l’Assemblée).`);
    this.notify(found.city, `🏛️ Le Président de l’Assemblée t’a envoyé ${nf(amount)}${this.cur()} !`);
    this.save();
    return { ok: true, amount, city: found.city.name, treasury: A.treasury };
  }

  buildFor(uid, cityName, type) {
    const g = this._presGuard(uid);
    if (!g.ok) return g;
    const A = this.assembly();
    const found = this.byName(cityName);
    if (!found) return { ok: false, err: 'Ville bénéficiaire introuvable.' };
    if (!BUILD_COST[type]) return { ok: false, err: `Types : ${Object.keys(BUILD_COST).join(', ')}` };
    const cost = BUILD_COST[type];
    if (A.treasury < cost) return { ok: false, err: `Trésor de l’Assemblée : ${nf(A.treasury)}${this.cur()} — ce bâtiment coûte ${nf(cost)}.` };
    A.treasury -= cost;
    found.city.b[type] = (found.city.b[type] || 0) + 1;
    if (type === 'house') found.city.pop += 5;
    this.addNews(`🏛️ Le Président a fait construire ${BUILD_LABEL[type]} à ${found.city.name} (fonds de l’Assemblée).`);
    this.notify(found.city, `🏛️ Le Président a financé ${BUILD_LABEL[type]} pour ta ville !`);
    this.save();
    return { ok: true, type, city: found.city.name, cost, treasury: A.treasury };
  }

  pocket(uid, amount) {
    const g = this._presGuard(uid);
    if (!g.ok) return g;
    const A = this.assembly();
    amount = Math.floor(Number(amount));
    if (!Number.isFinite(amount) || amount < 100) return { ok: false, err: 'Minimum 100.' };
    if (A.treasury < amount) return { ok: false, err: `Trésor de l’Assemblée : ${nf(A.treasury)}${this.cur()} (insuffisant).` };
    A.treasury -= amount;
    const me = this.cityOf(uid);
    me.gold += amount;
    me.scandals = (me.scandals || 0) + 1;
    me.rep -= 15;
    this.addNews(`🥀 SCANDALE : le Président a détourné ${nf(amount)}${this.cur()} de l’Assemblée pour son usage personnel !`);
    for (const [, c] of this.allCities()) this.notify(c, `🥀 Rumeur : le Président aurait détourné ${nf(amount)}${this.cur()}… Les maires s’en souviendront aux élections.`);
    this.save();
    return { ok: true, amount, scandals: me.scandals, rep: me.rep, treasury: A.treasury };
  }

  setCurrency(uid, sym) {
    const g = this._presGuard(uid);
    if (!g.ok) return g;
    const want = String(sym || '').trim().toUpperCase() || '$';
    const match = CURRENCIES.find((x) => x.toUpperCase() === want);
    if (!match) return { ok: false, err: `Monnaies disponibles : ${CURRENCIES.join(' ')}` };
    this.store.data.assembly.currency = match;
    this.addNews(`💱 L’Assemblée adopte la monnaie ${match} (décision du Président).`);
    this.save();
    return { ok: true, currency: match };
  }

  quarantine(uid, cityName) {
    const me = this.cityOf(uid);
    if (!me) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    const found = this.byName(cityName);
    if (!found) return { ok: false, err: 'Ville introuvable.' };
    const isPres = this.presidentUid() === String(uid);
    const infected = this.infectionsOn(String(found.uid)) > 0;
    if (!infected && !isPres) return { ok: false, err: 'Cette ville n’est pas infectée — quarantaine forcée réservée au Président.' };
    if (!isPres) {
      if (me.gold < 3000) return { ok: false, err: 'Mesure d’urgence : 3 000 (gratuite pour le Président).' };
      me.gold -= 3000;
    }
    found.city.quarantineUntil = this.now() + QUARANTINE_MS;
    this.addNews(`🚧 ${found.city.name} est placée en QUARANTAINE (30 min) — plus aucune opération militaire ou virale.`);
    this.notify(found.city, '🚧 QUARANTAINE : tes murs sont fermés 30 min (plus d’attaques, d’espions ni de virus).');
    this.save();
    return { ok: true, city: found.city.name, free: isPres };
  }

  /* ══════════════ RENSEIGNEMENT, TOXINES, DOUDES & DISSUASION ☢️ ══════════════ */

  _cdLeft(c, key, ms) {
    const last = (c.cds && c.cds[key]) || 0;
    return Math.max(0, ms - (this.now() - last));
  }
  _cdSet(c, key) { if (!c.cds) c.cds = {}; c.cds[key] = this.now(); }

  _opsTarget(uid, cityName) {
    const me = this.cityOf(uid);
    if (!me) return { err: 'Crée ta ville : Xcity create <nom>' };
    if (this.now() < me.quarantineUntil) return { err: '🚧 Ta ville est en QUARANTAINE — aucune opération extérieure.' };
    if (this.decreeActive('couvrefeu')) return { err: '🌑 COUVRE-FEU : opérations secrètes suspendues par décret mondial.' };
    const found = this.byName(cityName);
    if (!found) return { err: 'Ville cible introuvable.' };
    if (String(found.uid) === String(uid)) return { err: 'Pas toi-même 🙃' };
    if (this.now() < found.city.quarantineUntil) return { err: `🚧 ${found.city.name} est en quarantaine — inaccessible.` };
    return { me, found };
  }

  /* 🕵️ Espionnage : voir l'or, l'armée et le moral d'une ville. */
  spy(uid, cityName) {
    const t = this._opsTarget(uid, cityName);
    if (t.err) return { ok: false, err: t.err };
    const { me, found } = t;
    if ((me.units.archer || 0) < 1) return { ok: false, err: 'Il faut au moins 1 🏹 archer comme éclaireur (Xcity train archer).' };
    if (this._cdLeft(me, 'spy', 60_000)) return { ok: false, err: 'Cooldown espionnage : 60 s' };
    this._cdSet(me, 'spy');
    const target = found.city;
    const catchChance = Math.min(0.5, 0.15 * (target.b.school || 0));
    const caught = this.rng() < catchChance;
    if (caught) {
      me.rep -= 5;
      this.notify(target, `🕵️ Un espion de ${me.name} a été attrapé dans tes murs ! (-5 réputation pour eux)`);
      this.save();
      return { ok: true, caught: true, city: target.name, rep: me.rep, dm: [{ to: found.uid, txt: `🕵️ Un espion de ${me.name} a été attrapé dans tes murs !` }] };
    }
    this.save();
    return {
      ok: true, caught: false, city: target.name,
      gold: target.gold, units: `🪖${target.units.soldier} 🏹${target.units.archer} 🐎${target.units.cavalry}`,
      moral: target.moral, treaties: Object.keys(target.treaties).length,
    };
  }

  /* 🌾 Biotoxine : les récoltes de la cible ne rapportent plus (3 collects). */
  biotoxin(uid, cityName) {
    const t = this._opsTarget(uid, cityName);
    if (t.err) return { ok: false, err: t.err };
    const { me, found } = t;
    if (!(me.b.lab > 0) || me.scientists < 2) return { ok: false, err: 'Il faut 🧪 1 laboratoire et 🔬 2 scientifiques.' };
    if ((me.elements.soufre || 0) < 1 || (me.elements.phosphore || 0) < 1) {
      return { ok: false, err: 'Formule : 1 🟡 Soufre + 1 🟣 Phosphore (Xcity research).' };
    }
    if (this._cdLeft(me, 'biotoxin', 10 * 60_000)) return { ok: false, err: 'Cooldown biotoxine : 10 min' };
    const target = found.city;
    if (this.now() < target.immuneUntil) return { ok: false, err: `💉 ${target.name} est VACCINÉE — ta biotoxine est inutile.` };
    me.elements.soufre -= 1;
    me.elements.phosphore -= 1;
    me.gold -= 300;
    this._cdSet(me, 'biotoxin');
    target.farmBlight = 3;
    this.notify(target, '🥀 MALADIE MYSTÉRIEUSE : tes récoltes se fanent — fermes improductives pour 3 collects…');
    this.addNews(`🥀 Une étrange maladie des récoltes frappe ${target.name}.`);
    this.save();
    return { ok: true, city: target.name, anonymous: true };
  }

  /* 📻 Propagande : voler du moral à une ville rivale. */
  propaganda(uid, cityName) {
    const t = this._opsTarget(uid, cityName);
    if (t.err) return { ok: false, err: t.err };
    const { me, found } = t;
    if (!(me.b.school > 0)) return { ok: false, err: 'Il faut 🎓 1 école pour produire la propagande.' };
    if (me.gold < 400) return { ok: false, err: 'Campagne de propagande : 400.' };
    if (this._cdLeft(me, 'propaganda', 30 * 60_000)) return { ok: false, err: 'Cooldown propagande : 30 min' };
    me.gold -= 400;
    this._cdSet(me, 'propaganda');
    const target = found.city;
    target.moral = clamp(target.moral - 10, 0, 100);
    me.moral = clamp(me.moral + 5, 0, 100);
    this.notify(target, '📻 Des tracts étrangers circulent : le moral de tes habitants baisse (-10).');
    this.save();
    return { ok: true, city: target.name, targetMoral: target.moral, myMoral: me.moral, anonymous: true };
  }

  /* 🧨 Sabotage : la production de la cible est réduite de moitié (2 collects). */
  sabotage(uid, cityName) {
    const t = this._opsTarget(uid, cityName);
    if (t.err) return { ok: false, err: t.err };
    const { me, found } = t;
    if ((me.units.archer || 0) < 1) return { ok: false, err: 'Un 🏹 archer est requis comme agent saboteur.' };
    if (me.gold < 600) return { ok: false, err: 'Matériel de sabotage : 600.' };
    if (this._cdLeft(me, 'sabotage', 10 * 60_000)) return { ok: false, err: 'Cooldown sabotage : 10 min' };
    me.gold -= 600;
    this._cdSet(me, 'sabotage');
    const target = found.city;
    target.sabotaged = 2;
    const caught = this.rng() < 0.25;
    if (caught) {
      me.rep -= 5;
      this.notify(target, `🧨 Sabotage démasqué : les autorités de ${target.name} identifient des agents de ${me.name} !`);
      this.save();
      return { ok: true, caught: true, city: target.name, rep: me.rep, dm: [{ to: found.uid, txt: `🧨 Un sabotage de ${me.name} a été démasqué chez toi !` }] };
    }
    this.notify(target, '🧨 DES SABOTEURS ont frappé tes usines : production réduite de moitié pour 2 collects !');
    this.save();
    return { ok: true, caught: false, city: target.name, anonymous: true };
  }

  /* 🎭 Faux-monnayage : gain rapide… ou scandale. */
  counterfeit(uid) {
    const me = this.cityOf(uid);
    if (!me) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    if (!(me.b.factory > 0)) return { ok: false, err: 'Il faut 🏭 1 usine pour imprimer la fausse monnaie.' };
    if (me.gold < 500) return { ok: false, err: 'Équipement : 500.' };
    if (this._cdLeft(me, 'counterfeit', 10 * 60_000)) return { ok: false, err: 'Cooldown faux-monnayage : 10 min' };
    me.gold -= 500;
    this._cdSet(me, 'counterfeit');
    if (this.rng() < 0.60) {
      me.gold += 2500;
      this.save();
      return { ok: true, success: true, gain: 2500, gold: me.gold };
    }
    me.gold = Math.max(0, me.gold - 1500);
    me.rep -= 5;
    this.addNews(`🎭 Un atelier de fausse monnaie a été démantelé (ville non nommée) — 1 500 d’amende.`);
    this.save();
    return { ok: true, success: false, fine: 1500, rep: me.rep, gold: me.gold };
  }

  /* 📰 Enquête de presse : tenter de démasquer le créateur d'un virus. */
  investigate(uid, virusName) {
    const me = this.cityOf(uid);
    if (!me) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    if (!(me.b.school > 0)) return { ok: false, err: 'Il faut 🎓 1 école pour financer une enquête.' };
    if (me.gold < 800) return { ok: false, err: 'Enquête de presse : 800.' };
    const name = String(virusName || me.lastVirusHit || '').trim();
    if (!name) return { ok: false, err: 'Quel virus ? Xcity investigate <nom> (ou sois d’abord infecté).' };
    me.gold -= 800;
    const v = this._virusByName(name) || null;
    const creatorUid = v ? String(v.creator) : this.store.data.virusArchive[name] || null;
    if (!creatorUid) { this.save(); return { ok: true, revealed: false, reason: 'introuvable' }; }
    const chance = Math.min(0.8, 0.4 + 0.1 * (me.b.school || 0));
    if (this.rng() >= chance) {
      this.save();
      return { ok: true, revealed: false, reason: 'échec' };
    }
    const creator = this.cityOf(creatorUid);
    if (!creator) { this.save(); return { ok: true, revealed: false, reason: 'ville disparue' }; }
    this.addNews(`📰 ENQUÊTE EXCLUSIVE : le virus « ${name} » a été créé par ${creator.name} (${creator.mayor}) !`);
    this.save();
    return { ok: true, revealed: true, virus: name, creatorName: creator.name, mayor: creator.mayor };
  }

  /* ☢️ Dissuasion nucléaire : construire puis (éventuellement) frapper. */
  nukeBuild(uid) {
    const me = this.cityOf(uid);
    if (!me) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    if (!(me.b.lab >= 3)) return { ok: false, err: 'Programme nucléaire : 🧪 3 laboratoires requis.' };
    if (me.scientists < 6) return { ok: false, err: 'Programme nucléaire : 🔬 6 scientifiques requis.' };
    if ((me.elements.plutonium || 0) < 3) return { ok: false, err: 'Il faut ☣️ 3 Plutonium (Xcity research).' };
    if (me.gold < 10_000) return { ok: false, err: 'Coût du programme : 10 000.' };
    me.gold -= 10_000;
    me.elements.plutonium -= 3;
    me.nukes += 1;
    this.addNews(`☢️ DISSUASION : ${me.name} dispose désormais de ${me.nukes} ogive(s) nucléaire(s) !`);
    this.save();
    return { ok: true, nukes: me.nukes };
  }

  nuke(uid, cityName) {
    const t = this._opsTarget(uid, cityName);
    if (t.err) return { ok: false, err: t.err };
    const { me, found } = t;
    if ((me.nukes || 0) < 1) return { ok: false, err: 'Aucune ogive — Xcity nuke build (labo 3, 6 scientifiques, 3 plutonium, 10 000).' };
    if (this._cdLeft(me, 'nuke', 24 * 3_600_000)) return { ok: false, err: 'Cooldown nucléaire : 24 h' };
    if (this.decreeActive('paix')) return { ok: false, err: '🕊️ JOUR DE PAIX : les frappes sont suspendues par décret mondial.' };
    me.nukes -= 1;
    this._cdSet(me, 'nuke');
    const target = found.city;
    const deaths = Math.max(1, Math.ceil(target.pop * 0.30));
    target.pop = Math.max(10, target.pop - deaths);
    const drained = Math.min(Math.floor(target.gold * 0.25), 50_000);
    target.gold -= drained;
    me.gold += drained;
    for (let i = 0; i < 3; i++) {
      const types = Object.keys(target.b).filter((k) => target.b[k] > 0);
      if (!types.length) break;
      const k = pick(this.rng, types);
      target.b[k] -= 1;
      target.ruined = (target.ruined || 0) + 1;
    }
    target.moral = clamp(target.moral - 25, 0, 100);
    target.quarantineUntil = this.now() + QUARANTINE_MS;
    me.rep -= 30;
    this.notify(target, `☢️ FRAPPE NUCLÉAIRE de ${me.name} ! ${deaths} habitants morts, -${nf(drained)} pillés, bâtiments en ruine, zone en quarantaine.`);
    this.addNews(`☢️ ${me.name} a LANCÉ UNE FRAPPE NUCLÉAIRE sur ${target.name} : ${deaths} morts. Le monde est sous le choc.`);
    for (const [, c] of this.allCities()) this.notify(c, `☢️ GUERRE NUCLÉAIRE : ${target.name} vient d’être frappée par ${me.name} !`);
    this.save();
    return { ok: true, city: target.name, deaths, drained, rep: me.rep, nukes: me.nukes, dm: [{ to: found.uid, txt: `☢️ ${me.name} t’a frappé avec l’ATOME : ${deaths} morts, -${nf(drained)} pillés !` }] };
  }

  /* 💉 Vaccin national : immunité 24 h contre virus et biotoxines. */
  vaccinate(uid) {
    const me = this.cityOf(uid);
    if (!me) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    if (!(me.b.lab > 0) || me.scientists < 2) return { ok: false, err: 'Il faut 🧪 1 laboratoire et 🔬 2 scientifiques.' };
    if ((me.elements.calcium || 0) < 1) return { ok: false, err: 'Formule : 1 🦴 Calcium (Xcity research).' };
    if (me.gold < 1000) return { ok: false, err: 'Coût de la campagne de vaccination : 1 000.' };
    me.gold -= 1000;
    me.elements.calcium -= 1;
    me.immuneUntil = this.now() + 24 * 3_600_000;
    this.save();
    return { ok: true, immuneHours: 24 };
  }

  /* 💉 Marché noir de vaccins : guérir UNE ville infectée contre 80/habitant. */
  vaccine(uid, cityName, virusName) {
    const me = this.cityOf(uid);
    if (!me) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    if (!(me.b.lab > 0) || me.scientists < 2) return { ok: false, err: 'Il faut 🧪 1 laboratoire et 🔬 2 scientifiques pour produire le vaccin.' };
    if ((me.elements.calcium || 0) < 1) return { ok: false, err: 'Formule : 1 🦴 Calcium (Xcity research).' };
    const found = this.byName(cityName);
    if (!found) return { ok: false, err: 'Ville à soigner introuvable.' };
    const v = this._virusByName(virusName);
    if (!v || !v.infected[String(found.uid)]) return { ok: false, err: `${found.city.name} n’est pas infectée par « ${virusName} ».` };
    me.elements.calcium -= 1;
    const cnt = v.infected[String(found.uid)];
    const price = cnt * (this.ruleAdopted('noir') ? 60 : VACCINE_PRICE);
    const target = found.city;
    if (target.gold < price) return { ok: false, err: `${target.name} ne peut pas payer ${nf(price)} (80/habitant × ${cnt}).` };
    target.gold -= price;
    me.gold += price;
    delete v.infected[String(found.uid)];
    v.cured[String(found.uid)] = true;
    me.rep += 2;
    this.notify(target, `💉 Un intermédiaire mystérieux t’a vendu le remède : ${nf(price)} payés, ta ville est sauvée.`);
    this.addNews(`💉 Un vaccin « officieux » a sauvé ${target.name} de « ${v.name} ».`);
    this.save();
    return { ok: true, city: target.name, virus: v.name, price, cnt, rep: me.rep };
  }

  /* ══════════════ GOUVERNANCE MONDIALE 🏛️ ══════════════ */

  decreeActive(type) {
    const d = this.store.data.assembly.worldDecree;
    return Boolean(d && d.type === type && this.now() < d.until);
  }

  buffActive(key) {
    const b = this.store.data.assembly.buffs;
    return Boolean(b && b[key] && this.now() < b[key]);
  }

  ruleAdopted(rule) {
    const A = this.store.data.assembly;
    return Array.isArray(A.constitution) && A.constitution.includes(rule);
  }

  /* 📜 Décret mondial — 1 par mandat, annoncé à toutes les villes. */
  worldDecree(uid, type) {
    const MAP = {
      foire: { label: '🎪 Foire mondiale', hours: 1, txt: 'prix de VENTE +20 % au Grand Marché' },
      paix: { label: '🕊️ Jour de paix', hours: 2, txt: 'attaques et frappes nucléaires désactivées' },
      corvee: { label: '⚒️ Corvée générale', hours: 1, txt: '+30 % de revenus partout' },
      couvrefeu: { label: '🌑 Couvre-feu', hours: 1, txt: 'opérations secrètes bloquées' },
    };
    const dec = MAP[type];
    if (!dec) return { ok: false, err: 'Décrets : foire, paix, corvee, couvrefeu' };
    const guard = this._presGuard(uid);
    if (!guard.ok) return guard;
    const A = this.assembly();
    if (A.decreeUsed) return { ok: false, err: 'Un décret mondial a déjà été signé pendant CE mandat (1 par mandat).' };
    if (A.worldDecree && this.now() < A.worldDecree.until) return { ok: false, err: 'Un décret mondial est déjà en vigueur.' };
    A.worldDecree = { type, label: dec.label, until: this.now() + dec.hours * 3_600_000 };
    A.decreeUsed = true;
    this.addNews(`${dec.label} : décret du Président — ${dec.txt} (${dec.hours} h).`);
    for (const [, c] of this.allCities()) this.notify(c, `${dec.label} : ${dec.txt} (${dec.hours} h).`);
    this.save();
    return { ok: true, decree: dec.label, hours: dec.hours, txt: dec.txt };
  }

  /* ⚖️ Tribunal mondial : accusation → vote des maires → peine. */
  tribunalOpen(uid, cityName, sentence) {
    const A = this.assembly();
    if (A.tribunal) return { ok: false, err: 'Un procès est déjà en cours (Xcity tribunal).' };
    const found = this.byName(cityName);
    if (!found) return { ok: false, err: 'Ville accusée introuvable.' };
    if (!['amende', 'embargo'].includes(sentence)) return { ok: false, err: 'Peines : amende (5 000 vers l’Assemblée) ou embargo (marché fermé 12 h).' };
    const isPres = this.presidentUid() === String(uid);
    const accused = found.city;
    const evidence = (accused.scandals || 0) * 2 + (accused.betrayals || 0);
    if (!isPres && evidence < 1) return { ok: false, err: 'Sans le Président, il faut des PREUVES (scandales/trahisons) pour accuser une ville.' };
    if (String(found.uid) === String(uid)) return { ok: false, err: 'On ne s’accuse pas soi-même 🙃' };
    A.tribunal = { accused: String(found.uid), sentence, votes: {}, deadline: this.now() + 30 * 60_000, evidence };
    this.addNews(`⚖️ PROCÈS : ${accused.name} est accusé — peine demandée : ${sentence === 'amende' ? 'amende de 5 000' : 'embargo de 12 h'} (preuves : ${evidence}). Les maires votent : Xcity tribunal voter <coupable|innocent>`);
    for (const [, c] of this.allCities()) this.notify(c, `⚖️ Tribunal mondial : votez contre ${accused.name} — Xcity tribunal voter <coupable|innocent> (30 min)`);
    this.save();
    return { ok: true, city: accused.name, sentence, evidence };
  }

  tribunalVote(uid, verdict) {
    const v = ['coupable', 'innocent'].includes(String(verdict || '').toLowerCase()) ? String(verdict).toLowerCase() : null;
    if (!v) return { ok: false, err: 'Verdict : coupable ou innocent' };
    const A = this.assembly();
    const T = A.tribunal;
    if (!T || this.now() > T.deadline) return { ok: false, err: 'Aucun procès en cours (ou déjà clos).' };
    if (!this.cityOf(uid)) return { ok: false, err: 'Seuls les maires siègent au tribunal.' };
    if (T.accused === String(uid)) return { ok: false, err: 'L’accusé ne vote pas.' };
    T.votes[String(uid)] = v;
    this.save();
    return { ok: true, verdict: v };
  }

  tribunalStatus() {
    const T = this.store.data.assembly.tribunal;
    if (!T) return { ok: true, tribunal: null };
    const accused = this.cityOf(T.accused);
    let coupable = T.evidence, innocent = 0;
    for (const vote of Object.values(T.votes)) (vote === 'coupable' ? coupable++ : innocent++);
    return { ok: true, tribunal: { city: accused ? accused.name : '?', sentence: T.sentence, coupable, innocent, minutes: Math.max(0, Math.ceil((T.deadline - this.now()) / 60_000)) } };
  }

  _resolveTribunal() {
    const A = this.store.data.assembly;
    const T = A.tribunal;
    if (!T || this.now() < T.deadline) return;
    let guilty = T.evidence; // les preuves pèsent comme des voix
    let innocent = 0;
    for (const vote of Object.values(T.votes)) (vote === 'coupable' ? guilty++ : innocent++);
    const accused = this.cityOf(T.accused);
    A.tribunal = null;
    if (!accused) { this.save(); return; }
    if (guilty > innocent) {
      if (T.sentence === 'amende') {
        const fine = Math.min(accused.gold, 5000);
        accused.gold -= fine;
        A.treasury += fine;
        this.notify(accused, `⚖️ COUPABLE : amende de ${nf(fine)}${this.cur()} versée à l’Assemblée.`);
        this.addNews(`⚖️ ${accused.name} déclaré COUPABLE — amende de ${nf(fine)}${this.cur()}.`);
      } else {
        accused.embargoUntil = this.now() + 12 * 3_600_000;
        this.notify(accused, '⚖️ COUPABLE : embargo — ton marché est fermé 12 h.');
        this.addNews(`⚖️ ${accused.name} est sous EMBARGO commercial 12 h.`);
      }
    } else {
      accused.moral = clamp(accused.moral + 2, 0, 100);
      this.addNews(`⚖️ ${accused.name} a été DISCULPÉ par l’Assemblée.`);
    }
    this.save();
  }

  /* 📜 Constitution : lois votées par les maires, effets RÉELS. */
  loiPropose(uid, rule) {
    const MAP = {
      novice: '🛡️ Protection des petites villes (lvl 1-2 intouchables)',
      butin: '💰 Plafond de butin réduit de moitié (7 500)',
      noir: '💉 Vaccin noir plafonné à 60/habitant',
    };
    if (!MAP[rule]) return { ok: false, err: 'Lois : novice, butin, noir' };
    const A = this.assembly();
    if (!this.cityOf(uid)) return { ok: false, err: 'Seuls les maires proposent des lois.' };
    if (A.loi) return { ok: false, err: 'Un vote de loi est déjà en cours (Xcity loi).' };
    if (this.ruleAdopted(rule)) return { ok: false, err: 'Cette loi est déjà ADOPTÉE — repropose un vote pour l’abroger.' };
    A.loi = { rule, label: MAP[rule], votes: {}, deadline: this.now() + 30 * 60_000 };
    this.addNews(`📜 CONSTITUTION : vote sur « ${MAP[rule]} » — Xcity loi voter ${rule} <oui|non> (30 min).`);
    this.save();
    return { ok: true, rule, label: MAP[rule] };
  }

  loiVote(uid, rule, verdict) {
    const v = String(verdict || '').toLowerCase();
    if (!['oui', 'non'].includes(v)) return { ok: false, err: 'Verdict : oui ou non' };
    const A = this.assembly();
    const L = A.loi;
    if (!L || this.now() > L.deadline) return { ok: false, err: 'Aucun vote de loi en cours.' };
    if (L.rule !== String(rule || '').toLowerCase()) return { ok: false, err: 'Ce n’est pas la loi en discussion (Xcity loi).' };
    if (!this.cityOf(uid)) return { ok: false, err: 'Seuls les maires votent les lois.' };
    L.votes[String(uid)] = v;
    this.save();
    return { ok: true, verdict: v };
  }

  loiStatus() {
    const A = this.store.data.assembly;
    const L = A.loi;
    let oui = 0, non = 0;
    if (L) for (const vote of Object.values(L.votes)) (vote === 'oui' ? oui++ : non++);
    return { ok: true, active: L ? { rule: L.rule, label: L.label, oui, non, minutes: Math.max(0, Math.ceil((L.deadline - this.now()) / 60_000)) } : null, adopted: [...(A.constitution || [])] };
  }

  _resolveLoi() {
    const A = this.store.data.assembly;
    const L = A.loi;
    if (!L || this.now() < L.deadline) return;
    A.loi = null;
    let oui = 0, non = 0;
    for (const vote of Object.values(L.votes)) (vote === 'oui' ? oui++ : non++);
    if (!Array.isArray(A.constitution)) A.constitution = [];
    const idx = A.constitution.indexOf(L.rule);
    if (oui > non) {
      if (idx === -1) A.constitution.push(L.rule);
      this.addNews(`📜 ADOPTÉE : « ${L.label} » entre dans la Constitution (${oui} pour / ${non} contre).`);
    } else if (idx !== -1) {
      A.constitution.splice(idx, 1);
      this.addNews(`📜 ABROGÉE : « ${L.label} » sort de la Constitution (${oui} pour / ${non} contre).`);
    } else {
      this.addNews(`📜 REJETÉE : « ${L.label} » (${oui} pour / ${non} contre).`);
    }
    this.save();
  }

  /* 🏗️ Grands Travaux : étapes financées → bonus mondiaux 24 h. */
  worksView(uid) {
    const c = this.cityOf(uid);
    if (!c) return { ok: false, err: 'Crée ta ville : Xcity create <nom>' };
    const A = this.assembly();
    const W = A.works;
    return {
      ok: true,
      works: W ? { key: W.key, name: WORKS[W.key].label, stage: W.stage, total: WORKS[W.key].stages.length, need: WORKS[W.key].stages[W.stage], collected: W.collected, txt: WORKS[W.key].txt } : null,
      done: [...(A.worksDone || [])],
    };
  }

  worksLaunch(uid, key) {
    const guard = this._presGuard(uid);
    if (!guard.ok) return guard;
    if (!WORKS[key]) return { ok: false, err: `Chantiers : ${Object.keys(WORKS).join(', ')}` };
    const A = this.assembly();
    if (A.works) return { ok: false, err: 'Un chantier est déjà en cours (Xcity travaux).' };
    if ((A.worksDone || []).includes(WORKS[key].label)) return { ok: false, err: `${WORKS[key].label} est déjà construit !` };
    A.works = { key, stage: 0, collected: 0 };
    this.addNews(`🏗️ GRANDS TRAVAUX : le Président lance « ${WORKS[key].label} » — ${WORKS[key].txt}. Financez : Xcity travaux donner <somme>`);
    this.save();
    return { ok: true, name: WORKS[key].label, need: WORKS[key].stages[0] };
  }

  worksFund(uid, amount, fromTreasury) {
    const A = this.assembly();
    const W = A.works;
    if (!W) return { ok: false, err: 'Aucun chantier en cours — le Président lance : Xcity travaux lancer <pont|aqueduc|universite>' };
    amount = Math.floor(Number(amount));
    if (!Number.isFinite(amount) || amount < 500) return { ok: false, err: 'Minimum 500 par versement.' };
    const me = this.cityOf(uid);
    if (!me) return { ok: false, err: 'Seuls les maires financent les Grands Travaux.' };
    if (fromTreasury) {
      const guard = this._presGuard(uid);
      if (!guard.ok) return guard;
      if (A.treasury < amount) return { ok: false, err: `Trésor de l’Assemblée : ${nf(A.treasury)}${this.cur()} (insuffisant).` };
      A.treasury -= amount;
    } else {
      if (me.gold < amount) return { ok: false, err: `Fonds insuffisants (${nf(me.gold)}).` };
      me.gold -= amount;
      me.moral = clamp(me.moral + 1, 0, 100);
    }
    W.collected += amount;
    const def = WORKS[W.key];
    let stageDone = false, finished = false;
    if (W.collected >= def.stages[W.stage]) {
      stageDone = true;
      W.collected -= def.stages[W.stage];
      W.stage += 1;
      if (!A.buffs) A.buffs = {};
      A.buffs[def.buff] = this.now() + 24 * 3_600_000;
      this.addNews(`🏗️ ${def.label} — étape ${W.stage}/${def.stages.length} achevée : ${def.txt}`);
      if (W.stage >= def.stages.length) {
        finished = true;
        if (!Array.isArray(A.worksDone)) A.worksDone = [];
        A.worksDone.push(def.label);
        A.works = null;
        this.addNews(`🏗️ GRANDS TRAVAUX TERMINÉS : ${def.label} sert désormais tout le monde !`);
      }
    }
    this.save();
    return {
      ok: true, amount, name: def.label, stageDone, finished,
      stage: A.works ? A.works.stage : def.stages.length,
      need: A.works ? def.stages[A.works.stage] : 0,
      collected: A.works ? A.works.collected : 0, fromTreasury,
    };
  }

  /* 🚨 État de catastrophe : reconstructions -50 %, dons qui réconfortent. */
  catastropheFor(uid) {
    const A = this.store.data.assembly;
    return Boolean(A.catastrophe && A.catastrophe.uid === String(uid) && this.now() < A.catastrophe.until);
  }

  declareCatastrophe(uid, cityName) {
    const guard = this._presGuard(uid);
    if (!guard.ok) return guard;
    const found = this.byName(cityName);
    if (!found) return { ok: false, err: 'Ville sinistrée introuvable.' };
    const c = found.city;
    const disaster = (c.ruined || 0) > 0 || this.now() < (c.quarantineUntil || 0) || this.infectionsOn(String(found.uid)) > 0;
    if (!disaster) return { ok: false, err: `${c.name} ne subit aucune catastrophe (ni ruine, ni quarantaine, ni épidémie).` };
    const A = this.assembly();
    if (A.catastrophe && this.now() < A.catastrophe.until) return { ok: false, err: 'Un état de catastrophe est déjà déclaré.' };
    A.catastrophe = { uid: String(found.uid), until: this.now() + 2 * 3_600_000 };
    this.addNews(`🚨 ÉTAT DE CATASTROPHE déclaré sur ${c.name} — reconstructions à moitié prix, dons salués (2 h).`);
    this.notify(c, '🚨 L’Assemblée a déclaré l’état de catastrophe pour ta ville : reconstruis à -50 % pendant 2 h !');
    this.save();
    return { ok: true, city: c.name, hours: 2 };
  }

  /* 🕵️ Renseignements de l’État : acheter l’identité d’un créateur de virus. */
  intelBuy(uid, virusName) {
    const guard = this._presGuard(uid);
    if (!guard.ok) return guard;
    const A = this.assembly();
    if (A.treasury < 20000) return { ok: false, err: `Service de renseignement : 20 000 (trésor : ${nf(A.treasury)}).` };
    const name = String(virusName || '').trim();
    const archive = this.store.data.virusArchive || {};
    if (!archive[name]) return { ok: false, err: `Aucune trace du virus « ${name} » dans les registres.` };
    A.treasury -= 20000;
    const me = this.cityOf(uid);
    let result;
    if (this.rng() < 0.75) {
      const creator = this.cityOf(archive[name]);
      result = { sure: true, virus: name, creator: creator ? creator.name : 'ville disparue', mayor: creator ? creator.mayor : '?' };
      if (me) this.notify(me, `🕵️ INFORMATEUR : « ${name} » a été créé par ${result.creator} (${result.mayor}). Source fiable.`);
    } else {
      const others = this.allCities().filter(([u]) => u !== archive[name]);
      const wrong = others.length ? pick(this.rng, others)[1].name : null;
      result = { sure: false, virus: name, creator: wrong, mayor: null };
      if (me) this.notify(me, `🕵️ INFORMATEUR : il se dirigerait que « ${name} » viendrait de ${wrong || 'on ne sait où'}… Source peu fiable, à vérifier.`);
    }
    this.save();
    return { ok: true, ...result };
  }

  /* 🤝 Sommet diplomatique : présence = moral, clôture = paix collective. */
  summitOpen(uid) {
    const guard = this._presGuard(uid);
    if (!guard.ok) return guard;
    const A = this.assembly();
    if (A.treasury < 5000) return { ok: false, err: `Organiser le sommet coûte 5 000 (trésor : ${nf(A.treasury)}).` };
    if (A.sommet && this.now() < A.sommet.until) return { ok: false, err: 'Un sommet est déjà en cours.' };
    A.treasury -= 5000;
    A.sommet = { until: this.now() + 30 * 60_000, participants: {} };
    if (this.cityOf(uid)) A.sommet.participants[String(uid)] = true;
    this.addNews('🤝 SOMMET DIPLOMATIQUE convoqué par le Président ! Les maires répondent : Xcity present (30 min).');
    for (const [, c] of this.allCities()) this.notify(c, '🤝 SOMMET : réponds présent — Xcity present (+moral, paix collective à la clé).');
    this.save();
    return { ok: true };
  }

  summitAttend(uid) {
    const A = this.assembly();
    const S = A.sommet;
    if (!S || this.now() > S.until) return { ok: false, err: 'Aucun sommet en cours.' };
    const me = this.cityOf(uid);
    if (!me) return { ok: false, err: 'Seuls les maires assistent au sommet.' };
    if (S.participants[String(uid)]) return { ok: false, err: 'Tu es déjà inscrit au sommet.' };
    S.participants[String(uid)] = true;
    me.moral = clamp(me.moral + 3, 0, 100);
    this.save();
    return { ok: true, attendees: Object.keys(S.participants).length };
  }

  _resolveSummit() {
    const A = this.store.data.assembly;
    const S = A.sommet;
    if (!S || this.now() < S.until) return;
    A.sommet = null;
    const ids = Object.keys(S.participants).filter((u) => this.cityOf(u));
    if (ids.length >= 2) {
      const until = this.now() + 24 * 3_600_000;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = this.cityOf(ids[i]);
          const b = this.cityOf(ids[j]);
          a.treaties[ids[j]] = { type: 'peace', since: this.now(), until };
          b.treaties[ids[i]] = { type: 'peace', since: this.now(), until };
          this.notify(a, `🤝 Paix collective signée avec ${b.name} (24 h) grâce au sommet.`);
          this.notify(b, `🤝 Paix collective signée avec ${a.name} (24 h) grâce au sommet.`);
        }
      }
      this.addNews(`🤝 Le sommet s’achève : ${ids.length} villes signent une PAIX COLLECTIVE de 24 h.`);
    } else {
      this.addNews('🤝 Le sommet s’achève sans accord — trop peu de maires présents.');
    }
    this.save();
  }

  /* 🛡️ Garde de l’Assemblée : armée commune, dépêchée où le Président veut. */
  guardRecruit(uid, n) {
    const guard = this._presGuard(uid);
    if (!guard.ok) return guard;
    n = Math.floor(Number(n));
    if (!Number.isInteger(n) || n < 1 || n > 50) return { ok: false, err: 'Combien d’unités de garde ? (1 à 50)' };
    const A = this.assembly();
    const cost = n * 200;
    if (A.treasury < cost) return { ok: false, err: `Recruter ${n} gardes coûte ${nf(cost)}${this.cur()} (trésor : ${nf(A.treasury)}).` };
    A.treasury -= cost;
    A.garde = (A.garde || 0) + n;
    this.addNews(`🛡️ La Garde de l’Assemblée compte désormais ${A.garde} soldats (fonds communs).`);
    this.save();
    return { ok: true, garde: A.garde, cost };
  }

  guardSend(uid, cityName, n) {
    const guard = this._presGuard(uid);
    if (!guard.ok) return guard;
    const A = this.assembly();
    n = Math.floor(Number(n));
    if (!Number.isInteger(n) || n < 1) return { ok: false, err: 'Combien d’unités envoyer ?' };
    if ((A.garde || 0) < n) return { ok: false, err: `La Garde n’a que ${A.garde || 0} soldat(s) disponible(s) — Xcity garde recruter <n>` };
    const found = this.byName(cityName);
    if (!found) return { ok: false, err: 'Ville à protéger introuvable.' };
    A.garde -= n;
    const c = found.city;
    c.guard = (c.guard || 0) + n;
    this.addNews(`🛡️ ${n} soldat(s) de la Garde de l’Assemblée dépêchés à ${c.name}.`);
    this.notify(c, `🛡️ La Garde de l’Assemblée (${n} soldats) protège désormais ta ville.`);
    this.save();
    return { ok: true, city: c.name, sent: n, remaining: A.garde };
  }

  /* 📊 Bulletin présidentiel : rapport mondial toutes les 24 h. */
  _maybeBulletin() {
    const A = this.store.data.assembly;
    const now = this.now();
    if (!A.lastBulletin) { A.lastBulletin = now; return; }
    if (now - A.lastBulletin < 24 * 3_600_000) return;
    A.lastBulletin = now;
    const cities = this.allCities();
    if (!cities.length) return;
    const totalGold = cities.reduce((acc, [, c]) => acc + (c.gold || 0), 0);
    const top = cities.slice().sort((x, y) => y[1].gold - x[1].gold)[0];
    const conflicts = this.store.data.news.filter((n) => now - n.at < 24 * 3_600_000 && /pillé|NUCLÉAIRE|TRAHI|PANDÉMIE/.test(n.txt)).length;
    const txt = `📊 BULLETIN PRÉSIDENTIEL — ${cities.length} villes · richesse mondiale ${nf(totalGold)}${this.cur()} · ${conflicts} incident(s) en 24 h · en tête : ${top[1].name} · Trésor de l’Assemblée : ${nf(A.treasury)}${this.cur()}`;
    for (const [, c] of cities) this.notify(c, txt);
    this.save();
  }

  /* ══════════════ RENOMMAGE ══════════════ */

  _resolveCityFlexible(name) {
    const exact = this.byName(name);
    if (exact) return exact;
    const n = String(name || '').trim().toLowerCase();
    if (!n) return null;
    const matches = this.allCities().filter(([, c]) => String(c.name).toLowerCase().startsWith(n));
    return matches.length === 1 ? { uid: matches[0][0], city: matches[0][1] } : null;
  }

  rename(uid, oldName, newName, opts = {}) {
    newName = String(newName || '').trim().replace(/\s+/g, ' ');
    if (newName.length < 2 || newName.length > 24) return { ok: false, err: 'Nouveau nom : 2 à 24 caractères.' };
    let entry;
    if (!oldName) {
      const c = this.cityOf(uid);
      if (!c) return { ok: false, err: 'Tu n’as pas de ville — ou précise : Xcity rename <ville> <nouveau nom>' };
      entry = { uid: String(uid), city: c };
    } else {
      entry = this._resolveCityFlexible(oldName);
      if (!entry) return { ok: false, err: 'Ville introuvable (le début du suffit si unique).' };
      if (String(entry.uid) !== String(uid) && !opts.isAdmin) {
        return { ok: false, err: 'Seul un ADMIN peut renommer la ville d’un autre.' };
      }
    }
    if (this.byName(newName)) return { ok: false, err: `Le nom « ${newName} » est déjà pris.` };
    const old = entry.city.name;
    entry.city.name = newName;
    this.addNews(`🏷️ ${old} devient ${newName}.`);
    this.save();
    return { ok: true, oldName: old, newName, mayor: entry.city.mayor };
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
        main: `💰 ${nf(c.gold)}${this.cur()} · 👥 ${nf(c.pop)} · 😊 moral ${c.moral}/100 · 🪖 ${units}`,
        land: `📐 ${c.km2} km² · 🧳 ${this.tourists(c)} touristes/collect (+${nf(this.tourists(c) * 2)}$) · revenu ≈ ${nf(this.baseIncome(c) + this.bankBonus(c, this.baseIncome(c)) + this.tourists(c) * 2)}$`,
        buildings: `🏗️ ${buildings}`,
        ress: `📦 ${ress} — spécialités : ${c.produce.map((r) => RES_LABEL[r]).join(', ')}`,
        army: `🎖️ ${this.armyRating(c)}${c.officers.captain ? ' · Capitaine' : ''}${c.officers.general ? ' · Général' : ''}`,
        decree: `📜 Décret : ${c.decree ? DECREES[c.decree].label : 'aucun'}`,
        ...(c.b.lab > 0 ? { lab: `🧪 ${c.b.lab} labo(s) · 🔬 ${c.scientists}/${this.labCapacity(c)} scientifiques${this.infectionsOn(String(c.uid)) ? ` · ☣️ ${this.infectionsOn(String(c.uid))} infectés à soigner !` : ''}` } : {}),
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
      nukes: c.nukes || 0, scandals: c.scandals || 0,
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
  ELEMENTS, LAB_SCI_PER, HIRE_COST, RESEARCH_CD, RESEARCH_COST, SYNTH_CD,
  VIRUS_LAUNCH_CD, VIRUS_COST, PANDEMIC_COST, CURE_PRICE, DEATH_BOUNTY, DEATH_RATE,
  RANSOM_MIN,
  CANDIDACY_FEE, CANDIDACY_MS, VOTING_MS, MANDATE_MS, VOTE_WEIGHT, PRES_TAX,
  SCANDAL_PENALTY, CURRENCIES, QUARANTINE_MS, VACCINE_PRICE,
  PRES_SALARY, SALARY_MS, WORKS,
  BETRAY_RATE, BETRAY_REP, LOOT_RATE, LOOT_CAP, SEND_TAX, EXPAND_BASE,
  COLLECT_CD, ATTACK_CD, EXPAND_CD, TRAIN_CD, MARKET_MS, TREATY_MS, SHIELD_MS,
  titleFor,
};

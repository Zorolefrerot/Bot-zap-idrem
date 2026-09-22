"use strict";

/**
 * services/economy.js
 * ---------------------------------------------------------------------------
 * Économie virtuelle : IDREM Coins (symbole IG) — data/economy.json.
 *
 * Gère : solde, inventaire, boutique, revenus (/daily /work /crime) avec leurs
 * cooldowns, transferts (/give /transfer) et classement (/rich).
 *
 * Aucune valeur réelle : c'est un jeu. Les montants et délais viennent de
 * config.json (section `economy`) et restent modifiables sans toucher au code.
 * ---------------------------------------------------------------------------
 */

const { randInt, pick } = require("../utils/random");

const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };

/** Catalogue de la boutique. `sellRatio` = fraction du prix récupérée à la revente. */
const SHOP_ITEMS = [
  { id: "badge_fan", name: "Badge Fan", icon: "🎖️", price: 500, type: "badge", description: "Affiché sur /profile." },
  { id: "badge_dev", name: "Badge Développeur", icon: "🧑‍💻", price: 2500, type: "badge", description: "Pour celles et ceux qui codent." },
  { id: "badge_vip", name: "Badge VIP", icon: "💎", price: 10000, type: "badge", description: "Le luxe, tout simplement." },
  { id: "coffee", name: "Café", icon: "☕", price: 120, type: "conso", description: "Réveille le bot (et vous)." },
  { id: "pizza", name: "Pizza", icon: "🍕", price: 300, type: "conso", description: "Partageable, officiellement non." },
  { id: "rocket", name: "Fusée", icon: "🚀", price: 1500, type: "objet", description: "Pour viser la Lune, comme Tereshkova." },
  { id: "robot", name: "Robot de compagnie", icon: "🤖", price: 3000, type: "objet", description: "Il ne parle pas, il écoute." },
  { id: "crown", name: "Couronne", icon: "👑", price: 7500, type: "objet", description: "À porter avec modestie." },
  { id: "shield", name: "Bouclier anti-troll", icon: "🛡️", price: 900, type: "objet", description: "Efficacité non garantie." },
  { id: "plant", name: "Plante spatiale", icon: "🪴", price: 450, type: "objet", description: "Pousse sans gravité." },
  { id: "ticket", name: "Ticket de loterie", icon: "🎟️", price: 200, type: "conso", description: "À utiliser avec /crime… ou pas." },
  { id: "book", name: "Livre de commandes", icon: "📚", price: 650, type: "objet", description: "Contient /help, en mieux." }
];

const JOBS = [
  { label: "développeur·se", min: 0.9, max: 1.15 },
  { label: "livreur·se", min: 0.8, max: 1.1 },
  { label: "barista", min: 0.75, max: 1.05 },
  { label: "testeur·se de bots", min: 0.85, max: 1.2 },
  { label: "astronaute stagiaire", min: 1.0, max: 1.3 },
  { label: "community manager", min: 0.8, max: 1.1 },
  { label: "électricien·ne", min: 0.85, max: 1.15 },
  { label: "rédacteur·trice", min: 0.8, max: 1.1 },
  { label: "jardinier·ère orbital", min: 0.9, max: 1.25 }
];

const CRIMES_SUCCESS = [
  "Vous avez détourné un flux de données… sans laisser de trace.",
  "Le coffre du groupe était mal fermé. Il l'est moins maintenant.",
  "Arnaque au faux /daily réussie.",
  "Vous avez revendu des pixels qui n'existaient pas.",
  "Cambriolage de la banque d'XP : personne n'a rien vu."
];

const CRIMES_FAIL = [
  "Un modérateur passait par là. Amende immédiate.",
  "Vous avez trébuché sur le câble réseau. Alarme déclenchée.",
  "Le vigile du serveur vous a reconnu.",
  "Vous avez envoyé le plan par erreur dans le groupe.",
  "Tentative ratée : le bot a tout journalisé."
];

function uid(value) {
  const str = String(value ?? "").trim();
  return /^\d{5,25}$/.test(str) ? str : "";
}

/**
 * @param {object} deps
 * @param {object} deps.store
 * @param {object} deps.config
 * @param {object} [deps.logger]
 */
function createEconomy(deps = {}) {
  const { store, config } = deps;
  const logger = deps.logger || noopLogger;
  const collection = store.get("economy", {});

  const symbol = () => String(config.currency.symbol || "IG");
  const maxBalance = () => Number(config.currency.maxBalance) || 1000000000;

  function defaults(userID) {
    return {
      userID,
      balance: Math.max(0, Number(config.currency.startBalance) || 0),
      totalEarned: 0,
      totalSpent: 0,
      inventory: [],
      history: [],
      lastDaily: 0,
      lastWork: 0,
      lastCrime: 0,
      createdAt: Date.now()
    };
  }

  function repair(record, userID) {
    const base = defaults(userID);
    if (!record || typeof record !== "object" || Array.isArray(record)) return base;
    const merged = { ...base, ...record };
    merged.userID = userID;
    for (const key of ["balance", "totalEarned", "totalSpent", "lastDaily", "lastWork", "lastCrime", "createdAt"]) {
      merged[key] = Number.isFinite(Number(merged[key])) ? Math.max(0, Number(merged[key])) : base[key];
    }
    merged.balance = Math.min(maxBalance(), merged.balance);
    if (!Array.isArray(merged.inventory)) merged.inventory = [];
    merged.inventory = merged.inventory
      .filter((i) => i && typeof i === "object")
      .map((i) => ({ id: String(i.id || ""), name: String(i.name || i.id || ""), qty: Math.max(0, Number(i.qty) || 0) }))
      .filter((i) => i.id && i.qty > 0)
      .slice(0, Number(config.limits.maxInventorySlots) || 40);
    if (!Array.isArray(merged.history)) merged.history = [];
    merged.history = merged.history.slice(-30);
    return merged;
  }

  function get(userID) {
    const id = uid(userID);
    if (!id) return null;
    const existing = collection.data[id];
    const record = repair(existing, id);
    collection.data[id] = record;
    if (!existing) collection.save();
    return record;
  }

  function balance(userID) {
    const record = get(userID);
    return record ? record.balance : 0;
  }

  function logHistory(record, entry) {
    record.history.push({ at: Date.now(), ...entry });
    if (record.history.length > 30) record.history = record.history.slice(-30);
  }

  /** Ajoute des pièces (jamais au-delà du plafond). */
  function add(userID, amount, reason = "") {
    const record = get(userID);
    if (!record) return null;
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    if (value <= 0) return record;
    record.balance = Math.min(maxBalance(), record.balance + value);
    record.totalEarned += value;
    logHistory(record, { type: "gain", amount: value, reason });
    collection.save();
    return record;
  }

  /** Retire des pièces ; refuse si solde insuffisant. */
  function remove(userID, amount, reason = "") {
    const record = get(userID);
    if (!record) return null;
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    if (value <= 0) return { ...record, removed: 0 };
    if (record.balance < value) return null;
    record.balance -= value;
    record.totalSpent += value;
    logHistory(record, { type: "perte", amount: value, reason });
    collection.save();
    return record;
  }

  function has(userID, amount) {
    return balance(userID) >= Math.max(0, Math.floor(Number(amount) || 0));
  }

  /** Formate un montant : « 1 250 IG ». */
  function fmt(amount) {
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    return `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ${symbol()}`;
  }

  // --- Revenus avec cooldowns ---------------------------------------------

  function cooldownState(userID, kind) {
    const record = get(userID);
    if (!record) return { ready: false, remainingMs: 0 };
    const eco = config.economy;
    let cooldownMs = 0;
    let last = 0;
    if (kind === "daily") {
      cooldownMs = (Number(eco.daily.cooldownHours) || 20) * 3600000;
      last = record.lastDaily;
    } else if (kind === "work") {
      cooldownMs = (Number(eco.work.cooldownMinutes) || 45) * 60000;
      last = record.lastWork;
    } else if (kind === "crime") {
      cooldownMs = (Number(eco.crime.cooldownMinutes) || 90) * 60000;
      last = record.lastCrime;
    }
    const elapsed = Date.now() - (last || 0);
    return { ready: elapsed >= cooldownMs, remainingMs: Math.max(0, cooldownMs - elapsed), cooldownMs, last };
  }

  function cooldowns(userID) {
    return {
      daily: cooldownState(userID, "daily"),
      work: cooldownState(userID, "work"),
      crime: cooldownState(userID, "crime")
    };
  }

  function claimDaily(userID) {
    const state = cooldownState(userID, "daily");
    if (!state.ready) return { ok: false, remainingMs: state.remainingMs };
    const amount = randInt(config.economy.daily.min, config.economy.daily.max);
    const record = add(userID, amount, "bonus quotidien");
    record.lastDaily = Date.now();
    collection.save();
    return { ok: true, amount, balance: record.balance };
  }

  function work(userID) {
    const state = cooldownState(userID, "work");
    if (!state.ready) return { ok: false, remainingMs: state.remainingMs };
    const job = pick(JOBS);
    const baseAmount = randInt(config.economy.work.min, config.economy.work.max);
    // Le métier module le gain entre son minimum et son maximum.
    const multiplier = job.min + Math.random() * (job.max - job.min);
    const amount = Math.max(1, Math.round(baseAmount * multiplier));
    const record = add(userID, amount, `travail (${job.label})`);
    record.lastWork = Date.now();
    collection.save();
    return { ok: true, amount, job: job.label, balance: record.balance };
  }

  function crime(userID) {
    const state = cooldownState(userID, "crime");
    if (!state.ready) return { ok: false, remainingMs: state.remainingMs };

    const record = get(userID);
    record.lastCrime = Date.now();
    const success = Math.random() < (Number(config.economy.crime.successRate) || 0.45);

    if (success) {
      const amount = randInt(config.economy.crime.min, config.economy.crime.max);
      add(userID, amount, "crime réussi");
      const after = get(userID);
      after.lastCrime = record.lastCrime;
      collection.save();
      return { ok: true, success: true, amount, message: pick(CRIMES_SUCCESS), balance: after.balance };
    }

    const fine = randInt(config.economy.crime.fineMin, config.economy.crime.fineMax);
    const paid = Math.min(fine, record.balance);
    if (paid > 0) remove(userID, paid, "amende");
    const after = get(userID);
    after.lastCrime = record.lastCrime;
    collection.save();
    return { ok: true, success: false, amount: -paid, fine: paid, message: pick(CRIMES_FAIL), balance: after.balance };
  }

  // --- Transferts ----------------------------------------------------------

  /**
   * Transfert entre utilisateurs.
   * @returns {{ ok: boolean, amount?: number, fee?: number, error?: string, balance?: number }}
   */
  function transfer(fromID, toID, amount) {
    const from = uid(fromID);
    const to = uid(toID);
    const value = Math.floor(Number(amount) || 0);

    if (!from || !to) return { ok: false, error: "UID invalide." };
    if (from === to) return { ok: false, error: "Impossible de vous transférer des pièces à vous-même." };
    if (value <= 0) return { ok: false, error: "Montant invalide (doit être supérieur à 0)." };
    if (!Number.isFinite(value)) return { ok: false, error: "Montant invalide." };

    const senderRecord = get(from);
    if (senderRecord.balance < value) {
      return { ok: false, error: `Solde insuffisant : vous avez ${fmt(senderRecord.balance)}.` };
    }

    const feePercent = Number(config.economy.transferFeePercent) || 0;
    const fee = feePercent > 0 ? Math.floor((value * feePercent) / 100) : 0;
    const received = value - fee;

    const debited = remove(from, value, `transfert vers ${to}`);
    if (!debited) return { ok: false, error: "Solde insuffisant." };
    add(to, received, `transfert depuis ${from}`);

    logger.debug(`Transfert ${from} → ${to} : ${value} (${fee} de frais).`, "economy");
    return { ok: true, amount: value, received, fee, balance: debited.balance };
  }

  // --- Boutique ------------------------------------------------------------

  function shop() {
    return SHOP_ITEMS.map((item) => ({ ...item }));
  }

  function findItem(idOrName) {
    const key = String(idOrName ?? "").trim().toLowerCase();
    if (!key) return null;
    return (
      SHOP_ITEMS.find((i) => i.id === key) ||
      SHOP_ITEMS.find((i) => i.name.toLowerCase() === key) ||
      SHOP_ITEMS.find((i) => i.name.toLowerCase().includes(key) || i.id.includes(key)) ||
      null
    );
  }

  function inventory(userID) {
    const record = get(userID);
    return record ? record.inventory.map((i) => ({ ...i })) : [];
  }

  function buy(userID, itemId, qty = 1) {
    const item = findItem(itemId);
    if (!item) return { ok: false, error: "Article introuvable dans la boutique." };
    const quantity = Math.max(1, Math.min(99, Math.floor(Number(qty) || 1)));
    const total = item.price * quantity;
    const record = get(userID);

    if (record.balance < total) {
      return { ok: false, error: `Solde insuffisant : ${fmt(total)} requis, vous avez ${fmt(record.balance)}.` };
    }
    const slots = Number(config.limits.maxInventorySlots) || 40;
    const existing = record.inventory.find((i) => i.id === item.id);
    if (!existing && record.inventory.length >= slots) {
      return { ok: false, error: `Inventaire plein (${slots} emplacements).` };
    }

    const debited = remove(userID, total, `achat ${item.name} ×${quantity}`);
    if (!debited) return { ok: false, error: "Solde insuffisant." };
    if (existing) existing.qty += quantity;
    else debited.inventory.push({ id: item.id, name: item.name, qty: quantity });
    collection.save();
    return { ok: true, item, quantity, total, balance: debited.balance };
  }

  function sell(userID, itemId, qty = 1) {
    const item = findItem(itemId);
    if (!item) return { ok: false, error: "Article introuvable." };
    const record = get(userID);
    const entry = record.inventory.find((i) => i.id === item.id);
    if (!entry || entry.qty <= 0) return { ok: false, error: `Vous ne possédez pas « ${item.name} ».` };

    const quantity = Math.max(1, Math.min(entry.qty, Math.floor(Number(qty) || 1)));
    const value = Math.max(1, Math.floor(item.price * 0.5 * quantity));

    entry.qty -= quantity;
    record.inventory = record.inventory.filter((i) => i.qty > 0);
    add(userID, value, `vente ${item.name} ×${quantity}`);
    const after = get(userID);
    collection.save();
    return { ok: true, item, quantity, value, balance: after.balance };
  }

  /** Valeur totale de l'inventaire (moitié du prix d'achat). */
  function inventoryValue(userID) {
    const record = get(userID);
    return record.inventory.reduce((sum, entry) => {
      const item = SHOP_ITEMS.find((i) => i.id === entry.id);
      return sum + (item ? Math.floor(item.price * 0.5) * entry.qty : 0);
    }, 0);
  }

  /** Badges possédés (affichés sur /profile). */
  function badges(userID) {
    return inventory(userID)
      .map((entry) => SHOP_ITEMS.find((i) => i.id === entry.id))
      .filter((item) => item && item.type === "badge");
  }

  /** Utilisateurs les plus riches. */
  function top(limit = 10) {
    const n = Math.max(1, Math.min(50, Number(limit) || 10));
    return Object.values(collection.data)
      .map((r) => repair(r, r.userID))
      .sort((a, b) => b.balance - a.balance || b.totalEarned - a.totalEarned)
      .slice(0, n);
  }

  return {
    SHOP_ITEMS,
    get,
    balance,
    add,
    remove,
    has,
    fmt,
    symbol,
    cooldowns,
    cooldownState,
    claimDaily,
    work,
    crime,
    transfer,
    shop,
    findItem,
    inventory,
    inventoryValue,
    badges,
    buy,
    sell,
    top,
    defaults,
    store: collection
  };
}

module.exports = { createEconomy, SHOP_ITEMS };

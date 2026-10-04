'use strict';
/*
 * 🧬 MeR~NeL — systems/xbet.js
 * Moteur des paris Xbet — équipes de foot RÉELLES, cotes généreuses sans excès.
 * La carte est TRIÉE (grosses affiches en tête) et ne montre JAMAIS les puissances.
 * - Une manche = 10 affrontements (équipes réelles, jamais les mêmes duos 2×).
 * - Pari : `xbet <n°> <a|b> <v|n|d> <mise>` — 1 pari par match, 1er arrivé 1er servi.
 * - Résolution 30 s après le pari ; cotes basées sur la puissance des équipes.
 * - Les 10 matchs épuisés → prochaine commande Xbet = NOUVELLE manche.
 */

const fmt = require('../utils/formatter');

const BET_DELAY_MS = 30 * 1000;
const MIN_MISE = 100;
const MATCHES_PER_ROUND = 10;

/* Équipes réelles + puissance /100 (réalisme : le favori gagne presque toujours). */
const TEAMS = [
  ['Real Madrid', 95], ['Manchester City', 94], ['Bayern Munich', 93], ['Liverpool', 92],
  ['PSG', 91], ['Inter Milan', 90], ['Arsenal', 90], ['Barcelone', 89],
  ['Atletico Madrid', 87], ['Borussia Dortmund', 85], ['Naples', 84], ['AC Milan', 83],
  ['Chelsea', 83], ['Manchester United', 82], ['Tottenham', 81], ['Juventus', 81],
  ['Newcastle', 80], ['Aston Villa', 79], ['AS Roma', 79], ['Atalanta', 78],
  ['Seville', 77], ['Ajax', 76], ['Benfica', 76], ['FC Porto', 75],
  ['Sporting CP', 75], ['Lille', 74], ['Monaco', 74], ['Marseille', 73],
  ['Lyon', 72], ['Mazembe', 72], ['Al Ahly', 71], ['Espérance de Tunis', 70],
  ['Raja Casablanca', 69], ['Mamelodi Sundowns', 69], ['Wydad AC', 68], ['Zamalek', 68],
  ['Villarreal', 73], ['Real Sociedad', 72], ['Real Betis', 71], ['Valence', 70],
  ['Fiorentina', 72], ['Lazio', 73], ['Bologne', 71], ['Torino', 68],
  ['West Ham', 72], ['Brighton', 73], ['Crystal Palace', 70], ['Everton', 66],
  ['Fulham', 68], ['Brentford', 68], ['Wolves', 66], ['Nottingham Forest', 67],
  ['Stuttgart', 74], ['RB Leipzig', 80], ['Leverkusen', 84], ['Francfort', 72],
  ['Wolfsburg', 68], ['Fribourg', 70], ['Hoffenheim', 66], ['Mayence', 66],
  ['AS Vita Club', 64], ['Diables Rouges U23', 63], ['V Club', 64],
];

/* Cotes (multiplicateurs) — un peu plus généreuses, sans excès :
 * victoire ×1.25–4.5 · nul ×3.8 · défaite ×1.5–5. */
function oddsFor(a, b) {
  const oA = Math.min(4.5, Math.max(1.25, 118 / a[1]));
  const oB = Math.min(4.5, Math.max(1.25, 118 / b[1]));
  return {
    vA: Math.round(oA * 100) / 100, // pari a v
    vB: Math.round(oB * 100) / 100, // pari b v
    nul: 3.8,
    dA: Math.round(Math.min(5.0, Math.max(1.5, 135 / (135 - a[1]))) * 100) / 100,
    dB: Math.round(Math.min(5.0, Math.max(1.5, 135 / (135 - b[1]))) * 100) / 100,
  };
}

/* Simule le résultat réaliste d'un affrontement : favori ≈65–85 %. */
function simulate(a, b, rng) {
  const r = rng || Math.random;
  const diff = a[1] - b[1];
  let pA = 0.5 + diff / 220; // +10 puissance ≈ +4,5 %
  pA = Math.min(0.86, Math.max(0.07, pA));
  const pNul = Math.min(0.30, 0.17 + Math.abs(diff) / 500);
  const pB = 1 - pA - pNul;
  const x = r();
  if (x < pA) return 'A';
  if (x < pA + pNul) return 'NUL';
  return 'B';
}

class BetEngine {
  constructor(bot) {
    this.bot = bot;
    this.timers = new Map(); // `${groupID}:${matchIdx}` → timeout
  }

  _st(groupID) {
    return this.bot.db.betState(groupID);
  }

  /* Construit 10 nouveaux affrontements (duos jamais rejoués). */
  newRound(groupID) {
    const st = this._st(groupID);
    const used = new Set((st.pairs || []).map(([x, y]) => [x, y].sort().join('|')));
    const pool = [...TEAMS];
    const card = [];
    let guard = 400;
    while (card.length < MATCHES_PER_ROUND && pool.length >= 2 && guard-- > 0) {
      const i = Math.floor(Math.random() * pool.length);
      const j = Math.floor(Math.random() * pool.length);
      if (i === j) continue;
      const A = pool[i];
      const B = pool[j];
      const key = [A[0], B[0]].sort().join('|');
      if (used.has(key)) continue;
      used.add(key);
      st.pairs.push([A[0], B[0]]);
      card.push({ a: A, b: B, odds: oddsFor(A, B), taken: false });
      pool.splice(Math.max(i, j), 1);
      pool.splice(Math.min(i, j), 1);
    }
    /* Classement PROPRE : les plus grosses affiches en tête de carte. */
    card.sort((x, y) => y.a[1] + y.b[1] - (x.a[1] + x.b[1]));
    st.card = card;
    st.bets = {};
    this.bot.db.bets.save();
    return card;
  }

  /* Carte courante — la régénère si absente / épuisée. */
  getCard(groupID) {
    const st = this._st(groupID);
    if (!Array.isArray(st.card) || st.card.length === 0) return this.newRound(groupID);
    return st.card;
  }

  /* Pose un pari. Retourne { ok, message, bet, odds } */
  placeBet(groupID, senderID, matchNo, side, outcome, mise) {
    const st = this._st(groupID);
    const card = this.getCard(groupID);
    const idx = Number(matchNo) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= card.length) {
      return { ok: false, error: 'numero', message: `⚠️ Numéro de match invalide — choisis entre 1 et ${card.length}.` };
    }
    const match = card[idx];
    if (match.taken || st.bets[idx]) {
      return { ok: false, error: 'pris', message: '🚫 Ce match a déjà un pari — premier arrivé, premier servi !' };
    }
    if (!['a', 'b'].includes(side)) {
      return { ok: false, error: 'equipe', message: '⚠️ Équipe : écris a ou b (a = 1re équipe, b = 2e équipe).' };
    }
    if (!['v', 'n', 'd'].includes(outcome)) {
      return { ok: false, error: 'issue', message: '⚠️ Issue : v (victoire), n (match nul) ou d (défaite).' };
    }
    if (!Number.isInteger(mise) || mise < MIN_MISE) {
      return { ok: false, error: 'mise', message: `⚠️ Mise minimum : ${MIN_MISE} XCoins.` };
    }
    const team = side === 'a' ? match.a : match.b;
    const odds = side === 'a' ? (outcome === 'v' ? match.odds.vA : outcome === 'n' ? match.odds.nul : match.odds.dA)
                              : (outcome === 'v' ? match.odds.vB : outcome === 'n' ? match.odds.nul : match.odds.dB);

    match.taken = true;
    st.bets[idx] = {
      senderID: String(senderID),
      side,
      outcome,
      mise,
      odds,
      team: team[0],
      matchLabel: `${match.a[0]} vs ${match.b[0]}`,
      placedAt: Date.now(),
      resolvesAt: Date.now() + BET_DELAY_MS,
    };
    this.bot.db.bets.save();
    this._schedule(groupID, idx);
    return { ok: true, bet: st.bets[idx], odds };
  }

  /* Résolution : 30 s après le pari (timeout + rattrapage au redémarrage). */
  _schedule(groupID, idx) {
    const key = `${groupID}:${idx}`;
    if (this.timers.has(key)) clearTimeout(this.timers.get(key));
    const t = setTimeout(async () => {
      this.timers.delete(key);
      await this.resolve(groupID, idx);
    }, BET_DELAY_MS);
    t.unref && t.unref();
    this.timers.set(key, t);
  }

  /* Rattrape les paris expirés pendant une coupure. Retourne les messages. */
  async sweep(groupID) {
    const st = this._st(groupID);
    const now = Date.now();
    const messages = [];
    for (const [idx, bet] of Object.entries(st.bets || {})) {
      if (bet && bet.resolvesAt && bet.resolvesAt <= now) {
        const msg = await this.resolve(groupID, Number(idx));
        if (msg) messages.push(msg);
      }
    }
    return messages;
  }

  /* Joue un match : tirage pondéré + gain/perte XCoins. Retourne le message. */
  async resolve(groupID, idx) {
    const st = this._st(groupID);
    const bet = (st.bets || {})[idx];
    if (!bet || bet.resolved) return null;
    const card = st.card || [];
    const match = card[idx];
    if (!match) return null;

    const winner = simulate(match.a, match.b);
    bet.resolved = true;
    bet.result = winner;

    let win;
    if (winner === 'NUL') win = bet.outcome === 'n';
    else if (winner === 'A') win = bet.side === 'a' ? bet.outcome === 'v' : bet.outcome === 'd';
    else win = bet.side === 'b' ? bet.outcome === 'v' : bet.outcome === 'd';

    let delta;
    if (win) delta = Math.round(bet.mise * bet.odds);
    else delta = 0; // la mise était déjà débitée au placement

    const user = this.bot.db.ensureUser(bet.senderID);
    /* stats : bumpStat (vraie BDD) sinon stats.add (stubs de test). */
    const bump = (k, v) =>
      typeof this.bot.db.bumpStat === 'function' ? this.bot.db.bumpStat(k, v) : this.bot.db.stats.add(k, v);
    if (win) {
      user.xcoins += delta;
      bump('betsWon', 1);
    } else {
      bump('betsLost', 1);
    }
    this.bot.db.users.save();

    const winLabel = winner === 'A' ? match.a[0] : winner === 'B' ? match.b[0] : 'MATCH NUL';
    const res = win
      ? `🎉 ${fmt.bold('GAGNÉ')} : +${delta.toLocaleString('fr-FR')} XCoins (mise ${bet.mise.toLocaleString('fr-FR')} × ${bet.odds})`
      : `💀 ${fmt.bold('PERDU')} : −${bet.mise.toLocaleString('fr-FR')} XCoins`;
    const lines = [
      `⚽ ${fmt.bold(bet.matchLabel)}`,
      `🏁 ${fmt.bold('Résultat')} : ${fmt.bold(winLabel)}`,
      `🎯 ${fmt.bold('Ton pari')} : ${bet.team} — ${bet.outcome.toUpperCase()} (×${bet.odds})`,
      '',
      res,
      `💰 ${fmt.bold('Nouveau solde')} : ${fmt.bold(user.xcoins.toLocaleString('fr-FR') + ' XCoins')}`,
    ];
    // Match réglé → il disparaît de la carte ; carte vide = nouvelle manche au prochain Xbet.
    delete st.bets[idx];
    card.splice(idx, 1);
    this.bot.db.bets.save();
    const payload = { body: fmt.frame('⚽ XBET — RÉSULTAT', lines) };
    /* Le résultat part TOUT SEUL dans la conversation, 30 s après le pari. */
    if (typeof this.bot.send === 'function') {
      try {
        await this.bot.send(payload, String(groupID));
      } catch (_) {
        /* jamais de crash d'envoi */
      }
    }
    return payload;
  }

  /* Nettoyage des timers (arrêt du bot). */
  shutdown() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}

module.exports = { BetEngine, TEAMS, BET_DELAY_MS, MIN_MISE, MATCHES_PER_ROUND, simulate, oddsFor };

'use strict';
/*
 * 🧬 MeR~NeL — systems/ucCards.js
 * 🃏 Les 20 CARTES SPÉCIALES d'Undercover — achetées en XCoins (500 →
 * 1 000 000), utilisables EN PARTIE (1 carte / joueur / tour).
 * effet : ce que fait la carte · phase : quand on peut la jouer.
 */

const CARDS = [
  { id: 1, emoji: '⏱️', name: 'Souffle frais', price: 500,
    desc: '+10 s sur ton prochain indice', phase: 'tour' },
  { id: 2, emoji: '🏷️', name: 'Indice de catégorie', price: 900,
    desc: 'PV : la catégorie du mot des civils (animal, nourriture…)', phase: 'tour' },
  { id: 3, emoji: '🛡️', name: 'Bouclier', price: 1500,
    desc: 'Le 1er vote contre toi ce tour est annulé', phase: 'tour' },
  { id: 4, emoji: '🗳️', name: 'Double vote', price: 2500,
    desc: 'Ton vote compte double au prochain vote', phase: 'vote' },
  { id: 5, emoji: '🔤', name: 'Première lettre', price: 4000,
    desc: 'PV : la 1re lettre du mot des civils', phase: 'tour' },
  { id: 6, emoji: '🚫', name: 'Vote gelé', price: 6000,
    desc: 'Un joueur ciblé ne peut pas voter ce tour', phase: 'tour' },
  { id: 7, emoji: '🎭', name: 'Masque', price: 9000,
    desc: 'Si tu es éliminé, ton rôle n\u2019est pas révélé (1 fois)', phase: 'tour' },
  { id: 8, emoji: '🕯️', name: 'Sonde loyale', price: 14000,
    desc: 'PV : le joueur ciblé est ALLIÉ ou ENNEMI (de ton camp)', phase: 'tour' },
  { id: 9, emoji: '🔁', name: 'Permutation', price: 20000,
    desc: 'Échange ton total de votes avec un joueur ciblé', phase: 'vote' },
  { id: 10, emoji: '🔒', name: 'Bâillon', price: 30000,
    desc: 'Un joueur ciblé ne donne PAS d\u2019indice au prochain tour', phase: 'tour' },
  { id: 11, emoji: '📢', name: 'Cri du peuple', price: 45000,
    desc: 'Réouvre le vote 20 s — tout le monde peut changer de vote', phase: 'vote' },
  { id: 12, emoji: '🔮', name: 'Deux lettres', price: 65000,
    desc: 'PV : 2 lettres du mot des civils', phase: 'tour' },
  { id: 13, emoji: '⚰️', name: 'Second souffle', price: 90000,
    desc: 'Survis à ta 1re élimination — rôle non révélé', phase: 'tour' },
  { id: 14, emoji: '🕵️', name: 'Contre-enquête', price: 130000,
    desc: 'PV : le nombre EXACT d\u2019infiltrés encore vivants', phase: 'tour' },
  { id: 15, emoji: '🎁', name: 'Immunité royale', price: 200000,
    desc: 'Intouchable pendant 2 tours de vote', phase: 'tour' },
  { id: 16, emoji: '🧠', name: 'Lecture d\u2019esprit', price: 300000,
    desc: 'PV : le rôle précis d\u2019un joueur ciblé', phase: 'tour' },
  { id: 17, emoji: '🃏', name: 'Identité volée', price: 450000,
    desc: 'Échange ton rôle secret avec un joueur ciblé (en PV)', phase: 'tour' },
  { id: 18, emoji: '☠️', name: 'Dénonciation', price: 650000,
    desc: 'Le bot révèle UN infiltré vivant au hasard (éliminé direct)', phase: 'tour' },
  { id: 19, emoji: '⚡', name: 'Élimination directe', price: 850000,
    desc: 'Élimine immédiatement un joueur, SANS vote', phase: 'tour' },
  { id: 20, emoji: '👑', name: 'Œil de MeR~NeL', price: 1000000,
    desc: 'PV : la liste complète des rôles de tous les vivants', phase: 'tour' },
];

function cardById(id) {
  return CARDS.find((c) => c.id === Number(id)) || null;
}

/* Ligne du shop : « 1. ⏱️ Souffle frais — 500 XCoins · +10 s… » */
function shopLine(c) {
  const price = c.price.toLocaleString('fr-FR');
  return `${c.id}. ${c.emoji} ${c.name} — ${price} XCoins`;
}

module.exports = { CARDS, cardById, shopLine };

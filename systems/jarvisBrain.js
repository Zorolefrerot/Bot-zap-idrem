'use strict';
/*
 * 🧬 MeR~NeL — systems/jarvisBrain.js
 * LE CERVEAU JARVIS 100 % LOCAL — ZÉRO API EXTERNE.
 * Compréhension du français, réflexion, décision, mémoire par personne :
 * TOUT est codé ici, à la main. Quand le mode JARVIS est ON, le bot
 * n'appelle AUCUN service d'IA : ce fichier EST l'intelligence.
 *
 * think() reçoit un message naturel et renvoie :
 *   { text }                          → réponse conversationnelle
 *   { text, command, args }           → réponse + commande à exécuter
 */

const MAX_LOG = 8; // échanges retenus par personne

/* ── Normalisation : minuscules, sans accents, ponctuation légère ── */
function norm(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2019`]/g, "'")
    .replace(/([a-z])-(?=[a-z])/g, '$1 ')
    .replace(/[^a-z0-9@+\-*/:,?' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Présence d'un mot (frontières respectées — « ban » ≠ « xban »). */
function has(t, words) {
  return words.some((w) => new RegExp('(^|[^a-z0-9])' + w + '([^a-z0-9]|$)').test(t));
}

const NUM_WORDS = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7,
  huit: 8, neuf: 9, dix: 10, quinze: 15, vingt: 20, trente: 30, cinquante: 50, cent: 100,
};

function numbersIn(t) {
  const out = [];
  for (const m of String(t).matchAll(/\d+/g)) out.push(Number(m[0]));
  for (const w of String(t).split(' ')) {
    if (NUM_WORDS[w] !== undefined && !out.includes(NUM_WORDS[w])) out.push(NUM_WORDS[w]);
  }
  return out;
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/* Mots refusés comme prénom (« je suis fatigué » → on enregistre rien). */
const NOT_NAMES = new Set([
  'la', 'le', 'un', 'une', 'des', 'pas', 'plus', 'tres', 'bien', 'mal', 'ici',
  'fatigue', 'content', 'triste', 'colere', 'malade', 'mort', 'vivant', 'pret',
  'desole', 'fan', 'roi', 'reine', 'dieu', 'chef', 'garcon', 'fille', 'homme',
  'femme', 'enfant', 'vieux', 'jeune', 'occupe', 'presse', 'certain', 'appelle',
]);

const JOKES = [
  'Pourquoi les plongeurs plongent-ils toujours en arrière ? Parce que sinon ils tombent dans le bateau. 😄',
  "Que dit un escargot quand il croise une limace ? « Regarde, un nudiste ! » 🐌",
  "Pourquoi les poissons détestent l'ordinateur ? À cause de la souris. 🐭",
  "Quel est le comble pour un électricien ? De ne pas être au courant. ⚡",
  'Que fait une fraise sur un cheval ? Tagada, tagada. 🍓',
  "Pourquoi Napoléon n'a jamais déménagé ? Parce qu'il avait un Bonaparte. 🏠",
  'Quel est le sport préféré des insectes ? Le cricket. 🦗',
  "Pourquoi les maths sont tristes ? Parce qu'elles ont trop de problèmes. ➗",
  'Que dit un informaticien quand il se noie ? F1 ! F1 ! F1 ! 💻',
  "Quel est le comble pour un jardinier ? De raconter des salades. 🥬",
  "Quel est le sport le plus calme ? Le sport-car… parce qu'il est car-actère tranquille. 🚗 (Bon, j'apprends encore.)",
  "Comment appelle-t-on un chat tombé dans un pot de peinture ? Un chat-peint. 🎨",
];

const fmtInt = (n) => Number(n).toLocaleString('fr-FR');

/* Mini-calculatrice sûre : UN calcul, chiffres + opérateurs, rien d'autre. */
function calc(t) {
  const fixed = String(t).replace(/(\d)\s*x\s*(\d)/g, '$1 * $2');
  const m = fixed.match(/(-?\d+(?:[.,]\d+)?)\s*([+\-*/:])\s*(-?\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const a = Number(String(m[1]).replace(',', '.'));
  const b = Number(String(m[3]).replace(',', '.'));
  const op = m[2];
  let r;
  if (op === '+') r = a + b;
  else if (op === '-') r = a - b;
  else if (op === '*') r = a * b;
  else if (op === '/' || op === ':') {
    if (b === 0) return 'ZERO';
    r = a / b;
  }
  if (r === undefined || !Number.isFinite(r)) return null;
  r = Math.round(r * 10000) / 10000;
  const sym = op === '*' ? '×' : op;
  return `${fmtInt(a)} ${sym} ${fmtInt(b)} = ${fmtInt(r)}`;
}

/* Commandes que le cerveau peut déclencher (jamais d'administration). */
const KNOWN_COMMANDS = new Set([
  'xquiz', 'xid', 'xfoot', 'xduel', 'xbet', 'xslots', 'xpile', 'xcourse', 'xrps',
  'xmenu', 'xanime', 'xpolice', 'xlove', 'xprofil', 'xdaily', 'xcoins', 'xp',
  'xrank', 'xask', 'xai', 'xgame', 'xupt', 'xinfo',
]);

function createJarvisBrain(config, hooks = {}) {
  const botName = String((config && config.botName) || 'MeR~NeL');

  /** Map<`${threadID}:${uid}`, { log: [{q,a}] }> — mémoire vive de session. */
  const memory = new Map();

  const firstName = (uid) => String((hooks.getName && hooks.getName(uid)) || '').trim();
  const learnName = (uid, n) => { if (hooks.setName) hooks.setName(uid, n); };
  const dropName = (uid) => { if (hooks.forget) hooks.forget(uid); };

  /**
   * RÉFLEXION : analyse le message et décide.
   * @returns {{ text: string, command?: string, args?: string }}
   */
  function think(ev) {
    const threadID = ev.threadID;
    const senderID = ev.senderID;
    const raw = String(ev.text || '').trim();
    let t = norm(raw);
    const key = `${threadID}:${senderID}`;
    const mem = memory.get(key) || { log: [] };
    memory.set(key, mem);
    const who = firstName(senderID) || String(ev.senderName || '').split(/\s+/)[0] || '';

    const say = (text, extra) => {
      mem.log.push({ q: raw.slice(0, 140), a: String(text).slice(0, 140) });
      while (mem.log.length > MAX_LOG) mem.log.shift();
      return Object.assign({ text }, extra || {});
    };

    /* « mernel … » / « jarvis … » → on retire l'invocation. */
    t = t.replace(/^(mernel|mer~nel|jarvis)[ ,!?.:]* ?/, '');

    /* 1) Il apprend les prénoms — pour de vrai, en base. */
    let m = t.match(/(?:je m'?appelle|moi c'est|mon (?:nom|prenom) (?:est|c'est|c)|on m'appelle)\s+([a-z0-9]{2,15})/);
    if (m && !NOT_NAMES.has(m[1])) {
      learnName(senderID, cap(m[1]));
      return say(`Enchanté ${cap(m[1])} ! 🤝 C'est gravé — je n'oublie jamais un nom.`);
    }

    /* 2) Mémoire : qui suis-je ? */
    if (/(qui suis je|tu sais qui je suis|tu te souviens de moi|tu te rappelles de moi|c'est quoi mon (nom|prenom))/.test(t)) {
      const n = firstName(senderID);
      return say(n ? `Tu es ${n} ! 😎 Je retiens tout, moi.` : "Dis-moi ton prénom (« je m'appelle … ») et je le retiendrai pour toujours !");
    }
    if (/(oublie (moi|tout|mon nom|mon prenom)|efface ma memoire)/.test(t)) {
      dropName(senderID);
      return say('C\u2019est oublié… 🧹 Comme si on venait de nous présenter.');
    }

    /* 3) Identité — Mernel, fils de Merdi, conçu par Merdi et Nelson. */
    if (/(qui es tu|tu es qui|t es qui|t'es qui|c'est qui toi|presente toi|parle moi de toi|qui t'a (cree|fait|concu)|ton createur|tes createurs|comment tu t'appelles|tu t'appelles comment|tu es quoi)/.test(t)) {
      return say(
        `Je suis ${botName} 🤖 — Mernel, fils de Merdi, entre la RDC et le Bénin. ` +
          "Merdi et Nelson, les grands informaticiens, m'ont conçu. " +
          'Je suis ton JARVIS personnel : parle-moi naturellement, je comprends, je réfléchis et j\u2019exécute. Essaie : « lance un quiz », « mon solde », « blague »…'
      );
    }

    /* 4) Calcul mental. */
    const c = calc(t);
    if (c === 'ZERO') return say('Diviser par zéro ? 😵 Même mon cerveau local refuse ce pari.');
    if (c && (/combien|calcule|calcul|font|resultat|egal/.test(t) || t.endsWith('?') || /^\d/.test(t))) {
      return say(`🧮 ${c}`);
    }

    /* 5) Heure / date (horloge du serveur). */
    if (/(quelle heure|l'heure|il est quelle heure|donne moi l'heure)/.test(t)) {
      const d = new Date();
      return say(`🕐 Il est ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} (heure du serveur).`);
    }
    if (/(quel jour|quelle date|la date du jour|on est quel jour|date d'aujourd)/.test(t)) {
      const d = new Date();
      return say(`📅 Nous sommes le ${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`);
    }

    /* 6) Humeur & salon. */
    const mood = /(ca va|tu vas bien|comment vas tu|comment tu vas|la forme|quoi de neuf|tout va bien|tu tournes bien)/.test(t);
    const greet = has(t, ['salut', 'bonjour', 'bonsoir', 'hello', 'coucou', 'yo', 'bjr', 'bsr', 'hey', 'hi', 'alo', 'allo', 'wesh', 'ola']);
    if (mood && greet) return say(`Salut ${who} ! 😄 Moi : 100 % opérationnel, cerveau local à pleine vitesse. Et toi ?`);
    if (mood) return say(`Ça va du tonnerre, ${who} ! ⚡ Et toi, raconte ?`);
    if (greet) return say(`Salut ${who} ! 👋 Je t'écoute : quiz, duel, solde, blague, anime… ou pose-moi une question sur moi.`);

    /* 7) Blagues. */
    if (has(t, ['blague', 'blagues']) || /fais moi rire|raconte (moi )?quelque chose/.test(t)) {
      return say(JOKES[Math.floor(Math.random() * JOKES.length)]);
    }

    /* 8) Compliments / critiques. */
    if (/(tu es|t es|t'es)\s+(le|la|un|une)?\s*(meilleur|meilleure|genial|geniale|fort|forte|intelligent|intelligente|boss|legende)/.test(t)) {
      return say(`Merci ${who} ! 🥹 C'est Merdi et Nelson qu'il faut remercier — mais je note le compliment.`);
    }
    if (has(t, ['bete', 'nul', 'nulle', 'inutile', 'stupide', 'idiot', 'minable', 'lourd'])) {
      return say('Aïe. 😤 Et pourtant je suis le plus rapide du groupe. Démonte-moi ça : « lance un quiz » !');
    }

    /* 9) Merci / au revoir. */
    if (has(t, ['merci', 'cimer', 'thx', 'mrc'])) return say(`Avec plaisir, ${who} ! 🤝`);
    if (has(t, ['bye', 'aurevoir', 'ciao', 'bonne nuit', 'bonne soiree', 'bonne journee', 'a plus'])) {
      return say(`À bientôt, ${who} ! 🖤 Je reste ici, en veille.`);
    }

    /* 10) Limites honnêtes (météo/actu : pas de web en cerveau local). */
    if (has(t, ['meteo', 'temperature']) || /quel temps/.test(t)) {
      return say('Météo : ma fenêtre donne sur un datacenter 🖥️ — le ciel m\u2019est invisible. Mais je peux lancer un quiz qui déchire !');
    }
    if (has(t, ['actualite', 'news', 'journaux', 'journal'])) {
      return say('Les actualités, il me faudrait le web pour ça 🛰️ — mais pour animer le groupe, je suis champion : quiz, duel, jeux…');
    }

    /* 11) Administration : REFUS catégorique (jamais d'exécution). */
    if (has(t, ['ban', 'bannir', 'banne', 'kick', 'expulse', 'averti', 'warn', 'exclu'])) {
      return say("Je ne touche JAMAIS aux commandes d'administration — règle n°1 de mes créateurs. 🔒 Les admins ont leurs propres commandes directes.");
    }

    /* 12) Duel (mentions conservées pour désigner l'adversaire). */
    if (has(t, ['duel'])) {
      return say(`⚔️ C'est parti, ${who} ! Choisis ton adversaire et ta mise.`, { command: 'xduel' });
    }

    /* 13) Paris sportifs. */
    if (has(t, ['pari', 'paris', 'parier']) && !/quiz|quizz/.test(t)) {
      return say('🏟️ Je t\u2019ouvre les paris sportifs — choisis ton match !', { command: 'xbet' });
    }

    /* 14) QUIZ : la spécialité maison. */
    const wantsQuiz = /quiz|quizz/.test(t) || (has(t, ['question', 'questions']) && has(t, ['lance', 'lancer', 'joue', 'jouer', 'commence', 'demarre', 'fais', 'fait', 'on joue', 'on fait']));
    if (wantsQuiz) {
      if (has(t, ['multivers'])) return say('🌌 MULTIVERS ! Je lance — et je te demande juste combien de questions.', { command: 'xquiz', args: 'multivers' });
      if (has(t, ['drapeau', 'pays'])) return say('🚩 DRAPEAU : à toi de nommer les pays ! Je demande le nombre de questions.', { command: 'xquiz', args: 'drapeau' });
      if (has(t, ['capitale', 'capitales'])) return say('🌍 CAPITALES ! Je lance — prépare-toi à nommer les villes.', { command: 'xquiz', args: 'capitale' });
      if (has(t, ['cg', 'culture'])) return say('🧠 CULTURE GÉNÉRALE ! Je lance — combien de questions, le bot va te demander.', { command: 'xquiz', args: 'cg' });
      if (has(t, ['id', 'indices'])) return say('🪪 QUIZ D\u2019INDICES ! Je lance — choisis le nombre ensuite.', { command: 'xquiz', args: 'id' });
      if (has(t, ['manga', 'mangas', 'anime', 'animes', 'personnage', 'personnages', 'image', 'images', 'photo', 'photos'])) {
        return say("🎌 QUIZ MANGA ! Révise tes personnages — je lance et je te demande le nombre d'images.", { command: 'xid' });
      }
      if (has(t, ['foot', 'football', 'joueur', 'joueurs', 'ballon'])) {
        return say("⚽ QUIZ FOOT ! Devine le joueur — je lance et je te demande le nombre d'images.", { command: 'xfoot' });
      }
      return say(`Choisis ta catégorie, ${who} : ID, MULTIVERS, CG, CAPITALE ou DRAPEAU — le menu arrive ! 🎮`, { command: 'xquiz' });
    }

    /* 15) Jeux d'arcade. */
    if (has(t, ['shifumi', 'chifumi', 'pfc']) || /pierre.{0,3}feuille/.test(t)) {
      return say('✊✋✌️ Pierre, feuille, ciseaux — choisis ton arme !', { command: 'xrps' });
    }
    if (/pile ou face|coin flip|\bflip\b/.test(t) || (has(t, ['pile']) && has(t, ['face']))) {
      const nums = numbersIn(t).filter((n) => n >= 50);
      const side = has(t, ['face']) && !has(t, ['pile']) ? 'face' : 'pile';
      return nums.length
        ? say(`🪙 PILE OU FACE — ${fmtInt(nums[0])} XCoins en vol !`, { command: 'xpile', args: `${side} ${nums[0]}` })
        : say('🪙 Pile ou face ! Ajoute une mise (min. 50) ou lance direct.', { command: 'xpile' });
    }
    if (has(t, ['slots', 'slot', 'jackpot', 'machine a sous', 'bandit manchot'])) {
      const nums = numbersIn(t).filter((n) => n >= 50);
      return nums.length
        ? say(`🎰 Machine à sous — ${fmtInt(nums[0])} XCoins dans la fente !`, { command: 'xslots', args: String(nums[0]) })
        : say('🎰 Machine à sous ! Indique ta mise : « slots 200 ».', { command: 'xslots' });
    }
    if (has(t, ['course', 'courses', 'f1', 'voiture', 'voitures', 'volee'])) {
      const nums = numbersIn(t);
      const n = nums.find((x) => x >= 1 && x <= 4);
      const mise = nums.find((x) => x >= 50);
      return n && mise
        ? say(`🏎️ VITESSE ! Voiture n°${n}, ${fmtInt(mise)} XCoins en jeu !`, { command: 'xcourse', args: `${n} ${mise}` })
        : say('🏎️ Course ! Choisis ton numéro (1-4) et ta mise : « course 2 100 ».', { command: 'xcourse' });
    }

    /* 16) Fiche anime. */
    if (has(t, ['anime', 'animes', 'animation'])) {
      const m2 = t.match(/(?:parle moi de|info s? sur|informations sur|c'est quoi|presente (?:moi )?)\s*(?:l'|le|la|les)? ?(?:anime|animes|animation)\s*(.*)$/) || t.match(/(?:anime|animation)\s*(?:sur|de|du|:)?\s*(.+)$/);
      let name = m2 ? String(m2[1] || '').trim() : '';
      name = name.replace(/^(est ce que|c'est quoi|c quoi|stp|s'il te plait|de|du|sur|le|la|les|l')\s+/, '').trim();
      name = name.split(' ').slice(0, 5).join(' ').replace(/[?.!]+$/, '');
      if (name && name.length >= 2) {
        return say(`📺 ${cap(name)} — je fouille ma mémoire manga !`, { command: 'xanime', args: name });
      }
      return say('📺 Quel anime t\u2019intéresse ? « anime naruto » par exemple.', { command: 'xanime' });
    }

    /* 17) Vie du bot : économie, profil, stats. */
    if (has(t, ['amour', 'couple', 'marier', 'mariage', 'ship'])) return say('💘 Amour parfait ? Voyons voir ça…', { command: 'xlove' });
    if (has(t, ['profil', 'ma photo', 'ma carte', 'ma fiche', 'ma bio'])) return say(`🪪 Ta carte de profil, ${who}, fraîchement imprimée !`, { command: 'xprofil' });
    if (has(t, ['solde', 'coins', 'coin', 'xcoins', 'argent', 'pieces', 'fortune', 'richesse'])) return say(`💰 Voyons ton portefeuille, ${who}…`, { command: 'xcoins' });
    if (has(t, ['daily', 'bonus', 'journalier', 'recompense', 'cadeau'])) return say('🎁 Bonus journalier — vais-je te rendre riche aujourd\u2019hui ?', { command: 'xdaily' });
    if (/\bxp\b|mon niveau|points d'experience|mon experience/.test(t)) return say('📈 Vérifions ton XP et ton niveau…', { command: 'xp' });
    if (/mon rang|le classement|classement des|top \d/.test(t)) return say("🏆 Le tableau d'honneur, tout de suite !", { command: 'xrank' });
    if (has(t, ['menu', 'commandes', 'aide', 'help', 'capacites', 'fonctionnalites']) || /tu sais faire quoi|que sais tu faire|que peux tu faire|tu peux faire quoi/.test(t)) {
      return say(`Voici TOUT ce que je sais faire, ${who} 👇 Et souviens-toi : pas besoin de taper les commandes — demande-moi !`, { command: 'xmenu' });
    }
    if (has(t, ['uptime', 'sante', 'status']) || /ca tourne|tu tournes|en ligne depuis/.test(t)) return say('🩺 Diagnostic du système…', { command: 'xupt' });
    if (/qui est mernel|info (du|sur le) bot|informations du bot|fiche d'identite/.test(t)) return say("🪪 Ma fiche d'identité officielle !", { command: 'xinfo' });
    if (has(t, ['police', 'polices']) || /ecris .+ (en|avec) (gras|style)/.test(t)) {
      const m3 = t.match(/(?:ecris|ecrire|transforme)\s+(.+?)\s+(?:en|avec)\s+(?:gras|style|police)/);
      return m3 ? say('🖋️ Style activé !', { command: 'xpolice', args: m3[1] }) : say('🖋️ Donne-moi le texte et le style : « écris bonjour en gras ».', { command: 'xpolice' });
    }
    if (has(t, ['jeux', 'xgame', 'mini jeux']) || /^jouer$/.test(t)) return say("🎮 La salle d'arcade est ouverte !", { command: 'xgame' });

    /* 18) Une vraie commande tapée en toutes lettres. */
    const bare = t.match(/^x ?([a-z]+)(?: (.*))?$/);
    if (bare) {
      const wanted = 'x' + bare[1];
      if (KNOWN_COMMANDS.has(wanted)) {
        return say('🤖 Tout de suite !', { command: wanted, args: (bare[2] || '').trim() });
      }
    }

    /* 19) Sinon : réponses honnêtes + suggestions. */
    const hints = [
      `Je n'ai pas tout saisi, ${who} 😅. Dis par exemple : « lance un quiz multivers », « mon solde », « blague », « anime naruto », « qui es-tu »…`,
      `Hmm, un mot-clé m'aiderait, ${who} 🤔. Essaie : quiz, duel, solde, daily, profil, slots, shifumi, blague, heure…`,
      `Je préfère être honnête plutôt que d'inventer, ${who} 🧠. Je sais lancer des quiz et des jeux, donner ton solde, ton profil, ton XP, des blagues, l'heure… demande !`,
    ];
    return say(hints[Math.floor(Math.random() * hints.length)]);
  }

  return { think };
}

module.exports = { createJarvisBrain, norm, calc };

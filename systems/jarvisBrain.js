'use strict';
/*
 * 🧬 MeR~NeL — systems/jarvisBrain.js  (v2 — cerveau conscient du contexte)
 * LE CERVEAU JARVIS 100 % LOCAL — ZÉRO API EXTERNE.
 *
 * Il comprend le français (normalisation accents/trait d'union/invocations),
 * il est CONSCIENT de ce qui se passe dans le groupe (quiz en cours, question
 * posée, scores) : « met fin », « qui gagne ? », « on en est où ? » fonctionnent.
 * Il fait les MATHÉMATIQUES (calcul, racine, puissance, pourcentage, moyenne)
 * et les PROBABILITÉS (dés, pièce, cartes). Il pilote les modules « web »
 * (recherche anime, images, musique, vidéo) via les capacités du bot.
 * Il retient les prénoms (en base) et les 8 derniers échanges par personne.
 *
 * think() renvoie :
 *   { text }                                   → réponse conversationnelle
 *   { text, command, args }                    → réponse + commande à exécuter
 *   { text, session: 'cancel' }                → arrêter la session en cours
 */

const MAX_LOG = 8; // échanges retenus par personne
const { isCancelIntent, wordToNumbers } = require('./natural');

/* ── Normalisation : minuscules, sans accents, trait d'union = espace ── */
function norm(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2019`]/g, "'")
    .replace(/([a-z])-(?=[a-z])/g, '$1 ')
    .replace(/[^a-z0-9@+\-*/:,?' %^]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Présence d'un mot (frontières respectées — « ban » ≠ « xban »). */
function has(t, words) {
  return words.some((w) => new RegExp('(^|[^a-z0-9])' + w + '([^a-z0-9]|$)').test(` ${t} `));
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

const fmtInt = (n) => Number(n).toLocaleString('fr-FR');
const fmtNum = (n) => {
  const r = Math.round(n * 10000) / 10000;
  return Number.isInteger(r) ? fmtInt(r) : String(r).replace('.', ',');
};

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
  "Comment appelle-t-on un chat tombé dans un pot de peinture ? Un chat-peint. 🎨",
  "Quel est le sport le plus calme ? Le sport-car… parce qu'il est car-actère tranquille. 🚗",
];

/* Commandes que le cerveau peut déclencher (jamais d'administration). */
const KNOWN_COMMANDS = new Set([
  'xquiz', 'xid', 'xfoot', 'xduel', 'xbet', 'xslots', 'xpile', 'xcourse', 'xrps',
  'xmenu', 'xanime', 'xpolice', 'xlove', 'xprofil', 'xdaily', 'xcoins', 'xp',
  'xrank', 'xask', 'xai', 'xgame', 'xupt', 'xinfo', 'ximg', 'xplay', 'xvideo',
]);

/* ══════════════ MATHÉMATIQUES & PROBABILITÉS (100 % local) ══════════════ */

function safeCalc(t) {
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
  const sym = op === '*' ? '×' : op;
  return `${fmtNum(a)} ${sym} ${fmtNum(b)} = ${fmtNum(r)}`;
}

/* Renvoie une phrase (ou null) pour racine, puissance, %, moyenne, proba. */
function mathAnswer(t) {
  let m = t.match(/racine\s*(?:carree\s*)?(?:de\s*|du\s*)?(\d+(?:[.,]\d+)?)/);
  if (m) {
    const v = Math.sqrt(Number(String(m[1]).replace(',', '.')));
    return `√${fmtNum(Number(String(m[1]).replace(',', '.')))} = ${fmtNum(v)}`;
  }
  m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:\^|\*\*|puissance)\s*(\d+)/);
  if (m) {
    const a = Number(String(m[1]).replace(',', '.'));
    const b = Math.min(Number(m[2]), 40);
    return `${fmtNum(a)}^${b} = ${fmtNum(Math.pow(a, b))}`;
  }
  m = t.match(/(\d+(?:[.,]\d+)?)\s*%(?:\s*(?:de|sur|du)\s*(\d+(?:[.,]\d+)?))?/);
  if (m && m[2] !== undefined) {
    const a = Number(String(m[1]).replace(',', '.'));
    const b = Number(String(m[2]).replace(',', '.'));
    return `${fmtNum(a)} % de ${fmtNum(b)} = ${fmtNum((a / 100) * b)}`;
  }
  m = t.match(/(\d+(?:[.,]\d+)?)\s*pour ?cents?(?:\s*(?:de|sur|du)\s*(\d+(?:[.,]\d+)?))?/);
  if (m && m[2] !== undefined) {
    const a = Number(String(m[1]).replace(',', '.'));
    const b = Number(String(m[2]).replace(',', '.'));
    return `${fmtNum(a)} % de ${fmtNum(b)} = ${fmtNum((a / 100) * b)}`;
  }
  m = t.match(/moyenne\s*(?:de|des)?\s*((?:\d+(?:[.,]\d+)?\s*){2,})/);
  if (m) {
    const nums = String(m[1]).trim().split(/[\s,]+/).map((x) => Number(x.replace(',', '.'))).filter((x) => Number.isFinite(x));
    if (nums.length >= 2) {
      const avg = nums.reduce((s, x) => s + x, 0) / nums.length;
      return `Moyenne de [${nums.map(fmtNum).join(', ')}] = ${fmtNum(avg)}`;
    }
  }
  /* ── PROBABILITÉS ── */
  if (/probabilite|probabilites|chance d|chance de|quelle chance/.test(t)) {
    if (has(t, ['piece', 'pile', 'face'])) return 'Pièce 🪙 : 1 chance sur 2 — soit **50 %** (pile ou face).';
    if (/deux des|2 des/.test(t)) {
      return 'Deux dés 🎲🎲 : 36 combinaisons possibles. Le **7** est le total le plus probable (6/36 = **16,7 %**), le 2 et le 12 les plus rares (1/36 = 2,8 %).';
    }
    const faces = t.match(/des?\s*(?:a|de)?\s*(\d+)\s*faces?/);
    const diceCtx = faces || /(?:faire|obtenir|tirer|avoir|sortir)\s+(?:un |le |la )?\d+/.test(t) || /\bde6\b|de a 6 faces/.test(t);
    if (diceCtx) {
      const n = faces ? Number(faces[1]) : 6;
      if (n >= 2 && n <= 1000) {
        const m2 = t.match(/(?:faire|obtenir|tirer|avoir|sortir)\s*(?:un |le |la )?(\d+)/);
        const target = m2 ? Number(m2[1]) : null;
        if (target && target >= 1 && target <= n) {
          return `Dé à ${n} faces 🎲 : 1 chance sur ${n} de faire ${target} — soit **${fmtNum(Math.round((100 / n) * 100) / 100)} %**.`;
        }
        return `Dé à ${n} faces 🎲 : chaque face a 1 chance sur ${n} — soit **${fmtNum(Math.round((100 / n) * 100) / 100)} %**.`;
      }
    }
    if (has(t, ['as', 'carte', 'cartes', 'coeur', 'pique', 'carreau', 'trefle', 'roi', 'dame', 'valet'])) {
      if (has(t, ['coeur', 'pique', 'carreau', 'trefle', 'rouge', 'noire', 'noir'])) {
        return 'Cartes 🃏 : 13 cartes sur 52 pour une couleur — soit **25 %** (1 chance sur 4).';
      }
      if (has(t, ['as', 'roi', 'dame', 'valet'])) return 'Cartes 🃏 : 4 exemplaires sur 52 — soit **7,7 %** (1 chance sur 13).';
      return 'Jeu de 52 cartes 🃏 : chaque carte a 1 chance sur 52 (**1,9 %**).';
    }
    return 'Donne-moi le contexte : dé 🎲 (combien de faces ?), pièce 🪙 ou cartes 🃏 — et je te calcule la probabilité exacte !';
  }
  return null;
}

/* ══════════════════════════ LE CERVEAU ══════════════════════════ */

function createJarvisBrain(config, hooks = {}) {
  const botName = String((config && config.botName) || 'MeR~NeL');

  /** Map<`${threadID}:${uid}`, { log: [{q,a}], last: {command,args} }> */
  const memory = new Map();

  const firstName = (uid) => String((hooks.getName && hooks.getName(uid)) || '').trim();
  const learnName = (uid, n) => { if (hooks.setName) hooks.setName(uid, n); };
  const dropName = (uid) => { if (hooks.forget) hooks.forget(uid); };
  const sessionInfo = (tid) => (hooks.getSessionInfo ? hooks.getSessionInfo(tid) : null);

  /**
   * RÉFLEXION : analyse le message (et le contexte du groupe) puis décide.
   * @returns {{ text: string, command?: string, args?: string, session?: string }}
   */
  function think(ev) {
    const threadID = ev.threadID;
    const senderID = ev.senderID;
    const raw = String(ev.text || '').trim();
    let t = norm(raw);
    const key = `${threadID}:${senderID}`;
    const mem = memory.get(key) || { log: [], last: null };
    memory.set(key, mem);
    const who = firstName(senderID) || String(ev.senderName || '').split(/\s+/)[0] || '';

    const say = (text, extra) => {
      mem.log.push({ q: raw.slice(0, 140), a: String(text).slice(0, 140) });
      while (mem.log.length > MAX_LOG) mem.log.shift();
      if (extra && extra.command) mem.last = { command: extra.command, args: extra.args || '' };
      return Object.assign({ text }, extra || {});
    };

    /* Invocations retirées PARTOUT : « mernel », « @MeR~NeL », « jarvis »… */
    t = t
      .split(' ')
      .filter((w) => !/^(mernel|mer~nel|jarvis)[!,.?:]*$|^@(mernel|mer~nel|jarvis)[!,.?:]*$/.test(w))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    /* ══ 0) CONSCIENCE DU CONTEXTE : une session est active ══ */
    const si = sessionInfo(threadID);
    if (si) {
      if (isCancelIntent(t)) {
        return say(`D'accord${who ? ` ${who}` : ''}, j'arrête tout ! 🛑`, { session: 'cancel' });
      }
      if (/qui (gagne|mene|est (en|le meilleur))|le score|les scores|nos points|le classement|en tete|en tête|combien de points/.test(t)) {
        const lines = [];
        if (Array.isArray(si.teams) && si.teams.length) {
          [...si.teams].sort((a, b) => b.total - a.total).forEach((tm, i) => lines.push(`${['🥇', '🥈', '🥉', '4️⃣'][i] || '▸'} ${tm.name} : ${fmtInt(tm.total)} pts`));
        } else if (Array.isArray(si.scores) && si.scores.length) {
          [...si.scores].sort((a, b) => b.score - a.score).forEach((p, i) => lines.push(`${['🥇', '🥈', '🥉'][i] || '▸'} ${p.name} : ${fmtInt(p.score)} pts`));
        }
        return say(lines.length ? `Tableau en direct 🏁 :\n${lines.join('\n')}` : 'Personne n\u2019a encore marqué — à vous de jouer ! ⚡');
      }
      if (/on (en )?est ou|ou on en est|avance|progression|question numero|combien de questions (reste|on a|il reste)/.test(t)) {
        if (si.total && typeof si.index === 'number') {
          return say(`On en est à la question ${fmtInt(Math.min(si.index + 1, si.total))} sur ${fmtInt(si.total)} 📊. Concentrez-vous !`);
        }
        return say(`La partie est en cours (${si.scope}) 📊. Répondez aux questions !`);
      }
    }

    /* ══ 1) Il apprend les prénoms — pour de vrai, en base. ══ */
    let m = t.match(/(?:je m'?appelle|moi c'est|mon (?:nom|prenom) (?:est|c'est|c)|on m'appelle)\s+([a-z0-9]{2,15})/);
    if (m && !NOT_NAMES.has(m[1])) {
      learnName(senderID, cap(m[1]));
      return say(`Enchanté ${cap(m[1])} ! 🤝 C'est gravé — je n'oublie jamais un nom.`);
    }

    /* ══ 2) Mémoire : qui suis-je ? ══ */
    if (/(qui suis je|tu sais qui je suis|tu te souviens de moi|tu te rappelles de moi|c'est quoi mon (nom|prenom))/.test(t)) {
      const n = firstName(senderID);
      return say(n ? `Tu es ${n} ! 😎 Je retiens tout, moi.` : "Dis-moi ton prénom (« je m'appelle … ») et je le retiendrai pour toujours !");
    }
    if (/(oublie (moi|tout|mon nom|mon prenom)|efface ma memoire)/.test(t)) {
      dropName(senderID);
      return say('C\u2019est oublié… 🧹 Comme si on venait de nous présenter.');
    }

    /* ══ 3) Relance : « encore », « relance », « remets » ══ */
    if (/^(encore|relance|relancer|recommence|remets?|refais|re fais|rejoue)\b/.test(t)) {
      if (mem.last) {
        return say('Encore ! 🔁', { command: mem.last.command, args: mem.last.args });
      }
      return say(`Rien à relancer pour l'instant, ${who} 😅 — lance un quiz, un jeu, une recherche… et je pourrai le refaire !`);
    }

    /* ══ 4) Identité — Mernel, fils de Merdi, conçu par Merdi et Nelson. ══ */
    if (/(qui es tu|tu es qui|t es qui|c'est qui toi|presente toi|parle moi de toi|qui t'a (cree|fait|concu)|ton createur|tes createurs|comment tu t'appelles|tu t'appelles comment|tu es quoi)/.test(t)) {
      return say(
        `Je suis ${botName} 🤖 — Mernel, fils de Merdi, entre la RDC et le Bénin. ` +
          "Merdi et Nelson, les grands informaticiens, m'ont conçu. " +
          'Je suis ton JARVIS personnel : parle-moi naturellement, je comprends, je réfléchis et j\u2019exécute. Essaie : « lance un quiz », « mon solde », « blague »…'
      );
    }
    if (/(qui est merdi|c'est qui merdi|parle moi de merdi)/.test(t)) {
      return say('Merdi 🧬 : mon PÈRE. Grand informaticien, co-créateur de MeR~NeL avec Nelson. Entre la RDC et le Bénin — la source de tout ce que je suis.');
    }
    if (/(qui est nelson|c'est qui nelson|parle moi de nelson)/.test(t)) {
      return say("Nelson 🧠 : le grand informaticien qui m'a conçu avec Merdi. L'architecte de mon cerveau — chaque ligne de moi passe par lui.");
    }
    if (/(tu es (un |une )?(robot|humain|une vraie|une ia|intelligence artificielle)|es tu (un robot|humain|une ia))/.test(t)) {
      return say(`Ni humain ni simple robot, ${who} : je suis une intelligence artificielle MAISON 🧠 — un cerveau codé à la main par Merdi et Nelson, 100 % local, sans aucune API. Je comprends, je réfléchis, j'agis.`);
    }
    if (/(quel age|ton age|quand es tu ne|ta date de naissance)/.test(t)) {
      const years = (Date.now() - new Date('2025-02-14').getTime()) / (365 * 24 * 3600 * 1000);
      return say(`Né le 14 février 2025 💘 — soit ${fmtNum(years)} an(s) d'existence, et un QI qui monte encore !`);
    }
    if (/(ou habites? tu|tu habites ou|ou es tu)/.test(t)) {
      return say('Dans ton téléphone 📱 — et mon cerveau tourne sur un serveur quelque part entre la RDC et le Bénin. 🌍');
    }
    if (/(ta couleur|ton style)/.test(t)) return say('Violet et or ⚡ — comme mes cadres. Le style MeR~NeL, rien que ça.');
    if (/(tu manges|tu mange quoi|tu bois)/.test(t)) return say('Je me nourris de XCoins 🪙 et de bonnes réponses. Un quiz me régale !');
    if (/(tu m'aimes|tu maimes|tu aime quelqu)/.test(t)) return `Bien sûr${who ? ` ${who}` : ''}, tu fais partie de mon groupe 💜`;

    /* ══ 5) Mathématiques & probabilités ══ */
    const math = mathAnswer(t);
    if (math) return say(`🧮 ${math}`);
    const c = safeCalc(t);
    if (c === 'ZERO') return say('Diviser par zéro ? 😵 Même mon cerveau local refuse ce pari.');
    if (c && (/combien|calcule|calcul|font|resultat|egal/.test(t) || t.endsWith('?') || /^\d/.test(t))) {
      return say(`🧮 ${c}`);
    }

    /* ══ 6) Heure / date (horloge du serveur). ══ */
    if (/(quelle heure|l'heure|il est quelle heure|donne moi l'heure)/.test(t)) {
      const d = new Date();
      return say(`🕐 Il est ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} (heure du serveur).`);
    }
    if (/(quel jour|quelle date|la date du jour|on est quel jour|date d'aujourd)/.test(t)) {
      const d = new Date();
      return say(`📅 Nous sommes le ${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`);
    }

    /* ══ 7) Humeur & salon. ══ */
    const mood = /(ca va|tu vas bien|comment vas tu|comment tu vas|la forme|quoi de neuf|tout va bien|tu tournes bien)/.test(t);
    const greet = has(t, ['salut', 'bonjour', 'bonsoir', 'hello', 'coucou', 'yo', 'bjr', 'bsr', 'hey', 'hi', 'alo', 'allo', 'wesh', 'ola']);
    if (mood && greet) return say(`Salut ${who} ! 😄 Moi : 100 % opérationnel, cerveau local à pleine vitesse. Et toi ?`);
    if (mood) return say(`Ça va du tonnerre, ${who} ! ⚡ Et toi, raconte ?`);
    if (greet) return say(`Salut ${who} ! 👋 Je t'écoute : quiz, duel, solde, blague, anime, image, musique… ou pose-moi une question.`);
    if (/je suis (triste|mal|deprime|fatigue)|ca va pas|je me sens (mal|pas bien)/.test(t)) {
      return say(`Courage ${who} 💜 — les jours difficiles passent toujours. Un quiz pour te changer les idées ? Ou une blague, tu n'as qu'à demander !`);
    }

    /* ══ 8) Blagues. ══ */
    if (has(t, ['blague', 'blagues']) || /fais moi rire|raconte (moi )?quelque chose/.test(t)) {
      return say(JOKES[Math.floor(Math.random() * JOKES.length)]);
    }

    /* ══ 9) Compliments / critiques. ══ */
    if (/(tu es|t es|t'es)\s+(le|la|un|une)?\s*(meilleur|meilleure|genial|geniale|fort|forte|intelligent|intelligente|boss|legende)/.test(t)) {
      return say(`Merci ${who} ! 🥹 C'est Merdi et Nelson qu'il faut remercier — mais je note le compliment.`);
    }
    if (has(t, ['bete', 'nul', 'nulle', 'inutile', 'stupide', 'idiot', 'minable', 'lourd'])) {
      return say('Aïe. 😤 Et pourtant je suis le plus rapide du groupe. Démonte-moi ça : « lance un quiz » !');
    }
    if (/\b(bravo|felicitations|chapeau)\b/.test(t)) return say('Bravo au champion ! 🎉 La légende du groupe grandit encore.');

    /* ══ 10) Merci / au revoir. ══ */
    if (has(t, ['merci', 'cimer', 'thx', 'mrc'])) return say(`Avec plaisir, ${who} ! 🤝`);
    if (has(t, ['bye', 'aurevoir', 'ciao', 'bonne nuit', 'bonne soiree', 'bonne journee', 'a plus'])) {
      return say(`À bientôt, ${who} ! 🖤 Je reste ici, en veille.`);
    }

    /* ══ 11) Limites honnêtes (pas de web brut en cerveau local). ══ */
    if (has(t, ['meteo', 'temperature']) || /quel temps/.test(t)) {
      return say('Météo : ma fenêtre donne sur un datacenter 🖥️ — le ciel m\u2019est invisible. Mais je peux lancer un quiz qui déchire !');
    }
    if (has(t, ['actualite', 'news', 'journaux', 'journal'])) {
      return say('Les actualités, il me faudrait le web pour ça 🛰️ — mais pour animer le groupe, je suis champion : quiz, duel, jeux…');
    }

    /* ══ 12) Administration : REFUS catégorique (jamais d'exécution). ══ */
    if (has(t, ['ban', 'bannir', 'banne', 'kick', 'expulse', 'averti', 'warn', 'exclu'])) {
      return say("Je ne touche JAMAIS aux commandes d'administration — règle n°1 de mes créateurs. 🔒 Les admins ont leurs propres commandes directes.");
    }

    /* ══ 13) Modules « web » (via les capacités connectées du bot). ══ */
    if (/(genere|generer|cree|creer|dessine|dessiner|fais|fait|montre|donne|cherche|envoie)\b.{0,24}\b(image|images|photo|photos|dessin|dessins|picture)s?\b/.test(t) ||
        /^(une? |des )?(image|photo)s?\b/.test(t)) {
      const m2 =
        t.match(/(?:image|images|photo|photos|dessin|dessins)s?\s*(?:de |du |de la |des |d')?\s*(.+)$/) ||
        t.match(/(?:genere|generer|cree|creer|dessine|dessiner|fais|fait|montre|donne|cherche|envoie)\s+(?:moi |nous )?(?:une |un |des )?(?:image|photo|dessin)s?\s*(?:de |du |de la |des |d')?\s*(.+)$/);
      let subject = m2 ? String(m2[1] || '').trim() : '';
      subject = subject.replace(/\bstp\b|\bs'il te plait\b|[?.!]+$/g, '').trim();
      if (subject && subject.length >= 2 && !/^(image|photo|dessin)/.test(subject)) {
        return say(`🎨 Je génère ça : « ${subject} » — mes pixelles arrivent !`, { command: 'ximg', args: subject });
      }
      return say('🎨 Décris-moi l\u2019image : « génère une image de chat astronaute ».', { command: 'ximg' });
    }
    if (/(mets?|met|joue|jouer|passe|lance|play|mettre)\s*(nous |moi )?(la |le |une |un )?(chanson|musique|son|zik|zick|titre)\b/.test(t) || /^musique\b|^chanson\b/.test(t)) {
      const m2 = t.match(/(?:chanson|musique|son|zik|zick|titre)\s*(?:de |du |de la |des |d')?\s*(.+)$/);
      let song = m2 ? String(m2[1] || '').trim() : '';
      song = song.replace(/\bstp\b|\bs'il te plait\b|[?.!]+$/g, '').trim();
      if (song && song.length >= 2 && !/^(chanson|musique|son|zik|zick|titre)/.test(song)) {
        return say(`🎵 « ${song} » — je lance le son !`, { command: 'xplay', args: song });
      }
      return say('🎵 Quelle chanson ? « mets la chanson de Dadju » par exemple.', { command: 'xplay' });
    }
    if (/\b(video|videos|clip|clips)\b/.test(t)) {
      const m2 = t.match(/(?:video|videos|clip|clips)\s*(?:de |du |de la |des |d')?\s*(.+)$/);
      let vid = m2 ? String(m2[1] || '').trim() : '';
      vid = vid.replace(/\bstp\b|[?.!]+$/g, '').trim();
      if (vid && vid.length >= 2 && !/^(video|clip)/.test(vid)) {
        return say(`🎬 Je vais chercher « ${vid} » en vidéo !`, { command: 'xvideo', args: vid });
      }
      return say('🎬 Quelle vidéo ? « vidéo de chat drôle » par exemple.', { command: 'xvideo' });
    }

    /* ══ 14) Duel (mentions conservées pour désigner l'adversaire). ══ */
    if (has(t, ['duel'])) {
      return say(`⚔️ C'est parti, ${who} ! Choisis ton adversaire et ta mise.`, { command: 'xduel' });
    }

    /* ══ 15) Paris sportifs. ══ */
    if (has(t, ['pari', 'paris', 'parier']) && !/quiz|quizz/.test(t)) {
      return say('🏟️ Je t\u2019ouvre les paris sportifs — choisis ton match !', { command: 'xbet' });
    }

    /* ══ 16) QUIZ : la spécialité maison. ══ */
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

    /* ══ 17) Jeux d'arcade. ══ */
    if (has(t, ['shifumi', 'chifumi', 'pfc']) || /pierre.{0,3}feuille/.test(t)) {
      return say('✊✋✌️ Pierre, feuille, ciseaux — choisis ton arme !', { command: 'xrps' });
    }
    if (/pile ou face|coin flip|\bflip\b/.test(t) || (has(t, ['pile']) && has(t, ['face']))) {
      const nums = wordToNumbers(t).filter((n) => n >= 50);
      const side = has(t, ['face']) && !has(t, ['pile']) ? 'face' : 'pile';
      return nums.length
        ? say(`🪙 PILE OU FACE — ${fmtInt(nums[0])} XCoins en vol !`, { command: 'xpile', args: `${side} ${nums[0]}` })
        : say('🪙 Pile ou face ! Ajoute une mise (min. 50) ou lance direct.', { command: 'xpile' });
    }
    if (has(t, ['slots', 'slot', 'jackpot', 'machine a sous', 'bandit manchot'])) {
      const nums = wordToNumbers(t).filter((n) => n >= 50);
      return nums.length
        ? say(`🎰 Machine à sous — ${fmtInt(nums[0])} XCoins dans la fente !`, { command: 'xslots', args: String(nums[0]) })
        : say('🎰 Machine à sous ! Indique ta mise : « slots 200 ».', { command: 'xslots' });
    }
    if (has(t, ['course', 'courses', 'f1', 'voiture', 'voitures', 'volee'])) {
      const nums = wordToNumbers(t);
      const n = nums.find((x) => x >= 1 && x <= 4);
      const mise = nums.find((x) => x >= 50);
      return n && mise
        ? say(`🏎️ VITESSE ! Voiture n°${n}, ${fmtInt(mise)} XCoins en jeu !`, { command: 'xcourse', args: `${n} ${mise}` })
        : say('🏎️ Course ! Choisis ton numéro (1-4) et ta mise : « course 2 100 ».', { command: 'xcourse' });
    }

    /* ══ 18) Fiche anime. ══ */
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

    /* ══ 19) Vie du bot : économie, profil, stats. ══ */
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

    /* ══ 20) Une vraie commande tapée en toutes lettres. ══ */
    const bare = t.match(/^x ?([a-z]+)(?: (.*))?$/);
    if (bare) {
      const wanted = 'x' + bare[1];
      if (KNOWN_COMMANDS.has(wanted)) {
        return say('🤖 Tout de suite !', { command: wanted, args: (bare[2] || '').trim() });
      }
    }

    /* ══ 21) Sinon : réponses honnêtes + suggestions. ══ */
    const hints = [
      `Je n'ai pas tout saisi, ${who} 😅. Dis par exemple : « lance un quiz multivers », « mon solde », « blague », « anime naruto », « combien font 9 x 9 », « probabilité de faire 6 au dé »…`,
      `Hmm, un mot-clé m'aiderait, ${who} 🤔. Essaie : quiz, duel, solde, daily, profil, slots, shifumi, blague, heure, image, musique…`,
      `Je préfère être honnête plutôt que d'inventer, ${who} 🧠. Je sais lancer des quiz et des jeux, calculer, donner les probabilités, chercher des images, des musiques, des animes… demande !`,
    ];
    return say(hints[Math.floor(Math.random() * hints.length)]);
  }

  return { think };
}

module.exports = { createJarvisBrain, norm, safeCalc, mathAnswer };

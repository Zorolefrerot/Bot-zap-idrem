"use strict";

/**
 * services/corpus.js
 * ---------------------------------------------------------------------------
 * Contenu LOCAL du bot : blagues, citations, faits, taquineries, compliments,
 * vérités, défis, réponses conversationnelles, questions de quiz, mots du jeu
 * de pendu…
 *
 * Pourquoi en local ? Parce que /joke, /quote, /fact, /truth et /dare doivent
 * fonctionner SANS clé API ni service externe : pas de fausse promesse, pas de
 * réponse inventée, pas d'échec réseau. Les services réellement distants
 * (météo, traduction, définition, recherche…) vivent dans services/external/.
 * ---------------------------------------------------------------------------
 */

/** Salutations — variantes nombreuses pour ne jamais paraître répétitif. */
const GREETINGS = [
  "👋 Salut {name} ! Comment je peux t'aider ?",
  "✨ Bonjour {name}. /menu si tu cherches une commande.",
  "🔵 Salut ! Ravi de te voir ici.",
  "⚡ Coucou {name}, je suis opérationnel.",
  "👀 Hello ! Une question, un jeu, un calcul ?",
  "🌙 Bonsoir {name}, que puis-je faire pour toi ?",
  "🤝 Salut {name}, content de te retrouver.",
  "🚀 Hey ! IDREM à ton service."
];

/** Remerciements. */
const THANKS = [
  "🙌 Avec plaisir !",
  "😊 De rien, {name}.",
  "🔵 Normal, c'est mon métier.",
  "✨ anytime ! N'hésite pas si tu as besoin d'autre chose.",
  "🤝 Pas de souci.",
  "⚡ Service rapide, c'est la maison."
];

/** « Ça va ? ». */
const HOW_ARE_YOU = [
  "🟢 Très bien, tous mes systèmes sont au vert. Et toi ?",
  "⚡ Je tourne à plein régime, merci ! Tu as besoin de quoi ?",
  "🔵 Impeccable. Prêt pour une commande ou une partie ?",
  "🙂 Ça va, tant que le serveur ne dort pas. Et de ton côté ?",
  "📊 Statut : opérationnel. Humeur : curieuse."
];

/** « Qui es-tu ? ». */
const WHO_ARE_YOU = [
  "🔵 Je suis IDREM TERESHKOVA, un bot Messenger : jeux, économie virtuelle, utilitaires et IA. Fais /menu pour tout voir.",
  "⚡ IDREM, bot modulaire. {commands} commandes au compteur — /help pour le détail.",
  "🤖 Moi ? IDREM TERESHKOVA. Je réponds aux commandes qui commencent par {prefix} et je discute aussi naturellement.",
  "✨ Un bot, oui, mais un bot organisé : 12 catégories de commandes. /menu t'ouvre les portes."
];

/** Demande d'aide hors commande. */
const HELP_REQUESTS = [
  "📚 Bien sûr ! Tape /menu pour les catégories, ou /help pour la liste complète.",
  "🔵 Je peux t'aider : /calc, /weather, /translate, /quiz, /daily… Regarde /menu.",
  "💡 Dis-moi ce que tu cherches, ou fais /help <catégorie> (jeux, économie, social, fun, utilitaires…)."
];

/** Au revoir. */
const GOODBYE = [
  "👋 À bientôt {name} !",
  "🔵 Bonne journée !",
  "✨ Salut, repasse quand tu veux.",
  "🚀 Déconnexion… non je plaisante, je reste là."
];

/** Rires. */
const LAUGHTER = [
  "😄 Content que ça te fasse rire.",
  "🤭 J'en ai une autre si tu veux : /joke.",
  "😂 Mission divertissement accomplie."
];

/** Insultes / agressivité : on désamorce sans surenchérir. */
const CALM_DOWN = [
  "🙂 On se détend ? Je suis juste un bot.",
  "🔵 Pas de souci, mais restons courtois ici.",
  "🛡️ Message reçu. Un /roast et on passe à autre chose ?"
];

/** Réponses génériques quand le bot décide de participer à la discussion. */
const SMALL_TALK = [
  "🤔 Intéressant. Tu veux creuser avec /ai ou on continue la discussion ?",
  "🔵 Je note. /ask si tu veux une vraie réponse détaillée.",
  "💬 Je suis là si tu as besoin d'un calcul, d'une traduction ou d'un jeu.",
  "⚡ Hmm, je n'ai pas assez de contexte, mais /help est là pour ça.",
  "🙂 Tu veux mon avis ? /8ball tranchera mieux que moi."
];

/** Réponses aux mentions du bot. */
const MENTIONS = [
  "👀 Oui, je t'écoute.",
  "🔵 Présent. Que puis-je faire ?",
  "⚡ On m'appelle ? Me voilà.",
  "📌 Dis-moi — ou tape /menu pour voir ce que je sais faire.",
  "🤖 IDREM à l'écoute de {name}.",
  "✨ Tu m'as mentionné, donc me voici. Une commande, une question ?"
];

/** Boule magique 8ball. */
const EIGHT_BALL = {
  positive: [
    "✅ Oui, absolument.",
    "🔵 C'est certain.",
    "✨ Sans aucun doute.",
    "👍 Très probablement.",
    "🌟 Les signes disent oui.",
    "💯 Oui, et à 100 %."
  ],
  neutral: [
    "🤔 Demande encore plus tard.",
    "⚖️ Je ne peux pas me prononcer maintenant.",
    "🌫️ Concentre-toi et repose la question.",
    "😶 Réponse en cours de calcul… pas concluant.",
    "🔮 Peut-être. Peut-être pas."
  ],
  negative: [
    "❌ Ne compte pas dessus.",
    "🚫 Ma réponse est non.",
    "🧊 Les signes disent non.",
    "😬 Très douteux.",
    "🙅 Non, et c'est définitif."
  ]
};

/** Blagues (courtes, tout public). */
const JOKES = [
  "Pourquoi les développeurs détestent la nature ? Il y a trop de bugs.",
  "Un octet entre dans un bar. Le barman demande : « Tu as l'air malade. » — « Oui, je me sens un peu bit. »",
  "Pourquoi le Wi-Fi a-t-il rompu avec l'ordinateur ? Parce qu'il n'y avait plus de connexion.",
  "Que dit un robot quand il a faim ? « Je vais me faire un octet. »",
  "Il y a 10 catégories de personnes : celles qui comprennent le binaire et les autres.",
  "Pourquoi les poissons vivent-ils dans l'eau salée ? Parce que le poivre les fait éternuer.",
  "Un bug entre dans un bar. Le barman dit : « On ne sert pas les bugs ici. » Le bug répond : « Normal, je suis une feature. »",
  "Comment appelle-t-on un chien qui fait de la magie ? Un abracadabrador.",
  "Pourquoi les plongeurs plongent-ils toujours en arrière ? Parce que sinon ils tombent dans le bateau.",
  "Que fait une fraise sur un ordinateur ? Elle surfe sur la toile… avec de la crème.",
  "Le JSON dit au XML : « Tu es trop verbeux. » Le XML répond : « Au moins je me ferme correctement. »",
  "Pourquoi le mathématicien confond-il Halloween et Noël ? Parce que OCT 31 = DEC 25.",
  "Un serveur entre dans un bar et demande : « Vous avez une table pour deux octets ? »",
  "Que dit un chat quand il tombe amoureux ? « Tu es ma souris préférée. »",
  "Pourquoi les robots n'ont-ils jamais peur ? Parce qu'ils ont des nerfs d'acier.",
  "Quelle est la devise du paresseux ? « Je la donnerai demain. »",
  "Deux antennes se rencontrent sur un toit, tombent amoureuses et se marient. La cérémonie était nulle, mais la réception était excellente.",
  "Comment un développeur compte-t-il ses amis ? À partir de zéro."
];

/** Citations. */
const QUOTES = [
  { text: "La seule façon de faire du bon travail est d'aimer ce que l'on fait.", author: "Steve Jobs" },
  { text: "Ils ne savaient pas que c'était impossible, alors ils l'ont fait.", author: "Mark Twain" },
  { text: "Le succès, c'est tomber sept fois, se relever huit.", author: "Proverbe japonais" },
  { text: "La simplicité est la sophistication suprême.", author: "Léonard de Vinci" },
  { text: "Ce qui ne me détruit pas me rend plus fort.", author: "Friedrich Nietzsche" },
  { text: "Le voyage de mille lieues commence toujours par un premier pas.", author: "Lao Tseu" },
  { text: "L'imagination est plus importante que le savoir.", author: "Albert Einstein" },
  { text: "Sois le changement que tu veux voir dans le monde.", author: "Mahatma Gandhi" },
  { text: "La persévérance n'est pas une longue course ; c'est une multitude de courtes courses.", author: "Walter Elliot" },
  { text: "Un problème sans solution est un problème mal posé.", author: "Antoine de Saint-Exupéry" },
  { text: "Le meilleur moment pour planter un arbre était il y a 20 ans. Le deuxième meilleur moment est maintenant.", author: "Proverbe chinois" },
  { text: "La Terre est le berceau de l'humanité, mais on ne passe pas sa vie dans un berceau.", author: "Konstantin Tsiolkovski" },
  { text: "Je n'ai pas échoué. J'ai trouvé 10 000 solutions qui ne fonctionnent pas.", author: "Thomas Edison" },
  { text: "La discipline est le pont entre les objectifs et les réussites.", author: "Jim Rohn" },
  { text: "Il n'y a pas de vent favorable pour celui qui ne sait pas où il va.", author: "Sénèque" }
];

/** Faits surprenants. */
const FACTS = [
  "🧠 Le cerveau humain consomme environ 20 % de l'énergie du corps alors qu'il ne pèse que 2 % de sa masse.",
  "🐙 Les pieuvres ont trois cœurs et un sang bleu.",
  "🍯 Le miel ne se périme jamais : on en a retrouvé de comestible dans des tombes égyptiennes.",
  "🌩️ La foudre peut chauffer l'air à environ 30 000 °C, soit cinq fois la surface du Soleil.",
  "🦈 Les requins existaient avant les arbres : environ 400 millions d'années contre 350.",
  "🛰️ La Station spatiale internationale fait le tour de la Terre en 90 minutes.",
  "🐜 Il y a environ 2,5 millions de fourmis pour chaque humain sur Terre.",
  "📜 Le premier programme informatique a été écrit par Ada Lovelace en 1843.",
  "🌊 On a exploré moins de 20 % des océans de manière détaillée.",
  "🍌 La banane est botaniquement une baie, et la fraise n'en est pas une.",
  "⚡ Un éclair parcourt environ 300 000 km/h… la lumière, elle, va à 1 080 000 000 km/h.",
  "🧬 L'ADN humain déroulé mesurerait environ 2 mètres de long par cellule.",
  "🪐 Saturne flotterait sur l'eau : sa densité est inférieure à celle de l'eau.",
  "🐝 Les abeilles reconnaissent des visages humains sur des photos.",
  "💻 Le premier bug informatique était un vrai insecte, retrouvé dans le Mark II en 1947.",
  "🚀 Valentina Tereshkova fut la première femme dans l'espace, en 1963, à 26 ans."
];

/** Taquineries (/roast) — gentilles, jamais ciblées sur le physique réel. */
const ROASTS = [
  "Tu es la preuve que le mode économie existe aussi pour les idées.",
  "Ton niveau en orthographe ? Disons que ton correcteur a démissionné.",
  "Tu mets tellement de temps à répondre que j'ai eu le temps de redémarrer.",
  "Si la flemme était un sport olympique, tu aurais la médaille… envoyée par quelqu'un d'autre.",
  "Tu es comme un lundi : personne ne t'attend mais tu es toujours là.",
  "Ton Wi-Fi intérieur doit être en 2G.",
  "Tu joues à /quiz comme moi à la bourse : sans stratégie.",
  "Même ton avatar a l'air fatigué.",
  "Tu es unique… comme tout le monde, en fait.",
  "Je t'expliquerais bien, mais je n'ai pas de crayon assez gros.",
  "Ton sens de l'orientation ? Tu te perds dans un menu déroulant.",
  "Ne t'inquiète pas, tout le monde n'est pas doué… toi non plus."
];

/** Compliments (/compliment). */
const COMPLIMENTS = [
  "Tu as une énergie qui se remarque, même à travers un écran.",
  "Franchement, ta curiosité est ta meilleure qualité.",
  "Tu fais partie des gens qui rendent un groupe plus agréable.",
  "Ta patience force le respect — moi, je n'en ai aucune.",
  "Tu as ce petit humour qui tombe toujours au bon moment.",
  "Si tu continues comme ça, tu vas finir au classement /topusers.",
  "Tu poses de bonnes questions, c'est plus rare qu'on ne le pense.",
  "Ta bonne humeur est contagieuse, garde-la."
];

/** Vérités (/truth). */
const TRUTHS = [
  "Quelle est la chose la plus embarrassante que tu aies faite cette semaine ?",
  "Quel est ton pire mensonge qui a fonctionné ?",
  "Si tu pouvais effacer un message envoyé, lequel ?",
  "Quelle est la dernière recherche bizarre que tu as faite en ligne ?",
  "Qui, dans ce groupe, te fait le plus rire ?",
  "Quel est ton talent inutile ?",
  "Quelle chanson honteuse connais-tu par cœur ?",
  "Quelle est ta plus grosse peur ridicule ?",
  "Quel surnom détestes-tu qu'on te donne ?",
  "Qu'est-ce que tu fais quand tu es seul(e) et que personne ne doit savoir ?",
  "Quelle est la dernière fois que tu as pleuré, et pourquoi ?",
  "Si tu devais quitter le groupe demain, qui préviendrais-tu en premier ?",
  "Quel est le pire cadeau que tu aies reçu ?",
  "Quelle mauvaise habitude refuses-tu d'abandonner ?",
  "Quelle est ta plus grande fierté que tu n'oses pas raconter ?"
];

/** Défis (/dare) — toujours réalisables et sans risque. */
const DARES = [
  "Envoie le 5ᵉ emoji de ton clavier, sans contexte.",
  "Écris ta prochaine phrase uniquement en majuscules.",
  "Fais un compliment sincère à la personne au-dessus de toi dans la liste des membres.",
  "Raconte ta journée en trois mots seulement.",
  "Imite le bruit d'un modem 56k en vocal.",
  "Change ton pseudo pendant 10 minutes pour « Bot en formation ».",
  "Envoie une phrase avec une faute par mot.",
  "Décris le bot IDREM comme si c'était un plat.",
  "Pose une question à laquelle tu réponds toi-même immédiatement.",
  "Fais /8ball trois fois de suite et accepte la dernière réponse comme conseil du jour.",
  "Écris un haïku sur le Wi-Fi.",
  "Envoie le dernier message de ton autre conversation, tel quel.",
  "Parle en rimes pendant trois messages.",
  "Donne le nom de ton film préféré… en inversant les lettres du titre.",
  "Annonce solennellement que tu vas dormir, puis continue à parler."
];

/** Traits pour /character (portrait humoristique). */
const CHARACTER_TRAITS = [
  "Curieux·se compulsif·ve",
  "Stratège de canapé",
  "Génie incompris du groupe",
  "Expert·e en siestes courtes",
  "Diplomate de dernière minute",
  "Collectionneur·se de captures d'écran",
  "Philosophe du lundi matin",
  "Champion·ne du hors-sujet",
  "Architecte de plans improbables",
  "Ambassadeur·drice du sarcasme tendre",
  "Dompteur·se de notifications",
  "Historien·ne des blagues ratées",
  "Pilote de conversations nocturnes",
  "Négociateur·rice de dernières parts de pizza",
  "Gardien·ne des secrets du groupe"
];

const CHARACTER_QUIRKS = [
  "répond toujours après 3 minutes pile",
  "met des emojis dans les messages sérieux",
  "corrige les fautes des autres… avec les siennes",
  "envoie des vocaux de 2 secondes pour dire « ok »",
  "disparaît dès qu'on parle de rangement",
  "connaît toutes les paroles sauf celles du refrain",
  "gagne toujours à /rps le premier tour",
  "prétend avoir lu les conditions d'utilisation"
];

/** Appréciations pour /rate et /pp. */
const RATE_COMMENTS = [
  { min: 90, text: "Sans discussion : niveau légende." },
  { min: 75, text: "Excellent, tu peux viser plus haut." },
  { min: 60, text: "Solide, ça se voit." },
  { min: 45, text: "Correct, il manque un détail." },
  { min: 30, text: "Moyen… mais perfectible." },
  { min: 15, text: "Aïe. On repassera." },
  { min: 0, text: "Le néant absolu. Respect pour l'audace." }
];

/** Métiers pour /work. */
const WORK_LINES = [
  "Tu as travaillé comme {job} pendant {hours} h.",
  "Mission accomplie : {job}.",
  "Journée de {job} terminée sans incident majeur."
];

/** Questions de quiz — 6 catégories. */
const QUIZ = [
  { q: "Quelle est la capitale de l'Australie ?", a: ["Canberra", "Sydney", "Melbourne", "Perth"], c: 0, cat: "Géographie" },
  { q: "Combien de planètes compte le système solaire ?", a: ["7", "8", "9", "10"], c: 1, cat: "Espace" },
  { q: "Qui fut la première femme dans l'espace ?", a: ["Sally Ride", "Valentina Tereshkova", "Claudie Haigneré", "Mae Jemison"], c: 1, cat: "Espace" },
  { q: "Quel langage est utilisé pour styliser une page web ?", a: ["HTML", "CSS", "SQL", "PHP"], c: 1, cat: "Tech" },
  { q: "Combien font 7 × 8 ?", a: ["54", "56", "58", "64"], c: 1, cat: "Maths" },
  { q: "Quel océan borde la France à l'ouest ?", a: ["Pacifique", "Indien", "Atlantique", "Arctique"], c: 2, cat: "Géographie" },
  { q: "Quel est le plus grand désert chaud du monde ?", a: ["Gobi", "Kalahari", "Sahara", "Atacama"], c: 2, cat: "Géographie" },
  { q: "En quelle année a eu lieu le premier pas sur la Lune ?", a: ["1965", "1969", "1972", "1959"], c: 1, cat: "Espace" },
  { q: "Quel symbole chimique représente l'or ?", a: ["Ag", "Or", "Au", "Go"], c: 2, cat: "Science" },
  { q: "Combien de côtés a un hexagone ?", a: ["5", "6", "7", "8"], c: 1, cat: "Maths" },
  { q: "Qui a écrit « Les Misérables » ?", a: ["Émile Zola", "Victor Hugo", "Gustave Flaubert", "Alexandre Dumas"], c: 1, cat: "Culture" },
  { q: "Quelle est la monnaie officielle du Japon ?", a: ["Yuan", "Won", "Yen", "Ringgit"], c: 2, cat: "Culture" },
  { q: "Quel organe produit l'insuline ?", a: ["Le foie", "Le pancréas", "Les reins", "La rate"], c: 1, cat: "Science" },
  { q: "Combien de temps met la lumière du Soleil pour atteindre la Terre ?", a: ["8 secondes", "8 minutes", "8 heures", "80 minutes"], c: 1, cat: "Espace" },
  { q: "Quel pays a la forme d'une botte ?", a: ["Espagne", "Portugal", "Italie", "Grèce"], c: 2, cat: "Géographie" },
  { q: "Que signifie l'acronyme « HTTP » ?", a: ["HyperText Transfer Protocol", "High Tech Transfer Process", "Home Tool Transfer Protocol", "Hyperlink Text Transport Program"], c: 0, cat: "Tech" },
  { q: "Quelle est la racine carrée de 144 ?", a: ["10", "11", "12", "14"], c: 2, cat: "Maths" },
  { q: "Quel peintre a réalisé « La Nuit étoilée » ?", a: ["Monet", "Van Gogh", "Picasso", "Dalí"], c: 1, cat: "Culture" },
  { q: "Combien d'os compte le corps humain adulte ?", a: ["186", "206", "226", "246"], c: 1, cat: "Science" },
  { q: "Quelle planète est surnommée la planète rouge ?", a: ["Vénus", "Mars", "Jupiter", "Mercure"], c: 1, cat: "Espace" },
  { q: "Quel est le plus long fleuve d'Afrique ?", a: ["Congo", "Niger", "Nil", "Zambèze"], c: 2, cat: "Géographie" },
  { q: "En programmation, que fait une boucle « while » ?", a: ["Elle répète tant que la condition est vraie", "Elle s'exécute une seule fois", "Elle trie un tableau", "Elle arrête le programme"], c: 0, cat: "Tech" },
  { q: "Quelle est la capitale du Canada ?", a: ["Toronto", "Montréal", "Ottawa", "Vancouver"], c: 2, cat: "Géographie" },
  { q: "Combien de minutes dans une journée ?", a: ["1 240", "1 440", "1 640", "2 400"], c: 1, cat: "Maths" },
  { q: "Quel gaz les plantes absorbent-elles principalement ?", a: ["Oxygène", "Azote", "Dioxyde de carbone", "Hydrogène"], c: 2, cat: "Science" },
  { q: "Qui a peint la Joconde ?", a: ["Michel-Ange", "Léonard de Vinci", "Raphaël", "Botticelli"], c: 1, cat: "Culture" },
  { q: "Quel est le plus petit pays du monde ?", a: ["Monaco", "Malte", "Vatican", "Saint-Marin"], c: 2, cat: "Géographie" },
  { q: "Que renvoie « typeof [] » en JavaScript ?", a: ["array", "object", "list", "undefined"], c: 1, cat: "Tech" },
  { q: "Combien de cœurs a une pieuvre ?", a: ["1", "2", "3", "4"], c: 2, cat: "Science" },
  { q: "Quelle est la vitesse approximative de la lumière ?", a: ["300 000 km/s", "150 000 km/s", "3 000 km/s", "1 000 000 km/s"], c: 0, cat: "Science" },
  { q: "Quel film a remporté l'Oscar du meilleur film en 2020 ?", a: ["1917", "Joker", "Parasite", "Once Upon a Time in Hollywood"], c: 2, cat: "Culture" },
  { q: "Combien de zéros dans un milliard (échelle courte) ?", a: ["6", "9", "12", "15"], c: 1, cat: "Maths" }
];

/** Mots pour /word (jeu du mot à deviner). */
const WORDS = [
  "ordinateur", "messager", "galaxie", "boussole", "algorithme", "circuit", "horizon", "lanterne",
  "orchestre", "pyramide", "volcan", "cascade", "biscuit", "fenetre", "jardin", "montagne",
  "planete", "robotique", "satellite", "tornade", "viaduc", "zephyr", "archive", "bibliotheque",
  "carafe", "domino", "escalier", "falaise", "grenouille", "haricot", "iguane", "jupiter",
  "kayak", "lampe", "marmotte", "navette", "oiseau", "piano", "quartz", "riviere",
  "soleil", "tortue", "univers", "voilier", "xylophone", "yaourt", "zebre", "antenne"
];

/** Répliques pour /duel. */
const DUEL_LINES = {
  start: [
    "⚔️ {a} défie {b} ! Trois manches, que le meilleur gagne.",
    "🥊 Duel accepté : {a} contre {b}.",
    "🔵 Arène ouverte. {a} vs {b}."
  ],
  hit: [
    "{a} touche {b} ! {damage} dégâts.",
    "Coup net de {a} : {damage} dégâts sur {b}.",
    "{b} encaisse {damage} dégâts de {a}.",
    "Attaque éclair de {a} → {damage} dégâts."
  ],
  miss: [
    "{a} manque sa cible. {b} rit nerveusement.",
    "Coup dans le vide pour {a}.",
    "{b} esquive l'attaque de {a}.",
    "{a} glisse sur une peau de banane virtuelle."
  ],
  crit: [
    "💥 COUP CRITIQUE de {a} : {damage} dégâts !",
    "⚡ {a} frappe au point faible : {damage} dégâts !",
    "🔥 Enchaînement parfait de {a} : {damage} dégâts !"
  ],
  win: [
    "🏆 {a} remporte le duel contre {b} !",
    "🎉 Victoire de {a}. {b} se relève péniblement.",
    "⚔️ {a} gagne. Le public (moi) applaudit."
  ]
};

/** Devinettes pour /guess. */
const RIDDLES = [
  { r: "Je parle sans bouche et j'entends sans oreilles. Je n'ai pas de corps, mais je prends vie avec le vent. Qui suis-je ?", a: ["echo", "écho"] },
  { r: "Plus on en prend, plus on en laisse derrière soi. Qui suis-je ?", a: ["pas", "les pas", "empreintes"] },
  { r: "Je suis toujours devant toi mais tu ne peux jamais me voir. Qui suis-je ?", a: ["avenir", "futur", "demain"] },
  { r: "On me brise sans jamais me toucher. Qui suis-je ?", a: ["promesse", "une promesse", "silence"] },
  { r: "J'ai des villes mais pas de maisons, des montagnes mais pas d'arbres, de l'eau mais pas de poissons. Qui suis-je ?", a: ["carte", "une carte", "map"] }
];

/** Textes de mèmes (repli si l'API externe est indisponible). */
const MEME_FALLBACK = [
  "Quand tu écris /help et que tu découvres 100 commandes d'un coup. 😳",
  "Moi à 3 h du matin : encore une petite partie de /quiz… 🌙",
  "Le bot : « Solde insuffisant. » Moi : mais j'ai travaillé toute la journée ! 💸",
  "Quand quelqu'un tape /ping pour la 40ᵉ fois. 🏓",
  "Personne : … Moi : /8ball est-ce que je devrais dormir ? 🛌"
];

/** Réponses de /ai lorsqu'aucune API n'est configurée (message honnête). */
const AI_NOT_CONFIGURED_HINTS = [
  "Aucune clé IA n'est configurée sur ce déploiement.",
  "Le module IA est prêt, il attend simplement une clé API."
];

module.exports = {
  GREETINGS,
  THANKS,
  HOW_ARE_YOU,
  WHO_ARE_YOU,
  HELP_REQUESTS,
  GOODBYE,
  LAUGHTER,
  CALM_DOWN,
  SMALL_TALK,
  MENTIONS,
  EIGHT_BALL,
  JOKES,
  QUOTES,
  FACTS,
  ROASTS,
  COMPLIMENTS,
  TRUTHS,
  DARES,
  CHARACTER_TRAITS,
  CHARACTER_QUIRKS,
  RATE_COMMENTS,
  WORK_LINES,
  QUIZ,
  WORDS,
  RIDDLES,
  DUEL_LINES,
  MEME_FALLBACK,
  AI_NOT_CONFIGURED_HINTS
};

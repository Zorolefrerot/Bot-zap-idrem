# 🧬 𝗠𝗲𝗥~𝗡𝗲𝗟 🫟 — Bot Facebook/Messenger multifonction

> Assistant communautaire intelligent : IA, chat automatique, économie, XP/niveaux,
> jeux, génération d'images, audio, vidéo, profils, gestion de groupe, administration
> et accueil des nouveaux membres.
>
> **MeR~NeL Production** — PROPRE • MODULAIRE • PERSISTANT • SÉCURISÉ • EXTENSIBLE • PRÊT POUR RENDER

╭━━〔 🧬 𝗠𝗲𝗥~𝗡𝗘𝗟 ⚡ 〕━━╮

🤖 𝗜𝗡𝗧𝗘𝗟𝗟𝗜𝗚𝗘𝗡𝗖𝗘 — 💰 𝗘́𝗖𝗢𝗡𝗢𝗠𝗜𝗘 — 🎮 𝗝𝗘𝗨𝗫 — 🖼️ 𝗠𝗘́𝗗𝗜𝗔𝗦
👤 𝗣𝗥𝗢𝗙𝗜𝗟𝗦 — 📢 𝗚𝗥𝗢𝗨𝗣𝗘𝗦 — 🛡️ 𝗔𝗗𝗠𝗜𝗡

⚡ 𝗠𝗲𝗥~𝗡𝗘𝗟 — 𝗦𝗬𝗦𝗧𝗘̀𝗠𝗘 𝗢𝗡𝗟𝗜𝗡𝗘.

╰━━〔 🧬 𝗠𝗲𝗥~𝗡𝗲𝗟 〕━━╯

---

## 📁 Architecture

```
MeR-NeL/
├── index.js                  # Point d'entrée : connexion, keep-alive, arrêt propre
├── package.json
├── .env                      # Secrets (JAMAIS commité)
├── .env.example              # Modèle de configuration
├── .gitignore
├── render.yaml               # Déploiement Render en un clic
│
├── core/
│   ├── config.js             # Configuration centralisée (lit .env)
│   ├── bot.js                # Cerveau : routage, sessions, XP, accueil
│   ├── commandLoader.js      # Chargement auto de commands/**
│   └── keepAlive.js          # Serveur HTTP santé pour Render (/healthz)
│
├── commands/
│   ├── core/xmenu.js         # 📋 Menu officiel
│   ├── ai/                   # 🧠 xask, xai, xchat
│   ├── economy/              # 💰 xdaily, xcoins, xp, xrank
│   ├── games/                # 🎮 xquiz, xduel, xgame
│   ├── media/                # 🖼️ ximg, 🎵 xplay, 🎬 xvideo
│   ├── profile/              # 👤 xprofil, ✏️ xpseudo
│   ├── group/                # 📢 xtagall, xannonce
│   └── admin/                # 🛡️ xban, xwarn, xkick, xclear, xadd
│
├── services/
│   ├── facebook.js           # Adaptateur Messenger (@dongdev/fca-unofficial,
│   │                         #   secours ws3-fca) + mode mock
│   ├── ai.js                 # Toutes les requêtes IA (Xask/Xai)
│   ├── chat.js               # Mode discussion (contexte contrôlé)
│   ├── imageGenerator.js     # Génération d'images (Agnes)
│   ├── imageSearch.js        # Recherche d'images Google (fallback)
│   ├── audio.js              # Xplay (≤ 2 min, jamais de contournement)
│   ├── video.js              # Xvideo (≤ 2 min)
│   └── videoGenerator.js     # Génération vidéo (best effort)
│
├── systems/
│   ├── economy.js            # XCoins : soldes, daily, classement
│   ├── xp.js                 # XP & niveaux (courbe configurable)
│   ├── quiz.js               # Machine d'état du quiz
│   ├── duel.js               # Machine d'état du duel (mises sécurisées)
│   ├── cloudSync.js          # ☁️ Sauvegarde persistante Neon (PostgreSQL)
│   ├── jarvisBrain.js        # 🧠 CERVEAU JARVIS local : compréhension, réflexion, mémoire
│   ├── sessions.js           # Gestionnaire de conversations multi-étapes
│   └── questions/            # Banques de questions JSON (éditables)
│
├── database/
│   ├── database.js           # Couche d'accès centralisée (écritures atomiques)
│   └── data/                 # users.json, groups.json, stats.json (runtime)
│
├── utils/
│   ├── formatter.js          # Identité visuelle : gras Unicode, cadres, variantes
│   ├── permissions.js        # isAdmin(userID) & co
│   ├── cooldown.js           # Cooldowns serveur
│   ├── sanitize.js           # Validation des entrées
│   └── logger.js             # Logs avec masquage des secrets
│
├── assets/quiz/id/           # Photos de la catégorie ID
└── tests/                    # Suite de tests automatisés (node --test)
```

---

## 🚀 Installation

### Prérequis
- **Node.js ≥ 18**
- Un compte Facebook (⚠️ utilisez un compte **dédié au bot** — l'automatisation est
  contraire aux CGU de Facebook et peut entraîner une restriction du compte).

### Étapes

```bash
# 1. Cloner
git clone <votre-repo> MeR-NeL
cd MeR-NeL

# 2. Dépendances
npm install

# 3. (Optionnel) personnalisation
cp .env.example .env
# → tout est déjà préconfiguré ; .env ne sert qu'à surcharger

# 4. Connexion Facebook — SEULE étape obligatoire :
#   Fournissez les cookies du compte bot :
#   - soit un fichier appstate.json à la racine (tableau de cookies,
#     exporté via l'extension « Cookie Editor » — format accepté tel quel),
#   - soit la variable APPSTATE_JSON (même contenu, en une ligne).

# 5. Démarrage
npm start
```

Le bot affiche :

```
╭━━〔 🧬 MeR~NeL ⚡ 〕━━╮
   MeR~NeL Production — démarrage…
╰━━〔 🧬 MeR~NeL 〕━━╯
[commands] 20 commandes chargées.
[facebook] connecté (ws3-fca).
[keepAlive] écoute sur 0.0.0.0:3000 (/healthz)
```

Ajoutez le bot à un groupe → il se présente automatiquement.

---

## 🔐 Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `BOT_NAME` | Nom du bot | `MeR~NeL` |
| `BOT_SIGNATURE` | Signature | `MeR~NeL Production` |
| `PREFIX` | Préfixe des commandes | `X` |
| `ADMIN_UIDS` | UIDs administrateurs, séparés par des virgules | — (**obligatoire**) |
| `OWNER_UID` | UID du propriétaire | 1er admin |
| `SHIZO_API_URL` | API IA (Xask/Xai) | `https://api.shizo.top/ai/gpt` |
| `SHIZO_API_KEY` | Clé API shizo | `shizo` |
| `GEMINI_CHAT_URL` | Proxy chat (Xchat) | `https://arychauhann.onrender.com/api/gemini-proxy2` |
| `AGNES_API_URL` | API images/vidéos | `https://apihub.agnes-ai.com/v1` |
| `AGNES_API_KEY` | Clé Agnes (**obligatoire pour Ximg**) | — |
| `AGNES_IMAGE_MODEL` | Modèle d'image | `dall-e-3` |
| `APPSTATE_FILE` / `APPSTATE_JSON` | Cookies Facebook | `appstate.json` |
| `PORT` | Port du serveur keep-alive | `3000` |
| `DAILY_REWARD` | Récompense Xdaily | `350` |
| `DAILY_COOLDOWN_HOURS` | Cooldown Xdaily | `24` |
| `START_BALANCE` | Solde de départ | `500` |
| `MAX_IMAGES` | Max images par Ximg (1-5) | `5` |
| `MEDIA_MAX_SECONDS` | Durée max Xplay/Xvideo | `120` |
| `QUIZ_TIMEOUT_MS` / `DUEL_TIMEOUT_MS` | Temps de réponse | `15000` / `25000` |
| `QUIZ_ALLOWED_COUNTS` | Nombre de questions proposé (Xquiz) | `5,10,15` |
| `QUIZ_COINS_PER_CORRECT` | Gain par bonne réponse | `15` |
| `SPAM_DUPLICATE_LIMIT` | Répétitions avant détection | `5` |
| `SPAM_TIME_WINDOW_MS` | Fenêtre de détection (messages identiques) | `30000` |
| `SPAM_FLOOD_WINDOW_MS` | Fenêtre anti-flood (5 messages quelconques) | `10000` |
| `SPAM_WARN_LIMIT` | Avertissements avant exclusion auto | `2` |
| `SPAM_AUTO_BAN` | Exclusion automatique à la limite de warns | `true` |
| `IDLE_STANDBY_MINUTES` | Inactivité avant mode veille | `30` |
| `STANDBY_ANNOUNCE` | Annoncer le passage en veille | `true` |
| `BOT_ADAPTER` | `ws3-fca` (prod) ou `mock` (tests) | `ws3-fca` |
| `FACEBOOK_LIBRARY` | Force la bibliothèque FCA | `@dongdev/fca-unofficial` puis `ws3-fca` |

⚠️ **Sécurité** : `.env` et `appstate.json` sont dans `.gitignore`. Aucune clé
n'apparaît jamais dans les messages du bot, les erreurs ou les logs (masquage
automatique).

> 🔑 **Valeurs intégrées par défaut** : pour faciliter le déploiement, les URLs
> d'API, la clé Agnes et les UIDs admin sont préconfigurés dans `core/config.js`
> et `.env.example`. **Sur Render, la seule variable obligatoire est
> `APPSTATE_JSON`** (cookies Facebook). Toutes les autres restent surchargeables
> via `.env` / dashboard Render si besoin.

---

> 💾 **Persistance totale** : XCoins, XP, niveaux, rangs, pseudos, avertissements
> et paris sont écrits sur disque (JSON atomique + debounce), avec **autosave
> toutes les 5 minutes** et **flush garanti à l'extinction/redémarrage**
> (SIGTERM, Xstop, Xrestart). Rien ne se perd, même après un redéploiement.

## 📋 Liste complète des commandes

Préfixe : **`X`** (casse indifférente : `xquiz`, `XQUIZ`, `XQuiz` fonctionnent).

### 🧠 Intelligence & Chat
| Commande | Description |
|---|---|
| `Xask <question>` | Question rapide → réponse IA courte |
| `Xai <demande>` | IA avancée : analyse, rédaction, code |
| `Xinfo` | La fiche d'identité officielle de MeR~NEL |
| `Xchat on/off/status` | Discussion automatique sans préfixe (admins groupe/bot) |
| `Xanime <nom>` | Fiche wiki d'un animé : image + studio, épisodes, note AniList, genres, synopsis |
| `Xpolice <style> <texte>` | Transforme ton texte (20 polices Unicode) — `Xpolice` seul = la liste |
| `Xupt` | Temps d'activité du bot + toutes ses capacités |
| `Xstop` | (Admins) Stoppe/relance le bot dans le groupe — alias de Xoff/Xon |
| `Xrestart` | (Admins) Redémarre le bot — sauvegarde TOUTES les données avant |
| `Xonlyadmin on/off` | Mode « admins uniquement » : le bot ignore les non-admins |
| `Xjarvis on/off` | (Admins bot) Mode JARVIS : cerveau 100 % LOCAL (aucune API) — le bot comprend le français, réfléchit, retient chaque personne et exécute tout à la demande |

> ♻️ **Pool IA 6 fournisseurs SANS clé** (gemini-proxy2 → Pollinations → Shizo
> → Paxsenix → Ryzendesu → OpenAI/pollinations) avec **rotation automatique** :
> panne, timeout, 429 ou page HTML → fournisseur suivant, sans interruption.
> Format OpenAI JSON supporté. Les réponses HTML des APIs ne sont **jamais**
> renvoyées dans le chat (message « cerveau en pause »).

> 😏 **Personnalité** : MeR~NEL n'est PAS ChatGPT — drôle, intelligent,
> empathique, s'énerve vite, fait des blagues et rigole avec le groupe,
> réponses courtes. **Auto-réponse** : réponds à un message du bot ou tague
> `@MeR~NeL` → il répond direct, sans préfixe.

### 💰 Économie
| Commande | Description |
|---|---|
| `Xdaily` | +350 XCoins, cooldown 24 h serveur |
| `Xcoins` | Ton solde + rang |
| `Xp` | Ton XP, niveau et progression |
| `Xrank` | Top 10 XCoins + ta position |

### 🎮 Jeux
| Commande | Description |
|---|---|
| `Xquiz` | Quiz de GROUPE à réponses LIBRES : ID (indices) · MULTIVERS (manga 📚) · CG (thème 🏷️) · CAPITALE · DRAPEAU · EMOJI (devine l'objet 🎯) · ZIK (titre ↔ artiste 🎵) · MÉMORIAL (photo du lieu 🏛️) · LOGO (devine la marque 🏷️). ~2900 questions, vérificateur strict, +10 pts au premier bon, classement final — images indisponibles → item sauté |
| `Xid` | Quiz manga IMAGES UNIQUEMENT — chaîne 4 sources (AniList Referer-fixé → Kitsu → Jikan), 5 à 100 images, vérificateur strict (une autre réponse = faux). Image indisponible → personnage sauté ; sources en panne → message propre, JAMAIS de questions sans image |
| `Xduel` | Duel 1v1 avec mise en XCoins — catégories CG, MULTIVERS, ID, DRAPEAU et EMOJI (drapeau → pays, emoji → objet/animal) |
| `Xbet` | Paris football RÉELS : carte TRIÉE (grosses affiches d'abord), cotes affichées (favori ×1.25, nul ×3.8, jusqu'à ×5 — généreuses sans excès), puissances jamais montrées — `Xbet <n°> <a|b> <v|n|d> <mise>`, min 100 XCoins, 1 pari/match ; **le résultat part TOUT SEUL 30 s après le pari** : somme gagnée/perdue + nouveau solde ; duos jamais répétés |
| `Xrps` | Pierre 🪨 Feuille 📄 Ciseaux ✂️ contre MeR~NeL |
| `Xundercover` | Undercover SOCIAL (3-8 joueurs) : enrôlement 90 s (réponds « moi ») → rôles EN PV (🏛️ civils = 1 mot · 🕵️ undercover = mot proche · ⚪ Mr. White = rien) → indices 15 s/joueur en répondant au bot (jamais 2 indices, jamais modifiables, liste accumulée « 1. Merdi : c'est chaud, brûlant ») → vote 75 s (« vote @pseudo ») : UC démasqué = éliminé DIRECT, Mr. White démasqué = il tente de deviner le mot (bonne réponse = victoire volée +400) — gagnants + « PLUS MALIN » (MVP) + XCoins ; ~4 150 mots / 118 catégories, JAMAIS deux fois le même couple |
| `Xucards` | Boutique des 20 CARTES SpÉCIALES d'Undercover (500 → 1 000 000 XCoins) : achat `Xucards buy <n°>`, utilisation en partie `carte <n°> @cible` (1/joueur/tour) — temps bonus, boucliers, double vote, lettres du mot, sondes, immunité, vol d'identité, dénonciation, élimination directe, œil de MeR~NeL… |
| `Xucrank` | Tableau de RANG des meilleurs joueurs d'Undercover (points = victoires ×10 + plus malin ×15 + bons votes ×3) |
| `Xteam` | (Admins bot) Quiz INTER-ÉQUIPES : groupes (max 4) → recrutement par réponse au message → 5 questions par rubrique × 9 rubriques (ID/MULTIVERS/CG/CAPITALE/DRAPEAU/EMOJI/ZIK/MÉMORIAL/LOGO = 45 questions) → équipe gagnante +200 XCoins/membre, meilleur buteur +600 |
| `Xslots <mise>` | Machine à sous 🎰 — min 50 XCoins, 3 identiques jusqu'à ×25, paire ×2 |
| `Xpile <pile\|face> <mise>` | Pile ou face 🪙 — double ou rien (×2) |
| `Xcourse <n° 1-4> <mise>` | Course de chevaux 🏇 — pari sur 1 des 4, gain ×3.5 |
| `Xlove` | Toi + un membre au hasard = amour parfait : vos photos de profil collées avec un cœur ❤️ |
| `Xfoot` | Quiz football PHOTOS UNIQUEMENT (Wikidata, sans clé) — filtre MULTIVERS (top 200 pros) ou club/sélection (PSG, Real, RDC, Argentine…). Photo indisponible → joueur sauté ; panne → message propre, JAMAIS de questions sans photo |
| `Xgame` | Catalogue des jeux |

### 🖼️ Médias
| Commande | Description |
|---|---|
| `Ximg <desc> [1-5]` | Génération d'images (max 5) |
| `Xplay <morceau>` | Audio ≤ 2 minutes |
| `Xvideo <recherche>` | Vidéo ≤ 2 minutes |

### 👤 Profil
| Commande | Description |
|---|---|
| `Xprofil [@membre]` | CARTE DE PROFIL design MeR~NEL (image 1500×700) : fond violet circuits, ambiance photo floue, avatar à anneaux lumineux, niveau + barre d'XP capsule, XCoins en grand, stats à icônes — + photo de profil ; repli texte si l'image échoue |
| `Xpseudo <nom>` / `Xpseudo @Paul <nom>` / `Xpseudo reset` | Gestion du pseudo |

### 📢 Groupe
| Commande | Description |
|---|---|
| `Xtag all` | Mentionne les membres du groupe |
| `Xannonce` | Annonce guidée + affiche + tag all automatique |

### 🛡️ Admin (réservé aux `ADMIN_UIDS`)
| Commande | Description |
|---|---|
| `Xadmin @membre` | (Admins SUPRÊMES) Nomme un admin — pouvoirs complets mais SANS Xadmin/Xremove (la hiérarchie ne se délègue pas). `Xadmin liste` · persistant (JSON + Neon) |
| `Xremove @membre` | (Admins SUPRÊMES) Retire le rôle admin — suprêmes intouchables · `Xremove tout` vide la liste |
| `Xban` (en réponse à un message) | Bannit le membre (API si possible, sinon côté bot) |
| `Xkick` (en réponse) | Expulsion si l'API le permet |
| `Xclear` / `Xclear 3` | Supprime les derniers messages DU BOT uniquement (limite Messenger) |
| `Xoff` / `Xon` | Éteint / rallume le bot dans CE groupe (silence total, persistant) |
| `Xadd @Paul` / `Xadd <UID>` | Ajoute un membre |

### Divers
`X` (seul) → accueil · `Xmenu` → ce menu · pendant une session : `cancel` annule.

---

## 💬 Gestion des conversations (contexte)

Le bot comprend les réponses successives **sans préfixe** pendant une session :

```
> Xquiz
  「PLEASE CHOOSE YOUR CATEGORY」 ID / MULTIVERS / CG
> CG
  「NOMBRE DE QUESTIONS」 5 / 10 / 15
> 10
  🎮 QUIZ LANCÉ — Thème : CG — 10 Questions — Tout le monde peut jouer !
  🎮 QUESTION 1/10 (message tagué — tout le groupe est mentionné)
  (@Paul RÉPOND au message de la question : « C »)
  ⚡ BONNE RÉPONSE — @Paul prend le point ! (+1)
```

- Sessions **isolées par joueur ET par groupe** (les messages des autres membres
  n'interfèrent pas).
- Expiration automatique après inactivité (défaut : 2,5 min).
- `cancel` annule à tout moment ; les mises de duel sont remboursées.

---

## 📥 Réponses en PV (inbox)

Le bot répond **TOUJOURS aux messages privés** — personne n'est ignoré en DM :

- **Commandes préfixées** (`Xmenu`, `Xquiz`…) : comme en groupe ;
- **Message libre** : le cerveau LOCAL **Jarvis** répond d'abord (maths
  `√144`, probabilités, contexte, identité — gratuit et instantané), et
  l'**IA** prend le relais pour le reste. IA en panne ? Jarvis donne sa
  piste — un PV n'est **jamais** resté sans réponse ;
- **Réponse à un message du bot** : conversation directe ;
- **Commande inconnue en PV** (`Xblorp`) : part dans le cerveau au lieu
  du message « commande inconnue ».

## 🌙 Mode veille automatique

Après **30 minutes d'inactivité** dans une conversation (configurable via
`IDLE_STANDBY_MINUTES`), MeR~NeL s'endort automatiquement :

```
╭━━〔 🌙 MODE VEILLE ⚡ 〕━━╮
🌙 Aucune activité depuis 30 min.
💤 Le système se met en veille pour économiser ses ressources.
⚡ Écris X (ou une commande) pour me réveiller.
╰━━〔 🧬 MeR~NeL 〕━━╯
```

- Pendant la veille, les messages ordinaires sont ignorés (économie d'API,
  de mémoire et de quota) — l'annonce n'est envoyée qu'une seule fois.
- **Réveil instantané** par : n'importe quelle commande ou le préfixe `X`,
  une **mention du bot**, un message d'**admin**, une phrase de réveil
  (« réveil », « wake up »…), l'arrivée d'un **nouveau membre**, ou une
  session de jeu en cours.
- Quand toutes les conversations dorment, les contextes de chat sont
  libérés de la mémoire (hygiène automatique).

## 🗄️ Persistance

Les données survivent aux redémarrages (JSON atomiques + écritures différées) :
`database/data/users.json`, `groups.json`, `stats.json`.

Contenu : XCoins, XP, niveaux, pseudos, daily cooldown, avertissements, mutes,
bannissements, paramètres de groupe (chatMode…), statistiques.

La couche `database/database.js` est **la seule** à toucher aux fichiers :
pour passer sur une vraie BDD (Mongo, Postgres…), réimplémentez cette couche.

---

## 🛡️ Sécurité & honnêteté des fonctionnalités

- `isAdmin(userID)` : toute commande sensible vérifie `ADMIN_UIDS`.
- Validation des entrées (`utils/sanitize.js`), URLs toujours encodées
  (`encodeURIComponent`), aucun HTML/secret dans les réponses.
- Cooldowns par utilisateur, verrous par thread (chat), limites mémoire/taille.
- Erreurs typées (`API_TIMEOUT`, `AI_UNAVAILABLE`…) sans détails techniques sensibles.
- **Aucune fausse réussite** : quand Messenger interdit une action (expulsion,
  suppression de messages d'autrui, mentions…), le bot le dit clairement et
  propose l'alternative — le reste du bot reste fonctionnel.

---

## 🚢 Déploiement sur Render

1. Poussez ce dépôt sur GitHub.
2. Sur [render.com](https://render.com) : **New → Background Worker**
   (ou Web Service — le serveur keep-alive répond sur `/healthz`).
3. Dans *Environment → Environment Variables*, ajoutez **une seule variable
   obligatoire** : `APPSTATE_JSON` = le JSON des cookies du compte bot
   (export *Cookie Editor*, accepté tel quel, sur une seule ligne).
4. Commande de build : `npm install` — commande de démarrage : `npm start`.
5. `render.yaml` est fourni pour un déploiement en un clic (*Blueprint*).

> 🔐 **Avertissement** : la clé Agnes par défaut est visible dans ce dépôt.
> Gardez le dépôt **privé**, ou remplacez-la par la vôtre via la variable
> `AGNES_API_KEY`, ou révoquez-la si elle fuite.

> 📦 **Connexion Messenger** : le bot utilise **`@dongdev/fca-unofficial`**
> (bibliothèque demandée), avec bascule automatique sur `ws3-fca` si besoin
> (variable `FACEBOOK_LIBRARY` pour forcer l'une ou l'autre). L'auto-update du
> package est désactivé dans `fca-config.json` — un bot ne doit jamais changer
> ses propres dépendances en production.

> ⚠️ Sur les plans gratuits, le disque est éphémère : branchez un *Disk* sur
> `database/data` (ou passez sur une vraie BDD) pour conserver l'économie.

---

## 🧪 Tests

```bash
npm test
```

## ☁️ Sauvegarde persistante (Neon — PostgreSQL)

Les XCoins, XP, niveaux, paris, stats et réglages de groupes **survivent à tout** :
redémarrage, redéploiement, changement de machine. Le bot reflète ses données
(`users.json`, `groups.json`, `stats.json`, `bets.json`) dans une base **Neon** :

1. Crée une base gratuite sur [neon.tech](https://neon.tech) et copie la **Connection string** ;
2. Renseigne-la dans la variable d'environnement `DATABASE_URL` (Render → Environment) ;
3. C'est tout — au démarrage le bot **restaure** tout depuis le cloud, puis
   **sauvegarde** toutes les 5 minutes et à chaque extinction propre.

Sans `DATABASE_URL`, le bot tourne normalement sur les JSON locaux.

---

La suite exécute le bot en **mode mock** (aucune connexion Facebook) et couvre :
formateur, permissions, économie (daily/double claim), XP, quiz complet
(catégorie → nombre → réponses), duel (mise insuffisante, victoire, remboursement),
sessions simultanées dans plusieurs groupes, persistance après
redémarrage, refus d'admin pour les non-autorisés, et limites des capacités API.

---

🧬 **MeR~NeL Production** — système en ligne. ⚡

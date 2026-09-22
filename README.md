# 🔵 IDREM TERESHKOVA

**Bot Facebook Messenger modulaire** — 118 commandes, conversation naturelle, économie, jeux, IA, médias, administration de groupes.
Construit sur [`@dongdev/fca-unofficial`](https://www.npmjs.com/package/@dongdev/fca-unofficial) et prêt à être déployé sur **Render**.

![Node](https://img.shields.io/badge/Node-%3E%3D18-3c873a) ![Commandes](https://img.shields.io/badge/commandes-118-0b5cad) ![Tests](https://img.shields.io/badge/self--test-293%2F293-success) ![Licence](https://img.shields.io/badge/licence-MIT-blue)

```
⚡ Système opérationnel
🔵 IDREM TERESHKOVA — v2.0.0
📊 118 commandes actives • 12 catégories
```

---

## Sommaire

1. [Ce que fait le bot](#1-ce-que-fait-le-bot)
2. [Installation locale](#2-installation-locale)
3. [Le fichier account.txt](#3-le-fichier-accounttxt--sécurité)
4. [Déploiement sur Render](#4-déploiement-sur-render)
5. [Conserver les données sur Render](#5-conserver-les-données-sur-render)
6. [Variables d'environnement](#6-variables-denvironnement)
7. [Les 118 commandes](#7-les-118-commandes)
8. [Conversation naturelle et mentions](#8-conversation-naturelle-et-mentions)
9. [Rôles, permissions et modération](#9-rôles-permissions-et-modération)
10. [Anti-spam et stabilité](#10-anti-spam-et-stabilité)
11. [Architecture du projet](#11-architecture-du-projet)
12. [Ajouter une commande](#12-ajouter-une-commande)
13. [Tests intégrés](#13-tests-intégrés)
14. [Sécurité et limites assumées](#14-sécurité-et-limites-assumées)
15. [Dépannage](#15-dépannage)

---

## 1. Ce que fait le bot

| Aspect | Détail |
| --- | --- |
| **118 commandes** | réparties en 12 catégories, chacune dans son propre fichier, chargées automatiquement |
| **Conversation naturelle** | répond aux salutations, remerciements et questions simples, avec des variantes aléatoires — sans jamais spammer ni se répondre à lui-même |
| **Mentions** | détecte `@IDREM…` ou le nom du bot (« IDREM aide-moi ») et répond toujours |
| **`/` seul** | affiche un message « bot disponible » (4 variantes) — jamais une erreur |
| **Commande inconnue** | réponse claire + suggestion de la commande la plus proche, aucun plantage |
| **Préfixe configurable** | global (`/setprefix global !`) ou par groupe (`/setprefix !`), appliqué à chaud |
| **Données séparées** | chaque groupe a ses propres réglages, règles, messages d'accueil, liste anti-lien |
| **Économie + XP** | IDREM Coins (IG), boutique, inventaire, niveaux, classements |
| **Modération** | ban, mute, warn (auto-mute à 3), kick, anti-lien, anti-spam, anti-flood |
| **Administration** | tableau de bord, broadcast, statistiques, journaux, rechargement à chaud, statut maintenance |
| **Persistance** | écritures JSON atomiques, anti-corruption, snapshot distant optionnel |
| **i18n système** | messages système en français ou en anglais (`/language`), le reste reste en français |

---

## 2. Installation locale

```bash
# 1. Récupérer le projet
git clone https://github.com/Zorolefrerot/Bot-zap-idrem.git
cd Bot-zap-idrem

# 2. Installer la seule dépendance
npm install

# 3. Vérifier la configuration (registre, droits, services, sécurité)
npm run check

# 4. Lancer le test complet hors ligne (293 vérifications, aucune connexion Facebook)
npm run selftest

# 5. Ajouter votre session (voir section 3) puis démarrer
cp account.example.txt account.txt   # puis collez vos cookies
npm start
```

**Prérequis :** Node.js 18 ou plus récent (testé sur Node 22). Aucune base de données externe, aucun service payant obligatoire.

---

## 3. Le fichier `account.txt` — sécurité

Le bot se connecte avec **votre compte Facebook** via un fichier `account.txt` placé à la racine.

```
# account.example.txt (modèle, sans donnée réelle)
[{"key":"c_user","value":"VOTRE_UID","domain":".facebook.com","path":"/"},
 {"key":"xs","value":"VOTRE_XS","domain":".facebook.com","path":"/"}]
```

Règles appliquées par le code :

- `account.txt` est dans `.gitignore` : il **ne peut pas** être poussé sur GitHub.
- Son contenu n'est **jamais affiché**, jamais journalisé : `utils/logger.js` applique `sanitize()` sur chaque ligne (cookies, jetons, clés masqués).
- Aucune commande ne peut le lire : `/eval` refuse explicitement toute expression contenant `account`, `cookie`, `appState`, `token`, `password`… et il est désactivé par défaut.
- Si la session expire, le bot prévient le propriétaire, sauvegarde les données puis s'arrête proprement (pas de boucle de reconnexion infinie).

**Ordre de recherche du compte :** `ACCOUNT_FILE` → `account.txt` → `appstate.json` → `FB_APPSTATE` → `FB_COOKIE` → `FB_EMAIL` + `FB_PASSWORD`.

---

## 4. Déploiement sur Render

### Option A — Blueprint (recommandé)

`New +` → **Blueprint** → sélectionnez ce dépôt → Render lit `render.yaml` et crée le service. Il ne reste qu'à remplir les secrets demandés (`OWNER_UID`, `FB_APPSTATE`).

### Option B — Service manuel

| Champ | Valeur |
| --- | --- |
| **Runtime** | Node |
| **Region** | Frankfurt (ou la plus proche) |
| **Branch** | `main` |
| **Root Directory** | *(vide)* |
| **Build Command** | `npm install --no-audit --no-fund \|\| npm install --no-audit --no-fund --ignore-scripts` |
| **Start Command** | `npm start` |
| **Health Check Path** | `/health` |
| **Plan** | Free |

Le double `npm install` couvre le seul cas où la compilation native du **cache SQLite optionnel** de la librairie échoue : le bot fonctionne parfaitement sans lui (`fca-config.json` désactive les fonctions qui en dépendent).

### Variables à saisir dans Render

| Variable | Obligatoire | Valeur |
| --- | --- | --- |
| `NODE_ENV` | oui | `production` |
| `OWNER_UID` | **oui** | votre UID Facebook (`100065927401614`) |
| `FB_APPSTATE` | **oui** | contenu de `account.txt` (le disque Render est éphémère) |
| `PREFIX` | non | `/` |
| `LOG_LEVEL` | non | `info` |
| `HEALTH_SERVER` | oui (Web Service) | `true` |
| `AI_API_KEY`, `AI_PROVIDER`, `AI_MODEL` | non | active `/ai`, `/ask`, `/summarize`, `/explain`, `/code` |
| `IMAGE_API_KEY` | non | active `/image` |
| `MEDIA_API_URL`, `MEDIA_API_TOKEN` | non | active le téléchargement `/ytmp3`, `/ytmp4`, `/tiktok`, `/instagram` |
| `YOUTUBE_API_KEY` | non | active la recherche YouTube par mots-clés (`/yt nom`) |
| `REMOTE_STORE_URL`, `REMOTE_STORE_TOKEN` | non | sauvegarde des données (section 5) |
| `ALLOW_EVAL` | non | `false` — ne l'activez pas |

> ⚠️ **Sans `FB_APPSTATE` ni `account.txt`, le bot s'arrête au démarrage** avec un message explicite en 4 lignes (quoi faire, où le faire). C'est volontaire : il ne tourne jamais à moitié.

---

## 5. Conserver les données sur Render

Le disque d'un service Render gratuit est **réinitialisé à chaque déploiement**. Les fichiers JSON (`data/users.json`, `groups.json`, `settings.json`, `economy.json`, `warnings.json`, `stats.json`, `logs.json`) sont donc perdus si vous ne faites rien.

Deux solutions :

1. **Disque Render** (payant) : montez un disque sur `/opt/render/project/src/data` et définissez `DATA_DIR=data`.
2. **Snapshot distant** (gratuit) : pointez `REMOTE_STORE_URL` vers un petit stockage acceptant `PUT`/`GET` JSON (blob S3, KV, service maison). Le bot :
   - envoie un snapshot toutes les `SNAPSHOT_INTERVAL_MS` (5 min par défaut) et à chaque arrêt ;
   - le restaure au démarrage si le disque local est vide.

`/config storage` et `/admin data` affichent l'état exact de la persistance à tout moment.

---

## 6. Variables d'environnement

Toutes les variables sont documentées dans [`.env.example`](.env.example) et **aucune n'est obligatoire** sauf `OWNER_UID` et la session Facebook.

```bash
cp .env.example .env
node --env-file=.env index.js      # ou : PREFIX="!" npm start
```

Le projet n'utilise **aucune dépendance dotenv** : tout est lu depuis `process.env` et fusionné avec `config.json` (l'environnement est prioritaire).

---

## 7. Les 118 commandes

`/menu` affiche les catégories, `/help <catégorie>` le détail, `/help <commande>` la fiche complète (usage, exemples, accès, cooldown).
Les accès indiqués : **tous** = public · **admin du groupe** = admin Facebook du groupe ou admin du bot · **admin du bot** · **propriétaire**.

### 🔹 Général — 9 commandes

| Commande | Description | Accès |
| --- | --- | --- |
| `/botinfo` (/info, /about, /bot) | Présente le bot : identité, version, statistiques et services externes. | tous |
| `/groupinfo` (/group, /threadinfo, /infogroupe) | Affiche les informations de la conversation (groupe ou discussion privée). | tous |
| `/help` (/aide, /commandes, /cmds) | Affiche l'aide : catégories, commandes d'une catégorie ou détail d'une commande. | tous |
| `/menu` (/categories) | Affiche le menu complet : toutes les catégories et leurs commandes phares. | tous |
| `/ping` (/latence, /pong) | Mesure la latence de réponse du bot. | tous |
| `/profile` (/profil, /me, /moi, /rankcard) | Affiche ton profil (ou celui d'un autre) : niveau, XP, pièces, activité, rôle. | tous |
| `/rules` (/regles, /charte) | Affiche les règles de la conversation. | tous |
| `/uid` (/id, /userid) | Donne ton UID Facebook, ou celui de la personne mentionnée/citée. | tous |
| `/uptime` (/online, /dispo) | Affiche depuis combien de temps le bot est en ligne. | tous |

### 🎮 Jeux — 13 commandes

| Commande | Description | Accès |
| --- | --- | --- |
| `/coin` (/pileface, /flip) | Pile ou face. Tu peux parier des pièces sur ton choix. | tous |
| `/dare` (/defi, /gage) | Tire un défi amusant et sans risque au hasard. | tous |
| `/dice` (/de, /des, /roll) | Lance un ou plusieurs dés (ex. /dice 3d6). | tous |
| `/duel` (/combat, /fight, /battle) | Duel au tour par tour contre un joueur ou contre le bot (XP et pièces). | tous |
| `/guess` (/devine, /nombre, /highlow) | Devine le nombre secret entre 1 et 100 en 8 essais maximum. | tous |
| `/leaderboard` (/classement, /top, /ranking) | Classement des utilisateurs (XP, niveau, pièces, messages, victoires). | tous |
| `/mathgame` (/math, /calcul, /maths) | Défi de calcul mental : résous l'opération en 3 essais. | tous |
| `/qcm` (/serie) | Série de questions à choix multiples avec score et récompenses. | tous |
| `/quiz` (/quizz, /jeuquiz) | Quiz à choix multiples : une question, gagne de l'XP et des pièces. | tous |
| `/riddle` (/devinette, /enigme) | Devinettes : trouve la réponse à l'énigme proposée. | tous |
| `/rps` (/chifumi, /pierrefeuilleciseaux, /pfc) | Pierre, feuille, ciseaux contre le bot (XP et pièces en jeu). | tous |
| `/truth` (/verite) | Tire une question « vérité » au hasard (jeu, sans conséquence). | tous |
| `/word` (/pendu, /hangman, /mot) | Jeu du pendu : trouve le mot lettre par lettre (7 erreurs maximum). | tous |

### 💰 Économie — 11 commandes

| Commande | Description | Accès |
| --- | --- | --- |
| `/balance` (/bal, /solde, /money, /cash, /coins) | Affiche ton solde d'IDREM Coins, tes revenus et l'état de tes cooldowns. | tous |
| `/buy` (/acheter, /achat) | Achète un article de la boutique avec tes IDREM Coins. | tous |
| `/crime` (/braquage, /vol, /heist) | Tente un coup risqué : gros gain ou amende (45 % de réussite). | tous |
| `/daily` (/bonus, /quotidien, /recompense) | Récupère ton bonus quotidien d'IDREM Coins. | tous |
| `/give` (/donner, /offrir, /cadeau) | Offre des IDREM Coins à quelqu'un (équivalent de /transfer). | tous |
| `/inventory` (/inv, /inventaire, /sac, /bag) | Affiche ton inventaire d'objets virtuels et sa valeur. | tous |
| `/rich` (/richest, /fortune, /milliardaire) | Classement des utilisateurs les plus riches en IDREM Coins. | tous |
| `/sell` (/vendre, /vente) | Revend un objet de ton inventaire (50 % du prix d'achat). | tous |
| `/shop` (/boutique, /magasin, /store) | Affiche la boutique : badges, objets et consommables virtuels. | tous |
| `/transfer` (/send, /payer, /pay, /envoyer) | Transfère des IDREM Coins à un autre utilisateur. | tous |
| `/work` (/travail, /job, /travailler) | Travaille pour gagner des IDREM Coins (cooldown 45 min). | tous |

### 💞 Social — 8 commandes

| Commande | Description | Accès |
| --- | --- | --- |
| `/avatar` (/profilepic, /pdp, /avatarpic, /photoprofil) | Affiche la photo de profil publique de quelqu'un (ou la tienne). | tous |
| `/divorce` (/divorcer, /separation) | Met fin à ton mariage virtuel. | tous |
| `/friend` (/ami, /addfriend, /bestie) | Ajoute quelqu'un à ta liste d'amis du bot (ou l'en retire). | tous |
| `/friends` (/amis, /myfriends, /listeamis) | Affiche ta liste d'amis enregistrée par le bot. | tous |
| `/love` (/amour, /compatibilite, /lovecheck) | Mesure la compatibilité amoureuse entre deux personnes (100 % divertissement). | tous |
| `/marry` (/marier, /mariage, /wedding) | Épouse virtuellement quelqu'un (divertissement, sans valeur réelle). | tous |
| `/rank` (/level, /niveau, /xpcard, /carteniveau) | Affiche le niveau, l'XP et la position au classement d'un utilisateur. | tous |
| `/ship` (/shipper, /couple, /match) | Associe deux personnes et affiche leur compatibilité (divertissement). | tous |

### 🧰 Utilitaires — 11 commandes

| Commande | Description | Accès |
| --- | --- | --- |
| `/calc` (/calculer, /calculette, /compute, /calculatrice) | Calcule une expression mathématique de façon sécurisée (sans eval). | tous |
| `/convert` (/conversion, /taux, /change, /unites) | Convertit des devises (taux en ligne) ou des unités (longueur, masse, volume, température). | tous |
| `/date` (/jour, /aujourdhui, /today) | Affiche la date du jour, le numéro de semaine et la progression de l'année. | tous |
| `/define` (/definition, /dico, /wiktionary) | Donne la définition d'un mot (Wiktionnaire, ou Wikipédia pour les noms propres). | tous |
| `/qr` (/qrcode, /qr-code) | Génère un QR code image à partir d'un texte ou d'une URL. | tous |
| `/remind` (/rappel, /reminder, /rappelemoi) | Programme un rappel (30s, 5m, 2h, 1j…) envoyé dans cette conversation. | tous |
| `/search` (/wiki, /wikipedia, /recherche, /chercher) | Recherche un sujet sur Wikipédia et en donne un résumé (API publique). | tous |
| `/short` (/shorten, /url, /lien, /shorturl) | Raccourcit une URL longue via un service public (is.gd / TinyURL). | tous |
| `/time` (/heure, /clock, /horloge) | Affiche l'heure actuelle, éventuellement pour une ville précise. | tous |
| `/translate` (/trad, /traduire, /traduction) | Traduit un texte (détection automatique de la langue source). | tous |
| `/weather` (/meteo, /weatherforecast, /temps) | Affiche la météo d'une ville : conditions actuelles et prévisions. | tous |

### 🧠 IA — 6 commandes

| Commande | Description | Accès |
| --- | --- | --- |
| `/ai` (/gpt, /chat, /ia) | Discute avec l'IA configurée (OpenAI, Groq, OpenRouter…). | tous |
| `/ask` (/question, /demande, /demandeai) | Pose une question à l'IA et reçois une réponse courte et directe. | tous |
| `/code` (/coder, /dev, /programme, /programmer, /snippet) | Génère ou explique du code dans le langage demandé (nécessite une IA). | tous |
| `/explain` (/explique, /expliquer, /vulgarise, /eli5) | Explique un sujet de façon structurée (définition, utilité, exemple, vigilance). | tous |
| `/image` (/img, /generer, /draw, /dessine) | Génère une image à partir d'une description (nécessite un service d'images). | tous |
| `/summarize` (/resume, /tl, /synthese) | Résume un texte long en quelques phrases ou en puces (nécessite une IA). | tous |

### 🎭 Fun — 12 commandes

| Commande | Description | Accès |
| --- | --- | --- |
| `/8ball` (/boule, /oracle, /destin, /eightball) | Pose une question fermée à la boule magique (divertissement). | tous |
| `/character` (/personnage, /portrait, /charactercard) | Dresse un portrait humoristique de quelqu'un (traits et manies tirés au sort). | tous |
| `/compliment` (/complimente, /gentil, /praise) | Envoie un compliment (corpus local, toujours positif). | tous |
| `/fact` (/fait, /savais, /funfact) | Donne un fait surprenant (corpus local, vérifié à la rédaction). | tous |
| `/gayrate` (/gaymeter, /gay) | Mesure humoristique absurde (stable par jour) — sans aucune signification réelle. | tous |
| `/joke` (/blague, /rigole, /humour) | Raconte une blague courte (corpus local, sans service externe). | tous |
| `/meme` (/memes, /marrant, /funny) | Envoie un mème depuis des sources publiques (avec repli textuel local assumé). | tous |
| `/pp` (/pprofile, /photo2profil, /profilpic) | Affiche la photo de profil réelle avec un verdict humoristique (score du jour). | tous |
| `/quote` (/citation, /phrase, /inspire) | Affiche une citation (corpus local). | tous |
| `/rate` (/note, /noter, /evaluer) | Note sur 10 (toi, quelqu'un, ou un concept) — résultat stable pour la journée. | tous |
| `/roast` (/taquine, /clash, /insulte) | Envoie une taquinerie humoristique (toujours bon enfant, jamais haineuse). | tous |
| `/simp` (/simprate, /simpnation) | Mesure humoristique de la « simpitude » (stable par jour, sans sérieux). | tous |

### 🎬 Médias — 10 commandes

| Commande | Description | Accès |
| --- | --- | --- |
| `/instagram` (/ig, /insta, /reels) | Récupère une publication Instagram via un service conforme (MEDIA_API_URL). | tous |
| `/lyrics` (/paroles, /lyric, /songtext) | Affiche les paroles d'un titre (LRCLIB, service libre sans clé). | tous |
| `/play` (/music, /musique, /song, /ecouter) | Récupère l'audio d'un titre via un service conforme, sinon oriente vers les vraies alternatives. | tous |
| `/sticker` (/stickers, /autocollant, /emojigrand) | Renvoie un autocollant Messenger (par ID, ou celui reçu dans la conversation). | tous |
| `/tiktok` (/tt, /tiktokmp4) | Affiche les informations publiques d'une vidéo TikTok (et la récupère si MEDIA_API_URL est branché). | tous |
| `/toimg` (/toimage, /voirimage, /imagefromfile) | Renvoie la photo/image reçue (message courant ou cité) sous forme d'image. | tous |
| `/tomp3` (/toaudio, /mp3from, /extraire-audio) | Renvoie l'audio reçu, ou extrait l'audio d'une vidéo via un service conforme. | tous |
| `/yt` (/youtube, /video) | Recherche ou affiche les informations publiques d'une vidéo YouTube. | tous |
| `/ytmp3` (/mp3, /ytaudio, /youtube-mp3) | Récupère l'audio d'une vidéo YouTube via un service conforme (MEDIA_API_URL). | tous |
| `/ytmp4` (/mp4, /ytvideo, /youtube-mp4) | Récupère la vidéo d'un lien YouTube via un service conforme (MEDIA_API_URL). | tous |

### 👥 Groupes — 12 commandes

| Commande | Description | Accès |
| --- | --- | --- |
| `/admins` (/adminsgroupe, /adminlist, /responsables) | Liste les administrateurs du groupe courant. | tous • groupe |
| `/antilink` (/nolink, /liens, /links, /antipub) | Bloque les liens non autorisés dans le groupe (avec liste blanche par domaine). | admin du groupe • groupe |
| `/antispam` (/antiflood, /flood, /protection) | Active ou consulte la protection anti-flood du groupe. | admin du groupe |
| `/goodbye` (/aurevoir, /au-revoir, /depart) | Active, désactive ou teste le message d'au revoir du groupe. | admin du groupe • groupe |
| `/members` (/membres, /liste, /participants, /qui) | Liste les membres du groupe (effectif, noms connus, administrateurs). | tous • groupe |
| `/setgoodbye` (/goodbyemsg, /au-revoir-msg, /setau-revoir, /setaurevoir) | Définit le message d'au revoir du groupe (avec placeholders). | admin du groupe • groupe |
| `/setrules` (/rules-set, /setregles, /changerules) | Définit les règles du groupe affichées par /rules. | admin du groupe • groupe |
| `/setwelcome` (/welcomemsg, /bienvenue-msg, /setbienvenue) | Définit le message de bienvenue du groupe (avec placeholders). | admin du groupe • groupe |
| `/tagall` (/all, /mentionall, /tous, /pingall) | Mentionne tous les membres du groupe (admins uniquement, limité à 50 mentions). | admin du groupe • groupe |
| `/warn` (/avertir, /avertissement, /warning) | Donne un avertissement à un membre (mute automatique au seuil défini). | admin du groupe • groupe |
| `/warnings` (/warns, /avertissements, /warnlist) | Consulte, retire ou efface les avertissements des membres du groupe. | admin du groupe • groupe |
| `/welcome` (/bienvenue, /accueil, /bonjour-nouveau) | Active, désactive ou teste le message de bienvenue du groupe. | admin du groupe • groupe |

### ⚙️ Configuration — 4 commandes

| Commande | Description | Accès |
| --- | --- | --- |
| `/config` (/configuration, /conf, /showconfig) | Affiche la configuration effective du bot (secrets masqués). | admin du bot |
| `/language` (/langue, /lang, /setlanguage, /setlang) | Choisit la langue des messages système du bot pour ce groupe (fr / en). | admin du groupe |
| `/reset` (/reinit, /wipe, /erase, /effacer) | Réinitialise les réglages du groupe, ton profil, ou toutes les données (propriétaire). | tous |
| `/settings` (/config-groupe, /reglages, /parametres) | Affiche et modifie les réglages du groupe (indépendants des autres groupes). | admin du groupe • groupe |

### 📊 Statistiques — 8 commandes

| Commande | Description | Accès |
| --- | --- | --- |
| `/commands` (/commandlist, /listcommands, /allcommands) | Liste les commandes que tu peux utiliser, par catégorie, avec recherche. | tous |
| `/groups` (/groupes, /threads, /conversations, /groupelist) | Liste les groupes et conversations connus du bot, avec leurs réglages. | admin du bot |
| `/logs` (/journal, /log, /historique, /logbot) | Consulte le journal interne du bot (niveaux, périmètres, recherche). | admin du bot |
| `/mystats` (/messtats, /mystatistics, /mes-stats) | Tes statistiques personnelles : XP, niveau, messages, commandes, jeux, classements. | tous |
| `/stats` (/statistiques, /statistic, /botstats, /chiffres) | Statistiques globales du bot : usage, utilisateurs, groupes, erreurs, uptime. | admin du bot |
| `/topcommands` (/topcmd, /bestcommands, /populaires) | Classement des commandes les plus utilisées (et des inconnues les plus tapées). | tous |
| `/topusers` (/topuser, /meilleurs, /topplayers, /topjoueurs) | Classement des utilisateurs par XP, niveau, solde, messages ou victoires. | tous |
| `/users` (/userlist, /utilisateurs, /profiles) | Liste, recherche et gère les utilisateurs du bot (rôles réservés au propriétaire). | admin du bot |

### 🛡️ Administration — 13 commandes

| Commande | Description | Accès |
| --- | --- | --- |
| `/admin` (/dashboard, /panel, /console) | Tableau de bord : état du bot, services, données, erreurs et modération. | admin du bot |
| `/ban` (/banuser, /bannir, /blacklist) | Bannit un utilisateur du bot (toutes conversations) avec une raison. | admin du bot |
| `/broadcast` (/bc, /annonce, /diffusion, /annoncer) | Diffuse un message aux groupes, aux utilisateurs ou aux administrateurs. | propriétaire |
| `/kick` (/expulser, /remove, /eject) | Expulse un membre du groupe courant (le bot doit être admin du groupe). | admin du groupe • groupe |
| `/mute` (/silence, /taisezvous, /muette, /tempmute) | Rend un utilisateur muet dans ce groupe pendant une durée donnée. | admin du groupe |
| `/reload` (/reloadcommands, /refresh, /recharger) | Recharge les fichiers de commandes à chaud et signale les erreurs. | admin du bot |
| `/restart` (/reboot, /redemarrer) | Sauvegarde les données puis redémarre le processus du bot. | propriétaire |
| `/setname` (/nickname, /rename, /renomme, /settitle) | Change le pseudo du bot dans la conversation, ou le nom du groupe. | admin du bot |
| `/setprefix` (/prefix, /prefixe, /changeprefix) | Affiche ou change le préfixe des commandes (ce groupe, ou global pour les admins). | admin du groupe |
| `/setstatus` (/status, /mode, /maintenance, /statut) | Affiche ou change le mode du bot : actif, maintenance ou silencieux. | admin du bot |
| `/shutdown` (/stop, /eteindre, /poweroff, /off) | Sauvegarde les données et arrête le bot (arrêt propre). | propriétaire |
| `/unban` (/deban, /unbanuser) | Lève le bannissement d'un utilisateur (ou liste les bannis). | admin du bot |
| `/unmute` (/demute, /unmuteall, /libere) | Lève le mute d'un utilisateur (ou de tout le groupe). | admin du groupe |

> `/eval` existe mais reste **caché** de l'aide, réservé au propriétaire, et **désactivé en production** sauf `ALLOW_EVAL=true` explicite.

---

## 8. Conversation naturelle et mentions

Le bot ne se contente pas d'exécuter des commandes : il participe à la conversation, avec retenue.

| Déclencheur | Exemples | Réponse |
| --- | --- | --- |
| Salutation | `bonjour`, `salut`, `hello`, `bonsoir`, `yo`, `coucou` | plusieurs variantes aléatoires |
| Remerciement | `merci`, `thanks`, `thx` | variantes courtes |
| Question simple | `ça va ?`, `qui es-tu ?`, `tu peux m'aider ?` | réponses adaptées + orientation vers `/menu` |
| Mention | `@IDREM aide-moi`, `idrem tu peux m'aider ?` | **réponse systématique** (`mentionAlwaysReplies`) |
| Message ordinaire | `blabla…` | ignoré la plupart du temps |

Garde-fous (tous réglables dans `config.json` → `conversation`) :

- `probability` 0.5 en privé, `groupProbability` 0.25 en groupe ;
- `threadCooldownMs` 45 s par conversation, `userCooldownMs` 90 s par utilisateur ;
- `minTextLength` 2 — les messages trop courts sont ignorés ;
- `ignoreBots` — **le bot ne répond jamais à ses propres messages** (vérifié par le self-test) ;
- aucun message de conversation ne répète la variante précédente.

---

## 9. Rôles, permissions et modération

| Rôle | Obtention | Pouvoirs |
| --- | --- | --- |
| **OWNER** | `OWNER_UID` dans `config.json`/environnement — jamais stocké en base | tout, dont `/eval`, `/broadcast`, `/reload`, `/users role` |
| **ADMIN** | promu par le propriétaire (`/users role <uid> admin`) | commandes `admin`, modération globale |
| **GROUPADMIN** | admin Facebook du groupe (détecté via l'API) | modération **de son groupe uniquement** |
| **USER** | tout le monde | commandes publiques |

Règles inviolables, vérifiées par le self-test :

- un utilisateur **ne peut pas s'auto-promouvoir** (`setRole(uid, "admin", { by: uid })` → refusé) ;
- le rôle `owner` **n'est pas attribuable** : `VALID_ROLES = ["user", "admin"]` ;
- un refus affiche exactement : `⛔ Accès refusé. Cette commande est réservée aux administrateurs.` ;
- une commande `groupOnly` utilisée en privé répond `👥 /commande ne fonctionne que dans un groupe.` ;
- la vérification se fait **avant** toute exécution : rien ne fuit.

---

## 10. Anti-spam et stabilité

| Protection | Réglage (`config.json` → `limits`) | Effet |
| --- | --- | --- |
| Cooldown global | `globalCooldownMs` 900 ms | un message toutes les ~0,9 s par utilisateur |
| Cooldown par commande | champ `cooldown` de chaque commande | message d'attente avec le temps restant |
| Anti-flood | `floodMessages` 6 / `floodWindowMs` 6 s | pause de `floodMuteMs` 60 s + avertissement unique |
| Anti-doublon | `dedupeTtlMs` 5 min | le même `messageID` n'est jamais traité deux fois |
| Avis de maintenance | — | annoncé **une seule fois** par utilisateur |
| Longueur | `maxMessageLength` 4000 | réponses découpées proprement |
| Erreurs | — | une commande qui plante n'arrête **jamais** le bot : l'utilisateur reçoit « ⚠️ Une erreur est survenue… », le détail technique part dans les journaux (nettoyé) |

`/stats errors` et `/logs error` montrent les dernières erreurs côté propriétaire.

---

## 11. Architecture du projet

```
Bot-zap-idrem/
├── index.js                 point d'entrée : --start, --check, --selftest, --version
├── config.json              identité, devise, XP, limites, économie, sécurité
├── fca-config.json          options de la librairie (auto-update désactivé, etc.)
├── account.example.txt      modèle de session (sans donnée réelle)
├── core/                    cœur — aucune logique de commande ici
│   ├── bot.js               createBotApp() : assemble config, services, registre, dispatcher
│   ├── registry.js          chargement automatique de commands/**, alias, catégories
│   ├── dispatcher.js        middleware unique : préfixe, garde, commandes, conversation, événements de groupe
│   ├── context.js           ctx (message) + bag (services, helpers) passés aux commandes
│   ├── guard.js             ban, mute, flood, cooldowns, permissions, groupe requis
│   ├── errors.js            UserError vs erreur technique, messages utilisateurs
│   └── lifecycle.js         signaux, perte de session, redémarrage propre
├── commands/                118 commandes, une par fichier
│   ├── general/  games/  economy/  social/  utility/  ai/
│   ├── fun/      media/  admin/    groups/  config/   stats/
├── services/                logique métier (testable sans Messenger)
│   ├── store.js             écritures JSON atomiques, anti-corruption, flush groupé
│   ├── users.js  xp.js  economy.js  groups.js  settings.js
│   ├── warnings.js  stats.js  logs.js  scheduler.js
│   ├── conversation.js  corpus.js  games.js
│   └── external/            tout ce qui sort du bot
│       ├── ai.js  media.js  weather.js  translate.js  define.js
│       ├── search.js  meme.js  shortener.js  currency.js  qr.js  lyrics.js
│       └── http.js          fetch + timeout + retry
├── utils/                   config, logger, text (style 🔵⚫⚪), random, math,
│                            permissions, i18n, moderation, helpers, account,
│                            health-server, selftest
└── data/                    JSON runtime (ignoré par Git)
```

**Principe :** le cœur ne contient aucune logique de commande, les commandes ne contiennent aucune logique de connexion. Chaque couche est remplaçable et testable séparément.

---

## 12. Ajouter une commande

Créez un fichier dans `commands/<catégorie>/` — il est chargé automatiquement au démarrage (ou à chaud via `/reload`).

```js
// commands/fun/hello.js
"use strict";

const { box, ICONS } = require("../../utils/text");

module.exports = {
  name: "hello",              // /hello
  aliases: ["bonjour"],       // /bonjour
  category: "fun",            // défaut : le dossier
  description: "Salue l'utilisateur.",
  usage: "/hello [prénom]",
  examples: ["/hello", "/hello Alice"],
  permissions: "public",      // public | user | groupadmin | admin | owner
  cooldown: 3,                // secondes
  groupOnly: false,
  hidden: false,

  async execute(ctx, bag) {
    const who = ctx.argString || ctx.senderName || "toi";
    return box("SALUT", [`${ICONS.ok} Bonjour ${who} !`], { icon: ICONS.robot });
  }
};
```

Contrat :

- **retourner une chaîne** → elle est envoyée telle quelle ;
- `ctx.send(...)`, `ctx.sendImage(...)`, `ctx.sendSticker(...)`, `ctx.sendTo(threadID, ...)` pour les envois multiples ;
- **erreur utilisateur** → `throw new bag.errors.UserError("Texte clair")` (affiché tel quel) ;
- toute autre exception est attrapée par `core/errors.js` : l'utilisateur reçoit le message générique, les journaux reçoivent le détail nettoyé.

`bag` contient : `config`, `logger`, `text`, `random`, `math`, `helpers`, `services`, `registry`, `permissions`, `guard`, `errors`, `api`, `bot`, `botUserID`, `store`, `sendTo`, `logs`, `elapsed`.
`ctx` contient : `threadID`, `senderID`, `senderName`, `isGroup`, `prefix`, `args`, `argString`, `command`, `mentions`, `attachments`, `participantIDs`, `groupAdminIDs`, `api`, `typing()`, `resolveTarget()`.

---

## 13. Tests intégrés

```bash
npm run check      # diagnostic de configuration (~1 s)
npm run selftest   # test complet hors ligne (~4 min)
```

`npm run selftest` démarre une **application isolée** (dossier de données temporaire, fausse API Messenger reproduisant les signatures réelles de la librairie) et exécute réellement les commandes :

| Section | Vérifié |
| --- | --- |
| 0 | démarrage isolé, registre, rôles |
| 1 | message `/` seul (variantes FR + EN) |
| 2 | commande inconnue, suggestion, espace toléré |
| 3 | le bot ne se répond jamais, doublons ignorés |
| 4 | les 9 commandes générales |
| 5 | jeux + gain réel d'XP |
| 6 | économie : soldes, cooldown `/daily`, transferts |
| 7 | social |
| 8 | utilitaires (dont `/calc 2+3*4` = 14 et refus d'injection de code) |
| 9 | IA non configurée → refus honnête, jamais de faux résultat |
| 10 | fun |
| 11 | médias : aucun contournement, refus expliqué, pièces jointes réelles |
| 12 | permissions : phrase exacte de refus, groupe requis, auto-promotion impossible |
| 13 | administration : ban/mute/kick effectifs, préfixe à chaud, maintenance, `/reload` |
| 14 | groupes : réglages indépendants, anti-lien, warns, événements arrivée/départ (formats v4 **et** hérités) |
| 15 | configuration + langue (FR/EN) |
| 16 | statistiques réellement incrémentées |
| 17 | conversation naturelle, mentions, limite anti-spam |
| 18 | cooldowns et anti-flood |
| 19 | aucune donnée sensible dans les messages ni les journaux |
| 20 | persistance : 7 fichiers JSON écrits et valides |
| 21 | **balayage des 118 commandes** : aucune ne plante, toutes répondent proprement |
| 22 | une commande qui échoue ne tue pas le bot |

Dernier résultat connu : **293/293 vérifications réussies**.
`/restart` et `/shutdown` ne sont volontairement pas exécutés (ils arrêtent le processus) : seul leur contrôle d'accès est testé.

---

## 14. Sécurité et limites assumées

**Ce que le bot refuse de faire :**

- ⛔ **Contourner les protections des plateformes.** Aucun téléchargement « magique » : `/ytmp3`, `/ytmp4`, `/tiktok`, `/instagram`, `/play` passent par **votre** service intermédiaire (`MEDIA_API_URL`), dont vous assumez les conditions d'utilisation. Sans lui, un message explique quoi configurer.
- ⛔ **Inventer des résultats.** IA, génération d'image, médias, clés API manquantes → « service non configuré », jamais de fausse réponse.
- ⛔ **Afficher des secrets.** Cookies, jetons, clés, `account.txt` : masqués dans les messages, les journaux et les erreurs (`utils/logger.js` → `sanitize()`).
- ⛔ **`/eval` en production.** Caché, réservé au propriétaire, désactivé dès que `NODE_ENV=production` sauf `ALLOW_EVAL=true`, et il refuse toute expression touchant aux identifiants.
- ⛔ **Auto-promotion.** Aucun chemin ne permet de devenir ADMIN ou OWNER soi-même.

**Services externes sans clé** (fonctionnent immédiatement) : Open-Meteo, MyMemory, Wiktionnaire/Wikipédia, meme-api/Reddit, is.gd/TinyURL, open.er-api.com, api.qrserver.com, lrclib.net, oEmbed YouTube/TikTok.

**Services à clé** (optionnels) : IA texte, génération d'image, téléchargement média, recherche YouTube.

> Utilisez ce bot dans le respect des [conditions d'utilisation de Facebook](https://www.facebook.com/policies) et de celles des plateformes tierces. Un compte dédié est fortement recommandé.

---

## 15. Dépannage

| Symptôme | Cause probable | Solution |
| --- | --- | --- |
| `⛔ Démarrage impossible : ACCOUNT_NOT_FOUND` | pas de session | créez `account.txt` ou définissez `FB_APPSTATE` sur Render |
| Déconnexion après quelques heures | session expirée / checkpoint | régénérez les cookies ; le bot prévient le propriétaire avant de s'arrêter |
| `Database initialization error` dans les logs | cache SQLite non compilé | sans effet : `fca-config.json` désactive les fonctions concernées |
| Le bot ne répond pas dans un groupe | préfixe différent par groupe | `/settings` affiche le préfixe actif ; `/setprefix /` le réinitialise |
| « service non configuré » sur `/ai` | `AI_API_KEY` absente | renseignez `AI_PROVIDER` + `AI_API_KEY` (ou `GROQ_API_KEY`, `OPENROUTER_API_KEY`) |
| Données perdues après déploiement | disque Render éphémère | section 5 : `REMOTE_STORE_URL` ou disque persistant |
| `/restart` ne relance pas | Render relance le process lui-même | `restartOnFailure: true` + code de sortie 3 gérés par `core/lifecycle.js` |
| Trop de réponses en groupe | probabilité de conversation | `/settings conversation off` ou `CONVERSATION_PROBABILITY=0.2` |

Commandes utiles : `/config services` (état des services externes), `/admin data` (persistance), `/stats errors`, `/logs error`, `/settings`.

---

## Licence

MIT — voir [`LICENSE`](LICENSE) si présent. Projet personnel, sans affiliation avec Meta/Facebook.

# 🤖 IDREM TERESHKOVA BOT

> **Connectez votre compte WhatsApp et générez votre Session ID.**

Bot WhatsApp complet (Node.js + **Baileys**) avec **dashboard web moderne** (thème sombre cyber / anime-tech, responsive) pour :

- 🔗 **Appairer** un compte WhatsApp par **Pair Code** (`XXXX-XXXX`) ou QR code,
- 🆔 **Générer une Session ID** sécurisée au format `IDREM-TERESHKOVA-…`,
- 📷 **Récupérer les médias « Vue unique »** avec `/vv` (image, vidéo, audio),
- 🎨 **Créer des stickers** personnalisés (pack + auteur modifiables à chaud),
- 👑 **Administrer le bot** depuis WhatsApp ou le dashboard (préfixe, admin, broadcast, restart…).

Aucune donnée sensible (credentials WhatsApp, secrets) n'est exposée dans le frontend, les logs ou Git.

---

## 📑 Sommaire

1. [Fonctionnalités](#-fonctionnalités)
2. [Technologies](#-technologies)
3. [Architecture du projet](#-architecture-du-projet)
4. [Installation](#-installation)
5. [Pair Code & Session ID](#-pair-code--session-id)
6. [Commandes WhatsApp](#-commandes-whatsapp)
7. [`/vv` — View Once en détail](#-vv--view-once-en-détail)
8. [Stickers en détail](#-stickers-en-détail)
9. [API REST](#-api-rest)
10. [Variables d'environnement](#-variables-denvironnement)
11. [Déploiement](#-déploiement)
12. [Tests](#-tests)
13. [Sécurité](#-sécurité)
14. [Dépannage](#-dépannage)

---

## ✨ Fonctionnalités

| Domaine | Détail |
|---|---|
| **Connexion** | Pair Code `XXXX-XXXX`, QR code de secours, statuts *En attente de connexion → Pairing… → Connecté*, reconnexion automatique |
| **Session ID** | Format `IDREM-TERESHKOVA-` + 43 caractères aléatoires (256 bits, base64url), copie, régénération (rotation), reprise sans ré-appairage |
| **Bot** | 22 commandes modulaires (un fichier par commande), anti-spam (cooldown), gestion groupes/privés, permissions admin strictes |
| **Médias** | Stickers image (sharp, 512×512, EXIF pack/auteur), stickers animés + `/tovideo` `/toaudio` (ffmpeg), `/vv` View Once |
| **Dashboard** | Pages `/` (connexion), `/dashboard`, `/docs` — statut 🟢, téléphone, admin, préfixe, sticker, Session ID, logs récents non sensibles, Disconnect / Reconnect / Copy / Regenerate |
| **API** | REST JSON validée (zod), authentification Bearer/cookie, rate-limiting, helmet, CORS contrôlé |
| **Persistance** | Base JSON atomique (`data/db.json`), credentials Baileys chiffrés par la lib (`sessions/`), configuration modifiable à chaud |

---

## 🧰 Technologies

**Backend** — Node.js ≥ 20 (ESM), Express 4, [`@whiskeysockets/baileys` 6.7.24](https://github.com/WhiskeySockets/Baileys) (avec override npm `libsignal@6.0.0`), `sharp`, `node-webpmux`, `zod`, `pino`, `helmet`, `express-rate-limit`, `qrcode`, `@hapi/boom`, `dotenv`.

**Frontend** — Vite 7, React 18, React Router 6. Build statique servi par Express **ou** hébergé séparément (GitHub Pages / Vercel).

**Optionnel** — `ffmpeg` (stickers animés, `/tovideo`, `/toaudio`), `pm2` (VPS), Docker.

---

## 🏗️ Architecture du projet

```
Bot-zap-idrem/
├── src/
│   ├── index.js              # Point d'entrée (serveur + bot)
│   ├── config/               # defaults.js, env.js (zod-safe, sans secret affiché)
│   ├── auth/                 # sessionId.js, sessionStore.js, pairing.js
│   ├── bot/                  # client.js (socket Baileys), manager.js, loader.js, handler.js
│   ├── commands/             # 1 fichier = 1 commande
│   │   ├── admin/            # status, restart, shutdown, broadcast, setprefix,
│   │   │                     # setsticker, setadmin, setname, session
│   │   ├── bot/              # menu, help, ping, runtime, info, owner
│   │   ├── media/            # vv  ← View Once
│   │   ├── sticker/          # sticker, toimg, tovideo, toaudio
│   │   └── tools/            # del, pp
│   ├── events/               # connectionUpdate, groupsUpdate
│   ├── database/             # jsonStore.js (atomique), index.js (settings, chats, stats)
│   ├── utils/                # crypto, phone, errors, logger, format, exif, sticker,
│   │                         # ffmpeg, menu, validate, message, process, system, tempfile
│   └── web/                  # server.js, middleware/, routes/ (API REST)
├── frontend/                 # Dashboard React (Vite) — src/, dist/ (build)
├── scripts/doctor.js         # Diagnostic d'installation : npm run doctor
├── tests/                    # Suite node:test (unit + média + commandes + flux bot)
├── Dockerfile                # Image prod (Node 22 + ffmpeg)
├── render.yaml               # Blueprint Render (disque persistant /data)
├── ecosystem.config.cjs      # PM2 (VPS)
├── .env.example              # Modèle de configuration
└── package.json
```

**Flux de données** : `WhatsApp ⇄ Baileys (bot/client.js) → handler.js → commands/* → réponses`. Le dashboard agit via l'API REST (`web/routes/*`) sur le `botManager` et la base JSON. La Session ID n'est qu'une **référence serveur** vers le dossier de credentials — elle ne contient aucun secret WhatsApp.

---

## 🚀 Installation

### Prérequis

- **Node.js ≥ 20** (22 LTS recommandé) et npm
- **ffmpeg** (optionnel mais recommandé : stickers animés, `/tovideo`, `/toaudio`)
  - Debian/Ubuntu : `sudo apt-get install ffmpeg`
  - macOS : `brew install ffmpeg`
  - Windows : [ffmpeg.org](https://ffmpeg.org/download.html) puis renseigner `FFMPEG_PATH`

### Étapes

```bash
# 1. Cloner
git clone https://github.com/Zorolefrerot/Bot-zap-idrem.git
cd Bot-zap-idrem

# 2. Installer les dépendances (backend)
npm install

# 3. Builder le dashboard
npm run build

# 4. Configurer l'environnement
cp .env.example .env
#    Éditer .env : DASHBOARD_PASSWORD, SESSION_SECRET, ADMIN_NUMBER, ADMIN_NAME...

# 5. Diagnostic complet (recommandé)
npm run doctor

# 6. Démarrer
npm start          # production
npm run dev        # développement (nodemon + Vite dev server avec proxy API)
```

Le serveur écoute sur `http://localhost:3000` (API **et** dashboard). `npm run dev` lance le backend + le frontend Vite (hot-reload, proxy `/api` → `:3000`).

---

## 🔗 Pair Code & Session ID

### 1. Générer un Pair Code

1. Ouvrez le dashboard (page **/** « Connexion »).
2. Remplissez le formulaire : **ADMIN_NUMBER** (votre numéro WhatsApp, format international sans `+`, ex. `243970000000`), **ADMIN_NAME**, **PREFIX**, **STICKER_NAME**, et le **numéro WhatsApp** à connecter.
3. Cliquez sur **« Générer Pair Code »**.
4. Un code **`XXXX-XXXX`** s'affiche (bouton copier). Les statuts défilent : **En attente de connexion → Pairing… → Connecté**.
5. Sur votre téléphone : **WhatsApp → Réglages → Appareils connectés → Connecter un appareil → Connecter avec un numéro de téléphone** → saisissez le code.

> Le code expire vite (~60 s). Si le statut reste bloqué, cliquez à nouveau sur « Générer Pair Code ».

### 2. Session ID

Dès que la connexion passe à **Connecté**, une **Session ID** est générée automatiquement :

```
IDREM-TERESHKOVA-8Kt3vRzQmW1xP9nLbYc2DfGhJkM4pS7uVxZ0aE5rTw
```

- **Copier** : bouton dédié sur le dashboard.
- **Régénérer** : fait tourner la référence (les credentials WhatsApp restent les mêmes — pas de ré-appairage).
- **Persistance** : les credentials sont stockés dans `sessions/` ; après redémarrage, le bot se reconnecte **sans nouveau Pair Code** tant que la session est valide (bouton **Reconnect**).
- La Session ID est une référence **opaque** : elle ne contient ni clés, ni identifiants WhatsApp. Ne la partagez pas publiquement : elle identifie votre instance.

### 3. Dashboard

La page **/dashboard** affiche : **BOT STATUS 🟢**, téléphone connecté, administrateur, préfixe, nom du sticker, Session ID (copier / régénérer), nombre de commandes par catégorie, logs récents (non sensibles) et les boutons **Disconnect / Reconnect**.

---

## 💬 Commandes WhatsApp

Préfixe par défaut : `/` (modifiable : `/setprefix !`, dashboard, ou `PREFIX`).
Menu envoyé par `/menu` :

```
╭━━━〔 IDREM TERESHKOVA 〕━━━╮
┃  👑 ADMIN
┃  ⚡ BOT
┃  🛠️ TOOLS
┃  🎨 STICKER
┃  📥 MEDIA
╰━━━━━━━━━━━━━━━━━━━━━━╯
```

### ⚡ BOT

| Commande | Description |
|---|---|
| `/menu` | Menu principal par catégories |
| `/help [cmd]` | Aide générale ou détail d'une commande |
| `/ping` | Latence du bot |
| `/runtime` | Durée de fonctionnement |
| `/info` | Informations sur le bot |
| `/owner` | Carte de contact (vCard) de l'administrateur |

### 👑 ADMIN (réservées à `ADMIN_NUMBER`)

| Commande | Description |
|---|---|
| `/status` | État complet : connexion, session, admin, préfixe, mémoire, ffmpeg |
| `/restart` | Redémarre le processus du bot |
| `/shutdown` | Éteint proprement le bot |
| `/broadcast <texte> [--group\|--private]` | Diffuse aux conversations connues (ou en répondant à un média) |
| `/setprefix <p>` | Change le préfixe (1–3 caractères, symboles comme `/ ! . # ::` ou une lettre) |
| `/setsticker <pack\|auteur>` | Change pack/auteur des stickers |
| `/setadmin <numéro>` | Change le numéro administrateur |
| `/setname <nom>` | Change le nom affiché du bot |
| `/session` | Affiche la Session ID **en privé uniquement** (refusée en groupe) |

### 🎨 STICKER

| Commande | Description |
|---|---|
| `/sticker` | Image → sticker WebP 512×512 (EXIF pack + auteur) ; vidéo/gif → sticker animé (ffmpeg) |
| `/toimg` | Sticker WebP → image PNG |
| `/tovideo` | Sticker animé → vidéo MP4 (ffmpeg) |
| `/toaudio` | Vidéo → audio MP3 (ffmpeg) |

### 📥 MEDIA

| Commande | Description |
|---|---|
| `/vv` | Récupère un média **Vue unique** (voir [section dédiée](#-vv--view-once-en-détail)) |

### 🛠️ TOOLS

| Commande | Description |
|---|---|
| `/del` | Supprime un message du bot (admin du groupe requis) |
| `/pp` | Photo de profil du bot ou d'un utilisateur cité |

---

## 📷 `/vv` — View Once en détail

`/vv` récupère un média envoyé en **« Vue unique »** (view once) via les mécanismes **officiels de la bibliothèque Baileys** (`downloadMediaMessage`, avec `updateMediaMessage` pour le re-upload si WhatsApp renvoie 410). **Aucun contournement** des protections WhatsApp n'est effectué : tant que le média est disponible côté serveurs WhatsApp pour votre session, il est récupérable ; sinon, une erreur claire est renvoyée.

**Deux modes d'emploi :**

1. **En réponse** au message Vue unique : répondez au média puis envoyez `/vv`.
2. **Direct** : envoyez le média Vue unique au bot avec la commande en légende (`/vv`).

**Réponses :**

| Cas | Réponse |
|---|---|
| Image | renvoi de l'image + `📷 Image View Once récupérée.` |
| Vidéo | renvoi de la vidéo + `🎥 Vidéo View Once récupérée.` |
| Audio | renvoi de l'audio + `🎵 Audio View Once récupéré.` |
| Média expiré / supprimé (410/404) | `❌ Média expiré ou déjà supprimé des serveurs WhatsApp.` |
| Accès refusé (403) | `❌ Accès refusé par WhatsApp pour ce média.` |
| Aucun média détecté | `❌ Aucun média View Once détecté.` + guide d'utilisation |

> ⚠️ Le média Vue unique doit être **reçu par le bot** (envoyé au bot ou dans un groupe où il est présent). `/vv` ne peut pas récupérer un média envoyé à un autre compte.

---

## 🎨 Stickers en détail

- **Pack** (nom du sticker) = `STICKER_NAME` (défaut : `IDREM TERESHKOVA`)
- **Auteur** = `ADMIN_NAME` (ou `STICKER_AUTHOR` si défini)
- Modifiables **à chaud** : `/setsticker MonPack|MonAuteur`, dashboard (page Connexion / Config), ou variables d'env.
- Images : conversion **sharp** → WebP 512×512, injection **EXIF** (node-webpmux) — aucune dépendance externe.
- Vidéos/gifs animés : **ffmpeg** requis (message d'erreur explicite en français s'il est absent).
- Répondre à un sticker avec `/sticker MonPack|MonAuteur` re-marque le sticker existant.

---

## 🌐 API REST

Base : `http://VOTRE-SERVEUR/api`. Auth : `POST /api/auth/login` `{ "password": "…" }` → token Bearer (12 h) + cookie httpOnly. Certaines routes acceptent aussi `X-Api-Key` (`API_KEY`).

| Méthode | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | ✗ | Sonde de vie (uptime, connexion WhatsApp) |
| GET | `/api/commands` | ✗ | Catalogue des commandes par catégorie |
| POST | `/api/auth/login` | ✗ (rate-limit) | Connexion dashboard → token |
| POST | `/api/auth/logout` | cookie | Déconnexion |
| GET | `/api/auth/me` | ✓ | Profil de session courant |
| GET | `/api/status` | ✓ | État complet (bot, WhatsApp, admin, session, commandes) |
| POST | `/api/pair` | ✓ | `{ "phoneNumber": "243…", adminNumber?, adminName?, prefix?, stickerName?, stickerAuthor?, botName? }` → `{ pairCode: "XXXX-XXXX" }` |
| GET | `/api/pair` | ✓ | Dernier code généré (sans donnée sensible) |
| GET | `/api/qr` | ✓ | QR code de secours (data URL) |
| GET | `/api/session` | ✓ | `{ generated, session, status }` — Session ID |
| POST | `/api/session/regenerate` | ✓ | Rotation de la Session ID (mêmes credentials) |
| POST | `/api/reconnect` | ✓ | Reconnexion sans ré-appairage |
| POST | `/api/disconnect` | ✓ | Déconnexion propre |
| GET | `/api/config` | ✓ | Configuration courante (masquée) |
| POST | `/api/config` | ✓ | Mise à jour validée (zod) : prefix, admin, sticker… |
| GET | `/api/logs` | ✓ | Logs récents **sanitisés** (aucun secret) |

Erreurs : `400` validation (messages en français), `401` non autorisé, `409` état invalide (ex. session déjà active), `429` rate-limit, `503` WhatsApp injoignable.

---

## ⚙️ Variables d'environnement

Toutes documentées dans [`.env.example`](.env.example). Les principales :

| Variable | Défaut | Description |
|---|---|---|
| `PORT` / `HOST` | `3000` / `0.0.0.0` | Écoute HTTP |
| `DASHBOARD_PASSWORD` | généré (affiché 1× dans les logs) | Mot de passe dashboard/API |
| `SESSION_SECRET` | généré | Signature des tokens (à fixer en production) |
| `API_KEY` | — | Accès machine-to-machine optionnel |
| `ALLOWED_ORIGINS` | — | CORS pour frontend hébergé séparément (virgules) |
| `ADMIN_NUMBER` | — | Numéro admin, format international sans `+` (ex. `243970000000`) |
| `ADMIN_NAME` | — | Nom de l'admin (aussi auteur des stickers) |
| `BOT_NAME` | `IDREM TERESHKOVA BOT` | Nom affiché partout |
| `PREFIX` | `/` | Préfixe des commandes |
| `STICKER_NAME` | `IDREM TERESHKOVA` | Pack des stickers |
| `DATA_DIR` / `SESSION_DIR` / `LOG_DIR` / `TMP_DIR` | `./data` `./sessions` `./logs` `./tmp` | Stockage (**à persister !**) |
| `FFMPEG_PATH` | auto | Chemin ffmpeg si hors PATH |
| `AUTO_RECONNECT` | `true` | Reconnexion au démarrage si session valide |
| `WA_BROWSER_OS` / `WA_BROWSER_NAME` / `WA_VERSION` | `Ubuntu` / `IDREM Tereshkova` / auto | Identité du device Baileys |

Frontend (build Vite uniquement) : `VITE_API_URL` (URL de l'API si hébergé ailleurs), `VITE_BASE_PATH` (ex. `/Bot-zap-idrem/` pour GitHub Pages), `VITE_PROXY_TARGET` (dev).

---

## ☁️ Déploiement

### Backend — Render (recommandé)

Le dépôt contient un **Blueprint** [`render.yaml`](render.yaml) (runtime Docker, disque persistant `/data`, healthcheck `/api/health`) :

1. Poussez le dépôt sur GitHub.
2. Render → **New +** → **Blueprint** → sélectionnez le dépôt.
3. Renseignez `DASHBOARD_PASSWORD`, `ADMIN_NUMBER`, `ADMIN_NAME` (variables `sync: false`).
4. Déployez. L'URL publique sert l'API **et** le dashboard.

> 💾 Le disque persistant (`/data` → sessions, base, logs) exige un plan payant (Starter+). Sans disque, chaque redéploiement efface la session WhatsApp : regénérez un Pair Code depuis le dashboard.

### Backend — Docker (VPS, Railway, Fly.io…)

```bash
docker build -t idrem-tereshkova-bot .
docker run -d --name idrem-bot -p 3000:3000 \
  -e DASHBOARD_PASSWORD="mot-de-passe-fort" \
  -e SESSION_SECRET="$(openssl rand -base64 48)" \
  -e ADMIN_NUMBER=243XXXXXXXXX -e ADMIN_NAME="Mon Nom" \
  -v idrem-data:/data \
  idrem-tereshkova-bot
```

### Backend — VPS avec PM2

```bash
npm install -g pm2
npm ci --omit=dev && npm run build
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

Placez un reverse proxy (nginx/caddy, TLS) devant le port 3000.

### Frontend séparé — GitHub Pages / Vercel

Le backend ne peut **pas** tourner sur Vercel/Netlify (serverless = pas de WebSocket persistant) : hébergez-y seulement le **frontend**, le backend restant sur Render/VPS.

```bash
cd frontend
VITE_API_URL=https://votre-backend.onrender.com npm run build
# GitHub Pages : ajoutez VITE_BASE_PATH=/nom-du-repo/
```

- **Vercel** : importez le dépôt, *Root directory* = `frontend`, env `VITE_API_URL`.
- **GitHub Pages** : poussez `frontend/dist` (branche `gh-pages`) ; le SPA fallback (`public/404.html`) est inclus.
- Côté backend, autorisez l'origine : `ALLOWED_ORIGINS=https://votre-frontend.vercel.app`.

---

## 🧪 Tests

```bash
npm test        # node:test — 104 tests
npm run doctor  # diagnostic d'installation
```

Couverture : utilitaires (téléphone, JID, crypto/tokens, validation, logger sanitizé), médias réels (conversions sharp, EXIF webpmux, aller-retour PNG↔WebP), chargement des 22 commandes, menus, et **flux bot complet** avec socket Baileys doublée (routage, permissions admin, `/vv` tous cas d'erreur, stickers réels, broadcast, groupes).

---

## 🔐 Sécurité

- `.env`, `sessions/`, `data/`, `logs/`, `credentials/`, `auth/` sont **exclus de Git** (`.gitignore`).
- **Aucun secret dans les logs** : le logger sanitise mots de passe, tokens, Session ID et clés.
- **Aucune donnée WhatsApp dans le frontend** : la Session ID est une référence serveur opaque ; les credentials restent dans `sessions/` (chiffrés par Baileys).
- API : authentification (Bearer/cookie httpOnly + `SESSION_SECRET` signé), rate-limiting (global, login, pair), helmet (CSP, anti-clickjacking), CORS sur liste blanche, validation zod stricte, erreurs HTTP normalisées.
- `/session` refusée en groupe ; commandes admin vérifiées contre `ADMIN_NUMBER` côté serveur.

---

## 🛟 Dépannage

| Problème | Solution |
|---|---|
| `npm install` échoue sur `libsignal` (dépôt git) | Déjà traité : `overrides.libsignal = 6.0.0` (registre npm). Refaites `rm -rf node_modules package-lock.json && npm install` si besoin. |
| Pair Code → erreur `503 WhatsApp injoignable` | Réseau sortant bloqué (proxy/pare-feu). Le serveur doit pouvoir joindre `web.whatsapp.com:443` en WebSocket. |
| Code refusé / expiré sur le téléphone | Régénérez un Pair Code (validité ~60 s) et saisissez-le sans espaces. Vérifiez l'indicatif pays. |
| Session perdue après redéploiement | `SESSION_DIR`/`DATA_DIR` non persistés → montez un volume/disque (Render : plan Starter + disque `/data`). |
| `❌ ffmpeg introuvable…` sur `/tovideo`, `/toaudio`, sticker vidéo | Installez ffmpeg ou fixez `FFMPEG_PATH`. Les stickers **image** fonctionnent sans ffmpeg. |
| `❌ Média expiré…` sur `/vv` | Le média Vue unique a déjà été ouvert trop longtemps / supprimé des serveurs WhatsApp. Récupérez-le dès réception. |
| Le bot ne répond plus aux commandes | `/status` (admin) ou `GET /api/health` ; vérifiez le préfixe courant (`GET /api/config`) ; **Reconnect** sur le dashboard. |
| Port déjà utilisé | Changez `PORT` ; `npm run doctor` vérifie la disponibilité. |
| Dashboard blanc sur GitHub Pages | Build fait sans `VITE_BASE_PATH=/nom-du-repo/` — rebuild avec la variable. |
| `429 Too Many Requests` | Rate-limit atteint (défaut : 200 req/15 min, 5 pair/15 min). Ajustez `RATE_LIMIT_*` / `PAIR_RATE_LIMIT_MAX`. |
| Mot de passe oublié | Redéfinissez `DASHBOARD_PASSWORD` dans `.env` (ou variable d'env Render) et redémarrez. |

---

## 📄 Licence

MIT — projet **IDREM TERESHKOVA BOT**. WhatsApp est une marque de Meta Platforms, Inc. ; ce projet n'est pas affilié à Meta. Utilisation sous votre responsabilité (respectez les Conditions d'utilisation de WhatsApp).

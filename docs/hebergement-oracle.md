# ☁️ Héberger MeR~NeL 24H/24 GRATUITEMENT sur Oracle Cloud (Always Free)

Guide pas-à-pas — comptez **30 à 45 minutes**. À la fin, ton bot tourne
24H/24/365 sur un vrai serveur, sans s'endormir, et tes données (XCoins, XP,
niveaux…) sont **permanentes**.

---

## 🧭 Étape 0 — Ce qu'il te faut

| Élément | Détail |
|---|---|
| Une carte bancaire | **Vérification d'identité uniquement** — jamais débitée sur Always Free |
| Un compte e-mail | Gmail ok |
| L'appstate du compte bot | Le JSON de cookies Facebook (comme sur Render) — voir Étape 7 |
| Un PC avec terminal | Windows (PowerShell), Mac ou Linux |

> 💡 Oracle reste gratuit **à vie** tant que tu restes sur les ressources
> « Always Free ». Ne crée QUE ce qui est décrit dans ce guide.

---

## 1️⃣ Étape 1 — Créer le compte Oracle Cloud (5 min)

1. Va sur **https://www.oracle.com/cloud/free/**
2. Clique **Start for free** et remplis le formulaire.
3. Choisis ta **région (Home Region)** avec soin : ⚠️ **elle ne pourra plus être changée**.
   - Depuis la RDC/Afrique centrale : **Francfort (eu-frankfurt-1)**, **Paris**
     ou **Marseille** = bonne latence et stock de serveurs ARM correct.
4. Entre la carte bancaire (vérification ~1 € temporaire, remboursé).
5. Une fois le compte actif, connecte-toi sur **cloud.oracle.com**.
   - Si on te propose « Start a free trial / Upgrade » → **ignorer**,
     le compte **Free Tier** suffit.

---

## 2️⃣ Étape 2 — Créer le serveur (la VM) (10 min)

1. Menu ☰ → **Compute → Instances → Create Instance**.
2. **Name** : `mer-nel`
3. **Image** : **Ubuntu 22.04** (ou 24.04) —Canonical Ubuntu, pas d'autre.
4. **Shape** : clique **Change shape** → **Ampere A1** (`VM.Standard.A1.Flex`) :
   - **2 OCPU** et **12 GB RAM** → c'est le palier Always Free.
   - Si « Out of capacity » s'affiche → réessaie plus tard (matin/soir),
     ou change d'Availability Domain, ou recrée l'instance : c'est LE problème
     classique d'Oracle, ça finit toujours par passer.
5. **Boot volume** : mets **50 GB** (tu as 200 Go gratuits au total).
6. **SSH keys** : coche **Generate a key pair** →
   - **Download Private Key** → garde précieusement `mer-nel.key`
     (SANS elle, plus d'accès au serveur !)
7. **Create** → attends que l'instance passe en 🟢 **RUNNING**.
8. Note l'**adresse IP publique** (ex : `152.228.x.x`) affichée sur la page.

> 🔒 Inutile d'ouvrir des ports : le bot se connecte À Facebook (sortie).
> Le port 22 (SSH) est déjà ouvert.

---

## 3️⃣ Étape 3 — Se connecter au serveur (2 min)

Windows : ouvre **PowerShell** dans le dossier où tu as mis `mer-nel.key` :

```powershell
# Une seule fois — retirer la protection du fichier clé :
icacls mer-nel.key /inheritance:r /grant:r "$($env:USERNAME):(R)"

# Connexion (remplace l'IP par la tienne) :
ssh -i mer-nel.key ubuntu@152.228.x.x
```

Mac/Linux : `chmod 600 mer-nel.key` puis la même commande `ssh -i …`.
Quand on te demande `Are you sure you want to continue connecting?` → `yes`.

Tu vois `ubuntu@mer-nel:~$` ? **Tu es sur ton serveur.** 🎉

---

## 4️⃣ Étape 4 — Installer Node.js et les outils (5 min)

Copie-colle ces blocs (clic droit = coller dans le terminal) :

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git build-essential python3 make g++
```

Node.js 20 (LTS) :

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # doit afficher v20.x
```

> ⚠️ `build-essential` + `python3` sont **indispensables** : la bibliothèque
> Messenger du bot compile du code natif (sqlite3) à l'installation.

---

## 5️⃣ Étape 5 — Récupérer le bot (1 min)

```bash
git clone -b arena/01a0c906-bot-zap-idrem https://github.com/Zorolefrerot/Bot-zap-idrem.git mer-nel
cd mer-nel
```

> Astuce : quand ta branche sera fusionnée dans `main` (PR GitHub),
> tu pourras cloner simplement `https://github.com/Zorolefrerot/Bot-zap-idrem.git`.

---

## 6️⃣ Étape 6 — Installer les dépendances (3-5 min)

```bash
npm install
```

Ça compile du natif : **laisse finir sans interrompre** (2-5 min sur ARM).

---

## 7️⃣ Étape 7 — Le fichier .env (le cerveau de la connexion) (5 min)

Il faut le **APPSTATE_JSON** : les cookies de session du **compte Facebook bot**.

1. Sur ton PC, connecte le compte bot sur facebook.com (navigation privée conseillée).
2. Installe l'extension **Cookie Editor** (Chrome/Firefox).
3. Sur facebook.com → icône Cookie Editor → **Export → Export as JSON**.
   Tu obtiens un tableau JSON `[ { "name": …, "value": … }, … ]`.
4. **Le mieux** : si tu utilisais déjà Render, reprends la même variable
   `APPSTATE_JSON` que tu avais collée dans le dashboard Render (Settings → Environment).
5. Sur le serveur, crée le fichier :

```bash
nano .env
```

Colle ceci (Ctrl+V), en remplaçant les valeurs :

```env
PORT=3000
ADMIN_UIDS=61569333774600,100065927401614
OWNER_UID=100065927401614
APPSTATE_JSON=[{"name":"c_user","value":"…"},{"name":"xs","value":"…"},…]
```

- **Tout le JSON sur UNE SEULE ligne**, entouré d'apostrophes simples `'…'`
  si tu as le moindre souci.
- Sauvegarde : **Ctrl+O → Entrée**, quitte : **Ctrl+X**.

> 🔐 `.env` est dans `.gitignore` : il ne sera JAMAIS envoyé sur GitHub.

---

## 8️⃣ Étape 8 — Premier lancement (test) (2 min)

```bash
npm start
```

Tu dois voir :

```
╭━━〔 🧬 MeR~NeL ⚡ 〕━━╮
[facebook] bibliothèque Messenger : @dongdev/fca-unofficial
[facebook] connecté ✓
[keepAlive] écoute sur 0.0.0.0:3000 (/healthz)
```

**Teste ton bot sur Messenger** (envoie `X` à ton bot). Tout répond ? Parfait.
Arrête-le avec **Ctrl+C** — on passe au mode 24H/24.

> ❗ Erreur type `login-approval` / `checkpoint` : Facebook a détecté une
> nouvelle localisation. Re-exporte les cookies (Étape 7) juste après t'être
> reconnecté au compte bot, et réessaie. Ça ne se produit généralement qu'une fois.

---

## 9️⃣ Étape 9 — 24H/24 avec pm2 (redémarrage auto inclus) (3 min)

```bash
sudo npm install -g pm2
pm2 start index.js --name mer-nel
pm2 save
pm2 startup
```

`pm2 startup` **affiche une commande `sudo …`** → copie-colle-la telle quelle
et valide. C'est elle qui dit « redémarre le bot si le serveur redémarre ».

Commandes utiles :

```bash
pm2 status          # le bot tourne ? (status online)
pm2 logs mer-nel    # les messages du bot en direct (Ctrl+C pour sortir)
pm2 restart mer-nel # redémarrer
pm2 stop mer-nel    # arrêter
```

✅ **C'est fini.** Ton bot tourne maintenant 24H/24/365 :
crash → redémarrage auto · reboot serveur → redémarrage auto · données → permanentes.

---

## 🔟 Étape 10 — Au quotidien

**Mettre à jour le bot** (quand de nouvelles versions arrivent sur GitHub) :

```bash
cd ~/mer-nel
git pull
npm install        # seulement si package.json a changé
pm2 restart mer-nel
```

**Sauvegarde des données** (XCoins, XP, pseudos…) :

```bash
tar -czf ~/backup-mer-nel-$(date +%F).tar.gz -C ~/mer-nel/database data
```

Pour la récupérer sur ton PC : `scp -i mer-nel.key ubuntu@152.228.x.x:~/backup-mer-nel-*.tar.gz .`

**Vérifier que tout vit** : `pm2 monit` (CPU/RAM en direct, `q` pour sortir).

---

## 🆘 Dépannage rapide

| Problème | Solution |
|---|---|
| `Permission denied (publickey)` en SSH | La clé : `icacls mer-nel.key /inheritance:r /grant:r "$($env:USERNAME):(R)"` (Windows) ou `chmod 600` (Mac/Linux) — et vérifie l'IP |
| « Out of capacity » à la création | Réessaie à un autre moment / change d'Availability Domain — classique sur ARM gratuit |
| `npm install` échoue sur sqlite | `sudo apt install -y build-essential python3` puis recommence |
| `checkpoint` / `login-approval` au login | Re-exporte les cookies Cookie Editor et remplace `APPSTATE_JSON` |
| Le bot ne répond pas mais tourne | `pm2 logs mer-nel` → si « connecté ✓ » absent, remplace l'appstate |
| J'ai perdu la clé SSH | Instance → Console cloud (bouton « Lancer la console ») ou recrée l'instance |

## 🛡️ Règles d'or pour rester à 0 € à vie

1. Ne crée **que** cette instance (pas de load balancer, pas de base gérée).
2. N'active **pas** « Upgrade to Paid » — la carte sert uniquement à la vérification.
3. Ton bot utilise le réseau en continu : c'est exactement le profil qui
   reste hors de la politique de récupération des instances gratuites inactives.
4. Garde `mer-nel.key` et ton `.env` **privés** (jamais dans GitHub, jamais en photo).

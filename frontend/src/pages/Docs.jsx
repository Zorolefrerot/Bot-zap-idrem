import { useMemo } from 'react';
import api from '../api/client.js';
import Spinner from '../components/Spinner.jsx';
import { Card } from '../components/Card.jsx';
import { usePolling } from '../hooks/usePolling.js';

const SECTIONS = [
  {
    id: 'pair-code',
    title: 'Pair Code — connecter WhatsApp',
    body: [
      'Le Pair Code est le mécanisme d’appairage officiel pris en charge par Baileys : aucun QR n’est nécessaire.',
      'Depuis la page d’accueil, renseignez le numéro à connecter (format international, sans « + ») puis cliquez sur « Générer Pair Code ».',
      'Sur le téléphone : WhatsApp → Appareils connectés → Connecter un appareil → « Connecter avec un numéro de téléphone », puis saisissez le code affiché (valide ~60 secondes).',
      'Le bot rejoint alors votre compte comme appareil lié : vos conversations restent sur votre téléphone.',
    ],
  },
  {
    id: 'session-id',
    title: 'Session ID',
    body: [
      'Dès que WhatsApp est connecté, une Session ID est générée automatiquement. Elle commence obligatoirement par IDREM-TERESHKOVA-.',
      'C’est une référence opaque (32 octets aléatoires, encodage base64url) vers les credentials stockés sur votre serveur. Elle ne contient aucune clé WhatsApp et ne permet pas, à elle seule, d’accéder à votre compte.',
      'Elle est régénérable depuis le dashboard sans refaire de Pair Code. Au redémarrage du serveur, le bot se reconnecte avec la session stockée si elle est toujours valide.',
    ],
  },
  {
    id: 'vv',
    title: 'Commande /vv — View Once',
    body: [
      'Répondez à un média en vue unique avec /vv : le bot détecte automatiquement le type (image, vidéo, audio) et vous le renvoie en clair.',
      'Image → « 📷 Image View Once récupérée. » ; Vidéo → « 🎥 Vidéo View Once récupérée. » ; Audio → « 🎵 Audio View Once récupéré. »',
      'Si aucun média en vue unique n’est détecté, le bot répond : « ❌ Répondez à un média View Once… ».',
      'Le fonctionnement repose uniquement sur le déchiffrement standard des médias reçus par la bibliothèque Baileys (avec re-upload automatique si WhatsApp l’exige). Aucun contournement de protection n’est utilisé : un média expiré côté serveur renvoie une erreur explicite.',
    ],
  },
  {
    id: 'stickers',
    title: 'Stickers',
    body: [
      'Répondez à une image avec /sticker (ou /s) : le média est converti en WebP 512×512 puis marqué avec votre pack et votre auteur.',
      'Pack et auteur proviennent du dashboard (STICKER_NAME et STICKER_AUTHOR, ce dernier retombant sur ADMIN_NAME).',
      'Personnalisation ponctuelle : /sticker NomDuPack|Auteur.',
      'Depuis une URL : /sticker https://exemple.com/image.png.',
      'Les stickers animés (vidéo ≤ 10 s) et les commandes /tovideo et /toaudio nécessitent ffmpeg sur le serveur.',
    ],
  },
  {
    id: 'admin',
    title: 'Administration',
    body: [
      'Le numéro défini dans ADMIN_NUMBER est reconnu comme propriétaire. En l’absence de configuration, le numéro WhatsApp connecté au bot est considéré comme administrateur (anti-verrouillage).',
      'Commandes réservées : /restart, /shutdown, /broadcast, /setprefix, /setsticker, /setadmin, /setname, /status, /session.',
      'Un utilisateur non autorisé reçoit : « ⛔ Commande réservée à l’administrateur du bot. »',
    ],
  },
  {
    id: 'api',
    title: 'API',
    body: [
      'GET /api/health (public) · GET /api/commands (public)',
      'POST /api/auth/login · POST /api/auth/logout · GET /api/auth/me',
      'POST /api/pair · GET /api/pair · GET /api/status · GET /api/session · POST /api/session/regenerate',
      'POST /api/reconnect · POST /api/disconnect · GET /api/qr · GET /api/config · POST /api/config · GET /api/logs',
      'Authentification : cookie HTTP-only, en-tête Authorization: Bearer <token>, ou X-Api-Key. Les endpoints sensibles sont limités en débit.',
    ],
  },
];

export default function Docs() {
  const { data, loading } = usePolling(() => api.commands(), { interval: 60000 });

  const categories = useMemo(() => data?.categories || [], [data]);
  const prefix = data?.prefix || '/';

  return (
    <div className="page page--docs">
      <header className="page__header">
        <div>
          <h1 className="page__title">Documentation</h1>
          <p className="page__subtitle">
            Toutes les commandes de <strong>{data?.botName || 'IDREM TERESHKOVA BOT'}</strong>, leur usage et les concepts clés.
          </p>
        </div>
      </header>

      <Card title={`Commandes disponibles (${data?.total ?? '…'})`} subtitle={`Préfixe actuel : ${prefix}`}>
        {loading && !data ? (
          <Spinner />
        ) : (
          <div className="commands commands--docs">
            {categories.map((category) => (
              <section key={category.id} className="command-group">
                <h3 className="command-group__title">
                  <span aria-hidden="true">{category.icon}</span> {category.label}
                  <span className="command-group__count">{category.commands.length}</span>
                </h3>
                <ul className="command-list command-list--rich">
                  {category.commands.map((command) => (
                    <li key={command.name} className="command command--rich">
                      <div className="command__head">
                        <code className="command__name">
                          {prefix}
                          {command.name}
                        </code>
                        {command.aliases?.length > 0 && (
                          <span className="command__aliases">alias : {command.aliases.map((a) => prefix + a).join(', ')}</span>
                        )}
                        {command.ownerOnly && <span className="tag tag--owner">owner</span>}
                        {command.adminOnly && <span className="tag tag--admin">admin</span>}
                        {command.groupOnly && <span className="tag tag--group">groupe</span>}
                        {command.privateOnly && <span className="tag tag--private">privé</span>}
                      </div>
                      <p className="command__desc">{command.description}</p>
                      <p className="command__usage">
                        <strong>Usage</strong> <code>{command.usage}</code>
                      </p>
                      {command.examples?.length > 0 && (
                        <p className="command__examples">
                          <strong>Exemples</strong> {command.examples.map((example) => <code key={example}>{example}</code>)}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid--docs">
        {SECTIONS.map((section) => (
          <Card key={section.id} title={section.title} className="docs-section">
            <ul className="docs-list">
              {section.body.map((line) => (
                <li key={line.slice(0, 24)}>{line}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}

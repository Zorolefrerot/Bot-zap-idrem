import { useEffect, useMemo, useState } from 'react';
import api, { ApiError } from '../api/client.js';
import Button from '../components/Button.jsx';
import CopyBox from '../components/CopyBox.jsx';
import Field from '../components/Field.jsx';
import Spinner from '../components/Spinner.jsx';
import StatusPill from '../components/StatusPill.jsx';
import { Card, StatCard } from '../components/Card.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useActionState } from '../hooks/useActionState.js';
import { usePolling } from '../hooks/usePolling.js';
import { formatDuration } from '../utils/format.js';

const SETTINGS_FIELDS = [
  { key: 'adminNumber', label: 'ADMIN_NUMBER', placeholder: '243970000000', hint: 'Numéro(s) administrateur(s), séparés par des virgules si besoin.' },
  { key: 'adminName', label: 'ADMIN_NAME', placeholder: 'Merdi', hint: 'Nom affiché de l’administrateur (et auteur des stickers par défaut).' },
  { key: 'prefix', label: 'PREFIX', placeholder: '/', hint: 'Déclencheur des commandes WhatsApp.' },
  { key: 'stickerName', label: 'STICKER_NAME', placeholder: 'IDREM TERESHKOVA', hint: 'Nom du pack de stickers.' },
  { key: 'stickerAuthor', label: 'STICKER_AUTHOR', placeholder: 'Merdi', hint: 'Auteur des stickers (vide = ADMIN_NAME).' },
  { key: 'botName', label: 'BOT_NAME', placeholder: 'IDREM TERESHKOVA BOT', hint: 'Nom affiché du bot.' },
];

export default function Dashboard() {
  const toast = useToast();

  const { data: status, refresh: refreshStatus, error: statusError, loading: statusLoading } = usePolling(() => api.status(), {
    interval: 4000,
  });
  const { data: commands, refresh: refreshCommands } = usePolling(() => api.commands(), { interval: 30000 });
  const { data: logsData, refresh: refreshLogs } = usePolling(() => api.logs(80), { interval: 8000 });

  const disconnectAction = useActionState(2000);
  const reconnectAction = useActionState(2000);
  const sessionAction = useActionState(2000);
  const configAction = useActionState(2500);

  const [form, setForm] = useState(null);

  const connected = Boolean(status?.whatsapp?.connected);
  const session = status?.session?.sessionId ? status.session : null;

  useEffect(() => {
    if (!status?.settings || form) return;
    const s = status.settings;
    setForm({
      adminNumber: s.adminNumber || '',
      adminName: s.adminName || '',
      prefix: s.prefix || '/',
      stickerName: s.stickerName || '',
      stickerAuthor: s.stickerAuthorExplicit ? s.stickerAuthor : '',
      botName: s.botName || '',
    });
  }, [status, form]);

  const setField = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const run = async (action, task, successMessage) => {
    action.start();
    try {
      await task();
      action.succeed(successMessage);
      toast.success(`${successMessage}.`);
      await refreshStatus();
    } catch (error) {
      action.fail('Échec');
      toast.error(error instanceof ApiError ? error.message : 'Action impossible.');
    }
  };

  const handleSaveConfig = async (event) => {
    event.preventDefault();
    configAction.start();
    try {
      const payload = {};
      for (const field of SETTINGS_FIELDS) {
        const value = String(form?.[field.key] ?? '').trim();
        if (value) payload[field.key] = value;
        else if (field.key === 'stickerAuthor' || field.key === 'adminNumber') payload[field.key] = '';
      }
      await api.updateConfig(payload);
      configAction.succeed('Enregistré');
      toast.success('Configuration enregistrée.');
      setForm(null);
      await Promise.all([refreshStatus(), refreshCommands()]);
    } catch (error) {
      configAction.fail('Refusé');
      toast.error(error instanceof ApiError ? `${error.message}${error.details ? ` ${error.details}` : ''}` : 'Enregistrement impossible.');
    }
  };

  const groupedCommands = useMemo(() => commands?.categories || [], [commands]);
  const logs = useMemo(() => (logsData?.logs || []).slice().reverse(), [logsData]);

  if (statusLoading && !status) {
    return (
      <div className="page page--centered">
        <Spinner />
        <p className="muted">Chargement du dashboard…</p>
      </div>
    );
  }

  if (statusError && !status) {
    return (
      <div className="page page--centered">
        <p className="empty">Impossible de joindre l’API ({statusError.message}).</p>
        <Button onClick={() => window.location.reload()} icon="↻">
          Recharger
        </Button>
      </div>
    );
  }

  return (
    <div className="page page--dashboard">
      <header className="page__header">
        <div>
          <h1 className="page__title">Dashboard</h1>
          <p className="page__subtitle">
            {status?.bot?.name || 'IDREM TERESHKOVA BOT'} — pilotage du bot et de la session WhatsApp.
          </p>
        </div>
        <div className="page__actions">
          <StatusPill status={status?.whatsapp?.status || 'idle'} />
          <Button
            variant="subtle"
            size="sm"
            status={reconnectAction.state}
            successLabel="Relancé"
            errorLabel="Échec"
            icon="↻"
            onClick={() => run(reconnectAction, () => api.reconnect(), 'Reconnexion lancée')}
            disabled={connected}
          >
            Reconnect
          </Button>
          <Button
            variant="danger"
            size="sm"
            status={disconnectAction.state}
            successLabel="Déconnecté"
            errorLabel="Échec"
            icon="⏏"
            onClick={() => run(disconnectAction, () => api.disconnect(true), 'Bot déconnecté')}
            disabled={!connected && !session}
          >
            Disconnect
          </Button>
        </div>
      </header>

      <div className="stats">
        <StatCard
          label="BOT STATUS"
          icon={connected ? '🟢' : '⚪'}
          tone={connected ? 'green' : 'idle'}
          value={connected ? 'Connected' : String(status?.whatsapp?.status || 'idle')}
          hint={status?.error || (connected ? 'Connexion WhatsApp active' : 'Aucune connexion active')}
        />
        <StatCard
          label="PHONE"
          icon="📱"
          value={status?.whatsapp?.phoneFormatted || '—'}
          hint={status?.whatsapp?.pushName || 'Numéro connecté au bot'}
        />
        <StatCard label="ADMIN" icon="👑" value={status?.admin?.name || 'non configuré'} hint={status?.admin?.number || 'ADMIN_NUMBER à définir'} />
        <StatCard label="PREFIX" icon="🔣" value={status?.bot?.prefix || '/'} hint="Déclencheur des commandes" />
        <StatCard label="STICKER NAME" icon="🎨" value={status?.bot?.stickerName || '—'} hint={`Auteur : ${status?.bot?.stickerAuthor || '—'}`} />
        <StatCard
          label="SESSION"
          icon="🔐"
          tone="magenta"
          value={session ? 'Generated' : 'Aucune'}
          hint={session ? `Référence ${session.sessionId.slice(0, 22)}…` : 'Générez un Pair Code'}
        />
        <StatCard label="COMMANDS" icon="🧩" value={status?.commands?.total ?? '—'} hint={`${Object.keys(status?.commands?.byCategory || {}).length} catégories`} />
        <StatCard
          label="UPTIME"
          icon="⏱️"
          value={formatDuration(status?.whatsapp?.uptimeMs || 0)}
          hint={`Serveur : ${formatDuration(status?.server?.uptimeMs || 0)}`}
        />
        <StatCard
          label="MÉDIA"
          icon="🎞️"
          tone={status?.ffmpeg ? 'green' : 'warn'}
          value={status?.ffmpeg ? 'ffmpeg ✓' : 'ffmpeg absent'}
          hint={status?.ffmpeg ? 'Stickers animés, /tovideo et /toaudio actifs' : 'Images, /vv et stickers statiques actifs'}
        />
      </div>

      <div className="grid grid--dashboard">
        <div className="stack">
          <Card
            title="Session ID"
            subtitle={`Préfixe imposé : IDREM-TERESHKOVA- • ${session ? 'session active' : 'aucune session'}`}
            actions={
              <div className="card__actions">
                <Button
                  variant="subtle"
                  size="sm"
                  status={sessionAction.state}
                  successLabel="Régénérée"
                  errorLabel="Échec"
                  icon="↻"
                  onClick={() => run(sessionAction, async () => api.regenerateSession(), 'Session ID régénérée')}
                  disabled={!connected}
                >
                  Regenerate Session
                </Button>
              </div>
            }
          >
            {session ? (
              <div className="session">
                <CopyBox value={session.body} prefix="IDREM-TERESHKOVA-" tone="magenta" copyLabel="Copy Session ID" />
                <div className="session__meta">
                  <StatusPill status={connected ? 'connected' : status?.whatsapp?.status} />
                  {session.connectedAt && <span className="muted">Connectée le {new Date(session.connectedAt).toLocaleString('fr-FR')}</span>}
                </div>
                <p className="notice">
                  💡 La Session ID est une référence opaque vers les credentials stockés sur le serveur. Elle ne contient
                  aucune clé WhatsApp et peut être régénérée sans refaire de Pair Code.
                </p>
              </div>
            ) : (
              <p className="empty">Aucune Session ID : connectez WhatsApp depuis la page d’accueil (Pair Code).</p>
            )}
          </Card>

          <Card title="Configuration" subtitle="Modifiez les paramètres du bot sans redémarrage.">
            {form ? (
              <form className="form" onSubmit={handleSaveConfig} noValidate>
                <div className="form__grid">
                  {SETTINGS_FIELDS.map((field) => (
                    <Field
                      key={field.key}
                      label={field.label}
                      hint={field.hint}
                      placeholder={field.placeholder}
                      value={form[field.key]}
                      onChange={setField(field.key)}
                      maxLength={field.key === 'prefix' ? 3 : 48}
                    />
                  ))}
                </div>
                <div className="form__row">
                  <Button type="submit" status={configAction.state} successLabel="Enregistré" errorLabel="Refusé" icon="💾">
                    Enregistrer
                  </Button>
                  <Button variant="ghost" onClick={() => setForm(null)} icon="↺">
                    Réinitialiser
                  </Button>
                </div>
              </form>
            ) : (
              <Spinner />
            )}
          </Card>

          <Card
            title="Logs récents"
            subtitle="Événements non sensibles (les codes, secrets et credentials sont censurés à la source)."
            actions={
              <Button variant="ghost" size="sm" icon="↻" onClick={() => refreshLogs()}>
                Actualiser
              </Button>
            }
          >
            <div className="logs">
              {logs.length === 0 && <p className="empty">Aucun log pour le moment.</p>}
              {logs.map((entry, index) => (
                <div key={`${entry.time}-${index}`} className={`log log--${entry.level}`}>
                  <span className="log__time">{new Date(entry.time).toLocaleTimeString('fr-FR')}</span>
                  <span className="log__level">{entry.level}</span>
                  <span className="log__scope">{entry.scope}</span>
                  <span className="log__msg">{entry.msg}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="stack">
          <Card
            title={`Commandes (${commands?.total ?? 0})`}
            subtitle={`Préfixe actif : ${commands?.prefix || '/'}`}
            actions={
              <Button variant="ghost" size="sm" icon="↻" onClick={() => refreshCommands()}>
                Actualiser
              </Button>
            }
          >
            <div className="commands">
              {groupedCommands.map((category) => (
                <section key={category.id} className="command-group">
                  <h3 className="command-group__title">
                    <span aria-hidden="true">{category.icon}</span> {category.label}
                    <span className="command-group__count">{category.commands.length}</span>
                  </h3>
                  <ul className="command-list">
                    {category.commands.map((command) => (
                      <li key={command.name} className="command">
                        <code className="command__name">
                          {commands?.prefix || '/'}
                          {command.name}
                        </code>
                        <span className="command__desc">{command.description}</span>
                        {command.ownerOnly && <span className="tag tag--owner">owner</span>}
                        {command.adminOnly && <span className="tag tag--admin">admin</span>}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </Card>

          <Card title="Statistiques" subtitle="Compteurs depuis le démarrage du serveur.">
            <ul className="kv">
              <li>
                <span>Messages traités</span>
                <strong>{status?.stats?.messagesProcessed ?? 0}</strong>
              </li>
              <li>
                <span>Commandes exécutées</span>
                <strong>{status?.stats?.commandsExecuted ?? 0}</strong>
              </li>
              <li>
                <span>Conversations suivies</span>
                <strong>{status?.stats?.chats ?? 0}</strong>
              </li>
              <li>
                <span>Sessions enregistrées</span>
                <strong>{status?.stats?.sessions ?? 0}</strong>
              </li>
              <li>
                <span>Node.js</span>
                <strong>{status?.server?.node ?? '—'}</strong>
              </li>
              <li>
                <span>Environnement</span>
                <strong>{status?.server?.env ?? '—'}</strong>
              </li>
            </ul>

            {status?.stats?.topCommands?.length > 0 && (
              <div className="top">
                <h4 className="top__title">Commandes les plus utilisées</h4>
                <ul className="top__list">
                  {status.stats.topCommands.map((item) => (
                    <li key={item.name}>
                      <code>{item.name}</code>
                      <span className="top__bar">
                        <span
                          className="top__fill"
                          style={{ width: `${Math.round((item.count / status.stats.topCommands[0].count) * 100)}%` }}
                        />
                      </span>
                      <strong>{item.count}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { ApiError } from '../api/client.js';
import Button from '../components/Button.jsx';
import CopyBox from '../components/CopyBox.jsx';
import Expiry from '../components/Expiry.jsx';
import Field from '../components/Field.jsx';
import StatusPill from '../components/StatusPill.jsx';
import { Card } from '../components/Card.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useActionState } from '../hooks/useActionState.js';
import { usePolling } from '../hooks/usePolling.js';

const EMPTY_FORM = {
  adminNumber: '',
  adminName: '',
  prefix: '/',
  stickerName: 'IDREM TERESHKOVA',
  phoneNumber: '',
};

const FIELDS = [
  {
    key: 'adminNumber',
    label: 'Numéro de l’administrateur',
    placeholder: '243970000000',
    hint: 'ADMIN_NUMBER — format international sans le « + ». Ce numéro aura accès aux commandes administrateur.',
    inputMode: 'tel',
  },
  {
    key: 'adminName',
    label: 'Nom de l’administrateur',
    placeholder: 'Merdi',
    hint: 'ADMIN_NAME — utilisé comme auteur des stickers si aucun auteur n’est défini.',
  },
  {
    key: 'prefix',
    label: 'Préfixe du bot',
    placeholder: '/',
    hint: 'PREFIX — déclenche les commandes : /menu, /vv, /sticker…',
    maxLength: 3,
  },
  {
    key: 'stickerName',
    label: 'Nom utilisé pour l’enregistrement des stickers',
    placeholder: 'IDREM TERESHKOVA',
    hint: 'STICKER_NAME — nom du pack affiché dans WhatsApp.',
  },
  {
    key: 'phoneNumber',
    label: 'Numéro WhatsApp à connecter',
    placeholder: '243970000000',
    hint: 'Numéro du téléphone sur lequel le bot sera connecté en tant qu’appareil lié.',
    inputMode: 'tel',
    required: true,
  },
];

function validate(form) {
  const errors = {};
  const phone = (value) => /^\d{7,15}$/.test(String(value).replace(/[^\d]/g, '').replace(/^00/, ''));

  if (!form.phoneNumber.trim()) errors.phoneNumber = 'Numéro WhatsApp à connecter requis.';
  else if (!phone(form.phoneNumber) || String(form.phoneNumber).trim().startsWith('0'))
    errors.phoneNumber = 'Format international attendu, sans « + » ni 0 initial (ex. 243970000000).';

  if (form.adminNumber.trim() && (!phone(form.adminNumber) || String(form.adminNumber).trim().startsWith('0')))
    errors.adminNumber = 'Format international attendu (ex. 243970000000).';

  if (!form.prefix.trim()) errors.prefix = 'Préfixe requis (ex. /).';
  else if (form.prefix.trim().length > 3) errors.prefix = '3 caractères maximum.';

  if (!form.stickerName.trim()) errors.stickerName = 'Nom du pack requis.';
  return errors;
}

export default function Home() {
  const navigate = useNavigate();
  const { authenticated } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [pair, setPair] = useState(null);
  const [showQr, setShowQr] = useState(false);
  const [qr, setQr] = useState(null);

  const pairAction = useActionState(2500);
  const sessionAction = useActionState(2000);
  const prefilled = useRef(false);
  const notifiedSession = useRef(false);

  const { data: status } = usePolling(() => api.status(), { enabled: authenticated, interval: 3500 });

  const waStatus = status?.whatsapp?.status || 'idle';
  const connected = Boolean(status?.whatsapp?.connected);
  const session = status?.session?.sessionId ? status.session : null;

  /* Pré-remplissage depuis la configuration serveur. */
  useEffect(() => {
    if (!status || prefilled.current) return;
    prefilled.current = true;

    const settings = status.settings || {};
    setForm((current) => ({
      adminNumber: settings.adminNumber || current.adminNumber,
      adminName: settings.adminName || current.adminName,
      prefix: settings.prefix || current.prefix,
      stickerName: settings.stickerName || current.stickerName,
      phoneNumber: status.whatsapp?.phone || current.phoneNumber,
    }));

    if (status.pair?.display && !status.pair.expired) {
      setPair({ pairCode: status.pair.display, expiresAt: status.pair.expiresAt, phone: status.pair.phone });
    }
  }, [status]);

  /* Notification unique dès que la Session ID apparaît. */
  useEffect(() => {
    if (session?.sessionId && !notifiedSession.current) {
      notifiedSession.current = true;
      toast.success('WhatsApp connecté — Session ID générée automatiquement.');
    }
  }, [session, toast]);

  const setField = (key) => (event) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
  };

  const loadQr = async () => {
    try {
      const result = await api.qr();
      setQr(result.qr);
    } catch (error) {
      toast.warn(error instanceof ApiError ? error.message : 'QR code indisponible.');
    }
  };

  const handlePair = async (event) => {
    event.preventDefault();

    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      toast.error('Veuillez corriger les champs signalés.');
      return;
    }

    if (!authenticated) {
      toast.warn('Connectez-vous au dashboard pour générer un Pair Code.');
      navigate('/login', { state: { from: '/' } });
      return;
    }

    pairAction.start();
    try {
      const result = await api.pair({
        phoneNumber: form.phoneNumber,
        adminNumber: form.adminNumber || undefined,
        adminName: form.adminName || undefined,
        prefix: form.prefix,
        stickerName: form.stickerName,
      });

      setPair({ pairCode: result.pairCode, expiresAt: result.expiresAt, phone: result.phone });
      notifiedSession.current = false;
      pairAction.succeed('Pair Code généré');
      toast.success(`Pair Code généré : ${result.pairCode}`);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Échec de la génération du Pair Code.';
      pairAction.fail('Échec');
      toast.error(message);
      if (error.isUnauthorized) navigate('/login', { state: { from: '/' } });
    }
  };

  const handleRegenerate = async () => {
    sessionAction.start();
    try {
      const result = await api.regenerateSession();
      sessionAction.succeed('Régénérée');
      toast.success('Nouvelle Session ID générée.');
      return result;
    } catch (error) {
      sessionAction.fail('Échec');
      toast.error(error instanceof ApiError ? error.message : 'Régénération impossible.');
      return null;
    }
  };

  const steps = useMemo(
    () => [
      { key: 'waiting', label: 'En attente de connexion', done: ['pairing', 'connecting', 'connected'].includes(waStatus) },
      { key: 'pairing', label: 'Pairing…', done: waStatus === 'connected' || waStatus === 'connecting', active: waStatus === 'pairing' },
      { key: 'connected', label: 'Connecté', done: connected, active: connected },
    ],
    [waStatus, connected],
  );

  return (
    <div className="page page--home">
      <section className="hero">
        <span className="hero__badge">
          <span className="hero__badge-dot" aria-hidden="true" />
          Baileys · Node.js · Session sécurisée
        </span>
        <h1 className="hero__title">
          IDREM TERESHKOVA <span className="grad">BOT</span>
        </h1>
        <p className="hero__tagline">Connectez votre compte WhatsApp et générez votre Session ID.</p>

        <div className="hero__status">
          <StatusPill status={waStatus} />
          {status?.whatsapp?.phoneFormatted && <span className="hero__phone">📱 {status.whatsapp.phoneFormatted}</span>}
        </div>

        <ol className="stepper" aria-label="Progression de la connexion">
          {steps.map((step) => (
            <li key={step.key} className={`step ${step.done ? 'is-done' : ''} ${step.active ? 'is-active' : ''}`}>
              <span className="step__index" aria-hidden="true">
                {step.done ? '✓' : ''}
              </span>
              <span className="step__label">{step.label}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid grid--main">
        <Card
          title="Configuration"
          subtitle="Ces paramètres sont enregistrés sur votre serveur et modifiables à tout moment depuis le dashboard."
        >
          <form className="form" onSubmit={handlePair} noValidate>
            {FIELDS.map((field) => (
              <Field
                key={field.key}
                label={field.label}
                hint={field.hint}
                error={errors[field.key]}
                required={field.required}
                placeholder={field.placeholder}
                inputMode={field.inputMode}
                maxLength={field.maxLength}
                value={form[field.key]}
                onChange={setField(field.key)}
                autoComplete={field.key === 'phoneNumber' ? 'tel' : 'off'}
              />
            ))}

            <Button type="submit" status={pairAction.state} successLabel="Pair Code généré" errorLabel="Échec" block icon="⚡" size="lg">
              Générer Pair Code
            </Button>
            {pairAction.message && <p className="form__feedback">{pairAction.message}</p>}

            <p className="form__notice">
              🔒 Aucun credential WhatsApp n’est exposé au navigateur : le Pair Code et la Session ID sont des références,
              les clés restent sur le serveur.
            </p>
          </form>
        </Card>

        <div className="stack">
          <Card title="Pair Code" subtitle="À saisir dans WhatsApp → Appareils connectés → Connecter avec un numéro.">
            {pair?.pairCode ? (
              <div className="pair">
                <span className="pair__label">PAIR CODE</span>
                <CopyBox value={pair.pairCode} tone="cyan" size="xl" copyLabel="Copier le code" />
                <div className="pair__meta">
                  <Expiry date={pair.expiresAt} />
                  {pair.phone && <span className="pair__phone">📱 {pair.phone}</span>}
                </div>

                <ol className="pair__steps">
                  <li>Ouvrez WhatsApp sur le téléphone à connecter.</li>
                  <li>Menu ⋮ ou Réglages → <strong>Appareils connectés</strong>.</li>
                  <li>
                    <strong>Connecter un appareil</strong> → « Connecter avec un numéro de téléphone ».
                  </li>
                  <li>
                    Saisissez <strong>{pair.pairCode}</strong>.
                  </li>
                </ol>

                <details className="details" onToggle={(e) => e.currentTarget.open && !qr && loadQr()}>
                  <summary>Alternative : scanner un QR code</summary>
                  {qr ? (
                    <img className="qr" src={qr} alt="QR code de connexion WhatsApp" width="220" height="220" />
                  ) : (
                    <p className="muted">Chargement du QR code…</p>
                  )}
                </details>
              </div>
            ) : (
              <p className="empty">
                Aucun Pair Code généré pour le moment.
                <br />
                Remplissez le formulaire puis cliquez sur <strong>Générer Pair Code</strong>.
              </p>
            )}
          </Card>

          <Card
            title="Session ID"
            subtitle="Générée automatiquement dès que WhatsApp est connecté. Préfixe imposé : IDREM-TERESHKOVA-"
            actions={
              session?.sessionId ? (
                <Button
                  variant="subtle"
                  size="sm"
                  status={sessionAction.state}
                  successLabel="Régénérée"
                  errorLabel="Échec"
                  onClick={handleRegenerate}
                  icon="↻"
                >
                  Régénérer
                </Button>
              ) : null
            }
          >
            {session?.sessionId ? (
              <div className="session">
                <CopyBox
                  value={session.body}
                  prefix="IDREM-TERESHKOVA-"
                  tone="magenta"
                  size="md"
                  maskedByDefault
                  copyLabel="Copier Session ID"
                  hint="Cette Session ID référence les credentials conservés sur le serveur ; elle ne contient aucune donnée WhatsApp."
                />
                <div className="session__meta">
                  <StatusPill status={connected ? 'connected' : waStatus} />
                  {session.createdAt && <span className="muted">Créée le {new Date(session.createdAt).toLocaleString('fr-FR')}</span>}
                </div>
                <p className="notice">
                  💡 Au redémarrage du serveur, le bot se reconnecte automatiquement avec la session stockée :
                  aucun nouveau Pair Code n’est nécessaire tant que la session est valide.
                </p>
              </div>
            ) : (
              <p className="empty">
                {connected ? 'Session en cours de finalisation…' : 'En attente de connexion WhatsApp pour générer la Session ID.'}
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

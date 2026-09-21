const STATUS_MAP = {
  idle: { label: 'WhatsApp : En attente de connexion', tone: 'idle' },
  waiting: { label: 'WhatsApp : En attente de connexion', tone: 'idle' },
  pairing: { label: 'WhatsApp : Pairing…', tone: 'pairing' },
  connecting: { label: 'WhatsApp : Connexion…', tone: 'pairing' },
  connected: { label: 'WhatsApp : Connecté', tone: 'connected' },
  disconnected: { label: 'WhatsApp : Déconnecté', tone: 'error' },
  logged_out: { label: 'WhatsApp : Session fermée', tone: 'error' },
  error: { label: 'WhatsApp : Erreur', tone: 'error' },
};

/** Pastille d'état de connexion WhatsApp (libellés imposés par le cahier des charges). */
export default function StatusPill({ status = 'idle', label, tone, pulse = true, className = '' }) {
  const resolved = STATUS_MAP[status] || { label: label || status || 'inconnu', tone: 'idle' };
  const finalLabel = label || resolved.label;
  const finalTone = tone || resolved.tone;
  const animated = pulse && (finalTone === 'connected' || finalTone === 'pairing');

  return (
    <span className={`pill pill--${finalTone} ${animated ? 'pill--pulse' : ''} ${className}`}>
      <span className="pill__dot" aria-hidden="true" />
      <span className="pill__label">{finalLabel}</span>
    </span>
  );
}

export { STATUS_MAP };

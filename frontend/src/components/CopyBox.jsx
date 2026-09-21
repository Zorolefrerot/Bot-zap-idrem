import { useEffect, useState } from 'react';

/** Copie dans le presse-papiers avec repli pour les contextes non sécurisés. */
export async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* on tente la méthode de repli */
    }
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Affichage d'une valeur à copier (Pair Code, Session ID).
 * La valeur est masquable pour éviter toute divulgation par-dessus l'épaule.
 */
export default function CopyBox({
  value,
  label,
  prefix,
  tone = 'cyan',
  size = 'lg',
  copyLabel = 'Copier',
  maskedByDefault = false,
  hint,
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [masked, setMasked] = useState(maskedByDefault);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  const fullValue = `${prefix || ''}${value ?? ''}`;

  const handleCopy = async () => {
    const ok = await copyToClipboard(fullValue);
    setCopied(ok);
    setFailed(!ok);
    if (ok) setTimeout(() => setFailed(false), 1800);
  };

  const display = masked ? '•'.repeat(Math.min(32, String(value || '').length)) : value;

  return (
    <div className={`copybox copybox--${tone} copybox--${size}`}>
      {label && <span className="copybox__label">{label}</span>}

      <div className="copybox__row">
        <code className="copybox__value" title={masked ? 'Valeur masquée' : fullValue}>
          {prefix && <span className="copybox__prefix">{prefix}</span>}
          <span className="copybox__body">{display}</span>
        </code>

        <div className="copybox__actions">
          {maskedByDefault && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setMasked((m) => !m)}>
              <span className="btn__icon" aria-hidden="true">
                {masked ? '👁' : '🙈'}
              </span>
              <span className="btn__label">{masked ? 'Afficher' : 'Masquer'}</span>
            </button>
          )}
          <button
            type="button"
            className={`btn ${copied ? 'btn--success is-success' : failed ? 'btn--danger is-error' : 'btn--subtle'} btn--sm`}
            onClick={handleCopy}
          >
            <span className="btn__icon" aria-hidden="true">
              {copied ? '✓' : failed ? '✕' : '⧉'}
            </span>
            <span className="btn__label">{copied ? 'Copié !' : failed ? 'Échec' : copyLabel}</span>
          </button>
        </div>
      </div>

      {hint && <p className="copybox__hint">{hint}</p>}
    </div>
  );
}

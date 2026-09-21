import { copyToClipboard } from './CopyBox.jsx';

/** Panneau générique (titre, sous-titre, actions, contenu). */
export function Card({ title, subtitle, actions, children, className = '', tone = '' }) {
  return (
    <section className={`card ${tone ? `card--${tone}` : ''} ${className}`}>
      {(title || actions) && (
        <header className="card__header">
          <div className="card__titles">
            {title && <h2 className="card__title">{title}</h2>}
            {subtitle && <p className="card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="card__actions">{actions}</div>}
        </header>
      )}
      <div className="card__body">{children}</div>
    </section>
  );
}

/** Tuile de statistique du dashboard. */
export function StatCard({ label, value, icon, tone = 'cyan', copyable = false, hint, onCopied }) {
  const handleCopy = async () => {
    const ok = await copyToClipboard(String(value ?? ''));
    onCopied?.(ok, value);
  };

  return (
    <article className={`stat stat--${tone}`}>
      <div className="stat__head">
        {icon && (
          <span className="stat__icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="stat__label">{label}</span>
        {copyable && value && (
          <button type="button" className="stat__copy" onClick={handleCopy} title="Copier la valeur">
            ⧉
          </button>
        )}
      </div>
      <p className="stat__value" title={String(value ?? '')}>
        {value ?? '—'}
      </p>
      {hint && <p className="stat__hint">{hint}</p>}
    </article>
  );
}

export default Card;

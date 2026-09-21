import { useId } from 'react';

/**
 * Champ de formulaire complet : libellé, saisie, aide, erreur.
 * Les valeurs sensibles sont saisies en `type="password"` et ne sont jamais
 * journalisées ni renvoyées au frontend une fois enregistrées.
 */
export default function Field({
  label,
  hint,
  error,
  required = false,
  type = 'text',
  value,
  onChange,
  placeholder,
  autoComplete = 'off',
  inputMode,
  maxLength,
  disabled,
  className = '',
  name,
  children,
}) {
  const fieldId = useId();

  return (
    <div className={`field ${error ? 'field--error' : ''} ${className}`}>
      <label className="field__label" htmlFor={fieldId}>
        <span>{label}</span>
        {required && (
          <span className="field__required" title="Obligatoire">
            *
          </span>
        )}
      </label>

      {children || (
        <input
          id={fieldId}
          name={name}
          type={type}
          className="input"
          value={value ?? ''}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          maxLength={maxLength}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={hint || error ? `${fieldId}-help` : undefined}
        />
      )}

      {(hint || error) && (
        <p className={`field__${error ? 'error' : 'hint'}`} id={`${fieldId}-help`} role={error ? 'alert' : undefined}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

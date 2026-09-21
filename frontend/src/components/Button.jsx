import Spinner from './Spinner.jsx';

/**
 * Bouton avec états explicites : idle / loading / success / error.
 * `status` pilote l'apparence, `children` le libellé normal.
 */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  status = 'idle',
  successLabel,
  errorLabel,
  block = false,
  icon,
  className = '',
  type = 'button',
  disabled,
  ...rest
}) {
  const isLoading = status === 'loading';
  const isSuccess = status === 'success';
  const isError = status === 'error';
  const isDisabled = disabled || isLoading;

  const label = isSuccess ? successLabel || children : isError ? errorLabel || children : children;

  return (
    <button
      type={type}
      className={`btn btn--${variant} btn--${size} ${block ? 'btn--block' : ''} ${isSuccess ? 'is-success' : ''} ${isError ? 'is-error' : ''} ${className}`}
      disabled={isDisabled}
      aria-busy={isLoading}
      {...rest}
    >
      {isLoading ? (
        <Spinner className="btn__spinner" />
      ) : (
        icon && <span className="btn__icon" aria-hidden="true">{isSuccess ? '✓' : isError ? '✕' : icon}</span>
      )}
      <span className="btn__label">{label}</span>
      {isSuccess && !icon && <span className="btn__icon" aria-hidden="true">✓</span>}
      {isError && !icon && <span className="btn__icon" aria-hidden="true">✕</span>}
    </button>
  );
}

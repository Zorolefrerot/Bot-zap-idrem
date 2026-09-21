export default function Spinner({ className = '' }) {
  return <span className={`spinner ${className}`} role="progressbar" aria-label="Chargement" />;
}

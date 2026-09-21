import { useEffect, useState } from 'react';

/** Compte à rebours (secondes) jusqu'à une date ISO. */
export default function Expiry({ date, label = 'Expire dans' }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.round((new Date(date).getTime() - Date.now()) / 1000)));

  useEffect(() => {
    setRemaining(Math.max(0, Math.round((new Date(date).getTime() - Date.now()) / 1000)));
    const timer = setInterval(() => {
      setRemaining(Math.max(0, Math.round((new Date(date).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [date]);

  if (remaining <= 0) {
    return (
      <span className="expiry expiry--expired">
        <span aria-hidden="true">⌛</span> Code expiré — générez-en un nouveau
      </span>
    );
  }

  return (
    <span className="expiry">
      <span aria-hidden="true">⏳</span> {label} {remaining}s
    </span>
  );
}

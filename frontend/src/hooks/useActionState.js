import { useEffect, useRef, useState } from 'react';

/**
 * Gère l'état visuel d'un bouton : idle -> loading -> success | error.
 * L'état de résultat reste affiché ~1,6 s puis revient à idle.
 */
export function useActionState(resetAfterMs = 1600) {
  const [state, setState] = useState('idle'); // idle | loading | success | error
  const [message, setMessage] = useState('');
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const start = () => {
    clearTimeout(timer.current);
    setMessage('');
    setState('loading');
  };

  const finish = (nextState, text = '') => {
    setMessage(text);
    setState(nextState);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setState('idle');
      setMessage('');
    }, resetAfterMs);
  };

  return {
    state,
    message,
    loading: state === 'loading',
    start,
    succeed: (text) => finish('success', text),
    fail: (text) => finish('error', text),
    reset: () => {
      clearTimeout(timer.current);
      setState('idle');
      setMessage('');
    },
  };
}

export default useActionState;

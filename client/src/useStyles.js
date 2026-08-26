import { useEffect, useState } from 'react';
import { fetchStyles } from './api/styles.js';

/** Loads the style catalogue from the API on mount. */
export default function useStyles() {
  const [styles, setStyles] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    fetchStyles(controller.signal)
      .then((list) => {
        setStyles(list);
        setStatus('ready');
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err.message);
        setStatus('error');
      });

    return () => controller.abort();
  }, []);

  return { styles, status, error };
}

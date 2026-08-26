import { useEffect, useState } from 'react';

export default function App() {
  const [api, setApi] = useState('checking...');
  const [db, setDb] = useState('checking...');

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setApi(d.status))
      .catch(() => setApi('unreachable'));

    fetch('/api/health/db')
      .then((r) => r.json())
      .then((d) => setDb(d.database))
      .catch(() => setDb('unreachable'));
  }, []);

  return (
    <main className="app">
      <h1>StyleTransfer</h1>
      <p>PERN stack scaffold.</p>
      <ul className="status">
        <li>API: <strong>{api}</strong></li>
        <li>PostgreSQL: <strong>{db}</strong></li>
      </ul>
    </main>
  );
}

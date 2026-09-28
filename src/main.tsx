import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { loadCatalog } from './lib/data';
import type { Catalog } from './types';
import './styles.css';
function Bootstrap() {
  const [data, setData] = useState<Catalog | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    loadCatalog()
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  return data ? (
    <App data={data} />
  ) : (
    <main className="boot-screen">
      <span className="eyebrow">PKM—EVA</span>
      <h1>{error ? 'The catalog could not load.' : 'A little closer to your next keeper.'}</h1>
      <p role={error ? 'alert' : 'status'}>{error || 'Loading your Pokémon catalog…'}</p>
      {error && <button onClick={() => location.reload()}>Try again</button>}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Bootstrap />
  </StrictMode>,
);

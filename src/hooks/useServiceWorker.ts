import { useEffect, useState } from 'react';

export function useServiceWorker() {
  const [offlineReady, setOfflineReady] = useState(false);
  const [offlineUnavailable, setOfflineUnavailable] = useState(false);
  const [update, setUpdate] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (!('serviceWorker' in navigator)) {
      setOfflineUnavailable(true);
      return;
    }
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        if (reg.waiting) setUpdate(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller)
              setUpdate(installing);
          });
        });
        navigator.serviceWorker.ready.then(() => setOfflineReady(true));
      })
      .catch(() => setOfflineUnavailable(true));
  }, []);

  function activateUpdate() {
    if (!update) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {
      once: true,
    });
    update.postMessage({ type: 'ACTIVATE_UPDATE' });
  }

  return { offlineReady, offlineUnavailable, update, activateUpdate };
}

import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Tier 1 Google Maps Platform Quota Defense & window.fetch extension compatibility guard
if (typeof window !== 'undefined') {
  try {
    let activeFetch = window.fetch;
    const desc = Object.getOwnPropertyDescriptor(window, 'fetch');
    if (!desc || (desc.get && !desc.set && desc.configurable !== false)) {
      Object.defineProperty(window, 'fetch', {
        configurable: true,
        enumerable: true,
        get() {
          return activeFetch;
        },
        set(nextFetch) {
          if (typeof nextFetch === 'function') {
            activeFetch = nextFetch;
          }
        },
      });
    }
  } catch {
    // ignore if non-configurable
  }

  (window as any).gm_authFailure = () => {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  };

  const origError = console.error;
  console.error = (...args: unknown[]) => {
    if (args.some(a => typeof a === 'string' && /OverQuotaMapError|QuotaExceededError/.test(a))) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
    origError.apply(console, args);
  };
}

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/sw-push.js', { scope: '/', updateViaCache: 'none' })
    .then((reg) => {
      reg.update().catch(() => {});
    })
    .catch(() => {});
}

createRoot(document.getElementById('root')!).render(<App />);



import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  try {
    registerSW({
      immediate: true,
      onRegisterError() {
        navigator.serviceWorker.register('/sw-push.js', { scope: '/' }).catch(() => {});
      },
    });
  } catch {
    navigator.serviceWorker.register('/sw-push.js', { scope: '/' }).catch(() => {});
  }
}

createRoot(document.getElementById('root')!).render(<App />);


import { useEffect, useState, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    __baobabDeferredPwaPrompt?: BeforeInstallPromptEvent | null;
  }
}

export type DevicePlatform = 'ios' | 'android' | 'desktop';

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
    if (typeof window !== 'undefined' && window.__baobabDeferredPwaPrompt) {
      return window.__baobabDeferredPwaPrompt;
    }
    return null;
  });
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [platform, setPlatform] = useState<DevicePlatform>('desktop');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Detect standalone mode (already installed on home screen / desktop)
    const checkStandalone = () => {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: window-controls-overlay)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsInstalled(isStandalone);
    };
    checkStandalone();

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const onMediaChange = () => checkStandalone();
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', onMediaChange);
    }

    // Detect device platform (iOS / iPadOS, Android phone/tablet, Desktop/Laptop)
    const ua = window.navigator.userAgent.toLowerCase();
    const isIOSDevice =
      /iphone|ipad|ipod/.test(ua) ||
      (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
    const isAndroidDevice = /android/.test(ua);

    setIsIOS(isIOSDevice);
    if (isIOSDevice) {
      setPlatform('ios');
    } else if (isAndroidDevice) {
      setPlatform('android');
    } else {
      setPlatform('desktop');
    }

    if (window.__baobabDeferredPwaPrompt) {
      setDeferredPrompt(window.__baobabDeferredPwaPrompt);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      window.__baobabDeferredPwaPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
    };

    const handleGlobalPromptReady = () => {
      if (window.__baobabDeferredPwaPrompt) {
        setDeferredPrompt(window.__baobabDeferredPwaPrompt);
      }
    };

    const handleAppInstalled = () => {
      window.__baobabDeferredPwaPrompt = null;
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('baobab-pwa-prompt-ready', handleGlobalPromptReady);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('baobab-pwa-prompt-ready', handleGlobalPromptReady);
      window.removeEventListener('appinstalled', handleAppInstalled);
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', onMediaChange);
      }
    };
  }, []);

  const install = useCallback(async () => {
    const activePrompt =
      deferredPrompt || (typeof window !== 'undefined' ? window.__baobabDeferredPwaPrompt : null);
    if (!activePrompt) return false;
    try {
      await activePrompt.prompt();
      const { outcome } = await activePrompt.userChoice;
      if (outcome === 'accepted') {
        if (typeof window !== 'undefined') {
          window.__baobabDeferredPwaPrompt = null;
        }
        setIsInstalled(true);
        setDeferredPrompt(null);
        return true;
      }
    } catch {
      // ignore prompt errors
    }
    return false;
  }, [deferredPrompt]);

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    platform,
    install,
  };
}

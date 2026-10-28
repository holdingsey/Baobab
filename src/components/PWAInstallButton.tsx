import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        onClick={install}
        title="Installer l'application Baobab Distribution sur votre appareil"
        className={`inline-flex items-center gap-1.5 font-medium transition rounded-lg bg-teal-600 hover:bg-teal-700 text-white shadow-xs ${
          compact ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs sm:text-sm'
        }`}
      >
        <Download className="w-3.5 h-3.5" />
        <span>Installer l'App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          title="Installer sur iPhone ou iPad"
          className={`inline-flex items-center gap-1.5 font-medium transition rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 ${
            compact ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Installer (iOS)</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Installer Baobab sur iOS
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <div className="flex items-start gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-800 font-bold text-xs dark:bg-teal-900/50 dark:text-teal-300">
                    1
                  </span>
                  <span>
                    Touchez l'icône <strong>Partager</strong> en bas du navigateur Safari.
                  </span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-800 font-bold text-xs dark:bg-teal-900/50 dark:text-teal-300">
                    2
                  </span>
                  <span>
                    Faites défiler vers le bas et appuyez sur{' '}
                    <strong>« Sur l'écran d'accueil »</strong>.
                  </span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-800 font-bold text-xs dark:bg-teal-900/50 dark:text-teal-300">
                    3
                  </span>
                  <span>
                    Touchez <strong>Ajouter</strong> en haut à droite.
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-teal-600 py-2.5 text-sm font-medium text-white hover:bg-teal-700 transition"
              >
                Compris
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

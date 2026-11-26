import React, { useState, useEffect } from 'react';
import { Download, Smartphone, Tablet, Monitor, X, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{
  compact?: boolean;
  fullWidth?: boolean;
}> = ({ compact = false, fullWidth = false }) => {
  const { isInstallable, isInstalled, isIOS, platform, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        setShowGuideModal(true);
      }
    } else {
      setShowGuideModal(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        title="Installer Baobab Distribution sur votre téléphone, tablette ou ordinateur"
        className={`inline-flex items-center justify-center gap-2 font-bold transition rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-[var(--marque-texte-sur-plein)] shadow-xs shrink-0 cursor-pointer ${
          fullWidth ? 'w-full min-h-[46px] px-4 py-2.5 text-xs sm:text-sm' : compact ? 'p-2 sm:px-2.5 sm:py-1.5 text-xs' : 'min-h-[44px] px-3.5 py-2 text-xs sm:text-sm'
        }`}
      >
        <Download className="w-4 h-4 shrink-0" />
        <span className={compact ? 'hidden md:inline' : ''}>
          Installer l&apos;application (Mobile / Tablette / PC)
        </span>
      </button>

      {showGuideModal && (
        <PWAInstallGuideModal
          isIOS={isIOS}
          platform={platform}
          isInstallable={isInstallable}
          onTriggerNativeInstall={install}
          onClose={() => setShowGuideModal(false)}
        />
      )}
    </>
  );
};

export const PWAInstallPromptBanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, platform, install } = usePWAInstall();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        return sessionStorage.getItem('baobab_pwa_banner_dismissed') === '1';
      } catch {
        return false;
      }
    }
    return false;
  });
  const [showGuideModal, setShowGuideModal] = useState(false);

  useEffect(() => {
    const handleOpenInstallModal = () => setShowGuideModal(true);
    window.addEventListener('baobab-open-pwa-install-guide', handleOpenInstallModal);
    return () => window.removeEventListener('baobab-open-pwa-install-guide', handleOpenInstallModal);
  }, []);

  if (isInstalled || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem('baobab_pwa_banner_dismissed', '1');
    } catch {
      // ignore
    }
  };

  const handleInstallAction = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuideModal(true);
    }
  };

  return (
    <>
      <div className="fixed bottom-16 lg:bottom-4 left-3 right-3 sm:left-auto sm:right-5 sm:max-w-md z-50 rounded-2xl bg-slate-900/95 dark:bg-slate-900 text-white border border-teal-500/40 shadow-2xl p-3.5 sm:p-4 backdrop-blur-md">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-[#006D77] text-white flex items-center justify-center shrink-0 shadow-xs">
              {platform === 'ios' || platform === 'android' ? (
                <Smartphone className="w-5 h-5" />
              ) : (
                <Monitor className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm font-black text-white leading-snug">
                Installer Baobab Distribution
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                Ajoutez l&apos;application sur l&apos;écran d&apos;accueil de votre téléphone, tablette ou sur le bureau de votre ordinateur (PC / Mac) pour un accès rapide et hors-ligne.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Fermer la proposition d'installation"
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleDismiss}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition cursor-pointer"
          >
            Plus tard
          </button>
          <button
            type="button"
            onClick={handleInstallAction}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#15803D] hover:bg-emerald-800 text-white text-xs font-extrabold transition shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>Installer sur l&apos;appareil</span>
          </button>
        </div>
      </div>

      {showGuideModal && (
        <PWAInstallGuideModal
          isIOS={isIOS}
          platform={platform}
          isInstallable={isInstallable}
          onTriggerNativeInstall={install}
          onClose={() => setShowGuideModal(false)}
        />
      )}
    </>
  );
};

interface PWAInstallGuideModalProps {
  isIOS: boolean;
  platform: 'ios' | 'android' | 'desktop';
  isInstallable: boolean;
  onTriggerNativeInstall: () => Promise<boolean>;
  onClose: () => void;
}

const PWAInstallGuideModal: React.FC<PWAInstallGuideModalProps> = ({
  platform,
  isInstallable,
  onTriggerNativeInstall,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'android' | 'ios' | 'desktop'>(
    platform === 'ios' ? 'ios' : platform === 'android' ? 'android' : 'desktop'
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Installer Baobab Distribution
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Sur téléphone, tablette, ordinateur de bureau ou laptop
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isInstallable && (
          <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-900 dark:text-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0" />
              <span>Installation directe en 1 clic disponible sur votre navigateur</span>
            </div>
            <button
              type="button"
              onClick={async () => {
                const ok = await onTriggerNativeInstall();
                if (ok) onClose();
              }}
              className="w-full min-h-[44px] rounded-xl bg-[#15803D] hover:bg-emerald-800 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>Installer maintenant sur cet appareil</span>
            </button>
          </div>
        )}

        {/* Onglets par type d'appareil */}
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('android')}
            className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'android'
                ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 shrink-0" />
            <span>Android</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ios')}
            className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'ios'
                ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'
            }`}
          >
            <Tablet className="w-3.5 h-3.5 shrink-0" />
            <span>iPhone / iPad</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('desktop')}
            className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'desktop'
                ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'
            }`}
          >
            <Monitor className="w-3.5 h-3.5 shrink-0" />
            <span>PC / Laptop</span>
          </button>
        </div>

        {/* Instructions détaillées selon la plateforme */}
        {activeTab === 'android' && (
          <div className="space-y-3 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
            <div className="font-bold text-slate-900 dark:text-white">
              Téléphone ou Tablette Android (Chrome / Edge) :
            </div>
            <div className="flex items-start gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs">
                1
              </span>
              <span>
                Appuyez sur le menu <strong>⋮</strong> (3 points en haut à droite de Chrome).
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs">
                2
              </span>
              <span>
                Sélectionnez <strong>« Installer l&apos;application »</strong> ou{' '}
                <strong>« Ajouter à l&apos;écran d&apos;accueil »</strong>.
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs">
                3
              </span>
              <span>
                Confirmez en appuyant sur <strong>Installer</strong> : l&apos;icône Baobab apparaît sur votre écran d&apos;accueil.
              </span>
            </div>
          </div>
        )}

        {activeTab === 'ios' && (
          <div className="space-y-3 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
            <div className="font-bold text-slate-900 dark:text-white">
              iPhone ou Tablette iPad (Safari) :
            </div>
            <div className="flex items-start gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs">
                1
              </span>
              <span>
                Touchez le bouton <strong>Partager</strong> (carré avec une flèche vers le haut) dans la barre de Safari.
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs">
                2
              </span>
              <span>
                Faites défiler le menu et appuyez sur{' '}
                <strong>« Sur l&apos;écran d&apos;accueil »</strong>.
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs">
                3
              </span>
              <span>
                Touchez <strong>Ajouter</strong> en haut à droite.
              </span>
            </div>
          </div>
        )}

        {activeTab === 'desktop' && (
          <div className="space-y-3 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
            <div className="font-bold text-slate-900 dark:text-white">
              Ordinateur de bureau ou Laptop (Windows / Mac — Chrome ou Edge) :
            </div>
            <div className="flex items-start gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs">
                1
              </span>
              <span>
                Cliquez sur l&apos;icône <strong>Installer Baobab Distribution</strong> (petit écran avec une flèche) à droite de la barre d&apos;adresse du navigateur.
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs">
                2
              </span>
              <span>
                Ou ouvrez le menu <strong>⋮</strong> en haut à droite →{' '}
                <strong>« Cast, enregistrer et partager »</strong> →{' '}
                <strong>« Installer Baobab Distribution... »</strong>.
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs">
                3
              </span>
              <span>
                Cliquez sur <strong>Installer</strong> pour épingler l&apos;application sur votre Bureau et dans la barre des tâches.
              </span>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[44px] rounded-xl bg-[var(--marque-fonce)] py-2.5 text-sm font-bold text-[var(--marque-texte-sur-plein)] hover:bg-[#00586B] transition cursor-pointer"
        >
          Fermer
        </button>
      </div>
    </div>
  );
};

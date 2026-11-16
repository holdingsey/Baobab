import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  BellOff,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
  Send,
  RefreshCw,
  Info,
  X,
} from 'lucide-react';
import { UserSession } from './LoginScreen';
import { InfoTooltip } from './InfoTooltip';
import {
  NOTIFICATION_CATEGORY_LABELS,
  NotificationCategoryKey,
  NotificationPreferences,
  DEFAULT_NOTIFICATION_TYPES,
  getPushSupportInfo,
  getActivePushSubscription,
  requestAndSubscribePush,
  unsubscribePushDevice,
  fetchUserPushStatus,
  updateUserPushPreferences,
  triggerTestPushNotification,
  getPushBannerDismissInfo,
  clearPushBannerDismissal,
} from '../utils/pushNotifications';

interface NotificationSettingsPanelProps {
  currentUser: UserSession;
  onClose?: () => void;
  isModal?: boolean;
  hideHeader?: boolean;
}

export const NotificationSettingsPanel: React.FC<NotificationSettingsPanelProps> = ({
  currentUser,
  onClose,
  isModal = false,
  hideHeader = false,
}) => {
  const [supportInfo, setSupportInfo] = useState(() => getPushSupportInfo());
  const [hasLocalSubscription, setHasLocalSubscription] = useState(false);
  const [devices, setDevices] = useState<
    Array<{
      id: string;
      endpoint?: string;
      deviceLabel?: string;
      device_label?: string;
      updatedAt?: string;
      updated_at?: string;
      created_at?: string;
    }>
  >([]);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    enabled: true,
    types: { ...DEFAULT_NOTIFICATION_TYPES },
  });
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<'toggle' | 'test' | 'prefs' | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [dismissInfo, setDismissInfo] = useState(() => getPushBannerDismissInfo(currentUser.id));

  const refreshState = useCallback(async () => {
    setLoading(true);
    setSupportInfo(getPushSupportInfo());
    setDismissInfo(getPushBannerDismissInfo(currentUser.id));
    const sub = await getActivePushSubscription(currentUser.id);
    setHasLocalSubscription(Boolean(sub));
    const status = await fetchUserPushStatus(currentUser.id, currentUser.role);
    if (status) {
      setPreferences(status.preferences);
      setDevices(status.devices || []);
      if (status.devices && status.devices.length > 0) {
        setHasLocalSubscription(true);
      }
    }
    setLoading(false);
  }, [currentUser.id, currentUser.role]);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  const isEffectiveActive =
    supportInfo.supported &&
    supportInfo.permission === 'granted' &&
    (hasLocalSubscription || devices.length > 0) &&
    preferences.enabled;

  const handleToggleMain = async () => {
    setFeedback(null);
    setBusyAction('toggle');
    try {
      if (!isEffectiveActive) {
        const res = await requestAndSubscribePush(currentUser.id, currentUser.role);
        setSupportInfo(getPushSupportInfo());
        if (!res.ok) {
          setFeedback({
            type: 'error',
            message: res.error || "Impossible d'activer les notifications sur cet appareil.",
          });
        } else {
          clearPushBannerDismissal(currentUser.id);
          const updatedPrefs = await updateUserPushPreferences(currentUser.id, currentUser.role, {
            enabled: true,
          });
          if (updatedPrefs) setPreferences(updatedPrefs);
          await refreshState();
          setFeedback({
            type: 'success',
            message: 'Notifications système activées sur cet appareil.',
          });
          window.dispatchEvent(new Event('baobab-push-subscription-changed'));
        }
      } else {
        await unsubscribePushDevice(currentUser.id, currentUser.role);
        const updatedPrefs = await updateUserPushPreferences(currentUser.id, currentUser.role, {
          enabled: false,
        });
        if (updatedPrefs) setPreferences(updatedPrefs);
        await refreshState();
        setFeedback({
          type: 'info',
          message: 'Notifications système désactivées sur cet appareil.',
        });
        window.dispatchEvent(new Event('baobab-push-subscription-changed'));
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleCategory = async (key: NotificationCategoryKey) => {
    setFeedback(null);
    const nextTypes = {
      ...preferences.types,
      [key]: !preferences.types[key],
    };
    const optimistic: NotificationPreferences = { ...preferences, types: nextTypes };
    setPreferences(optimistic);
    setBusyAction('prefs');
    try {
      const saved = await updateUserPushPreferences(currentUser.id, currentUser.role, {
        types: nextTypes,
      });
      if (saved) {
        setPreferences(saved);
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleSendTest = async () => {
    setFeedback(null);
    setBusyAction('test');
    try {
      if (!hasLocalSubscription && supportInfo.supported && supportInfo.permission !== 'denied') {
        const subRes = await requestAndSubscribePush(currentUser.id, currentUser.role);
        setSupportInfo(getPushSupportInfo());
        if (!subRes.ok) {
          setFeedback({
            type: 'error',
            message: subRes.error || "Veuillez d'abord activer les notifications sur cet appareil.",
          });
          return;
        }
        clearPushBannerDismissal(currentUser.id);
        await refreshState();
      }
      const res = await triggerTestPushNotification(currentUser.id, currentUser.role);
      setFeedback({
        type: res.ok ? 'success' : 'error',
        message: res.message,
      });
    } finally {
      setBusyAction(null);
    }
  };

  const innerContent = (
    <div className="space-y-4">
      {!hideHeader && (
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-[var(--marque-clair)] text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[18px] font-bold text-slate-900 dark:text-white leading-snug">
                Notifications
              </h2>
              <div className="flex items-center gap-1 mt-0.5">
                <p className="text-[14px] text-slate-500 dark:text-slate-400 leading-snug">
                  Alertes temps réel et pastille d&apos;application.
                </p>
                <InfoTooltip
                  text={`Configurez les notifications système en temps réel et le badge d'icône pour ${currentUser.name} (${currentUser.role}).`}
                />
              </div>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white inline-flex items-center justify-center cursor-pointer shrink-0"
              aria-label="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Rappel discret lorsque les notifications ne sont pas activées ou ont été reportées pour 7 jours */}
      {!isEffectiveActive && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/80 dark:bg-amber-950/30 px-3.5 py-2.5 flex items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="font-semibold text-amber-900 dark:text-amber-200 leading-snug">
              {dismissInfo.dismissed
                ? 'Rappel : bannière masquée pour 7 jours. Vous pouvez activer les notifications ici à tout moment.'
                : 'Rappel : les notifications en temps réel ne sont pas encore activées sur cet appareil.'}
            </span>
          </div>
          <InfoTooltip text="Dans le navigateur : icône cadenas à gauche de l'adresse > Autorisations > Notifications > Autoriser. Sur Android : Paramètres > Applications > Notifications. Sur iOS : Partager > Sur l'écran d'accueil, puis Réglages > Notifications." />
        </div>
      )}

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : feedback.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
              : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          ) : feedback.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          ) : (
            <Info className="w-4 h-4 text-[#008DA9] shrink-0 mt-0.5" />
          )}
          <span className="font-medium leading-snug">{feedback.message}</span>
        </div>
      )}

      {/* Statut actuel sur l'appareil */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-900 dark:text-white">
            Statut sur cet appareil :
          </span>
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold ${
              isEffectiveActive
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
            }`}
          >
            {isEffectiveActive ? 'Activées' : 'Désactivées'}
          </span>
          <InfoTooltip text="Recevez les alertes même lorsque l'application Baobab Distribution est fermée ou en arrière-plan." />
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <Smartphone className="w-4 h-4 text-[#008DA9] shrink-0" />
          <span>
            Appareils abonnés :{' '}
            <strong className="text-slate-800 dark:text-slate-200">{devices.length}</strong>
          </span>
        </div>
      </div>

      {/* Choix des types de notifications */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Catégories d&apos;alertes
            </h3>
            <InfoTooltip text="Cochez ou décochez les familles d'alertes que vous souhaitez recevoir sur vos appareils." />
          </div>
          {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" />}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {NOTIFICATION_CATEGORY_LABELS.map((item) => {
            const checked = Boolean(preferences.types?.[item.key]);
            return (
              <label
                key={item.key}
                className={`flex items-center justify-between gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition ${
                  checked
                    ? 'bg-teal-50/40 dark:bg-teal-950/25 border-[#008DA9]/40'
                    : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-75'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleToggleCategory(item.key)}
                    className="h-4 w-4 rounded border-slate-300 text-[#15803D] focus:ring-[#15803D] cursor-pointer shrink-0"
                  />
                  <span className="font-bold text-slate-900 dark:text-white leading-snug">
                    {item.label}
                  </span>
                </div>
                <InfoTooltip text={item.description} />
              </label>
            );
          })}
        </div>
      </div>

      {/* Boutons principaux verts en bas de la section */}
      <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={handleSendTest}
          disabled={busyAction !== null || !supportInfo.supported}
          className="h-[48px] min-h-[48px] px-4 rounded-xl border border-[#15803D] bg-[#DCFCE7] hover:bg-[#BBF7D0] dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-[#15803D] dark:text-emerald-300 font-bold text-sm inline-flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
        >
          {busyAction === 'test' ? (
            <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
          ) : (
            <Send className="w-4 h-4 shrink-0" />
          )}
          <span>Tester la notification</span>
        </button>

        <button
          type="button"
          onClick={handleToggleMain}
          disabled={busyAction !== null || !supportInfo.supported}
          className="h-[48px] min-h-[48px] px-5 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50"
        >
          {busyAction === 'toggle' ? (
            <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
          ) : isEffectiveActive ? (
            <BellOff className="w-4 h-4 shrink-0" />
          ) : (
            <Bell className="w-4 h-4 shrink-0" />
          )}
          <span>
            {isEffectiveActive ? 'Désactiver les notifications' : 'Activer les notifications'}
          </span>
        </button>
      </div>
    </div>
  );

  if (hideHeader && !isModal) {
    return innerContent;
  }

  const cardWrapped = (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-xs">
      {innerContent}
    </div>
  );

  if (!isModal) {
    return cardWrapped;
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 flex items-stretch justify-center sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[90dvh] sm:max-w-[640px] bg-white dark:bg-[#0F172A] opacity-100 rounded-none sm:rounded-2xl shadow-2xl sm:border sm:border-[#64748B] dark:sm:border-[#94A3B8] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {cardWrapped}
      </div>
    </div>
  );
};

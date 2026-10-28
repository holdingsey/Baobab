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
import {
  NOTIFICATION_CATEGORY_LABELS,
  PushPreferences,
  getPushSupportInfo,
  getActivePushSubscription,
  requestAndSubscribePush,
  unsubscribePushDevice,
  fetchUserPushStatus,
  updateUserPushPreferences,
  triggerTestPushNotification,
} from '../utils/pushNotifications';

interface NotificationSettingsPanelProps {
  currentUser: UserSession;
  onClose?: () => void;
  isModal?: boolean;
}

const DEFAULT_PREFS: PushPreferences = {
  enabled: true,
  chargements: true,
  versements: true,
  pdvs: true,
  peremption: true,
  cadeaux: true,
};

export const NotificationSettingsPanel: React.FC<NotificationSettingsPanelProps> = ({
  currentUser,
  onClose,
  isModal = false,
}) => {
  const [supportInfo, setSupportInfo] = useState(() => getPushSupportInfo());
  const [hasLocalSubscription, setHasLocalSubscription] = useState(false);
  const [devices, setDevices] = useState<
    Array<{ id: string; device_label: string; updated_at: string; created_at: string }>
  >([]);
  const [preferences, setPreferences] = useState<PushPreferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<'toggle' | 'test' | 'prefs' | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const refreshState = useCallback(async () => {
    setLoading(true);
    setSupportInfo(getPushSupportInfo());
    const sub = await getActivePushSubscription();
    setHasLocalSubscription(Boolean(sub));
    const status = await fetchUserPushStatus(currentUser.id, currentUser.role);
    if (status) {
      setPreferences(status.preferences);
      setDevices(status.devices || []);
    }
    setLoading(false);
  }, [currentUser.id, currentUser.role]);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  const isEffectiveActive =
    supportInfo.supported &&
    supportInfo.permission === 'granted' &&
    hasLocalSubscription &&
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
          message: 'Notifications système désactivées pour votre compte sur cet appareil.',
        });
        window.dispatchEvent(new Event('baobab-push-subscription-changed'));
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleCategory = async (
    key: keyof Omit<PushPreferences, 'enabled'>
  ) => {
    setFeedback(null);
    const nextValue = !preferences[key];
    const optimistic: PushPreferences = { ...preferences, [key]: nextValue };
    setPreferences(optimistic);
    setBusyAction('prefs');
    try {
      const saved = await updateUserPushPreferences(currentUser.id, currentUser.role, {
        [key]: nextValue,
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

  const content = (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-xs space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-[#008DA9] dark:text-cyan-300 shrink-0">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
              Notifications
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Alertes système en temps réel et badge sur l'icône de l'application ({currentUser.name} &bull; {currentUser.role}).
            </p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Message clair si refusé ou non supporté avec marche à suivre */}
      {(!supportInfo.supported || supportInfo.permission === 'denied') && (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 space-y-2.5 text-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-extrabold text-amber-950 dark:text-amber-200 text-sm">
                {!supportInfo.supported
                  ? 'Notifications système non prises en charge dans ce contexte'
                  : 'Permission de notifications refusée sur cet appareil'}
              </div>
              <p className="text-amber-900 dark:text-amber-300 leading-relaxed">
                {supportInfo.reason ||
                  'Les notifications système sont bloquées par les réglages de votre navigateur ou de votre téléphone.'}
              </p>
            </div>
          </div>
          <div className="pl-7 space-y-1.5 text-amber-900 dark:text-amber-200 border-t border-amber-200/70 dark:border-amber-800/70 pt-2.5">
            <div className="font-bold">Marche à suivre pour activer les notifications :</div>
            <ul className="list-disc list-inside space-y-1 text-[11px] leading-relaxed">
              <li>
                <strong>Dans le navigateur (Chrome / Edge / Firefox) :</strong> appuyez sur l'icône de cadenas ou de réglages à gauche de la barre d'adresse &rarr; <em>Autorisations</em> &rarr; <em>Notifications</em> &rarr; sélectionnez <strong>Autoriser</strong>, puis rechargez la page.
              </li>
              <li>
                <strong>Sur téléphone ou tablette Android :</strong> ouvrez <em>Paramètres</em> &rarr; <em>Applications</em> &rarr; <em>Baobab Distribution</em> (ou <em>Chrome</em>) &rarr; <em>Notifications</em> &rarr; activez <strong>Autoriser les notifications</strong>.
              </li>
              <li>
                <strong>Sur iPhone / iPad (iOS / iPadOS) :</strong> touchez <em>Partager</em> &rarr; <em>Sur l'écran d'accueil</em>, ouvrez l'application installée, puis allez dans <em>Réglages</em> &rarr; <em>Notifications</em> &rarr; <em>Baobab</em> &rarr; activez <strong>Autoriser les notifications</strong> et <strong>Pastilles</strong>.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs ${
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
          <span className="font-medium leading-relaxed">{feedback.message}</span>
        </div>
      )}

      {/* Activer / Désactiver + Tester */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold text-slate-900 dark:text-white">
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
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Recevez les alertes même lorsque l'application Baobab Distribution est fermée.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleToggleMain}
            disabled={busyAction !== null || !supportInfo.supported}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer disabled:opacity-50 ${
              isEffectiveActive
                ? 'bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-100'
                : 'bg-[#008DA9] hover:bg-[#00748C] text-white shadow-xs'
            }`}
          >
            {busyAction === 'toggle' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : isEffectiveActive ? (
              <BellOff className="w-3.5 h-3.5" />
            ) : (
              <Bell className="w-3.5 h-3.5" />
            )}
            <span>
              {isEffectiveActive ? 'Désactiver les notifications' : 'Activer les notifications'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleSendTest}
            disabled={busyAction !== null || !supportInfo.supported}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold bg-teal-50 hover:bg-teal-100 text-[#008DA9] dark:bg-teal-950/60 dark:hover:bg-teal-900/60 dark:text-cyan-300 border border-[#008DA9]/30 transition cursor-pointer disabled:opacity-50"
          >
            {busyAction === 'test' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>Envoyer une notification de test</span>
          </button>
        </div>
      </div>

      {/* Choix des types de notifications */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Types de notifications reçues
          </h3>
          {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" />}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {(
            Object.keys(NOTIFICATION_CATEGORY_LABELS) as Array<
              keyof Omit<PushPreferences, 'enabled'>
            >
          ).map((key) => {
            const item = NOTIFICATION_CATEGORY_LABELS[key];
            const checked = Boolean(preferences[key]);
            return (
              <label
                key={key}
                className={`flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition ${
                  checked
                    ? 'bg-teal-50/40 dark:bg-teal-950/25 border-[#008DA9]/40'
                    : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-75'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => handleToggleCategory(key)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#008DA9] focus:ring-[#008DA9] cursor-pointer"
                />
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 dark:text-white">{item.label}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                    {item.description}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Appareils enregistrés (téléphone, tablette, ordinateur) */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-1.5">
          <Smartphone className="w-4 h-4 text-[#008DA9]" />
          <span>
            Appareils abonnés pour <strong>{currentUser.name}</strong> :{' '}
            <strong className="text-slate-800 dark:text-slate-200">{devices.length}</strong>
          </span>
        </div>
        {devices.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {devices.map((d) => (
              <span
                key={d.id}
                className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-semibold"
              >
                {d.device_label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (!isModal) {
    return content;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs overflow-y-auto"
      onClick={onClose}
    >
      <div className="max-w-2xl w-full my-auto" onClick={(e) => e.stopPropagation()}>
        {content}
      </div>
    </div>
  );
};

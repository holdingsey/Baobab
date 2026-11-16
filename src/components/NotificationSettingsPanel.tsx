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
  Activity,
  BatteryCharging,
  Clock,
} from 'lucide-react';
import { UserSession } from './LoginScreen';
import { InfoTooltip } from './InfoTooltip';
import {
  NOTIFICATION_CATEGORY_LABELS,
  NotificationCategoryKey,
  NotificationPreferences,
  DEFAULT_NOTIFICATION_TYPES,
  PushDiagnosticsResponse,
  getPushSupportInfo,
  getActivePushSubscription,
  requestAndSubscribePush,
  unsubscribePushDevice,
  fetchUserPushStatus,
  updateUserPushPreferences,
  triggerTestPushNotification,
  fetchPushDiagnostics,
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
  const isAdmin = currentUser.role === 'Administrateur';
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
    hideAmountsOnLockScreen: true,
    minSaleAmount: 0,
    saleScope: 'all',
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '06:00',
  });
  const [diagnostics, setDiagnostics] = useState<PushDiagnosticsResponse | null>(null);
  const [lastMeasuredLatencyMs, setLastMeasuredLatencyMs] = useState<number | null>(null);
  const [lastTestStatusCode, setLastTestStatusCode] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<'toggle' | 'test' | 'prefs' | 'diag' | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [dismissInfo, setDismissInfo] = useState(() => getPushBannerDismissInfo(currentUser.id));

  const refreshDiagnostics = useCallback(async () => {
    if (!isAdmin) return;
    const diag = await fetchPushDiagnostics(currentUser.id, currentUser.role);
    if (diag) {
      setDiagnostics(diag);
    }
  }, [currentUser.id, currentUser.role, isAdmin]);

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
    if (isAdmin) {
      await refreshDiagnostics();
    }
    setLoading(false);
  }, [currentUser.id, currentUser.role, isAdmin, refreshDiagnostics]);

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

  const handleUpdateSalesPrefs = async (patch: Partial<NotificationPreferences>) => {
    setFeedback(null);
    const optimistic: NotificationPreferences = { ...preferences, ...patch };
    setPreferences(optimistic);
    setBusyAction('prefs');
    try {
      const saved = await updateUserPushPreferences(currentUser.id, currentUser.role, patch);
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
      if (typeof res.latencyMs === 'number') {
        setLastMeasuredLatencyMs(res.latencyMs);
      }
      if (typeof res.statusCode === 'number') {
        setLastTestStatusCode(res.statusCode);
      }
      setFeedback({
        type: res.ok ? 'success' : 'error',
        message: res.message,
      });
      if (isAdmin) {
        await refreshDiagnostics();
      }
    } finally {
      setBusyAction(null);
    }
  };

  const formatTimeIso = (isoStr?: string) => {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      if (Number.isNaN(d.getTime())) return isoStr;
      return d.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  const innerContent = (
    <div className="space-y-5">
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
                  Alertes temps réel, diagnostic et pastille d&apos;application.
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
          <InfoTooltip text="Recevez les alertes immédiatement même lorsque l'application Baobab Distribution est fermée ou en arrière-plan." />
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

      {/* RÉGLAGES PUSH DE VENTE (Masquage écran verrouillé, Périmètre, Seuil minimum, Heures silencieuses) */}
      {currentUser.role !== 'Gestionnaire de stock' && currentUser.role !== 'Magasinier' && (
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Réglages des Notifications Push de Vente
              </h3>
              <InfoTooltip text="Personnalisez vos notifications push de vente (masquage des montants sur l'écran verrouillé, seuil minimum, périmètre et heures silencieuses). Vos choix ne modifient jamais vos droits d'accès." />
            </div>
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Regroupement auto &gt; 5 ventes / 2 min
            </span>
          </div>

          {/* Option : Masquer les montants sur l'écran verrouillé (activée par défaut) */}
          <label className="flex items-start justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 cursor-pointer">
            <div className="space-y-0.5 min-w-0">
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                Masquer les montants sur l&apos;écran verrouillé
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                {(preferences.hideAmountsOnLockScreen ?? true)
                  ? 'Activé (par défaut) : affiche « Nouvelle vente enregistrée » sur l’écran verrouillé (le détail complet reste dans la cloche).'
                  : 'Désactivé : affiche « Oumar K. · Alimentation Générale Sotuba · 48 000 FCFA » dans la notification.'}
              </p>
            </div>
            <input
              type="checkbox"
              checked={preferences.hideAmountsOnLockScreen ?? true}
              onChange={(e) => handleUpdateSalesPrefs({ hideAmountsOnLockScreen: e.target.checked })}
              className="h-4 w-4 mt-0.5 rounded border-slate-300 text-[#15803D] focus:ring-[#15803D] cursor-pointer shrink-0"
            />
          </label>

          {/* Périmètre et Seuil de montant minimum */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Périmètre des ventes notifiées
              </label>
              <select
                value={preferences.saleScope || 'all'}
                onChange={(e) =>
                  handleUpdateSalesPrefs({
                    saleScope: e.target.value as 'all' | 'mine' | 'above_threshold',
                  })
                }
                className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white"
              >
                <option value="all">Toutes les ventes de mon périmètre</option>
                <option value="mine">Seulement les miennes</option>
                <option value="above_threshold">Seulement au-dessus d&apos;un montant</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Seuil de montant minimum (FCFA)
              </label>
              <input
                type="number"
                min={0}
                step={1000}
                value={preferences.minSaleAmount ?? 0}
                onChange={(e) => {
                  const val = Math.max(0, Math.round(Number(e.target.value) || 0));
                  setPreferences((prev) => ({ ...prev, minSaleAmount: val }));
                }}
                onBlur={(e) => {
                  const val = Math.max(0, Math.round(Number(e.target.value) || 0));
                  void handleUpdateSalesPrefs({ minSaleAmount: val });
                }}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold text-slate-900 dark:text-white"
                placeholder="0"
              />
            </div>
          </div>

          {/* Heures silencieuses (par défaut aucune) */}
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2.5">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  Heures silencieuses
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {preferences.quietHoursEnabled
                    ? `Actives de ${preferences.quietHoursStart || '22:00'} à ${preferences.quietHoursEnd || '06:00'} (les ventes restent enregistrées dans la cloche).`
                    : 'Aucune heure silencieuse par défaut (notifications push reçues 24h/24).'}
                </p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(preferences.quietHoursEnabled)}
                onChange={(e) => handleUpdateSalesPrefs({ quietHoursEnabled: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-[#15803D] focus:ring-[#15803D] cursor-pointer shrink-0"
              />
            </label>

            {preferences.quietHoursEnabled && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400">
                    Début
                  </label>
                  <input
                    type="time"
                    value={preferences.quietHoursStart || '22:00'}
                    onChange={(e) => handleUpdateSalesPrefs({ quietHoursStart: e.target.value })}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold text-slate-900 dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400">
                    Fin
                  </label>
                  <input
                    type="time"
                    value={preferences.quietHoursEnd || '06:00'}
                    onChange={(e) => handleUpdateSalesPrefs({ quietHoursEnd: e.target.value })}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION DIAGNOSTIC : Test de latence, Aide économie de batterie & Journal Administrateur */}
      <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#008DA9] shrink-0" />
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              Diagnostic &amp; Latence des Notifications Push
            </h3>
          </div>
          {lastMeasuredLatencyMs !== null && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-200 text-xs font-bold">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>
                Délai mesuré : {lastMeasuredLatencyMs} ms
                {lastTestStatusCode ? ` (HTTP ${lastTestStatusCode})` : ''}
              </span>
            </span>
          )}
        </div>

        {/* Message d'aide si l'appareil bloque les notifications (économie de batterie / arrière-plan) */}
        <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/25 space-y-1.5 text-xs">
          <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-200">
            <BatteryCharging className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              Aide : que faire si l&apos;appareil retarde ou bloque les notifications (économie de batterie) ?
            </span>
          </div>
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
            Sur smartphone, le mode <strong>Économie d&apos;énergie / Optimisation de la batterie</strong> peut
            suspendre la réception en arrière-plan lorsque l&apos;application est fermée :
          </p>
          <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-300 leading-snug">
            <li>
              <strong>Android (Chrome / PWA) :</strong> ouvrez <em>Paramètres &gt; Applications &gt; Chrome (ou Baobab Distribution) &gt; Batterie</em> et sélectionnez <strong>« Non restreinte »</strong>, puis désactivez l&apos;économiseur de données pour l&apos;application.
            </li>
            <li>
              <strong>iPhone / iPad (iOS) :</strong> installez l&apos;application sur l&apos;écran d&apos;accueil, désactivez le <em>Mode économie d&apos;énergie</em> et autorisez les alertes immédiates dans <em>Réglages &gt; Notifications</em>.
            </li>
          </ul>
        </div>

        {/* Boutons d'action : Envoyer une notification de test & Activer/Désactiver */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
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
            <span>Envoyer une notification de test</span>
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

        {/* Journal des envois Push & Délai moyen (visible par l'Administrateur) */}
        {isAdmin && (
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  Journal des envois Push (Administrateur)
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Heure de création, heure d&apos;envoi, code de réponse HTTP, réessais et délai moyen.
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  setBusyAction('diag');
                  await refreshDiagnostics();
                  setBusyAction(null);
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-xs font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${busyAction === 'diag' ? 'animate-spin' : ''}`} />
                <span>Actualiser</span>
              </button>
            </div>

            {/* Indicateurs de latence et de fiabilité */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-[10px] font-bold uppercase text-slate-500">Délai moyen</div>
                <div className="text-base font-black text-[#008DA9] mt-0.5">
                  {diagnostics ? `${diagnostics.avgLatencyMs} ms` : '0 ms'}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-[10px] font-bold uppercase text-slate-500">Envois réussis</div>
                <div className="text-base font-black text-emerald-600 mt-0.5">
                  {diagnostics ? `${diagnostics.successCount} / ${diagnostics.totalSent}` : '0 / 0'}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-[10px] font-bold uppercase text-slate-500">Clients SSE actifs</div>
                <div className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                  {diagnostics ? diagnostics.connectedSseClientsCount : 0}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-[10px] font-bold uppercase text-slate-500">404/410 purgés</div>
                <div className="text-base font-black text-amber-600 mt-0.5">
                  {diagnostics ? diagnostics.removedSubscriptionsCount : 0}
                </div>
              </div>
            </div>

            {/* Liste des envois enregistrés */}
            {!diagnostics || diagnostics.logs.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-center text-xs text-slate-400">
                Aucun envoi push enregistré pour le moment. Cliquez sur « Envoyer une notification de test » ou déclenchez une validation métier.
              </div>
            ) : (
              <div className="max-h-[260px] overflow-y-auto space-y-2 pr-1">
                {diagnostics.logs.map((log) => (
                  <div
                    key={log.id}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-slate-900 dark:text-white">{log.title}</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                          {log.user_role}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            log.urgency === 'high'
                              ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {log.urgency}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Création : <strong className="font-mono">{formatTimeIso(log.created_at)}</strong> &bull; Envoi :{' '}
                        <strong className="font-mono">{formatTimeIso(log.sent_at)}</strong> &bull; Essais :{' '}
                        <strong>{log.attempts}</strong>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <span className="font-mono font-bold text-[#008DA9]">{log.latency_ms} ms</span>
                      <span
                        className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                          log.status === 'succes'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : log.status === 'abonnement_supprime'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        }`}
                      >
                        HTTP {log.status_code}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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

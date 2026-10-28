import React from 'react';
import {
  Menu,
  Sun,
  Moon,
  Shield,
  Bell,
  User,
  Wifi,
  WifiOff,
  Receipt,
  ShoppingBag,
  X,
  CheckCircle,
  ExternalLink,
  Store,
  FileText,
  Gift,
  Package,
  Clock,
  Settings,
} from 'lucide-react';
import { BaobabLogo } from './BaobabLogo';
import { PWAInstallButton } from './PWAInstallButton';
import { UserSession } from './LoginScreen';
import { InvoiceData } from './PrintableDocument';
import { NotificationSettingsPanel } from './NotificationSettingsPanel';
import {
  isAppOnline,
  isSimulatedOffline,
  setSimulatedOffline,
  getOfflineSalesQueue,
  getOfflineGpsQueue,
} from '../utils/offlineSync';
import {
  syncAppBadge,
  clearAppBadge,
  closeSystemNotifications,
  ensureUserAuthToken,
  getPushSupportInfo,
  getActivePushSubscription,
  requestAndSubscribePush,
  fetchUserPushStatus,
} from '../utils/pushNotifications';

interface HeaderProps {
  currentUser: UserSession;
  usersList?: UserSession[];
  logoUrl?: string;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenMobileMenu: () => void;
  onSwitchRole: (newRole: 'Administrateur' | 'Magasinier' | 'Comptable' | 'Vendeur') => void;
  onSwitchUser?: (user: UserSession) => void;
  onOpenDocument?: (doc: InvoiceData) => void;
  onNavigateTab?: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  usersList = [],
  logoUrl,
  theme,
  onToggleTheme,
  onOpenMobileMenu,
  onSwitchRole,
  onSwitchUser,
  onOpenDocument,
  onNavigateTab,
}) => {
  const [notifications, setNotifications] = React.useState<any[]>([]);
  const [showNotifMenu, setShowNotifMenu] = React.useState(false);
  const [showNotifSettingsModal, setShowNotifSettingsModal] = React.useState(false);
  const [selectedNotification, setSelectedNotification] = React.useState<any | null>(null);
  const [showPushInvite, setShowPushInvite] = React.useState(false);
  const [pushInviteBusy, setPushInviteBusy] = React.useState(false);
  const [online, setOnline] = React.useState<boolean>(() => isAppOnline());
  const [pendingCount, setPendingCount] = React.useState<number>(
    () => getOfflineSalesQueue().length + getOfflineGpsQueue().length
  );

  React.useEffect(() => {
    const syncState = () => {
      setOnline(isAppOnline());
      setPendingCount(getOfflineSalesQueue().length + getOfflineGpsQueue().length);
    };
    window.addEventListener('online', syncState);
    window.addEventListener('offline', syncState);
    window.addEventListener('baobab-network-change', syncState);
    window.addEventListener('baobab-queue-updated', syncState);
    window.addEventListener('baobab-sync-completed', syncState);
    return () => {
      window.removeEventListener('online', syncState);
      window.removeEventListener('offline', syncState);
      window.removeEventListener('baobab-network-change', syncState);
      window.removeEventListener('baobab-queue-updated', syncState);
      window.removeEventListener('baobab-sync-completed', syncState);
    };
  }, []);

  const vendorUsers = React.useMemo(
    () => usersList.filter((u) => u.role === 'Vendeur'),
    [usersList]
  );

  const fetchNotifs = React.useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', {
        headers: {
          'x-user-role': currentUser.role,
          'x-user-id': currentUser.id,
        },
      });
      if (res.ok) {
        const d = await res.json();
        if (d.notifications) {
          setNotifications(d.notifications);
          const count =
            typeof d.unreadCount === 'number'
              ? d.unreadCount
              : d.notifications.filter((n: any) => !n.is_read).length;
          syncAppBadge(count);
        }
      }
    } catch {
      // ignore
    }
  }, [currentUser.role, currentUser.id]);

  React.useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 8000);
    const handleNotifsUpdated = () => {
      fetchNotifs();
    };
    window.addEventListener('baobab-notifications-updated', handleNotifsUpdated);
    return () => {
      clearInterval(interval);
      window.removeEventListener('baobab-notifications-updated', handleNotifsUpdated);
    };
  }, [fetchNotifs]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // Synchronise le badge de l'icône à chaque changement du compteur
  React.useEffect(() => {
    syncAppBadge(unreadCount);
  }, [unreadCount]);

  // Vérifie l'état d'abonnement push après connexion pour afficher l'invite discrète "Activer les notifications"
  const checkPushSubscriptionState = React.useCallback(async () => {
    await ensureUserAuthToken(currentUser.id, currentUser.role);
    const support = getPushSupportInfo();
    if (!support.supported) {
      setShowPushInvite(false);
      return;
    }
    const dismissedKey = `baobab_push_invite_dismissed_${currentUser.id}`;
    if (sessionStorage.getItem(dismissedKey) === '1') {
      setShowPushInvite(false);
      return;
    }
    const localSub = await getActivePushSubscription();
    if (localSub && support.permission === 'granted') {
      // Si l'appareil a déjà un abonnement local et la permission accordée, on s'assure qu'il est lié à l'utilisateur courant
      const status = await fetchUserPushStatus(currentUser.id, currentUser.role);
      if (status && status.devices && status.devices.length > 0 && status.preferences.enabled) {
        setShowPushInvite(false);
        return;
      }
    }
    setShowPushInvite(true);
  }, [currentUser.id, currentUser.role]);

  React.useEffect(() => {
    checkPushSubscriptionState();
    const onSubChanged = () => {
      checkPushSubscriptionState();
    };
    window.addEventListener('baobab-push-subscription-changed', onSubChanged);
    return () => {
      window.removeEventListener('baobab-push-subscription-changed', onSubChanged);
    };
  }, [checkPushSubscriptionState]);

  // Écoute les messages du Service Worker (push reçu ou clic sur notification système)
  React.useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const handleSwMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'BAOBAB_PUSH_RECEIVED') {
        if (typeof msg.unreadCount === 'number') {
          syncAppBadge(msg.unreadCount);
        }
        fetchNotifs();
      } else if (msg.type === 'BAOBAB_NOTIFICATION_CLICK') {
        if (msg.tab && onNavigateTab) {
          onNavigateTab(msg.tab);
        }
        fetchNotifs();
      }
    };
    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSwMessage);
    };
  }, [fetchNotifs, onNavigateTab]);

  const handleActivateNotificationsClick = async () => {
    setPushInviteBusy(true);
    try {
      const res = await requestAndSubscribePush(currentUser.id, currentUser.role);
      if (res.ok) {
        setShowPushInvite(false);
      } else {
        // Si refusé ou non supporté, ouvre le panneau des réglages qui affiche le message clair et la marche à suivre
        setShowNotifSettingsModal(true);
      }
    } finally {
      setPushInviteBusy(false);
    }
  };

  const handleDismissPushInvite = () => {
    sessionStorage.setItem(`baobab_push_invite_dismissed_${currentUser.id}`, '1');
    setShowPushInvite(false);
  };

  const markAsRead = async (id: string) => {
    const targetNotif = notifications.find(n => n.id === id);
    try {
      setNotifications(prev => {
        const updated = prev.map(n => (n.id === id ? { ...n, is_read: 1 } : n));
        const nextUnread = updated.filter(n => !n.is_read).length;
        syncAppBadge(nextUnread);
        return updated;
      });
      await closeSystemNotifications({
        notificationId: id,
        reference: targetNotif?.reference,
        type: targetNotif?.type,
      });
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentUser.role,
          'x-user-id': currentUser.id,
        },
        body: JSON.stringify({ role: currentUser.role, userId: currentUser.id }),
      });
      if (res.ok) {
        const d = await res.json();
        if (typeof d.unreadCount === 'number') {
          syncAppBadge(d.unreadCount);
        }
      }
    } catch {
      // ignore
    }
  };

  const markAllAsRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
    clearAppBadge();
    await closeSystemNotifications({ closeAll: true });
    try {
      await fetch('/api/notifications/read-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentUser.role,
          'x-user-id': currentUser.id,
        },
        body: JSON.stringify({ role: currentUser.role, userId: currentUser.id }),
      });
    } catch {
      // ignore
    }
  };

  const handleOpenNotificationMessage = (n: any) => {
    if (!n.is_read) {
      markAsRead(n.id);
    } else {
      closeSystemNotifications({
        notificationId: n.id,
        reference: n.reference,
        type: n.type,
      });
    }
    setSelectedNotification({ ...n, is_read: 1 });
    setShowNotifMenu(false);
  };

  const getNotificationActionTarget = (n: any): { tab: string; label: string; icon: React.ReactNode } | null => {
    if (!onNavigateTab || !n) return null;
    const type = String(n.type || '');
    const ref = String(n.reference || '');
    const title = String(n.title || '').toLowerCase();

    if (
      type === 'demande_achat' ||
      type === 'validation_demande_achat' ||
      type === 'rejet_demande_achat' ||
      ref.startsWith('ACH-')
    ) {
      return {
        tab: 'demandes-achat',
        label: "Ouvrir les Demandes d'achat",
        icon: <ShoppingBag className="w-3.5 h-3.5" />,
      };
    }

    if (
      type === 'creation_pdv' ||
      type === 'validation_pdv' ||
      type === 'rejet_pdv' ||
      ref.startsWith('PDV-') ||
      title.includes('pdv') ||
      title.includes('point de vente')
    ) {
      return {
        tab: currentUser.role === 'Administrateur' ? 'validation-pdv' : 'mes-pdvs',
        label: currentUser.role === 'Administrateur' ? 'Ouvrir Validation PDV' : 'Ouvrir Mes PDV',
        icon: <Store className="w-3.5 h-3.5" />,
      };
    }

    if (type === 'versement' || ref.startsWith('VSM-') || title.includes('versement')) {
      return {
        tab: currentUser.role === 'Vendeur' ? 'mes-versements' : 'versements',
        label: currentUser.role === 'Vendeur' ? 'Ouvrir Mes Versements' : 'Ouvrir les Versements',
        icon: <Receipt className="w-3.5 h-3.5" />,
      };
    }

    if (
      type === 'rectification_facture' ||
      type === 'facture_rectifiee' ||
      type === 'facture' ||
      ref.startsWith('FAC-') ||
      ref.startsWith('RECT-') ||
      title.includes('facture')
    ) {
      return {
        tab: currentUser.role === 'Vendeur' ? 'mes-factures' : 'factures',
        label: currentUser.role === 'Vendeur' ? 'Ouvrir Mes Factures' : 'Ouvrir Factures & Rectifications',
        icon: <FileText className="w-3.5 h-3.5" />,
      };
    }

    if (type === 'cadeau' || ref.startsWith('BON-') || title.includes('gratter') || title.includes('cadeau')) {
      if (currentUser.role === 'Magasinier') {
        return {
          tab: 'bons-a-remettre',
          label: 'Ouvrir Bons à remettre',
          icon: <Gift className="w-3.5 h-3.5" />,
        };
      }
      return {
        tab: currentUser.role === 'Vendeur' ? 'mes-cadeaux' : 'cadeaux',
        label: 'Ouvrir Bons Cadeaux',
        icon: <Gift className="w-3.5 h-3.5" />,
      };
    }

    if (type === 'alerte_peremption' || ref.startsWith('LOT-') || title.includes('péremption')) {
      return {
        tab: 'lots',
        label: 'Ouvrir Lots & FEFO',
        icon: <Package className="w-3.5 h-3.5" />,
      };
    }

    if (type === 'retour' || ref.startsWith('RET-') || title.includes('retour')) {
      return {
        tab: currentUser.role === 'Vendeur' ? 'mon-stock' : 'retours',
        label: currentUser.role === 'Vendeur' ? 'Ouvrir Mon Stock' : 'Ouvrir les Retours',
        icon: <Package className="w-3.5 h-3.5" />,
      };
    }

    if (type === 'chargement' || ref.startsWith('CHG-') || title.includes('chargement')) {
      return {
        tab: currentUser.role === 'Vendeur' ? 'mon-chargement' : 'chargements',
        label: 'Ouvrir les Chargements',
        icon: <Package className="w-3.5 h-3.5" />,
      };
    }

    return null;
  };

  const formatNotifDateTime = (isoStr?: string) => {
    if (!isoStr) return '';
    if (isoStr.includes('T')) {
      const [d, t] = isoStr.split('T');
      return `${d} à ${t.slice(0, 5)}`;
    }
    return isoStr;
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
        <div className="flex items-center justify-between gap-2 px-3 sm:px-5 lg:px-6 h-16">
          {/* Left: Mobile menu toggle + Header Logo */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <button
              onClick={onOpenMobileMenu}
              className="p-2 -ml-1 rounded-xl text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white lg:hidden cursor-pointer shrink-0"
              aria-label="Ouvrir le menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Logo visible on Mobile, Tablet and Desktop */}
            <div
              onClick={() => (onNavigateTab ? onNavigateTab('dashboard') : null)}
              className="flex items-center gap-2 cursor-pointer select-none shrink-0"
              title="Baobab Distribution - Accueil"
            >
              <BaobabLogo
                variant="header"
                size={32}
                logoUrl={logoUrl}
                showTextOnPC={true}
              />
            </div>
          </div>

          {/* Center / Right: Quick Role Switcher + Notifications + PWA Install + Theme Toggle */}
          <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-2.5 shrink-0">
            {/* Quick Role Switcher dropdown for quick testing */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700/70 text-xs whitespace-nowrap shrink-0">
              <Shield className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
              <span className="hidden xl:inline text-slate-500 text-xs whitespace-nowrap">Rôle :</span>
              <select
                value={currentUser.role}
                onChange={(e) =>
                  onSwitchRole(
                    e.target.value as 'Administrateur' | 'Magasinier' | 'Comptable' | 'Vendeur'
                  )
                }
                className="bg-transparent font-bold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="Administrateur" className="dark:bg-slate-900">
                  Administrateur
                </option>
                <option value="Magasinier" className="dark:bg-slate-900">
                  Magasinier
                </option>
                <option value="Comptable" className="dark:bg-slate-900">
                  Comptable
                </option>
                <option value="Vendeur" className="dark:bg-slate-900">
                  Vendeur
                </option>
              </select>
            </div>

            {/* Vendor Account Selector when role === 'Vendeur' */}
            {currentUser.role === 'Vendeur' && vendorUsers.length > 1 && onSwitchUser && (
              <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#008DA9]/10 border border-[#008DA9]/30 text-xs whitespace-nowrap shrink-0">
                <User className="w-3.5 h-3.5 text-[#008DA9] shrink-0" />
                <select
                  value={currentUser.id}
                  onChange={(e) => {
                    const found = vendorUsers.find((v) => v.id === e.target.value);
                    if (found) onSwitchUser(found);
                  }}
                  className="bg-transparent font-bold text-[#008DA9] dark:text-cyan-300 focus:outline-none cursor-pointer max-w-[140px] lg:max-w-none truncate"
                  title="Changer de compte vendeur"
                >
                  {vendorUsers.map((v) => (
                    <option key={v.id} value={v.id} className="dark:bg-slate-900 text-slate-900 dark:text-white">
                      {v.name} ({v.code})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Network Status & Offline Sync Toggle */}
            <button
              type="button"
              onClick={() => setSimulatedOffline(!isSimulatedOffline())}
              title={
                online
                  ? 'Réseau actif — Cliquer pour tester le mode Hors-Ligne (sans réseau)'
                  : 'Mode Hors-Ligne actif — Cliquer pour rétablir le réseau et synchroniser automatiquement'
              }
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer whitespace-nowrap shrink-0 ${
                online
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                  : 'bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200'
              }`}
            >
              {online ? <Wifi className="w-4 h-4 shrink-0" /> : <WifiOff className="w-4 h-4 shrink-0" />}
              <span className="hidden sm:inline whitespace-nowrap">{online ? 'En ligne' : 'Hors-ligne'}</span>
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-600 text-white text-[10px] font-black leading-none">
                  {pendingCount}
                </span>
              )}
            </button>

            {/* Notifications Bell */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowNotifMenu(v => !v)}
                className="relative p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800 transition cursor-pointer"
                title="Notifications système"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-black text-white shadow-xs">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Popover — Optimized for Mobile (fixed inset-x-2.5 so it never overflows left) and Desktop */}
              {showNotifMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40 bg-black/25 sm:bg-transparent"
                    onClick={() => setShowNotifMenu(false)}
                  />
                  <div className="fixed left-2.5 right-2.5 top-[4.25rem] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 w-auto sm:w-96 max-w-[calc(100vw-1.25rem)] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl z-50 p-3 sm:p-3.5 text-xs">
                    <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                      <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5 min-w-0">
                        <Bell className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                        <span className="truncate">Notifications &bull; {currentUser.role}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {unreadCount > 0 && (
                          <button
                            type="button"
                            onClick={markAllAsRead}
                            className="px-2 py-0.5 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-[#008DA9] dark:text-cyan-300 text-[10px] font-bold hover:bg-teal-100 cursor-pointer"
                          >
                            Tout marquer comme lu ({unreadCount})
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setShowNotifMenu(false);
                            setShowNotifSettingsModal(true);
                          }}
                          title="Réglages des notifications"
                          className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 hover:text-[#008DA9] dark:text-slate-300 dark:hover:text-cyan-300 cursor-pointer"
                          aria-label="Réglages des notifications"
                        >
                          <Settings className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowNotifMenu(false)}
                          className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                          aria-label="Fermer les notifications"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="max-h-[68vh] sm:max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 py-1">
                      {notifications.length === 0 ? (
                        <div className="py-6 text-center text-slate-400 text-xs">
                          Aucune notification pour le moment.
                        </div>
                      ) : (
                        notifications.map(n => (
                          <div
                            key={n.id}
                            onClick={() => handleOpenNotificationMessage(n)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleOpenNotificationMessage(n);
                              }
                            }}
                            className={`p-2.5 sm:p-3 rounded-xl transition cursor-pointer ${
                              !n.is_read
                                ? 'bg-teal-50/70 dark:bg-teal-950/35 border-l-2 border-[#008DA9]'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className={`font-bold text-xs leading-snug break-words ${
                                n.type === 'ecart' || n.type === 'rejet_demande_achat' || n.type === 'rejet_pdv'
                                  ? 'text-red-600 dark:text-red-400'
                                  : n.type === 'rectification_facture'
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : n.type === 'validation_demande_achat' || n.type === 'facture_rectifiee' || n.type === 'validation_pdv'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-slate-800 dark:text-slate-200'
                              }`}>
                                {n.title}
                              </span>
                              <span className="text-[9px] text-slate-400 whitespace-nowrap shrink-0">
                                {n.created_at?.split('T')[0] || ''}
                              </span>
                            </div>

                            <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-snug line-clamp-2 break-words">
                              {n.message}
                            </p>

                            <div className="mt-2 pt-1.5 border-t border-slate-200/60 dark:border-slate-800 flex flex-wrap items-center justify-between gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenNotificationMessage(n);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#008DA9]/15 hover:bg-[#008DA9] text-[#008DA9] hover:text-white dark:text-cyan-300 font-bold text-[10px] transition cursor-pointer"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>Ouvrir le message</span>
                              </button>

                              {/* Si la notification contient une Mini Facture Thermique soumise comme preuve */}
                              {n.proof && onOpenDocument && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    markAsRead(n.id);
                                    setShowNotifMenu(false);
                                    onOpenDocument({
                                      ...n.proof,
                                      type: 'mini_thermique',
                                      isProofPreview: true,
                                    });
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[10px] shadow-xs cursor-pointer"
                                >
                                  <Receipt className="w-3 h-3" />
                                  <span>Voir Preuve Thermique</span>
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* PWA Install Button (Mandatory as per PWA guidelines) */}
            <PWAInstallButton compact />

            {/* Dark / Light Theme Toggle */}
            <button
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
              className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800 transition shrink-0 cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-600" />
              )}
            </button>

            {/* User Avatar badge */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800 shrink-0 whitespace-nowrap">
              <div className="h-8 w-8 rounded-full bg-teal-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                {currentUser.name.charAt(0)}
              </div>
              <span className="hidden md:inline text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                {currentUser.name.split(' ')[0]}
              </span>
            </div>
          </div>
        </div>

        {/* Invite discrète "Activer les notifications" après connexion (demande de permission au clic seulement) */}
        {showPushInvite && (
          <div className="px-3 sm:px-5 lg:px-6 py-2 bg-teal-50/90 dark:bg-slate-800/95 border-t border-teal-200/70 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Bell className="w-4 h-4 text-[#008DA9] dark:text-cyan-400 shrink-0" />
              <span className="text-slate-700 dark:text-slate-200 font-medium truncate">
                Recevez les alertes Baobab Distribution en temps réel sur cet appareil.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleActivateNotificationsClick}
                disabled={pushInviteBusy}
                className="px-3 py-1 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-extrabold text-xs transition cursor-pointer disabled:opacity-60"
              >
                {pushInviteBusy ? 'Activation...' : 'Activer les notifications'}
              </button>
              <button
                type="button"
                onClick={() => setShowNotifSettingsModal(true)}
                className="px-2.5 py-1 rounded-xl bg-white/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs hover:bg-white transition cursor-pointer"
              >
                Réglages
              </button>
              <button
                type="button"
                onClick={handleDismissPushInvite}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white cursor-pointer"
                aria-label="Masquer l'invite de notifications"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Modal Réglages des Notifications */}
      {showNotifSettingsModal && (
        <NotificationSettingsPanel
          currentUser={currentUser}
          isModal={true}
          onClose={() => setShowNotifSettingsModal(false)}
        />
      )}

      {/* Notification Message Detail Modal — Opens when tapping any notification on Mobile or Desktop */}
      {selectedNotification && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs overflow-y-auto"
          onClick={() => setSelectedNotification(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-[#008DA9]/15 text-[#008DA9] dark:text-cyan-300 flex items-center justify-center shrink-0">
                  <Bell className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#008DA9] dark:text-cyan-400">
                      Message de Notification
                    </span>
                    {selectedNotification.reference && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {selectedNotification.reference}
                      </span>
                    )}
                  </div>
                  <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white leading-snug break-words mt-0.5">
                    {selectedNotification.title}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNotification(null)}
                className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center justify-center shrink-0 cursor-pointer"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Date & Destinataire info */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 rounded-xl">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#008DA9]" />
                <span>Reçu le : <strong className="text-slate-700 dark:text-slate-200">{formatNotifDateTime(selectedNotification.created_at)}</strong></span>
              </div>
              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-bold">
                <CheckCircle className="w-3.5 h-3.5" />
                Message lu
              </span>
            </div>

            {/* Full Notification Message Body */}
            <div className="p-4 rounded-2xl bg-teal-50/50 dark:bg-slate-800/80 border border-teal-200/70 dark:border-slate-700 text-xs sm:text-sm text-slate-800 dark:text-slate-100 leading-relaxed whitespace-pre-line break-words">
              {selectedNotification.message}
            </div>

            {/* Metadata Details if available */}
            {selectedNotification.metadata && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
                {selectedNotification.metadata.pdvName && (
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Point de Vente :</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {selectedNotification.metadata.pdvName} ({selectedNotification.metadata.pdvCode || ''})
                    </span>
                  </div>
                )}
                {selectedNotification.metadata.vendorName && (
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Vendeur créateur :</span>
                    <span className="font-bold text-[#008DA9] dark:text-cyan-300">
                      {selectedNotification.metadata.vendorName}
                    </span>
                  </div>
                )}
                {selectedNotification.metadata.requesterName && (
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Demandeur :</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {selectedNotification.metadata.requesterName} ({selectedNotification.metadata.requesterRole || ''})
                    </span>
                  </div>
                )}
                {selectedNotification.metadata.adminMotif && (
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Motif Administrateur :</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {selectedNotification.metadata.adminMotif}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Attached Mini Facture Thermique Proof if present */}
            {selectedNotification.proof && onOpenDocument && (
              <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="text-xs">
                  <div className="font-extrabold text-amber-900 dark:text-amber-300">
                    Preuve jointe : Mini Facture Thermique
                  </div>
                  <div className="text-[11px] font-mono text-amber-700 dark:text-amber-400">
                    {selectedNotification.proof.thermalTicketNumber || selectedNotification.proof.number}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const proofDoc = selectedNotification.proof;
                    setSelectedNotification(null);
                    onOpenDocument({
                      ...proofDoc,
                      type: 'mini_thermique',
                      isProofPreview: true,
                    });
                  }}
                  className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Receipt className="w-4 h-4" />
                  <span>Voir la Mini Facture Thermique</span>
                </button>
              </div>
            )}

            {/* Footer Actions */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              {(() => {
                const action = getNotificationActionTarget(selectedNotification);
                if (!action || !onNavigateTab) return null;
                return (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedNotification(null);
                      onNavigateTab(action.tab);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    {action.icon}
                    <span>{action.label}</span>
                  </button>
                );
              })()}
              <button
                type="button"
                onClick={() => setSelectedNotification(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

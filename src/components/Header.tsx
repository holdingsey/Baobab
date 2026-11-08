import React from 'react';
import {
  Menu,
  Sun,
  Moon,
  Bell,
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
  ChevronDown,
  Check,
  Search,
} from 'lucide-react';
import { BaobabLogo } from './BaobabLogo';
import { PWAInstallButton } from './PWAInstallButton';
import { UserSession } from './LoginScreen';
import { InvoiceData } from './PrintableDocument';
import { FormModal } from './FormModal';
import { NotificationSettingsPanel } from './NotificationSettingsPanel';
import { GlobalSearchModal, SearchResultItem } from './GlobalSearchModal';
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
  onSwitchRole: (newRole: 'Administrateur' | 'Directeur des opérations de vente' | 'Sales Admin' | 'Gestionnaire grossiste' | 'Gestionnaire de stock' | 'Magasinier' | 'Comptable' | 'Vendeur') => void;
  onSwitchUser?: (user: UserSession) => void;
  onOpenDocument?: (doc: InvoiceData) => void;
  onNavigateTab?: (tab: string) => void;
  onSelectSearchResult?: (item: SearchResultItem) => void;
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
  onSelectSearchResult,
}) => {
  const [notifications, setNotifications] = React.useState<any[]>([]);
  const [showNotifMenu, setShowNotifMenu] = React.useState(false);
  const [showNotifSettingsModal, setShowNotifSettingsModal] = React.useState(false);
  const [selectedNotification, setSelectedNotification] = React.useState<any | null>(null);
  const [showProfileMenu, setShowProfileMenu] = React.useState(false);
  const [showSearchModal, setShowSearchModal] = React.useState(false);
  const [showPushInvite, setShowPushInvite] = React.useState(false);
  const [pushInviteBusy, setPushInviteBusy] = React.useState(false);
  const [online, setOnline] = React.useState<boolean>(() => isAppOnline());
  const [pendingCount, setPendingCount] = React.useState<number>(
    () => getOfflineSalesQueue().length + getOfflineGpsQueue().length
  );

  // Raccourci clavier global Ctrl+K / Cmd+K pour ouvrir la recherche
  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowSearchModal((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Helper to format any role nicely for user display
  const getDisplayRole = React.useCallback((role?: string, code?: string) => {
    const r = (role || '').trim();
    if (/directeur|op[eé]ration|dov/i.test(r) || code === 'BAO-DOV') return 'Directeur des opérations de vente (DOV)';
    if (/sales|contr/i.test(r) || code === 'BAO-SAD') return 'Sales Admin (Contrôleur)';
    if (/grossiste/i.test(r) || (code && code.startsWith('BAO-GRS'))) return 'Gestionnaire grossiste';
    if (/gestionnaire|magas/i.test(r) || code === 'BAO-MAG') return 'Gestionnaire de stock';
    if (/admin/i.test(r) || code === 'BAO-ADM') return 'Administrateur';
    if (/compt/i.test(r) || code === 'BAO-CPT') return 'Comptable';
    if (/vend/i.test(r) || (code && code.startsWith('BAO-VND'))) return 'Vendeur';
    return r || 'Administrateur';
  }, []);

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
        if (Array.isArray(d.notifications)) {
          const nextNotifs = d.notifications;
          setNotifications((prev) => {
            if (
              prev.length === nextNotifs.length &&
              prev.every(
                (item, idx) =>
                  item.id === nextNotifs[idx]?.id && item.is_read === nextNotifs[idx]?.is_read
              )
            ) {
              return prev;
            }
            return nextNotifs;
          });
          const count =
            typeof d.unreadCount === 'number'
              ? d.unreadCount
              : nextNotifs.filter((n: any) => !n.is_read).length;
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
    const localSub = await getActivePushSubscription(currentUser.id);
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
      type === 'demande_annulation_vente' ||
      ref.startsWith('VTE-') ||
      title.includes("demande d'annulation")
    ) {
      const isDovOrAdmin =
        currentUser.role === 'Directeur des opérations de vente' ||
        currentUser.role === 'Administrateur';
      return {
        tab: isDovOrAdmin ? 'demandes-annulation-vente' : currentUser.role === 'Vendeur' ? 'mes-ventes' : 'ventes',
        label: isDovOrAdmin ? "Ouvrir Demandes d'annulation de vente" : 'Ouvrir Mes Ventes',
        icon: <ShoppingBag className="w-3.5 h-3.5" />,
      };
    }

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
      const canValidatePdvRole =
        currentUser.role === 'Administrateur' || currentUser.role === 'Directeur des opérations de vente';
      return {
        tab: canValidatePdvRole ? 'validation-pdv' : 'mes-pdvs',
        label: canValidatePdvRole ? 'Ouvrir Validation PDV' : 'Ouvrir Mes PDV',
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
      if (currentUser.role === 'Gestionnaire de stock' || currentUser.role === 'Magasinier') {
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

    if (type === 'reception' || ref.startsWith('REC-FOURN-') || title.includes('réception')) {
      return {
        tab: 'receptions',
        label: 'Ouvrir les Réceptions Fournisseur',
        icon: <Package className="w-3.5 h-3.5" />,
      };
    }

    if (type === 'chargement' || ref.startsWith('CHG-') || title.includes('chargement') || title.includes('approvisionnement')) {
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

  const isDemoMode =
    typeof import.meta !== 'undefined' &&
    (import.meta as any).env?.VITE_DEMO_MODE !== 'false';

  const connectionTooltip = online
    ? pendingCount > 0
      ? `En ligne (${pendingCount} en attente de synchronisation)`
      : 'En ligne'
    : pendingCount > 0
    ? `Hors ligne (${pendingCount} en attente)`
    : 'Hors ligne';

  return (
    <>
      <header className="sticky top-0 z-30 w-full max-w-full h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transform-gpu">
        <div className="flex items-center justify-between gap-2 md:gap-2.5 px-3 md:px-5 lg:px-6 h-16 w-full max-w-full">
          {/* Gauche : Hamburger (Mobile & Tablette < 1024 px) + Logo */}
          <div className="flex items-center gap-2 md:gap-2.5 shrink-0 min-w-0">
            <button
              type="button"
              onClick={onOpenMobileMenu}
              className="w-11 h-11 min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-200 dark:hover:text-white dark:hover:bg-slate-800 lg:hidden cursor-pointer shrink-0 transition"
              aria-label="Ouvrir le menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div
              onClick={() => (onNavigateTab ? onNavigateTab('dashboard') : null)}
              className="flex items-center gap-2 cursor-pointer select-none shrink-0"
              title="Baobab Distribution - Accueil"
            >
              <BaobabLogo
                variant="header"
                size={36}
                logoUrl={logoUrl}
                showTextOnPC={true}
              />
            </div>
          </div>

          {/* Droite :
              - Mobile (< 768 px) : loupe, cloche, avatar
              - Tablette (768-1023 px) : loupe, point de connexion, thème, cloche, avatar
          */}
          <div className="flex items-center justify-end gap-2 md:gap-2.5 shrink-0">
            {/* 1. Loupe de recherche (Mobile, Tablette, PC) */}
            <button
              type="button"
              onClick={() => setShowSearchModal(true)}
              title="Recherche globale (Ctrl+K)"
              aria-label="Ouvrir la recherche globale (Ctrl+K)"
              className="w-11 h-11 min-w-[44px] min-h-[44px] lg:w-auto lg:px-3 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 transition cursor-pointer shrink-0"
            >
              <Search className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
              <span className="hidden lg:inline text-xs font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                Rechercher...
              </span>
              <kbd className="hidden xl:inline-flex items-center px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300">
                Ctrl+K
              </kbd>
            </button>

            {/* 2. Point de connexion (Tablette >= 768 px et PC ; sur Mobile il passe dans le menu de l'avatar) */}
            <button
              type="button"
              onClick={() => setSimulatedOffline(!isSimulatedOffline())}
              title={connectionTooltip}
              aria-label={connectionTooltip}
              className="hidden md:inline-flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
            >
              <span
                className={`w-3 h-3 rounded-full transition ${
                  online
                    ? 'bg-[#15803D] ring-4 ring-[#15803D]/20'
                    : 'bg-slate-400 dark:bg-slate-500 ring-4 ring-slate-400/20'
                }`}
              />
            </button>

            {/* 3. Thème (Tablette >= 768 px et PC ; sur Mobile il passe dans le menu de l'avatar) */}
            <button
              type="button"
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
              aria-label={theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
              className="hidden md:inline-flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800 transition shrink-0 cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-5 h-5 text-amber-400" />
              ) : (
                <Moon className="w-5 h-5 text-slate-700" />
              )}
            </button>

            {/* 4. Cloche de notifications (Mobile, Tablette, PC) */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowNotifMenu((v) => !v)}
                className="relative w-11 h-11 min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800 transition cursor-pointer"
                title="Notifications système"
                aria-label="Notifications système"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-[#DC2626] text-[10px] font-black text-white shadow-xs">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {showNotifMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40 bg-black/25 sm:bg-transparent"
                    onClick={() => setShowNotifMenu(false)}
                  />
                  <div className="fixed left-2.5 right-2.5 top-[4.25rem] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 w-auto sm:w-96 max-w-[calc(100vw-1.25rem)] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl z-50 p-3 sm:p-3.5 text-xs">
                    <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                      <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5 min-w-0">
                        <Bell className="w-3.5 h-3.5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                        <span className="truncate">Notifications &bull; {getDisplayRole(currentUser.role, currentUser.code)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {unreadCount > 0 && (
                          <button
                            type="button"
                            onClick={markAllAsRead}
                            className="px-2 py-0.5 rounded-lg bg-[var(--marque-clair)] text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] text-[10px] font-bold hover:opacity-90 cursor-pointer"
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
                          className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 hover:text-[var(--marque-fonce)] dark:text-slate-300 dark:hover:text-[var(--marque-eclaircie)] cursor-pointer"
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
                        notifications.map((n) => (
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
                                ? 'bg-[var(--marque-clair)] border-l-2 border-[var(--marque-fonce)] dark:border-[var(--marque-eclaircie)]'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span
                                className={`font-bold text-xs leading-snug break-words ${
                                  n.type === 'ecart' || n.type === 'rejet_demande_achat' || n.type === 'rejet_pdv'
                                    ? 'text-[#B91C1C] dark:text-red-400'
                                    : n.type === 'rectification_facture'
                                    ? 'text-[#92400E] dark:text-amber-400'
                                    : n.type === 'validation_demande_achat' ||
                                      n.type === 'facture_rectifiee' ||
                                      n.type === 'validation_pdv'
                                    ? 'text-[#15803D] dark:text-emerald-400'
                                    : 'text-slate-800 dark:text-slate-200'
                                }`}
                              >
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
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--marque-clair)] hover:bg-[var(--marque-fonce)] text-[var(--marque-fonce)] hover:text-white dark:text-[var(--marque-eclaircie)] font-bold text-[10px] transition cursor-pointer"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>Ouvrir le message</span>
                              </button>

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
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#92400E] hover:bg-[#78350F] text-white font-black text-[10px] shadow-xs cursor-pointer"
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

            {/* 5. Avatar (Mobile, Tablette, PC) */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowProfileMenu((prev) => !prev)}
                className="w-11 h-11 min-w-[44px] min-h-[44px] lg:w-auto lg:px-2 inline-flex items-center justify-center gap-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 whitespace-nowrap transition cursor-pointer"
                title="Menu du profil"
                aria-label="Ouvrir le menu du profil"
              >
                <div className="h-9 w-9 rounded-full bg-[var(--marque-fonce)] text-[var(--marque-texte-sur-plein)] font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                  {currentUser.name.charAt(0)}
                </div>
                <div className="hidden lg:flex flex-col text-left max-w-[110px]">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-tight truncate">
                    {currentUser.name.split(' ')[0]}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-none truncate">
                    {getDisplayRole(currentUser.role, currentUser.code)}
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden lg:inline shrink-0" />
              </button>

              {/* Menu de l'avatar :
                  - Carte utilisateur + point coloré d'état de connexion à côté de l'avatar
                  - Contrôle du thème et de l'état de connexion (indispensable sur Mobile < 768 px)
                  - Sélecteur de rôles unique (seulement si DEMO_MODE est actif)
              */}
              {showProfileMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40 bg-black/20 sm:bg-transparent"
                    onClick={() => setShowProfileMenu(false)}
                  />
                  <div className="fixed right-2.5 top-[4.25rem] sm:absolute sm:right-0 sm:top-full sm:mt-2 w-80 max-w-[calc(100vw-1.25rem)] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl z-50 p-3 text-xs space-y-2.5">
                    {/* Carte de l'utilisateur actif avec point coloré de connexion à côté de l'avatar */}
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-2.5">
                        <div className="relative flex items-center gap-1.5 shrink-0">
                          <div className="h-9 w-9 rounded-full bg-[var(--marque-fonce)] text-[var(--marque-texte-sur-plein)] font-bold text-sm flex items-center justify-center shrink-0">
                            {currentUser.name.charAt(0)}
                          </div>
                          <span
                            title={connectionTooltip}
                            className={`w-3 h-3 rounded-full shrink-0 ${
                              online
                                ? 'bg-[#15803D] ring-2 ring-[#15803D]/25'
                                : 'bg-slate-400 dark:bg-slate-500 ring-2 ring-slate-400/25'
                            }`}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-black text-slate-900 dark:text-white truncate">
                            {currentUser.name}
                          </div>
                          <div className="text-[11px] font-bold text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] truncate">
                            {getDisplayRole(currentUser.role, currentUser.code)} &bull; {currentUser.code}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {currentUser.email}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* État de connexion & Thème dans le menu de l'avatar */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSimulatedOffline(!isSimulatedOffline())}
                        title={connectionTooltip}
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition"
                      >
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            online ? 'bg-[#15803D]' : 'bg-slate-400 dark:bg-slate-500'
                          }`}
                        />
                        <span className="truncate">{online ? 'En ligne' : 'Hors ligne'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={onToggleTheme}
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition"
                      >
                        {theme === 'dark' ? (
                          <>
                            <Sun className="w-4 h-4 text-amber-400 shrink-0" />
                            <span className="truncate">Thème clair</span>
                          </>
                        ) : (
                          <>
                            <Moon className="w-4 h-4 text-[var(--marque-fonce)] shrink-0" />
                            <span className="truncate">Thème sombre</span>
                          </>
                        )}
                      </button>
                    </div>

                    <PWAInstallButton />

                    {/* Sélecteur de rôles unique : uniquement dans le menu de l'avatar et seulement si DEMO_MODE est actif */}
                    {isDemoMode && (
                      <div className="pt-1 border-t border-slate-200 dark:border-slate-800">
                        <div className="px-1 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Changer de rôle (Mode démo) :
                        </div>

                        <div className="max-h-56 overflow-y-auto space-y-1 py-1">
                          {usersList.map((u) => {
                            const isCurrent = u.id === currentUser.id;
                            return (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() => {
                                  if (onSwitchUser) {
                                    onSwitchUser(u);
                                  } else {
                                    onSwitchRole(u.role as any);
                                  }
                                  setShowProfileMenu(false);
                                }}
                                className={`w-full min-h-[44px] p-2 rounded-xl text-left transition flex items-center justify-between gap-2 cursor-pointer ${
                                  isCurrent
                                    ? 'bg-[var(--marque-fonce)] text-[var(--marque-texte-sur-plein)] font-bold'
                                    : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-semibold text-xs flex items-center gap-1.5">
                                    <span className="truncate">{u.name}</span>
                                    <span
                                      className={`text-[10px] font-mono px-1 rounded shrink-0 ${
                                        isCurrent
                                          ? 'bg-white/20 text-white'
                                          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                      }`}
                                    >
                                      {u.code}
                                    </span>
                                  </div>
                                  <div
                                    className={`text-[10px] truncate ${
                                      isCurrent ? 'text-white/90' : 'text-slate-500 dark:text-slate-400'
                                    }`}
                                  >
                                    {getDisplayRole(u.role, u.code)}
                                  </div>
                                </div>
                                {isCurrent && <Check className="w-4 h-4 shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Invite discrète "Activer les notifications" après connexion (sans texte tronqué ni débordement) */}
        {showPushInvite && (
          <div className="px-3 sm:px-5 lg:px-6 py-2 bg-[var(--marque-clair)] dark:bg-slate-800/95 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs w-full max-w-full">
            <div className="flex items-start sm:items-center gap-2 min-w-0">
              <Bell className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0 mt-0.5 sm:mt-0" />
              <span className="text-slate-700 dark:text-slate-200 font-medium leading-snug break-words">
                Recevez les alertes Baobab Distribution en temps réel sur cet appareil.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={handleActivateNotificationsClick}
                disabled={pushInviteBusy}
                className="px-3 py-1 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-[var(--marque-texte-sur-plein)] font-extrabold text-xs transition cursor-pointer disabled:opacity-60 whitespace-nowrap"
              >
                {pushInviteBusy ? 'Activation...' : 'Activer les notifications'}
              </button>
              <button
                type="button"
                onClick={() => setShowNotifSettingsModal(true)}
                className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 font-bold text-xs hover:bg-slate-50 transition cursor-pointer whitespace-nowrap"
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

      {/* Modal Recherche Globale (Ctrl+K / Loupe) */}
      <GlobalSearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        currentUser={currentUser}
        onSelectResult={(item) => {
          if (onSelectSearchResult) {
            onSelectSearchResult(item);
            return;
          }
          if (onNavigateTab && item.url) {
            try {
              const urlObj = new URL(item.url, window.location.origin);
              const tab = urlObj.searchParams.get('tab');
              if (tab) {
                onNavigateTab(tab);
                return;
              }
            } catch {
              // ignore
            }
          }
        }}
      />

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
        <FormModal
          title={selectedNotification.title}
          subtitle={`Message reçu le ${formatNotifDateTime(selectedNotification.created_at)}`}
          icon={<Bell className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />}
          onClose={() => setSelectedNotification(null)}
          submitLabel="Fermer"
          onSubmit={(e) => {
            e.preventDefault();
            setSelectedNotification(null);
          }}
        >
          <div className="space-y-4 text-xs">
            {/* Destinataire info */}
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

            {/* Action buttons if available */}
            {(() => {
              const action = getNotificationActionTarget(selectedNotification);
              if (!action || !onNavigateTab) return null;
              return (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedNotification(null);
                      onNavigateTab(action.tab);
                    }}
                    className="w-full min-h-[48px] py-2.5 px-4 rounded-[12px] bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                  >
                    {action.icon}
                    <span>{action.label}</span>
                  </button>
                </div>
              );
            })()}
          </div>
        </FormModal>
      )}
    </>
  );
};

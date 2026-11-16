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
  getPushBannerDismissInfo,
  dismissPushBannerFor7Days,
  clearPushBannerDismissal,
  showDeviceSystemNotification,
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

    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;
    let retryDelayMs = 1500;

    const connectSse = () => {
      if (unmounted || typeof window === 'undefined' || typeof EventSource === 'undefined') return;
      try {
        if (es) {
          es.close();
          es = null;
        }
        const streamUrl = `/api/notifications/stream?userId=${encodeURIComponent(
          currentUser.id
        )}&role=${encodeURIComponent(currentUser.role)}`;
        es = new EventSource(streamUrl);

        es.onopen = () => {
          retryDelayMs = 1500;
          fetchNotifs();
        };

        es.onmessage = (evt) => {
          try {
            const payload = JSON.parse(evt.data);
            if (payload.event === 'notification:created') {
              if (payload.notification && payload.notification.id) {
                const incoming = payload.notification;
                setNotifications((prev) => {
                  if (prev.some((n) => n.id === incoming.id)) {
                    return prev;
                  }
                  return [incoming, ...prev];
                });
              } else {
                fetchNotifs();
              }
              if (typeof payload.unreadCount === 'number') {
                syncAppBadge(payload.unreadCount);
              }
              if (payload.pushPayload) {
                void showDeviceSystemNotification({
                  title: payload.pushPayload.title,
                  body: payload.pushPayload.body,
                  tag: payload.pushPayload.tag,
                  url: payload.pushPayload.url,
                  notificationId: payload.pushPayload.notificationId,
                  requireInteraction: payload.pushPayload.requireInteraction,
                });
              }
              const notifType = String(payload.notification?.type || '');
              const notifRef = String(payload.notification?.reference || '');
              if (
                notifType === 'nouvelle_vente' ||
                notifType === 'commande_gros' ||
                notifType === 'annulation_vente' ||
                notifType === 'demande_annulation_vente' ||
                notifType === 'vente_a_regulariser' ||
                notifRef.startsWith('VTE-') ||
                notifRef.startsWith('CMD-GROS-')
              ) {
                window.dispatchEvent(
                  new CustomEvent('baobab-sales-realtime-updated', {
                    detail: payload.notification || null,
                  })
                );
              }
            } else if (payload.event === 'notification:read') {
              if (payload.notification?.id) {
                const readId = payload.notification.id;
                setNotifications((prev) =>
                  prev.map((n) => (n.id === readId ? { ...n, is_read: 1 } : n))
                );
              } else {
                fetchNotifs();
              }
              if (typeof payload.unreadCount === 'number') {
                syncAppBadge(payload.unreadCount);
              }
            } else if (payload.event === 'notification:read-all') {
              setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
              syncAppBadge(0);
            }
          } catch {
            // ignore malformed SSE message
          }
        };

        es.onerror = () => {
          if (es) {
            es.close();
            es = null;
          }
          if (!unmounted) {
            if (reconnectTimer) clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(() => {
              retryDelayMs = Math.min(10000, Math.round(retryDelayMs * 1.5));
              connectSse();
            }, retryDelayMs);
          }
        };
      } catch {
        // fallback reconnect
      }
    };

    connectSse();

    const handleNotifsUpdated = () => {
      fetchNotifs();
    };
    const handleVisibilityOrOnline = () => {
      if (document.visibilityState === 'visible') {
        fetchNotifs();
        if (!es || es.readyState === EventSource.CLOSED) {
          connectSse();
        }
      }
    };

    window.addEventListener('baobab-notifications-updated', handleNotifsUpdated);
    window.addEventListener('online', handleVisibilityOrOnline);
    document.addEventListener('visibilitychange', handleVisibilityOrOnline);

    return () => {
      unmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (es) {
        es.close();
        es = null;
      }
      window.removeEventListener('baobab-notifications-updated', handleNotifsUpdated);
      window.removeEventListener('online', handleVisibilityOrOnline);
      document.removeEventListener('visibilitychange', handleVisibilityOrOnline);
    };
  }, [fetchNotifs, currentUser.id, currentUser.role]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // Synchronise le badge de l'icône à chaque changement du compteur
  React.useEffect(() => {
    syncAppBadge(unreadCount);
  }, [unreadCount]);

  // Vérifie l'état d'abonnement push après connexion pour afficher la bannière dans le flux de la page
  const checkPushSubscriptionState = React.useCallback(async () => {
    const support = getPushSupportInfo();
    if (!support.supported) {
      setShowPushInvite(false);
      return;
    }
    const dismissInfo = getPushBannerDismissInfo(currentUser.id);
    if (dismissInfo.dismissed) {
      setShowPushInvite(false);
      return;
    }
    if (support.permission === 'denied') {
      dismissPushBannerFor7Days(currentUser.id, 'refused');
      setShowPushInvite(false);
      return;
    }
    try {
      const dismissedKey = `baobab_push_invite_dismissed_${currentUser.id}`;
      if (sessionStorage.getItem(dismissedKey) === '1') {
        setShowPushInvite(false);
        return;
      }
      if (localStorage.getItem(`baobab_push_enabled_${currentUser.id}`) === '1' && support.permission === 'granted') {
        setShowPushInvite(false);
        return;
      }
    } catch {
      // ignore storage errors
    }
    setShowPushInvite(true);
  }, [currentUser.id]);

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
        clearPushBannerDismissal(currentUser.id);
        setShowPushInvite(false);
        window.dispatchEvent(new Event('baobab-push-subscription-changed'));
      } else {
        // Si refusée, ne réapparaît pas avant 7 jours et un rappel discret reste dans Réglages > Notifications
        dismissPushBannerFor7Days(currentUser.id, 'refused');
        setShowPushInvite(false);
        window.dispatchEvent(new Event('baobab-push-subscription-changed'));
      }
    } finally {
      setPushInviteBusy(false);
    }
  };

  const handleDismissPushInvite = () => {
    dismissPushBannerFor7Days(currentUser.id, 'closed');
    setShowPushInvite(false);
    window.dispatchEvent(new Event('baobab-push-subscription-changed'));
  };

  const [notifFilter, setNotifFilter] = React.useState<'all' | 'unread'>('all');

  // Bloque le défilement de la page derrière le panneau ouvert et gère la fermeture par geste retour (popstate) ou Échap
  React.useEffect(() => {
    if (!showNotifMenu) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    let pushedHistory = false;
    try {
      window.history.pushState({ baobabNotifOpen: true }, '');
      pushedHistory = true;
    } catch {
      // ignore history errors
    }

    const handlePopState = () => {
      setShowNotifMenu(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowNotifMenu(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
      if (pushedHistory && window.history.state?.baobabNotifOpen) {
        try {
          window.history.back();
        } catch {
          // ignore
        }
      }
    };
  }, [showNotifMenu]);

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
    setShowNotifMenu(false);

    const nType = String(n.type || '');
    const nRef = String(n.reference || '');
    if (
      nType === 'nouvelle_vente' ||
      nType === 'commande_gros' ||
      nType === 'annulation_vente' ||
      nType === 'demande_annulation_vente' ||
      nType === 'vente_a_regulariser' ||
      nRef.startsWith('VTE-') ||
      nRef.startsWith('CMD-GROS-')
    ) {
      const targetSaleId = n.metadata?.saleId || nRef;
      if (targetSaleId) {
        window.dispatchEvent(
          new CustomEvent('baobab-open-sale-detail', {
            detail: { saleId: targetSaleId, saleNumber: nRef },
          })
        );
      }
    }

    const action = getNotificationActionTarget(n);
    if (action && onNavigateTab) {
      onNavigateTab(action.tab);
      return;
    }
    setSelectedNotification({ ...n, is_read: 1 });
  };

  const formatRelativeNotifDate = (isoStr?: string) => {
    if (!isoStr) return "À l'instant";
    try {
      const normalized = isoStr.includes('T') ? isoStr : `${isoStr}T12:00:00`;
      const date = new Date(normalized);
      if (Number.isNaN(date.getTime())) return isoStr;
      const diffMs = Date.now() - date.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return "À l'instant";
      if (diffMin < 60) return `Il y a ${diffMin} min`;
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) return `Il y a ${diffHours} h`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays === 1) return 'Hier';
      if (diffDays < 7) return `Il y a ${diffDays} j`;
      return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
      });
    } catch {
      return isoStr;
    }
  };

  const formatTwoLinesDetail = (msg?: string) => {
    const clean = String(msg || '').replace(/\s+/g, ' ').trim();
    if (clean.length <= 85) return clean;
    const sliced = clean.slice(0, 82);
    const lastSpace = sliced.lastIndexOf(' ');
    return `${lastSpace > 45 ? sliced.slice(0, lastSpace) : sliced}…`;
  };

  const filteredNotifications = React.useMemo(() => {
    if (notifFilter === 'unread') {
      return notifications.filter((n) => !n.is_read);
    }
    return notifications;
  }, [notifications, notifFilter]);

  const getNotificationActionTarget = (n: any): { tab: string; label: string; icon: React.ReactNode } | null => {
    if (!onNavigateTab || !n) return null;
    const type = String(n.type || '');
    const ref = String(n.reference || '');
    const title = String(n.title || '').toLowerCase();

    if (
      type === 'alerte_anomalie' ||
      ref.startsWith('ANO-') ||
      title.includes('alerte critique')
    ) {
      if (currentUser.role === 'Vendeur') return null;
      return {
        tab: 'alertes',
        label: 'Ouvrir Écran Alertes',
        icon: <Bell className="w-3.5 h-3.5" />,
      };
    }

    if (type === 'commande_gros' || ref.startsWith('CMD-GROS-')) {
      return {
        tab: 'grossistes',
        label: 'Ouvrir Commandes en gros',
        icon: <ShoppingBag className="w-3.5 h-3.5" />,
      };
    }

    if (
      type === 'demande_annulation_vente' ||
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
      type === 'nouvelle_vente' ||
      type === 'annulation_vente' ||
      type === 'vente_a_regulariser' ||
      type === 'vente' ||
      ref.startsWith('VTE-')
    ) {
      return {
        tab: currentUser.role === 'Vendeur' ? 'mes-ventes' : 'ventes',
        label: currentUser.role === 'Vendeur' ? 'Ouvrir Mes Ventes' : 'Ouvrir les Ventes',
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
      <header className="sticky top-0 z-30 w-full max-w-full h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
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
              <span className="hidden lg:inline text-xs font-bold text-slate-700 dark:text-slate-200">
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
                  {/* Fond cliquable pour fermer le panneau */}
                  <div
                    className="fixed inset-0 z-[90] bg-black/25 md:bg-transparent"
                    onClick={() => setShowNotifMenu(false)}
                  />

                  {/* Panneau des notifications compact :
                      - Mobile (< 768 px) : panneau flottant compact sous l'en-tête (max-h 68dvh)
                      - Tablette & PC (>= 768 px) : ancré sous la cloche, largeur 360 px, hauteur max 65dvh
                  */}
                  <div
                    role="dialog"
                    aria-label="Notifications"
                    style={{ writingMode: 'horizontal-tb' }}
                    className="baobab-notif-panel fixed left-3 right-3 top-[4.1rem] max-h-[68dvh] z-[100] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden md:absolute md:inset-auto md:right-0 md:top-full md:mt-2 md:w-[360px] md:max-w-[calc(100vw-24px)] md:max-h-[65dvh]"
                  >
                    {/* EN-TÊTE COMPACT SUR DEUX LIGNES */}
                    <div className="px-3 pt-2.5 pb-2 border-b border-slate-200 dark:border-slate-800 space-y-1.5 shrink-0">
                      {/* Ligne 1 : Titre "Notifications" + bulle rouge #DC2626 à gauche, icônes réglages et croix à droite */}
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="flex-1 min-w-0 flex items-center gap-1.5">
                          <h2
                            style={{ writingMode: 'horizontal-tb' }}
                            className="text-[14px] font-extrabold text-slate-900 dark:text-white whitespace-normal leading-tight"
                          >
                            Notifications
                          </h2>
                          {unreadCount > 0 && (
                            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#DC2626] text-white text-[10px] font-black leading-none shrink-0">
                              {unreadCount}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setShowNotifMenu(false);
                              setShowNotifSettingsModal(true);
                            }}
                            title="Réglages des notifications"
                            aria-label="Réglages des notifications"
                            className="w-8 h-8 min-w-[32px] min-h-[32px] rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 inline-flex items-center justify-center cursor-pointer transition shrink-0"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowNotifMenu(false)}
                            title="Fermer les notifications"
                            aria-label="Fermer les notifications"
                            className="w-8 h-8 min-w-[32px] min-h-[32px] rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 inline-flex items-center justify-center cursor-pointer transition shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Ligne 2 : Bouton "Tout marquer comme lu" pleine largeur compact */}
                      <button
                        type="button"
                        onClick={markAllAsRead}
                        disabled={unreadCount === 0}
                        className="w-full min-h-[34px] h-[34px] px-3 rounded-lg bg-[var(--marque-clair)] hover:opacity-90 disabled:opacity-50 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] font-bold text-[12px] inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed transition"
                      >
                        <Check className="w-3.5 h-3.5 shrink-0" />
                        <span>Tout marquer comme lu</span>
                      </button>
                    </div>

                    {/* FILTRES COMPACTS : puces "Toutes" et "Non lues" */}
                    <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 shrink-0">
                      <button
                        type="button"
                        onClick={() => setNotifFilter('all')}
                        className={`min-h-[28px] px-2.5 py-0.5 rounded-full text-[11px] font-bold shrink-0 transition cursor-pointer inline-flex items-center ${
                          notifFilter === 'all'
                            ? 'bg-[var(--marque-fonce)] text-white shadow-2xs'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        <span>Toutes</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setNotifFilter('unread')}
                        className={`min-h-[28px] px-2.5 py-0.5 rounded-full text-[11px] font-bold shrink-0 transition cursor-pointer inline-flex items-center ${
                          notifFilter === 'unread'
                            ? 'bg-[var(--marque-fonce)] text-white shadow-2xs'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        <span>Non lues</span>
                      </button>
                    </div>

                    {/* LISTE COMPACTE : zone défilante */}
                    <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
                      {filteredNotifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center text-center py-8 px-4 gap-2">
                          <Bell className="w-8 h-8 text-slate-400 dark:text-slate-500 stroke-[1.75]" />
                          <p className="text-[12px] font-semibold text-slate-500 dark:text-slate-400">
                            Aucune notification
                          </p>
                        </div>
                      ) : (
                        filteredNotifications.map((n) => {
                          const isUnread = !n.is_read;
                          return (
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
                              className={`w-full px-3 py-2 text-left transition cursor-pointer flex items-start gap-2 ${
                                isUnread
                                  ? 'bg-[var(--marque-clair)]/60 dark:bg-slate-800/80 hover:bg-[var(--marque-clair)] dark:hover:bg-slate-800'
                                  : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                              }`}
                            >
                              {/* Pastille non lue (point bleu de marque) */}
                              <div className="pt-1.5 shrink-0 w-2 flex justify-center">
                                {isUnread && (
                                  <span
                                    aria-label="Non lue"
                                    className="w-2 h-2 rounded-full bg-[var(--marque-fonce)] dark:bg-[var(--marque-eclaircie)] block"
                                  />
                                )}
                              </div>

                              {/* Contenu de la carte de notification */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline justify-between gap-2">
                                  <div className="font-bold text-[12.5px] text-slate-900 dark:text-white leading-snug whitespace-normal break-words flex-1 min-w-0">
                                    {n.title}
                                  </div>
                                  <span className="text-[10.5px] text-slate-400 dark:text-slate-500 shrink-0">
                                    {formatRelativeNotifDate(n.created_at)}
                                  </span>
                                </div>

                                <p className="text-[11.5px] text-slate-600 dark:text-slate-300 mt-0.5 leading-snug whitespace-normal break-words">
                                  {formatTwoLinesDetail(n.message)}
                                </p>
                              </div>
                            </div>
                          );
                        })
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
                <div className="hidden lg:flex flex-col text-left min-w-0">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-tight">
                    {currentUser.name.split(' ')[0]}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-none">
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
                          <div className="font-black text-slate-900 dark:text-white leading-snug">
                            {currentUser.name}
                          </div>
                          <div className="text-[11px] font-bold text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] leading-snug">
                            {getDisplayRole(currentUser.role, currentUser.code)} &bull; {currentUser.code}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
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
                        className="min-h-[48px] h-auto px-3 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition"
                      >
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            online ? 'bg-[#15803D]' : 'bg-slate-400 dark:bg-slate-500'
                          }`}
                        />
                        <span>{online ? 'En ligne' : 'Hors ligne'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={onToggleTheme}
                        className="min-h-[48px] h-auto px-3 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition"
                      >
                        {theme === 'dark' ? (
                          <>
                            <Sun className="w-4 h-4 text-amber-400 shrink-0" />
                            <span>Thème clair</span>
                          </>
                        ) : (
                          <>
                            <Moon className="w-4 h-4 text-[var(--marque-fonce)] shrink-0" />
                            <span>Thème sombre</span>
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
                                className={`w-full min-h-[48px] h-auto p-2.5 rounded-xl text-left transition flex items-center justify-between gap-2 cursor-pointer ${
                                  isCurrent
                                    ? 'bg-[var(--marque-fonce)] text-[var(--marque-texte-sur-plein)] font-bold'
                                    : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold text-xs flex flex-wrap items-center gap-1.5">
                                    <span>{u.name}</span>
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
                                    className={`text-[10px] leading-snug ${
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
      </header>

      {/* Bannière d'activation des notifications dans le flux de la page, sous l'en-tête et AU-DESSUS du titre (marge haut/bas 16 px, jamais fixe ni absolue) */}
      {showPushInvite && (
        <div
          role="region"
          aria-label="Activation des notifications"
          className="w-full max-w-full px-3.5 sm:px-6 lg:px-8 my-[16px]"
        >
          <div className="max-w-7xl mx-auto w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3.5 sm:px-5 sm:py-3.5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start justify-between gap-2.5 min-w-0 flex-1">
              <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-xl bg-[var(--marque-clair)] text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] flex items-center justify-center shrink-0">
                  <Bell className="w-4 h-4" />
                </div>
                <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-100 font-semibold leading-snug break-words">
                  Activez les notifications pour recevoir les alertes de ventes, stocks et validations en temps réel sur cet appareil.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDismissPushInvite}
                className="md:hidden w-[44px] h-[44px] min-w-[44px] min-h-[44px] rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 inline-flex items-center justify-center cursor-pointer shrink-0 transition"
                aria-label="Fermer la bannière de notifications"
                title="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
              <button
                type="button"
                onClick={handleActivateNotificationsClick}
                disabled={pushInviteBusy}
                className="flex-1 md:flex-initial h-[44px] min-h-[44px] px-4 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-60 whitespace-nowrap shadow-2xs"
              >
                {pushInviteBusy ? 'Activation...' : 'Activer'}
              </button>
              <button
                type="button"
                onClick={handleDismissPushInvite}
                className="flex-1 md:flex-initial h-[44px] min-h-[44px] px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600 font-bold text-xs sm:text-sm inline-flex items-center justify-center transition cursor-pointer whitespace-nowrap"
              >
                Plus tard
              </button>
              <button
                type="button"
                onClick={handleDismissPushInvite}
                className="hidden md:inline-flex w-[44px] h-[44px] min-w-[44px] min-h-[44px] rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 items-center justify-center cursor-pointer shrink-0 transition"
                aria-label="Fermer la bannière de notifications"
                title="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

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

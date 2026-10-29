export type NotificationCategoryKey =
  | 'chargements'
  | 'versements'
  | 'pdv'
  | 'peremption'
  | 'cadeaux';

export interface NotificationPreferences {
  enabled: boolean;
  types: Record<NotificationCategoryKey, boolean>;
}

export type PushPreferences = NotificationPreferences;

export const DEFAULT_NOTIFICATION_TYPES: Record<NotificationCategoryKey, boolean> = {
  chargements: true,
  versements: true,
  pdv: true,
  peremption: true,
  cadeaux: true,
};

export const NOTIFICATION_CATEGORY_LABELS: Array<{
  key: NotificationCategoryKey;
  label: string;
  description: string;
}> = [
  {
    key: 'chargements',
    label: 'Chargements & Retours',
    description: 'Nouveaux chargements à valider, chargements validés ou rejetés, remises et retours.',
  },
  {
    key: 'versements',
    label: 'Versements & Factures',
    description: 'Versements à confirmer ou confirmés en caisse, nouvelles factures et rectifications.',
  },
  {
    key: 'pdv',
    label: 'Points de vente (PDV)',
    description: 'Nouveaux PDV à valider par l\'Administrateur et décisions sur vos points de vente.',
  },
  {
    key: 'peremption',
    label: 'Lots proches de la péremption & Stock',
    description: 'Alertes sur les lots à moins de 30 jours de péremption et écarts d\'inventaire.',
  },
  {
    key: 'cadeaux',
    label: 'Cartes cadeaux & Bons à remettre',
    description: 'Cartes cadeaux prêtes à gratter, bons cadeaux à préparer et remises au dépôt.',
  },
];

/**
 * Met à jour le badge de l'icône de l'application (navigator.setAppBadge / navigator.clearAppBadge)
 * avec vérification de prise en charge (feature detection) sans erreur si absente.
 */
export async function syncAppBadge(unreadCount: number): Promise<void> {
  if (typeof navigator === 'undefined') return;
  try {
    const count = Math.max(0, Number(unreadCount) || 0);
    const nav = navigator as Navigator & {
      setAppBadge?: (contents?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };

    if (count > 0) {
      if ('setAppBadge' in nav && typeof nav.setAppBadge === 'function') {
        await nav.setAppBadge(count);
      }
    } else {
      if ('clearAppBadge' in nav && typeof nav.clearAppBadge === 'function') {
        await nav.clearAppBadge();
      } else if ('setAppBadge' in nav && typeof nav.setAppBadge === 'function') {
        await nav.setAppBadge(0);
      }
    }
  } catch {
    // Aucune erreur si non supporté ou restreint par le système
  }
}

/**
 * Efface le badge de l'icône (quand le compteur vaut 0 ou à la déconnexion).
 */
export async function clearAppBadge(): Promise<void> {
  await syncAppBadge(0);
}

/**
 * Retire la ou les notifications système correspondantes de la barre du téléphone/navigateur
 * (getNotifications puis close) lorsqu'elles sont lues dans l'application.
 */
export async function closeSystemNotifications(options: {
  notificationId?: string;
  reference?: string;
  type?: string;
  closeAll?: boolean;
}): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const reg of registrations) {
      if (typeof reg.getNotifications !== 'function') continue;
      const activeNotifs = await reg.getNotifications();
      for (const sysNotif of activeNotifs) {
        if (options.closeAll) {
          sysNotif.close();
          continue;
        }
        const data = (sysNotif as any).data || {};
        const matchId = options.notificationId && data.notificationId === options.notificationId;
        const matchRef = options.reference && data.reference && data.reference === options.reference;
        const matchTag =
          options.type &&
          !options.notificationId &&
          !options.reference &&
          (sysNotif.tag === `baobab-${options.type}` || data.type === options.type);

        if (matchId || matchRef || matchTag) {
          sysNotif.close();
        }
      }
    }
  } catch {
    // Ignore si getNotifications non disponible
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const TOKEN_STORAGE_PREFIX = 'baobab_auth_token_';

export async function ensureUserAuthToken(userId: string, userRole?: string): Promise<string | null> {
  if (!userId) return null;
  const cached = localStorage.getItem(`${TOKEN_STORAGE_PREFIX}${userId}`);
  if (cached) return cached;

  try {
    const res = await fetch('/api/auth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        ...(userRole ? { 'x-user-role': userRole } : {}),
      },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.token) {
        localStorage.setItem(`${TOKEN_STORAGE_PREFIX}${userId}`, data.token);
        if (typeof data.unreadCount === 'number') {
          await syncAppBadge(data.unreadCount);
        }
        return data.token;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function getPushSupportInfo(): {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  reason?: string;
} {
  if (typeof window === 'undefined') {
    return { supported: false, permission: 'unsupported', reason: 'Environnement serveur' };
  }
  if (!('Notification' in window)) {
    return {
      supported: false,
      permission: 'unsupported',
      reason:
        "Votre navigateur ne prend pas en charge les notifications système. Sur iPhone/iPad (iOS), installez d'abord l'application sur l'écran d'accueil (« Partager » > « Sur l'écran d'accueil ») puis ouvrez-la depuis l'icône installée.",
    };
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return {
      supported: false,
      permission: Notification.permission,
      reason:
        'Le Service Worker ou le gestionnaire Push (PushManager) n\'est pas disponible dans ce contexte. Assurez-vous d\'utiliser une connexion sécurisée HTTPS et un navigateur compatible (Chrome, Edge, Firefox ou Safari PWA installée).',
    };
  }
  return {
    supported: true,
    permission: Notification.permission,
  };
}

async function getOrRegisterServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) return existing;
    const reg = await navigator.serviceWorker.register('/sw-push.js', { scope: '/' });
    return reg;
  } catch {
    try {
      return await navigator.serviceWorker.ready;
    } catch {
      return null;
    }
  }
}

export async function getActivePushSubscription(): Promise<PushSubscription | null> {
  try {
    const reg = await getOrRegisterServiceWorker();
    if (!reg || !reg.pushManager) return null;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Demande la permission au clic de l'utilisateur, crée l'abonnement push
 * et l'enregistre côté serveur pour l'utilisateur connecté (déduit de son jeton).
 */
export async function requestAndSubscribePush(
  userId: string,
  userRole: string
): Promise<{
  success: boolean;
  ok: boolean;
  permission: NotificationPermission | 'unsupported';
  message: string;
  error?: string;
  preferences?: NotificationPreferences;
}> {
  const support = getPushSupportInfo();
  if (!support.supported) {
    return {
      success: false,
      ok: false,
      permission: support.permission,
      message:
        support.reason ||
        'Les notifications système ne sont pas prises en charge sur ce navigateur ou cet appareil.',
      error: support.reason,
    };
  }

  // 1. Demande de permission déclenchée uniquement au clic
  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }

  if (permission !== 'granted') {
    return {
      success: false,
      ok: false,
      permission,
      message:
        'Les notifications sont refusées dans votre navigateur. Consultez la marche à suivre ci-dessous pour les réactiver dans les réglages du navigateur et du téléphone.',
      error: 'Permission refusée',
    };
  }

  try {
    // 2. Obtenir le jeton d'authentification de l'utilisateur
    const token = await ensureUserAuthToken(userId, userRole);
    if (!token) {
      return {
        success: false,
        ok: false,
        permission,
        message: 'Impossible de vérifier votre session utilisateur.',
        error: 'Session non authentifiée',
      };
    }

    // 3. Récupérer la clé publique VAPID depuis le serveur
    const keyRes = await fetch('/api/push/vapid-public-key');
    const keyData = await keyRes.json();
    if (!keyRes.ok || !keyData.publicKey) {
      return {
        success: false,
        ok: false,
        permission,
        message: 'Clé publique VAPID indisponible sur le serveur.',
        error: 'Clé VAPID manquante',
      };
    }

    // 4. Obtenir le Service Worker et créer l'abonnement Push
    const reg = await getOrRegisterServiceWorker();
    if (!reg || !reg.pushManager) {
      return {
        success: false,
        ok: false,
        permission,
        message: 'Le Service Worker n\'est pas prêt sur cet appareil.',
        error: 'Service worker non prêt',
      };
    }

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const appServerKey = urlBase64ToUint8Array(keyData.publicKey);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey as unknown as BufferSource,
      });
    }

    // 5. Enregistrer l'abonnement côté serveur pour l'utilisateur connecté (déduit du jeton)
    const subRes = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        subscription: sub.toJSON(),
      }),
    });

    const subData = await subRes.json();
    if (!subRes.ok || !subData.success) {
      return {
        success: false,
        ok: false,
        permission,
        message: subData.error || 'Erreur lors de l\'enregistrement de l\'abonnement.',
        error: subData.error || 'Erreur lors de l\'enregistrement',
      };
    }

    if (typeof subData.unreadCount === 'number') {
      await syncAppBadge(subData.unreadCount);
    }

    localStorage.setItem(`baobab_push_enabled_${userId}`, '1');

    return {
      success: true,
      ok: true,
      permission: 'granted',
      message: subData.message || 'Notifications système activées sur cet appareil.',
      preferences: subData.preferences,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Erreur technique';
    return {
      success: false,
      ok: false,
      permission: Notification.permission,
      message: `Impossible d'activer l'abonnement push (${errMsg}).`,
      error: errMsg,
    };
  }
}

export async function unsubscribePushDevice(
  userId: string,
  userRole: string
): Promise<{ success: boolean; ok: boolean; message: string; error?: string }> {
  try {
    const token = await ensureUserAuthToken(userId, userRole);
    const sub = await getActivePushSubscription();
    const endpoint = sub?.endpoint || null;

    if (sub) {
      try {
        await sub.unsubscribe();
      } catch {
        // ignore
      }
    }

    if (token) {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ endpoint }),
      });
    }

    localStorage.removeItem(`baobab_push_enabled_${userId}`);
    return {
      success: true,
      ok: true,
      message: 'Notifications système désactivées sur cet appareil.',
    };
  } catch {
    return {
      success: false,
      ok: false,
      message: 'Erreur lors de la désactivation des notifications.',
      error: 'Erreur réseau',
    };
  }
}

export async function fetchUserPushStatus(
  userId: string,
  userRole: string
): Promise<{
  preferences: NotificationPreferences;
  subscriptionsCount: number;
  devices: Array<{ id: string; endpoint: string; deviceLabel: string; updatedAt: string }>;
  unreadCount: number;
} | null> {
  try {
    const token = await ensureUserAuthToken(userId, userRole);
    if (!token) return null;
    const res = await fetch('/api/push/status', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.success) return null;
    return {
      preferences: data.preferences || { enabled: true, types: { ...DEFAULT_NOTIFICATION_TYPES } },
      subscriptionsCount: Number(data.subscriptionsCount || 0),
      devices: data.devices || [],
      unreadCount: Number(data.unreadCount || 0),
    };
  } catch {
    return null;
  }
}

export async function updateUserPushPreferences(
  userId: string,
  userRole: string,
  preferences: Partial<NotificationPreferences>
): Promise<NotificationPreferences | null> {
  try {
    const token = await ensureUserAuthToken(userId, userRole);
    if (!token) return null;
    const res = await fetch('/api/push/preferences', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(preferences),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.preferences || null;
  } catch {
    return null;
  }
}

export async function triggerTestPushNotification(
  userId: string,
  userRole: string
): Promise<{ success: boolean; ok: boolean; message: string; error?: string }> {
  try {
    const token = await ensureUserAuthToken(userId, userRole);
    if (!token) {
      return { success: false, ok: false, message: 'Session utilisateur non authentifiée.', error: 'Session non authentifiée' };
    }
    const res = await fetch('/api/push/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await res.json();
    const isOk = Boolean(res.ok && data.success && data.sentCount > 0);
    return {
      success: isOk,
      ok: isOk,
      message:
        data.message ||
        (res.ok ? 'Notification de test envoyée.' : 'Erreur lors de l\'envoi du test.'),
      error: isOk ? undefined : data.message,
    };
  } catch {
    return {
      success: false,
      ok: false,
      message: 'Erreur réseau lors de l\'envoi de la notification de test.',
      error: 'Erreur réseau',
    };
  }
}

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
const LOCAL_DEVICE_ID_KEY = 'baobab_push_device_id';

function getOrCreateLocalDeviceId(): string {
  try {
    let id = localStorage.getItem(LOCAL_DEVICE_ID_KEY);
    if (!id) {
      id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(LOCAL_DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'dev-mobile';
  }
}

export async function ensureUserAuthToken(
  userId: string,
  userRole?: string,
  forceRefresh = false
): Promise<string | null> {
  if (!userId) return null;
  if (!forceRefresh) {
    try {
      const cached = localStorage.getItem(`${TOKEN_STORAGE_PREFIX}${userId}`);
      if (cached) return cached;
    } catch {
      // ignore
    }
  }

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
        try {
          localStorage.setItem(`${TOKEN_STORAGE_PREFIX}${userId}`, data.token);
        } catch {
          // ignore
        }
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
  return {
    supported: true,
    permission: Notification.permission,
  };
}

async function getOrRegisterServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    let reg = await navigator.serviceWorker.getRegistration('/');
    if (!reg) {
      reg = await navigator.serviceWorker.register('/sw-push.js', { scope: '/' });
    }
    if (reg && !reg.active) {
      // Wait briefly for the service worker to become active on mobile Chrome
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
      reg = (await navigator.serviceWorker.getRegistration('/')) || reg;
    }
    return reg || null;
  } catch {
    try {
      return await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);
    } catch {
      return null;
    }
  }
}

export async function getActivePushSubscription(userId?: string): Promise<PushSubscription | { endpoint: string } | null> {
  try {
    const reg = await getOrRegisterServiceWorker();
    if (reg && reg.pushManager) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) return sub;
    }
  } catch {
    // ignore
  }
  try {
    if (userId && localStorage.getItem(`baobab_push_enabled_${userId}`) === '1') {
      return { endpoint: `local-notif://${userId}/${getOrCreateLocalDeviceId()}` };
    }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('baobab_push_enabled_') && localStorage.getItem(k) === '1') {
        const uid = k.replace('baobab_push_enabled_', '');
        return { endpoint: `local-notif://${uid}/${getOrCreateLocalDeviceId()}` };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Affiche une notification système locale via le Service Worker (ou l'API Notification)
 * afin que l'utilisateur reçoive immédiatement l'alerte sur son téléphone.
 */
export async function showDeviceSystemNotification(params: {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  tab?: string;
  notificationId?: string;
}): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  const title = params.title || 'Baobab Distribution';
  const options: NotificationOptions & Record<string, any> = {
    body: params.body,
    icon: '/logo.png',
    badge: '/badge-72x72.png',
    tag: params.tag || 'baobab-notif',
    renotify: true,
    vibrate: [180, 80, 180],
    data: {
      url: params.url || '/?tab=dashboard',
      tab: params.tab || 'dashboard',
      notificationId: params.notificationId || null,
    },
  };

  try {
    const reg = await getOrRegisterServiceWorker();
    if (reg && typeof reg.showNotification === 'function') {
      await reg.showNotification(title, options);
      return true;
    }
  } catch {
    // Fallback to standard Notification constructor
  }

  try {
    new Notification(title, {
      body: params.body,
      icon: '/logo.png',
      tag: params.tag || 'baobab-notif',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Demande la permission au clic de l'utilisateur, crée l'abonnement push
 * et l'enregistre côté serveur pour l'utilisateur connecté.
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
    try {
      permission = await Notification.requestPermission();
    } catch {
      permission = Notification.permission;
    }
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
    // 2. Toujours rafraîchir le jeton d'authentification pour éviter tout décalage de clé serveur
    const token = (await ensureUserAuthToken(userId, userRole, true)) || (await ensureUserAuthToken(userId, userRole, false));

    // 3. Récupérer la clé publique VAPID depuis le serveur
    const keyRes = await fetch('/api/push/vapid-public-key');
    const keyData = await keyRes.json().catch(() => ({}));

    // 4. Obtenir le Service Worker et tenter de créer l'abonnement Web Push
    const reg = await getOrRegisterServiceWorker();
    let subscriptionPayload: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    } | null = null;

    if (reg && reg.pushManager && keyRes.ok && keyData?.publicKey) {
      try {
        const appServerKey = urlBase64ToUint8Array(keyData.publicKey);
        let sub = await reg.pushManager.getSubscription();

        // Vérifier si l'abonnement existant utilise une ancienne clé VAPID différente
        if (sub && sub.options?.applicationServerKey) {
          const existingKey = new Uint8Array(sub.options.applicationServerKey);
          let keyMismatch = existingKey.length !== appServerKey.length;
          if (!keyMismatch) {
            for (let i = 0; i < existingKey.length; i++) {
              if (existingKey[i] !== appServerKey[i]) {
                keyMismatch = true;
                break;
              }
            }
          }
          if (keyMismatch) {
            await sub.unsubscribe().catch(() => {});
            sub = null;
          }
        }

        if (!sub) {
          try {
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: appServerKey as unknown as BufferSource,
            });
          } catch {
            // Si un ancien abonnement bloquait la souscription, on le nettoie et on réessaie
            const oldSub = await reg.pushManager.getSubscription().catch(() => null);
            if (oldSub) {
              await oldSub.unsubscribe().catch(() => {});
            }
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: appServerKey as unknown as BufferSource,
            });
          }
        }

        if (sub) {
          const json = sub.toJSON();
          if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
            subscriptionPayload = {
              endpoint: json.endpoint,
              keys: {
                p256dh: json.keys.p256dh,
                auth: json.keys.auth,
              },
            };
          }
        }
      } catch {
        // Fallback local si le service Push distant du navigateur est restreint
      }
    }

    // Fallback local si PushManager n'a pas pu créer de souscription FCM mais que la permission Notification est accordée
    if (!subscriptionPayload) {
      subscriptionPayload = {
        endpoint: `local-notif://${userId}/${getOrCreateLocalDeviceId()}`,
        keys: {
          p256dh: 'local-device-p256dh',
          auth: 'local-device-auth',
        },
      };
    }

    // 5. Enregistrer l'abonnement côté serveur pour l'utilisateur connecté
    const subRes = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-user-role': userRole,
        ...(token ? { Authorization: `Bearer ${token}`, 'x-auth-token': token } : {}),
      },
      body: JSON.stringify({
        userId,
        subscription: subscriptionPayload,
      }),
    });

    const subData = await subRes.json().catch(() => ({}));
    if (!subRes.ok || !subData.success) {
      return {
        success: false,
        ok: false,
        permission,
        message: subData.error || "Erreur lors de l'enregistrement de l'abonnement.",
        error: subData.error || "Erreur lors de l'enregistrement",
      };
    }

    if (typeof subData.unreadCount === 'number') {
      await syncAppBadge(subData.unreadCount);
    }

    try {
      localStorage.setItem(`baobab_push_enabled_${userId}`, '1');
    } catch {
      // ignore
    }

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
    const sub = await getActivePushSubscription(userId);
    const endpoint = sub?.endpoint || null;

    if (sub && 'unsubscribe' in sub && typeof sub.unsubscribe === 'function') {
      try {
        await sub.unsubscribe();
      } catch {
        // ignore
      }
    }

    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-user-role': userRole,
        ...(token ? { Authorization: `Bearer ${token}`, 'x-auth-token': token } : {}),
      },
      body: JSON.stringify({ endpoint }),
    });

    try {
      localStorage.removeItem(`baobab_push_enabled_${userId}`);
    } catch {
      // ignore
    }
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
    const res = await fetch('/api/push/status', {
      headers: {
        'x-user-id': userId,
        'x-user-role': userRole,
        ...(token ? { Authorization: `Bearer ${token}`, 'x-auth-token': token } : {}),
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
    const res = await fetch('/api/push/preferences', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-user-role': userRole,
        ...(token ? { Authorization: `Bearer ${token}`, 'x-auth-token': token } : {}),
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
    const token = (await ensureUserAuthToken(userId, userRole, true)) || (await ensureUserAuthToken(userId, userRole, false));
    const res = await fetch('/api/push/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-user-role': userRole,
        ...(token ? { Authorization: `Bearer ${token}`, 'x-auth-token': token } : {}),
      },
    });
    const data = await res.json().catch(() => ({}));

    // Afficher également la notification système sur l'appareil (dédupliquée via tag 'baobab-test')
    const localShown = await showDeviceSystemNotification({
      title: 'Baobab Distribution',
      body: 'Notification de test : vos alertes système sont bien activées sur cet appareil.',
      tag: 'baobab-test',
      url: '/?tab=dashboard',
      tab: 'dashboard',
    });

    const isOk = Boolean((res.ok && data.success && data.sentCount > 0) || localShown);
    return {
      success: isOk,
      ok: isOk,
      message: isOk
        ? data.message && data.sentCount > 0
          ? data.message
          : 'Notification de test envoyée avec succès sur cet appareil.'
        : data.message || "Erreur lors de l'envoi du test.",
      error: isOk ? undefined : data.message,
    };
  } catch {
    return {
      success: false,
      ok: false,
      message: "Erreur réseau lors de l'envoi de la notification de test.",
      error: 'Erreur réseau',
    };
  }
}

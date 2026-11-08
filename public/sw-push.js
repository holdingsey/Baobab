/* Service Worker — Notifications Système & Badge d'icône Baobab Distribution (v8) */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.map((key) => caches.delete(key)))
      ),
    ])
  );
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'Baobab Distribution',
    body: 'Nouvelle notification système',
    icon: '/logo.png',
    badge: '/badge-72x72.png',
    timestamp: Date.now(),
    tag: 'baobab-info',
    type: 'info',
    url: '/?tab=dashboard',
    tab: 'dashboard',
    notificationId: null,
    reference: null,
    unreadCount: 1,
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = Object.assign({}, payload, parsed);
    } catch {
      try {
        payload.body = event.data.text() || payload.body;
      } catch {
        // Fallback default payload
      }
    }
  }

  const title = payload.title || 'Baobab Distribution';
  const tag = payload.tag || ('baobab-' + (payload.type || 'info'));
  const timestamp = Number(payload.timestamp) || Date.now();
  const targetUrl = payload.url || (payload.tab ? '/?tab=' + encodeURIComponent(payload.tab) : '/?tab=dashboard');

  const notificationOptions = {
    body: payload.body || 'Nouvelle notification disponible',
    icon: payload.icon || '/logo.png',
    badge: payload.badge || '/badge-72x72.png',
    timestamp: timestamp,
    tag: tag,
    renotify: true,
    vibrate: [150, 75, 150],
    data: {
      url: targetUrl,
      tab: payload.tab || 'dashboard',
      notificationId: payload.notificationId || null,
      reference: payload.reference || null,
      type: payload.type || 'info',
      tag: tag,
      unreadCount: typeof payload.unreadCount === 'number' ? payload.unreadCount : undefined,
      userId: payload.userId || null,
      userRole: payload.userRole || null,
    },
  };

  const applyBadgePromise = (async () => {
    try {
      if (typeof payload.unreadCount === 'number') {
        if (payload.unreadCount > 0 && 'setAppBadge' in self.navigator && typeof self.navigator.setAppBadge === 'function') {
          await self.navigator.setAppBadge(payload.unreadCount);
        } else if (payload.unreadCount <= 0 && 'clearAppBadge' in self.navigator && typeof self.navigator.clearAppBadge === 'function') {
          await self.navigator.clearAppBadge();
        }
      }
    } catch {
      // Feature non supportée ou refusée silencieusement
    }
  })();

  const notifyClientsPromise = (async () => {
    try {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of windowClients) {
        client.postMessage({
          type: 'BAOBAB_PUSH_RECEIVED',
          payload: payload,
        });
      }
    } catch {
      // Ignore client broadcast errors
    }
  })();

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, notificationOptions),
      applyBadgePromise,
      notifyClientsPromise,
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const data = notification.data || {};
  notification.close();

  const targetTab = data.tab || 'dashboard';
  const notificationId = data.notificationId || null;
  const reference = data.reference || null;
  const userId = data.userId || null;
  const userRole = data.userRole || null;

  let targetUrl = data.url || ('/?tab=' + encodeURIComponent(targetTab));
  if (notificationId && !targetUrl.includes('notifId=')) {
    targetUrl += (targetUrl.includes('?') ? '&' : '?') + 'notifId=' + encodeURIComponent(notificationId);
  }

  event.waitUntil(
    (async () => {
      let updatedUnreadCount = null;

      // 1. Marquer la notification comme lue côté serveur
      if (notificationId) {
        try {
          const headers = {
            'Content-Type': 'application/json',
          };
          if (userRole) headers['x-user-role'] = userRole;
          if (userId) headers['x-user-id'] = userId;

          const res = await fetch('/api/notifications/' + encodeURIComponent(notificationId) + '/read', {
            method: 'PATCH',
            headers: headers,
            body: JSON.stringify({
              fromServiceWorker: true,
              userId: userId,
              userRole: userRole,
              reference: reference,
            }),
          });

          if (res.ok) {
            const respData = await res.json();
            if (typeof respData.unreadCount === 'number') {
              updatedUnreadCount = respData.unreadCount;
            }
          }
        } catch {
          // Ignore network error during SW read call
        }
      }

      // 2. Mettre à jour le badge de l'icône avec le nouveau compteur
      try {
        if (typeof updatedUnreadCount === 'number') {
          if (updatedUnreadCount > 0 && 'setAppBadge' in self.navigator && typeof self.navigator.setAppBadge === 'function') {
            await self.navigator.setAppBadge(updatedUnreadCount);
          } else if (updatedUnreadCount <= 0 && 'clearAppBadge' in self.navigator && typeof self.navigator.clearAppBadge === 'function') {
            await self.navigator.clearAppBadge();
          }
        } else if (typeof data.unreadCount === 'number') {
          const nextCount = Math.max(0, data.unreadCount - 1);
          if (nextCount > 0 && 'setAppBadge' in self.navigator && typeof self.navigator.setAppBadge === 'function') {
            await self.navigator.setAppBadge(nextCount);
          } else if (nextCount <= 0 && 'clearAppBadge' in self.navigator && typeof self.navigator.clearAppBadge === 'function') {
            await self.navigator.clearAppBadge();
          }
        }
      } catch {
        // Feature detection sans erreur
      }

      // 3. Ouvrir ou réutiliser l'application sur l'écran concerné
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        if ('focus' in client) {
          try {
            await client.focus();
          } catch {
            // Focus may fail on some mobile browsers before navigation
          }
          client.postMessage({
            type: 'BAOBAB_NOTIFICATION_CLICK',
            url: targetUrl,
            tab: targetTab,
            notificationId: notificationId,
            reference: reference,
            userId: userId,
            userRole: userRole,
            unreadCount: updatedUnreadCount,
          });
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});

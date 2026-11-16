/* Service Worker — Notifications Push Immédiates Baobab Distribution (v9) */

const displayedEventIds = new Set();

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
  // Aucune requête réseau avant l'affichage : lecture synchrone du payload léger
  let payload = {
    title: 'Baobab Distribution',
    body: 'Nouvelle notification système',
    url: '/?tab=dashboard',
    tab: 'dashboard',
    notificationId: null,
    reference: null,
    unreadCount: 1,
    requireInteraction: false,
    urgency: 'normal',
    timestamp: Date.now(),
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

  // Déduplication par identifiant d'événement
  const eventKey = payload.notificationId || payload.tag || ('evt-' + Date.now());
  if (payload.notificationId && displayedEventIds.has(payload.notificationId)) {
    return;
  }
  if (payload.notificationId) {
    displayedEventIds.add(payload.notificationId);
    if (displayedEventIds.size > 500) {
      const oldest = displayedEventIds.values().next().value;
      if (oldest) displayedEventIds.delete(oldest);
    }
  }

  const title = payload.title || 'Baobab Distribution';
  // Tag unique par événement
  const uniqueTag = payload.tag || ('baobab-evt-' + eventKey);
  const timestamp = Number(payload.timestamp) || Date.now();
  const targetUrl =
    payload.url ||
    (payload.tab ? '/?tab=' + encodeURIComponent(payload.tab) : '/?tab=dashboard');
  const isActionable =
    Boolean(payload.requireInteraction) || payload.urgency === 'high';

  const notificationOptions = {
    body: payload.body || 'Nouvelle notification disponible',
    icon: '/logo.png',
    badge: '/badge-72x72.png',
    timestamp: timestamp,
    tag: uniqueTag,
    renotify: true,
    requireInteraction: isActionable,
    vibrate: isActionable ? [200, 80, 200] : [120, 60, 120],
    data: {
      url: targetUrl,
      tab: payload.tab || 'dashboard',
      notificationId: payload.notificationId || null,
      reference: payload.reference || null,
      tag: uniqueTag,
      unreadCount:
        typeof payload.unreadCount === 'number' ? payload.unreadCount : undefined,
      userId: payload.userId || null,
      userRole: payload.userRole || null,
    },
  };

  // Affichage immédiat dans event.waitUntil(showNotification) sans aucune requête réseau préalable
  const showPromise = self.registration.showNotification(title, notificationOptions);

  const badgeAndClientSync = (async () => {
    try {
      if (typeof payload.unreadCount === 'number') {
        if (
          payload.unreadCount > 0 &&
          'setAppBadge' in self.navigator &&
          typeof self.navigator.setAppBadge === 'function'
        ) {
          await self.navigator.setAppBadge(payload.unreadCount);
        } else if (
          payload.unreadCount <= 0 &&
          'clearAppBadge' in self.navigator &&
          typeof self.navigator.clearAppBadge === 'function'
        ) {
          await self.navigator.clearAppBadge();
        }
      }
    } catch {
      // Ignore
    }

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
      // Ignore
    }
  })();

  event.waitUntil(Promise.all([showPromise, badgeAndClientSync]));
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
    targetUrl +=
      (targetUrl.includes('?') ? '&' : '?') +
      'notifId=' +
      encodeURIComponent(notificationId);
  }

  event.waitUntil(
    (async () => {
      let updatedUnreadCount = null;

      if (notificationId) {
        try {
          const headers = {
            'Content-Type': 'application/json',
          };
          if (userRole) headers['x-user-role'] = userRole;
          if (userId) headers['x-user-id'] = userId;

          const res = await fetch(
            '/api/notifications/' + encodeURIComponent(notificationId) + '/read',
            {
              method: 'PATCH',
              headers: headers,
              body: JSON.stringify({
                fromServiceWorker: true,
                userId: userId,
                userRole: userRole,
                reference: reference,
              }),
            }
          );

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

      try {
        if (typeof updatedUnreadCount === 'number') {
          if (
            updatedUnreadCount > 0 &&
            'setAppBadge' in self.navigator &&
            typeof self.navigator.setAppBadge === 'function'
          ) {
            await self.navigator.setAppBadge(updatedUnreadCount);
          } else if (
            updatedUnreadCount <= 0 &&
            'clearAppBadge' in self.navigator &&
            typeof self.navigator.clearAppBadge === 'function'
          ) {
            await self.navigator.clearAppBadge();
          }
        } else if (typeof data.unreadCount === 'number') {
          const nextCount = Math.max(0, data.unreadCount - 1);
          if (
            nextCount > 0 &&
            'setAppBadge' in self.navigator &&
            typeof self.navigator.setAppBadge === 'function'
          ) {
            await self.navigator.setAppBadge(nextCount);
          } else if (
            nextCount <= 0 &&
            'clearAppBadge' in self.navigator &&
            typeof self.navigator.clearAppBadge === 'function'
          ) {
            await self.navigator.clearAppBadge();
          }
        }
      } catch {
        // Feature detection sans erreur
      }

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

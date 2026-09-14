// Service Worker for Minimal Launcher - Mindful Curfew & Web Push Notifications
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// PUSH NOTIFICATION LISTENER (Called by browser when phone receives Web Push while closed)
self.addEventListener('push', (event) => {
  let data = {
    title: '🌙 Lâchez votre téléphone',
    body: "Il est l'heure de poser votre téléphone et de reposer votre esprit.",
    tag: 'curfew-disconnect',
    url: '/',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = Object.assign(data, parsed);
    } catch (e) {
      const txt = event.data.text();
      if (txt) data.body = txt;
    }
  }

  const options = {
    body: data.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: data.tag || 'curfew-disconnect',
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [350, 150, 350, 150, 500],
    data: {
      url: data.url || '/',
      dateOfArrival: Date.now(),
      cycleKey: data.cycleKey,
    },
    actions: [
      {
        action: 'open',
        title: 'Ouvrir Minimal',
      },
      {
        action: 'confirm_night',
        title: "J'arrête mon téléphone",
      },
    ],
  };

  const showSafeNotification = async () => {
    try {
      // First attempt with full rich actions and vibration
      await self.registration.showNotification(data.title, options);
    } catch (err) {
      console.warn('Rich notification failed, falling back to minimal options for device compatibility:', err);
      try {
        // Fallback for Safari/iOS or browsers that do not support actions/vibrate
        await self.registration.showNotification(data.title, {
          body: data.body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: data.tag || 'curfew-disconnect',
          renotify: true,
          data: {
            url: data.url || '/',
          },
        });
      } catch (fallbackErr) {
        console.error('All notification attempts failed:', fallbackErr);
      }
    }
  };

  event.waitUntil(showSafeNotification());
});

// NOTIFICATION CLICK LISTENER
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'confirm_night') {
    event.waitUntil(
      fetch('/api/push/confirm-night', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm_night' }),
      }).catch(() => {})
    );
    return;
  }

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

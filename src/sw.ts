/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

declare let self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);
self.skipWaiting();
clientsClaim();

// PUSH NOTIFICATION LISTENER (Called by browser when phone receives Web Push while closed)
self.addEventListener('push', (event: PushEvent) => {
  let data: {
    title: string;
    body: string;
    tag?: string;
    url?: string;
    cycleKey?: string;
  } = {
    title: '🌙 Lâchez votre téléphone',
    body: "Il est l'heure de poser votre téléphone et de reposer votre esprit.",
    tag: 'curfew-disconnect',
    url: '/',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch {
      const txt = event.data.text();
      if (txt) data.body = txt;
    }
  }

  const options: any = {
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

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// NOTIFICATION CLICK LISTENER
self.addEventListener('notificationclick', (event: NotificationEvent) => {
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

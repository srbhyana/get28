/* Thirty-five — service worker. Shows the bell when the server pushes. */
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let d = { title: 'Thirty-five', body: 'Do the next thing.' };
  try { d = event.data.json(); } catch (e) { try { d.body = event.data.text(); } catch (e2) {} }
  event.waitUntil(self.registration.showNotification(d.title, {
    body: d.body,
    tag: d.tag || 'bell',
    renotify: true,
    requireInteraction: !!d.hard,
    vibrate: [40, 80, 40],
    data: { url: d.url || '/' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    return clients.openWindow(event.notification.data.url || '/');
  }));
});

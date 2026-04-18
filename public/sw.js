self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(clients.claim()); });
self.addEventListener('fetch', (e) => {
  // Don't intercept non-GET requests or auth-sensitive API routes — let the
  // browser handle them natively. Wrapping them in respondWith + fetch produces
  // spurious "FetchEvent resulted in a network error" console warnings and
  // can interfere with streaming/keep-alive requests (Ably, SSE, etc.).
  if (e.request.method !== 'GET') return;
  try {
    const url = new URL(e.request.url);
    if (url.pathname.startsWith('/api/community')) return;
    if (url.pathname.startsWith('/api/ably-token')) return;
    if (url.pathname.startsWith('/api/notifications/sse')) return;
  } catch {}
  e.respondWith(fetch(e.request));
});

// Push notifications
self.addEventListener('push', (e) => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'Clippers HQ', {
      body: data.body || 'You have a new notification',
      icon: '/landing/logo/logo.png',
      badge: '/landing/logo/logo.png',
      data: { url: data.url || '/dashboard' },
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data.url));
});

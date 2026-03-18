importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Config injected from main app via postMessage after SW registration
let messagingInitialized = false;

self.addEventListener('message', (event) => {
  if (event.data?.type === 'FIREBASE_CONFIG' && !messagingInitialized) {
    messagingInitialized = true;
    firebase.initializeApp(event.data.config);
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      self.registration.showNotification(
        payload.notification?.title ?? 'Vereins-App',
        {
          body: payload.notification?.body ?? '',
          icon: payload.notification?.icon ?? '/icon-192.png',
          badge: '/icon-96.png',
          data: payload.data ?? {},
          requireInteraction: false,
        }
      );
    });
  }
});

// Handle notification click → focus existing window or open new one
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) return clientList[0].focus();
      return clients.openWindow('/mein-bereich');
    })
  );
});

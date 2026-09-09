// Service worker: handles incoming Web Push events and notification clicks.
// Registered from js/push.js at the site root so it can control every page.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "New message", body: "You have a new message.", conversationId: null };
  if (event.data) {
    try { payload = { ...payload, ...event.data.json() }; } catch (_) { payload.body = event.data.text(); }
  }

  const options = {
    body: payload.body,
    icon: "/images/cover-places.jpg",
    badge: "/images/cover-places.jpg",
    tag: payload.conversationId ? `conversation-${payload.conversationId}` : undefined,
    data: { conversationId: payload.conversationId }
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const conversationId = event.notification.data?.conversationId;
  const targetUrl = conversationId ? `/messages.html#${conversationId}` : "/messages.html";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes("/messages.html") && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

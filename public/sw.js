// Service worker mínimo: solo existe para poder recibir notificaciones push
// (requisito de iOS/Android para Web Push) y abrir la app al tocarlas. No
// cachea nada ni hace la app funcionar offline — eso no se pidió, así que no
// se agrega complejidad de más.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Finanzas", body: event.data.text() };
  }
  const title = payload.title || "Finanzas";
  const options = {
    body: payload.body || "",
    icon: "/finanzas-app/icons/icon-192.png",
    badge: "/finanzas-app/icons/icon-192.png",
    data: { url: payload.url || "/finanzas-app/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/finanzas-app/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("/finanzas-app/") && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

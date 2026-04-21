// public/sw.js

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  let data = {}
  try {
    data = event.data.json()
  } catch {
    data = { titel: event.data.text() }
  }

  const options = {
    body: data.text ?? '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: { link: data.link ?? '/' },
    actions: data.link
      ? [{ action: 'open', title: 'Öffnen' }]
      : [],
  }

  event.waitUntil(
    self.registration.showNotification(data.titel ?? 'Neue Benachrichtigung', options)
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const link = event.notification.data?.link ?? '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Wenn App schon offen → fokussieren und navigieren
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          client.navigate(link)
          return
        }
      }
      // Sonst neues Fenster öffnen
      if (clients.openWindow) {
        return clients.openWindow(link)
      }
    })
  )
})
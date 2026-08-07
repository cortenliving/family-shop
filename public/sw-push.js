/* Family Shop — push handlers imported into the Workbox service worker */

self.addEventListener('push', (event) => {
  let data = {
    title: 'Family Shop',
    body: 'Shopping list updated',
    url: '/',
    tag: 'family-shop-list',
  }
  try {
    if (event.data) {
      // Payload may be JSON object or a JSON string
      let parsed = event.data.json()
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed)
        } catch {
          data.body = parsed
          parsed = null
        }
      }
      if (parsed && typeof parsed === 'object') {
        data = { ...data, ...parsed }
      }
    }
  } catch {
    try {
      const text = event.data && event.data.text()
      if (text) {
        try {
          const parsed = JSON.parse(text)
          if (parsed && typeof parsed === 'object') {
            data = { ...data, ...parsed }
          } else {
            data.body = text
          }
        } catch {
          data.body = text
        }
      }
    } catch {
      /* use defaults */
    }
  }

  // iOS / browsers require a visible notification in the push handler
  event.waitUntil(
    self.registration.showNotification(data.title || 'Family Shop', {
      body: data.body || 'Shopping list updated',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'family-shop-list',
      renotify: true,
      requireInteraction: false,
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            if ('navigate' in client) client.navigate(url)
            return client.focus()
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(url)
      }),
  )
})

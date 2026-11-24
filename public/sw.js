// タイマー終了の通知を出すためだけの Service Worker（ページの保存や通信の横取りはしない）
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => (list.length > 0 ? list[0].focus() : self.clients.openWindow('/')))
  );
});

/* Service Worker for Blog Admin PWA
 * v3: 清除所有缓存并注销自身，避免旧版缓存导致功能异常。
 * 后台为管理工具，无需离线能力，后续一律走网络请求。
 */
self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => clients.forEach(c => c.navigate(c.url)))
  );
});

// 不拦截任何请求（后台无需离线缓存）
self.addEventListener('fetch', e => {});

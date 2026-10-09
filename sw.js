/* Service Worker — المنظومة التعليمية
   غيّر رقم VERSION عند الحاجة لإجبار تحديث الكاش. */
const VERSION = 'v1';
const CACHE = 'tighya-' + VERSION;
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './photo.jpg'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('tighya-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // الصفحة: الشبكة أولًا (لتصل تحديثات الدروس فورًا) ثم الكاش عند انقطاع الإنترنت
  if (req.mode === 'navigate' || (url.origin === location.origin && url.pathname.endsWith('index.html'))) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // باقي الملفات والخطوط: من الكاش فورًا مع تحديثه في الخلفية
  if (url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(
      caches.match(req).then(hit => {
        const net = fetch(req).then(res => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
  }
});

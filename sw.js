/* Service Worker — المنظومة التعليمية
   غيّر رقم VERSION عند الحاجة لإجبار تحديث الكاش. */
const VERSION = 'v2';
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

  // الصوت والفيديو: بث مباشر من الشبكة + حفظ نسخة كاملة في الخلفية، ويدعم طلبات Range دون إنترنت
  if (url.origin === location.origin && /\.(mp3|m4a|aac|ogg|wav|mp4)$/i.test(url.pathname)) {
    e.respondWith(handleMedia(e, req, url));
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

const pendingMedia = new Set();

async function handleMedia(e, req, url) {
  const cache = await caches.open(CACHE);
  const key = url.href;
  const hit = await cache.match(key);

  if (!hit) {
    // غير محفوظ: يُشغَّل من الشبكة، ثم تُحفظ نسخة كاملة في الخلفية
    if (!pendingMedia.has(key)) {
      pendingMedia.add(key);
      e.waitUntil(
        fetch(key).then(r => { if (r.ok) return cache.put(key, r); })
          .catch(() => {}).finally(() => pendingMedia.delete(key))
      );
    }
    return fetch(req).catch(() => new Response('', { status: 503 }));
  }

  const range = req.headers.get('range');
  if (!range) return hit;
  const blob = await hit.blob();
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  const size = blob.size;
  let start = m && m[1] ? parseInt(m[1], 10) : 0;
  let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
  end = Math.min(end, size - 1);
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': hit.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
      'Content-Length': String(end - start + 1)
    }
  });
}

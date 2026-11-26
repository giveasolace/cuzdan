const CACHE = 'cuzdan-v8';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('cuzdan-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Önce ağ, olmazsa önbellek
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.registration.scope)) return;
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(r => {  // HTTP önbelleğini atla, hep en yeni sürüm
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});

// ---------- Ödeme hatırlatmaları ----------
function readSnap() {
  return new Promise(res => {
    const r = indexedDB.open('cuzdan', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onerror = () => res(null);
    r.onsuccess = () => {
      try {
        const g = r.result.transaction('kv').objectStore('kv').get('snap');
        g.onsuccess = () => res(g.result || null);
        g.onerror = () => res(null);
      } catch (e) { res(null); }
    };
  });
}
const pad = n => String(n).padStart(2, '0');
const dkey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const fmt = n => Math.round(n).toLocaleString('tr-TR') + ' ₺';

function buildMessage(s) {
  if (s && s.testAt && Date.now() - s.testAt < 5 * 60 * 1000)
    return { title: '✅ Cüzdan bildirimleri çalışıyor!', body: 'Ödeme günlerin yaklaşınca seni uyaracağım 💳', url: './' };
  const t = dkey(new Date());
  const items = ((s && s.items) || []).filter(i => i.date <= dkey(new Date(Date.now() + 7 * 864e5)));
  if (!items.length) return { title: '💳 Ödeme hatırlatması', body: 'Yaklaşan ödemelerine bir göz at.', url: './?tab=bills' };
  const label = d => { const n = Math.round((new Date(d + 'T12:00') - new Date(t + 'T12:00')) / 864e5);
    return n < 0 ? 'Gecikti' : n === 0 ? 'Bugün' : n === 1 ? 'Yarın' : `${n} gün sonra`; };
  const late = items.some(i => i.date < t);
  const body = items.slice(0, 4).map(i => `${label(i.date)}: ${i.name}${i.amount ? ' ' + fmt(i.amount) : ''}`).join(' · ') + (items.length > 4 ? ` +${items.length - 4}` : '');
  return { title: late ? '⚠️ Geciken ödemen var' : '💳 Ödeme hatırlatması', body, url: './?tab=bills' };
}

self.addEventListener('push', e => {
  e.waitUntil(readSnap().then(s => {
    const m = buildMessage(s);
    return self.registration.showNotification(m.title, { body: m.body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'cuzdan', data: { url: m.url } });
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const mine = cs.filter(c => c.url.startsWith(self.registration.scope));
    if (mine.length) { if (url.includes('tab=bills')) mine[0].postMessage('bills'); return mine[0].focus(); }
    return self.clients.openWindow(url);
  }));
});

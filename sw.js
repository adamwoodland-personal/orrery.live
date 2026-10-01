// Service worker for orrery.live.
//
// Strategy:
//  - Code, data and navigations: NETWORK-FIRST. Online users always get the
//    freshly deployed files (nothing here is fingerprinted); the cached copy
//    only serves when the network is unavailable.
//  - Images/textures: CACHE-FIRST. They are large and effectively immutable,
//    so repeat visits and offline use skip the download entirely.
//  - Bump CACHE on deploys that must wipe stale entries (activate deletes
//    every other cache version).
const CACHE = 'orrery-v17';
const CORE = [
	'/',
	'/index.html',
	'/styles.css',
	'/app.js',
	'/stars.js',
	'/constellations.js',
	'/spacecraft.js',
	'/lib/three.module.js',
	'/lib/three.core.js',
	'/lib/jsm/controls/OrbitControls.js',
	'/favicon.svg',
	'/manifest.json'
];

self.addEventListener('install', (e) => {
	e.waitUntil(
		caches.open(CACHE)
			.then((c) => c.addAll(CORE))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (e) => {
	e.waitUntil(
		caches.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (e) => {
	const req = e.request;
	if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

	if (req.destination === 'image') {
		// Textures: cache-first (immutable in practice).
		e.respondWith(
			caches.open(CACHE).then(async (c) => {
				const hit = await c.match(req);
				if (hit) return hit;
				const res = await fetch(req);
				if (res.ok) c.put(req, res.clone());
				return res;
			})
		);
		return;
	}

	// Everything else: network-first with cache fallback; navigations fall
	// back to the cached shell (share-link query strings and all).
	e.respondWith(
		fetch(req)
			.then((res) => {
				if (res.ok) {
					const copy = res.clone();
					caches.open(CACHE).then((c) => c.put(req, copy));
				}
				return res;
			})
			.catch(async () => {
				const hit = await caches.match(req);
				if (hit) return hit;
				if (req.mode === 'navigate') {
					const shell = await caches.match('/index.html');
					if (shell) return shell;
				}
				return Response.error();
			})
	);
});

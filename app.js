// Imports use relative paths (no import-map) so the page works under a strict
// CSP (script-src 'self'). OrbitControls' own `three` import is likewise
// rewired to ./lib/three.module.js, and the star catalogue is embedded in
// stars.js because fetch() is blocked by connect-src 'none'.
import * as THREE from './lib/three.module.js';
import { OrbitControls } from './lib/jsm/controls/OrbitControls.js';
import { STARS } from './stars.js';
import { CLINES } from './constellations.js';
import { TRAJ } from './spacecraft.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x01020a);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 4000);
camera.position.set(0, 16, 30);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 3;
controls.maxDistance = 140;

// The loading overlay stays up until every managed texture has arrived (the
// optional Milky Way backdrop loads unmanaged — it's hidden by default and
// shouldn't gate startup). Safety timeout so a stalled download can't strand
// the overlay; rendering runs behind it regardless.
const loadManager = new THREE.LoadingManager();
function dismissLoading() { const el = document.getElementById('loading'); if (el) el.remove(); }
loadManager.onLoad = dismissLoading;
setTimeout(dismissLoading, 8000);

const texLoader = new THREE.TextureLoader(loadManager).setPath('./textures/');
function loadMap(file) {
	const t = texLoader.load(file);
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = renderer.capabilities.getMaxAnisotropy();
	return t;
}

// ---- Lighting --------------------------------------------------------
const ambient = new THREE.AmbientLight(0x9fb0d8, 0.35); // soft fill; user-adjustable below
scene.add(ambient);
const sunLight = new THREE.PointLight(0xfff4e0, 3.0, 0, 0); // decay 0 -> even light across the system
scene.add(sunLight);

// ---- Sun -------------------------------------------------------------
const sun = new THREE.Mesh(
	new THREE.SphereGeometry(1.7, 64, 64),
	new THREE.MeshBasicMaterial({ map: loadMap('2k_sun.jpg') })
);
scene.add(sun);

// soft additive glow sprite around the sun
function radialGlow() {
	const c = document.createElement('canvas'); c.width = c.height = 256;
	const g = c.getContext('2d');
	const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
	grd.addColorStop(0.0, 'rgba(255,236,180,0.95)');
	grd.addColorStop(0.25, 'rgba(255,200,90,0.45)');
	grd.addColorStop(0.55, 'rgba(255,150,40,0.12)');
	grd.addColorStop(1.0, 'rgba(255,120,20,0)');
	g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
	const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialGlow(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
glow.scale.set(9, 9, 1);
sun.add(glow);

// =====================================================================
//  Keplerian elements (JPL / Standish, J2000), long-range Table 2a/2b,
//  valid ~3000 BC – 3000 AD. [value at J2000, change per Julian century]
//  Jupiter–Pluto carry extra periodic terms `bcsf` = [b, c, s, f].
// =====================================================================
const DEG = Math.PI / 180;
const J2000 = 2451545.0;
const AU_KM = 149597870.7;
const OBLIQUITY = 23.43928 * DEG; // tilt between Earth's equatorial frame and the ecliptic

const planetsData = [
	{ name: 'Mercury', rotH: 1407.6, tex: '2k_mercury.jpg',       size: 0.24, displayA: 2.6,  type: 'Terrestrial planet', fact: 'Smallest planet; no atmosphere to speak of, with 430 °C days and −180 °C nights.',
	  el: { a:[0.38709843,0.0], e:[0.20563661,0.00002123], I:[7.00559432,-0.00590158], L:[252.25166724,149472.67486623], peri:[77.45771895,0.15940013], node:[48.33961819,-0.12214182] } },
	{ name: 'Venus', rotH: -5832.5, tex: '2k_venus_surface.jpg',   size: 0.36, displayA: 3.7,  type: 'Terrestrial planet', fact: 'Hottest planet (465 °C) under a thick CO₂ atmosphere; spins backwards.',
	  el: { a:[0.72332102,-0.00000026], e:[0.00676399,-0.00005107], I:[3.39777545,0.00043494], L:[181.97970850,58517.81560260], peri:[131.76755713,0.05679648], node:[76.67261496,-0.27274174] } },
	{ name: 'Earth', rotH: 23.9345, tex: '2k_earth_daymap.jpg',    size: 0.38, displayA: 4.9,  type: 'Terrestrial planet', fact: 'The only known world with liquid surface water and life.',
	  el: { a:[1.00000018,-0.00000003], e:[0.01673163,-0.00003661], I:[-0.00054346,-0.01337178], L:[100.46691572,35999.37306329], peri:[102.93005885,0.31795260], node:[-5.11260389,-0.24123856], emb: true } },
	{ name: 'Mars', rotH: 24.6229, tex: '2k_mars.jpg',             size: 0.29, displayA: 6.1,  type: 'Terrestrial planet', fact: 'The “Red Planet”; home to Olympus Mons, the tallest volcano in the solar system.',
	  el: { a:[1.52371243,0.00000097], e:[0.09336511,0.00009149], I:[1.85181869,-0.00724757], L:[-4.56813164,19140.29934243], peri:[-23.91744784,0.45223625], node:[49.71320984,-0.26852431] } },
	{ name: 'Jupiter', rotH: 9.925, tex: '2k_jupiter.jpg',       size: 0.95, displayA: 8.9,  type: 'Gas giant', fact: 'The largest planet — 2.5× the mass of all the others combined. The Great Red Spot is a centuries-old storm.',
	  el: { a:[5.20248019,-0.00002864], e:[0.04853590,0.00018026], I:[1.29861416,-0.00322699], L:[34.33479152,3034.90371757], peri:[14.27495244,0.18199196], node:[100.29282654,0.13024619], bcsf:[-0.00012452,0.06064060,-0.35635438,38.35125] } },
	{ name: 'Saturn', rotH: 10.561, tex: '2k_saturn.jpg',         size: 0.80, displayA: 11.4, type: 'Gas giant', ring: true, fact: 'Famous for its bright ring system of ice and rock; low enough density to float on water.',
	  el: { a:[9.54149883,-0.00003065], e:[0.05550825,-0.00032044], I:[2.49424102,0.00451969], L:[50.07571329,1222.11494724], peri:[92.86136063,0.54179478], node:[113.63998702,-0.25015002], bcsf:[0.00025899,-0.13434469,0.87320147,38.35125] } },
	{ name: 'Uranus', rotH: -17.24, tex: '2k_uranus.jpg',         size: 0.58, displayA: 13.3, type: 'Ice giant', fact: 'Tipped on its side (98° axial tilt), so it rolls around the Sun.',
	  el: { a:[19.18797948,-0.00020455], e:[0.04685740,-0.00001550], I:[0.77298127,-0.00180155], L:[314.20276625,428.49512595], peri:[172.43404441,0.09266985], node:[73.96250215,0.05739699], bcsf:[0.00058331,-0.97731848,0.17689245,7.67025] } },
	{ name: 'Neptune', rotH: 16.11, tex: '2k_neptune.jpg',       size: 0.56, displayA: 14.8, type: 'Ice giant', fact: 'Windiest planet, with gusts over 2,000 km/h. Discovered by maths before it was seen.',
	  el: { a:[30.06952752,0.00006447], e:[0.00895439,0.00000818], I:[1.77005520,0.00022400], L:[304.22289287,218.46515314], peri:[46.68158724,0.01009938], node:[131.78635853,-0.00606302], bcsf:[-0.00041348,0.68346318,-0.10162547,7.67025] } },
	{ name: 'Pluto', rotH: -153.3,                                size: 0.21, displayA: 16.3, type: 'Dwarf planet', fact: 'Reclassified as a dwarf planet in 2006; its tilted, eccentric orbit sometimes brings it closer than Neptune.',
	  el: { a:[39.48686035,0.00449751], e:[0.24885238,0.00006016], I:[17.14104260,0.00000501], L:[238.96535011,145.18042903], peri:[224.09702598,-0.00968827], node:[110.30167986,-0.00809981], bcsf:[-0.01262724,0.0,0.0,0.0] } },
	// Remaining IAU dwarf planets. Untextured (no free maps), shaded by `color`.
	// Elements are J2000 mean values (no per-century rates beyond mean motion),
	// so orbit shape/size/inclination are accurate and position is approximate.
	{ name: 'Ceres', rotH: 9.074, size: 0.12, displayA: 7.0, type: 'Dwarf planet', color: '#9a9389', fact: 'The largest object in the asteroid belt and the only dwarf planet in the inner solar system; it may hold briny water under its crust.',
	  el: { a:[2.7691,0], e:[0.0760,0], I:[10.594,0], L:[249.891,7812.6], peri:[153.902,0], node:[80.305,0] } },
	{ name: 'Haumea', rotH: 3.915, size: 0.16, displayA: 17.3, type: 'Dwarf planet', color: '#d9d2c6', fact: 'An egg-shaped, fast-spinning dwarf planet — a day there lasts under four hours — circled by a ring and two moons.',
	  el: { a:[43.182,0], e:[0.19642,0], I:[28.214,0], L:[219.8,126.85], peri:[1.4,0], node:[121.9,0] } },
	{ name: 'Makemake', rotH: 22.827, size: 0.15, displayA: 18.1, type: 'Dwarf planet', color: '#b07a5a', fact: 'A large reddish Kuiper Belt dwarf planet with a frigid surface of methane and ethane ice.',
	  el: { a:[45.430,0], e:[0.16126,0], I:[28.984,0], L:[167.45,117.6], peri:[14.45,0], node:[79.62,0] } },
	// Eris rotation: tidally locked to its moon Dysnomia (15.786-day lightcurve
	// period, Szakáts et al. 2023); older catalogues still list 25.9 h.
	{ name: 'Eris', rotH: 378.86, size: 0.20, displayA: 19.6, type: 'Dwarf planet', color: '#d8d5cc', fact: 'A distant, massive dwarf planet, slightly heavier than Pluto — tidally locked to its moon Dysnomia, so its day lasts 15.8 Earth days. Its 2005 discovery triggered Pluto’s reclassification.',
	  el: { a:[67.864,0], e:[0.43607,0], I:[44.040,0], L:[31.75,64.39], peri:[187.59,0], node:[35.951,0] } }
];

// --- Axial rotation (tied to simulated time) ------------------------
// Rotation is a function of the simulated date, at each body's real
// sidereal rate and direction (rotH < 0 = retrograde). So pausing freezes
// every body at a fixed orientation, and scrubbing the date turns them the
// correct way (and reverses correctly). The four terrestrial planets are
// oriented from the IAU rotational elements (real pole direction + prime-
// meridian angle W = W0 + Wd·d), so the correct longitude faces the Sun —
// Earth maps to real geography (Greenwich at local noon); Mercury/Venus/Mars
// are as accurate as their surface maps' longitude registration. The giant
// planets and Pluto get their true IAU spin-axis direction (so Saturn's rings
// and Uranus's sideways roll sit in their real planes) and the real rate, but
// an arbitrary phase (no solid surface / stylised maps), so their absolute
// facing isn't claimed. The remaining dwarf planets get the real rate and
// direction on an upright axis (no reliable pole data).
const SUN_ROT_H = 609.12; // ~25.4-day solar rotation, prograde
function spinRate(rotH) { return Math.sign(rotH) * 2 * Math.PI / (Math.abs(rotH) / 24); } // rad per day
const sunSpin = spinRate(SUN_ROT_H);

// IAU (WGCCRE) rotational elements: north-pole RA/Dec [J2000°, °/century]
// and prime meridian W0 [°] + Wd [°/day] (d = days since J2000).
const IAU = {
	Mercury: { ra: [281.0103, -0.0328],  dec: [61.4155, -0.0049],  W0: 329.5988, Wd: 6.1385108 },
	Venus:   { ra: [272.76, 0],          dec: [67.16, 0],          W0: 160.20,   Wd: -1.4813688 },
	Earth:   { ra: [0.0, -0.641],        dec: [90.0, -0.557],      W0: 190.147,  Wd: 360.9856235 },
	Mars:    { ra: [317.68143, -0.1061], dec: [52.88650, -0.0609], W0: 176.630,  Wd: 350.89198226 }
};

// Equatorial (ICRF) unit direction -> scene frame (same transform as the stars).
function eqToScene(v) {
	const yc = v.y * Math.cos(OBLIQUITY) + v.z * Math.sin(OBLIQUITY);
	const zc = -v.y * Math.sin(OBLIQUITY) + v.z * Math.cos(OBLIQUITY);
	return new THREE.Vector3(v.x, zc, -yc);
}

// Orient an accurate body's mesh from its IAU elements at day d (since J2000).
const _basis = new THREE.Matrix4();
function orientAccurate(b, d) {
	const p = b.iau, T = d / 36525;
	const a0 = (p.ra[0] + p.ra[1] * T) * DEG;
	const d0 = (p.dec[0] + p.dec[1] * T) * DEG;
	const W = (p.W0 + p.Wd * d) * DEG;
	const bz = new THREE.Vector3(Math.cos(d0) * Math.cos(a0), Math.cos(d0) * Math.sin(a0), Math.sin(d0)); // north pole
	const node = new THREE.Vector3(-Math.sin(a0), Math.cos(a0), 0);                                       // equator ascending node
	const bx = node.clone().multiplyScalar(Math.cos(W))                                                   // prime meridian (lon 0)
		.add(new THREE.Vector3().crossVectors(bz, node).multiplyScalar(Math.sin(W)));
	const sx = eqToScene(bx).normalize();   // sphere local +x = longitude 0 (texture centre)
	const sy = eqToScene(bz).normalize();   // sphere local +y = north pole
	const sz = new THREE.Vector3().crossVectors(sx, sy).normalize();
	_basis.makeBasis(sx, sy, sz);
	b.mesh.quaternion.setFromRotationMatrix(_basis);
}

// True spin-axis directions (IAU/WGCCRE, J2000) for the bodies whose maps are
// illustrative: right-hand-rule poles, i.e. the direction your thumb points
// when the fingers follow the spin. Uranus's entry is therefore the opposite
// of its IAU "north" pole, and Pluto's points 23° below the ecliptic — their
// retrograde character is encoded in the pole, so spin is always positive
// about it. Moon systems ride these same planes (see buildMoons).
const POLES = {
	Jupiter: { ra: [268.057], dec: [64.495] },
	Saturn:  { ra: [40.589],  dec: [83.537] },
	Uranus:  { ra: [77.311],  dec: [15.175] },
	Neptune: { ra: [299.36],  dec: [43.46] },  // mean pole (0.7° precession wobble ignored)
	Pluto:   { ra: [132.993], dec: [-6.163] }
};
const _POLE_UP = new THREE.Vector3(0, 1, 0);
function poleQuat(p) { // rotate scene-up onto the pole; twist (phase) is arbitrary
	const a0 = p.ra[0] * DEG, d0 = p.dec[0] * DEG; // J2000 values; centennial drift is negligible here
	const dir = eqToScene(new THREE.Vector3(Math.cos(d0) * Math.cos(a0), Math.cos(d0) * Math.sin(a0), Math.sin(d0))).normalize();
	return new THREE.Quaternion().setFromUnitVectors(_POLE_UP, dir);
}

function dateToDays(date) { return date.getTime() / 86400000 + 2440587.5 - J2000; }
// Rounded to whole milliseconds: the float round-trip otherwise lands a
// picked 21:47 at 21:46:59.999 and the label reads a minute early.
function daysToDate(days) { return new Date(Math.round((days + J2000 - 2440587.5) * 86400000)); }

// Geocentric Moon (km, J2000 ecliptic) from the Astronomical Almanac's
// low-precision lunar formulae (ecliptic of date), precessed to J2000 so it
// shares the planets' frame. Checked against JPL Horizons DE441 geocentric
// vectors at six dates 1900–2100: direction within 0.12°, distance within 0.15%.
const EARTH_MOON_MASS = 1 / 82.30057; // Moon / (Earth + Moon)
const MOON_A = 384400;                // km, mean distance (the display-radius reference)
function moonGeocentric(days) {
	const T = days / 36525;
	const s = (a, b) => Math.sin((a + b * T) * DEG), c = (a, b) => Math.cos((a + b * T) * DEG);
	const lam = (218.32 + 481267.881 * T - 1.39697 * T // last term: ecliptic of date -> J2000
		+ 6.29 * s(135.0, 477198.87) - 1.27 * s(259.3, -413335.36) + 0.66 * s(235.7, 890534.22)
		+ 0.21 * s(269.9, 954397.70) - 0.19 * s(357.5, 35999.05) - 0.11 * s(186.5, 966404.03)) * DEG;
	const bet = (5.13 * s(93.3, 483202.02) + 0.28 * s(228.2, 960400.89) - 0.28 * s(318.3, 6003.15) - 0.17 * s(217.6, -407332.21)) * DEG;
	const par = (0.9508 + 0.0518 * c(135.0, 477198.87) + 0.0095 * c(259.3, -413335.36) + 0.0078 * c(235.7, 890534.22) + 0.0028 * c(269.9, 954397.70)) * DEG;
	const r = 6378.14 / Math.sin(par), cb = Math.cos(bet);
	return { x: r * cb * Math.cos(lam), y: r * cb * Math.sin(lam), z: r * Math.sin(bet) };
}

// Heliocentric ecliptic position (AU) from elements at century T.
function heliocentric(el, T) {
	const a    =  el.a[0]    + el.a[1]    * T;
	const e    =  el.e[0]    + el.e[1]    * T;
	const I    = (el.I[0]    + el.I[1]    * T) * DEG;
	const L    =  el.L[0]    + el.L[1]    * T;
	const peri =  el.peri[0] + el.peri[1] * T;
	const nodeDeg = el.node[0] + el.node[1] * T;
	const node = nodeDeg * DEG;
	const omega = (peri - nodeDeg) * DEG;

	let M = L - peri;
	// Long-range table adds periodic terms for Jupiter–Pluto (b·T² + c·cos(fT) + s·sin(fT)).
	if (el.bcsf) {
		const [b, c, s, f] = el.bcsf;
		M += b * T * T + c * Math.cos(f * T * DEG) + s * Math.sin(f * T * DEG);
	}
	M = ((M + 180) % 360 + 360) % 360 - 180;
	M *= DEG;

	// Danby's starter keeps Newton stable for the near-parabolic comets (e -> 1);
	// the classic starter is fine (and slightly faster) for the planets.
	let E = e < 0.8 ? M + e * Math.sin(M) : M + 0.85 * e * Math.sign(Math.sin(M) || 1);
	for (let i = 0; i < 24; i++) {
		const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
		E -= dE;
		if (Math.abs(dE) < 1e-8) break;
	}
	const xp = a * (Math.cos(E) - e);
	const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
	const cw = Math.cos(omega), sw = Math.sin(omega);
	const cO = Math.cos(node),  sO = Math.sin(node);
	const cI = Math.cos(I),     sI = Math.sin(I);
	const x = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp;
	const y = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp;
	const z = (sw * sI) * xp + (cw * sI) * yp;
	if (el.emb) {
		// JPL's "Earth" row is really the Earth–Moon barycentre: step from it to
		// Earth's centre (≈4,670 km, 3e-5 AU — tiny, but it is what "Earth" means).
		const m = moonGeocentric(T * 36525), k = EARTH_MOON_MASS / AU_KM;
		return { x: x - m.x * k, y: y - m.y * k, z: z - m.z * k };
	}
	return { x, y, z };
}

// ecliptic AU -> three.js scene units (y = ecliptic north)
function toScene(p, scale) {
	return new THREE.Vector3(p.x * scale, p.z * scale, -p.y * scale);
}

// ---- Build planets, orbits, Saturn's ring ---------------------------
const bodies = [];

// Orbit-line geometry from the elements at century T (mean anomaly swept over
// a revolution, so it is the ellipse's shape and orientation at that epoch).
// Regenerated by placeBodies as the elements evolve, so the marker stays on its
// line even at 3000 BC, where Mars's J2000 ellipse would sit 3.6% off.
function orbitGeometry(el, T, scale) {
	const pts = [], segs = 256;
	const periT = el.peri[0] + el.peri[1] * T;
	for (let i = 0; i <= segs; i++) {
		const swept = { a: el.a, e: el.e, I: el.I, peri: el.peri, node: el.node, L: [periT + (i / segs) * 360, 0] };
		pts.push(toScene(heliocentric(swept, T), scale));
	}
	return new THREE.BufferGeometry().setFromPoints(pts);
}

// Saturn ring geometry with radial UVs so the alpha strip maps correctly.
function ringMesh(inner, outer) {
	const geo = new THREE.RingGeometry(inner, outer, 96);
	const pos = geo.attributes.position, uv = geo.attributes.uv, v = new THREE.Vector3();
	for (let i = 0; i < pos.count; i++) {
		v.fromBufferAttribute(pos, i);
		uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
	}
	const tex = texLoader.load('2k_saturn_ring_alpha.png');
	tex.colorSpace = THREE.SRGBColorSpace;
	const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
	const m = new THREE.Mesh(geo, mat);
	m.rotation.x = Math.PI / 2;
	return m;
}

// Procedural equirectangular Pluto map. The only freely-licensed real map
// of Pluto is a disc photo on black space (not a cylindrical projection),
// which leaves most of the sphere black and makes one bright patch look
// "always lit". This stylised, New-Horizons-inspired map covers the whole
// surface with a moderate albedo, so it lights like the other planets.
function plutoTexture() {
	const w = 1024, h = 512, c = document.createElement('canvas');
	c.width = w; c.height = h; const g = c.getContext('2d');
	g.fillStyle = '#b9a489'; g.fillRect(0, 0, w, h);                 // tan base
	const blob = (x, y, r, col, a) => {
		g.globalAlpha = a; g.fillStyle = col;
		g.beginPath(); g.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2); g.fill();
	};
	// mottled terrain
	for (let i = 0; i < 320; i++) {
		const dark = Math.random() < 0.5;
		blob(Math.random() * w, Math.random() * h, 12 + Math.random() * 55,
			dark ? '#8a755c' : '#d8c6a8', 0.10 + Math.random() * 0.18);
	}
	// Cthulhu Macula — dark reddish equatorial band on one side
	g.globalAlpha = 0.5; g.fillStyle = '#5e463a';
	g.beginPath(); g.ellipse(w * 0.30, h * 0.55, w * 0.22, h * 0.16, 0, 0, Math.PI * 2); g.fill();
	// Sputnik Planitia — the bright "heart" (pale nitrogen ice)
	g.globalAlpha = 0.85; g.fillStyle = '#ece2cf';
	g.beginPath(); g.ellipse(w * 0.66, h * 0.6, w * 0.12, h * 0.16, 0, 0, Math.PI * 2); g.fill();
	g.globalAlpha = 0.5;
	g.beginPath(); g.ellipse(w * 0.62, h * 0.5, w * 0.07, h * 0.08, 0, 0, Math.PI * 2); g.fill();
	g.globalAlpha = 1;
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = renderer.capabilities.getMaxAnisotropy();
	return t;
}

for (const planet of planetsData) {
	const scale = planet.displayA / planet.el.a[0];
	const cat = planet.type.includes('Dwarf') ? 'dwarf' : 'planet';
	const iau = IAU[planet.name] || null;
	const pole = POLES[planet.name] || null;

	const holder = new THREE.Object3D();           // positioned at the orbit point
	const tilted = new THREE.Object3D();            // carries axial tilt + the planet mesh
	if (pole) tilted.quaternion.copy(poleQuat(pole)); // true axis direction; IAU bodies carry the full pole on the mesh
	holder.add(tilted);

	let pMap = null;
	if (planet.name === 'Pluto') pMap = plutoTexture();
	else if (planet.tex) pMap = loadMap(planet.tex);
	const mesh = new THREE.Mesh(
		new THREE.SphereGeometry(planet.size, 48, 48),
		pMap
			? new THREE.MeshStandardMaterial({ map: pMap, roughness: 0.92, metalness: 0.0 })
			: new THREE.MeshStandardMaterial({ color: new THREE.Color(planet.color), roughness: 0.92, metalness: 0.0 })
	);
	mesh.userData = planet;
	tilted.add(mesh);
	if (planet.ring) tilted.add(ringMesh(planet.size * 1.35, planet.size * 2.3));
	scene.add(holder);

	// true orbit ellipse at J2000 (refreshed with the date, see orbitGeometry)
	const el = planet.el;
	const orbitLine = new THREE.LineLoop(
		orbitGeometry(el, 0, scale),
		new THREE.LineBasicMaterial({ color: 0x6c8fd0, transparent: true, opacity: 0.32 })
	);
	scene.add(orbitLine);
	const orbitEvolves = !!(el.a[1] || el.e[1] || el.I[1] || el.peri[1] || el.node[1]); // dwarfs have fixed mean elements

	bodies.push({ planet, cat, holder, tilted, mesh, orbitLine, orbitT: 0, orbitEvolves, scale, iau, pole, spinRate: spinRate(planet.rotH), spacingF: 1 });
}

// =====================================================================
//  Moons. Real mean orbital elements (a in km, e, inclination°, sidereal
//  period in days, retrograde flag) from JPL satellite tables. They feed
//  the same Kepler solver as the planets, but parented to their planet —
//  so orbit SHAPE, inclination, period and direction are real, while orbit
//  SPACING, body size and phase along the orbit are illustrative (like the
//  rest of the model). Moon orbits ride their planet's true spin plane (IAU
//  pole), so Saturn's moons share the ring plane, Uranus's orbit on their
//  side and Pluto's family tips with it — except Earth's Moon, whose
//  elements (and real orbit) are referenced to the ecliptic.
//  `cls`: 'major' = large round moons; 'minor' = small / irregular moons.
// =====================================================================
const moonsData = [
	// Earth
	{ name: 'Moon', parent: 'Earth', cls: 'major', a: 384400, e: 0.0549, inc: 5.145, periodD: 27.3217, size: 0.10, tex: '2k_moon.jpg', color: '#b8b3ab', fact: "Earth's only natural satellite; it raises the tides and is drifting away ~3.8 cm a year." },
	// Mars
	{ name: 'Phobos', parent: 'Mars', cls: 'minor', a: 9376, e: 0.0151, inc: 1.08, periodD: 0.31891, size: 0.04, color: '#8a7d70', fact: 'Orbits Mars faster than Mars spins; it is spiralling inward and doomed in ~50 million years.' },
	{ name: 'Deimos', parent: 'Mars', cls: 'minor', a: 23463, e: 0.00033, inc: 1.79, periodD: 1.26244, size: 0.035, color: '#9b8d7e', fact: "Mars's tiny outer moon, only about 12 km across." },
	// Jupiter — Galileans (major)
	{ name: 'Io', parent: 'Jupiter', cls: 'major', a: 421700, e: 0.0041, inc: 0.05, periodD: 1.76914, size: 0.10, color: '#d9c46a', fact: 'The most volcanically active world in the solar system, lit by hundreds of erupting vents.' },
	{ name: 'Europa', parent: 'Jupiter', cls: 'major', a: 671034, e: 0.0094, inc: 0.47, periodD: 3.55118, size: 0.09, color: '#e8e2d4', fact: 'A smooth crust of ice over a global subsurface ocean — a prime place to hunt for life.' },
	{ name: 'Ganymede', parent: 'Jupiter', cls: 'major', a: 1070412, e: 0.0013, inc: 0.20, periodD: 7.15455, size: 0.13, color: '#8c8378', fact: 'The largest moon in the solar system — bigger than Mercury, and the only moon with its own magnetic field.' },
	{ name: 'Callisto', parent: 'Jupiter', cls: 'major', a: 1882709, e: 0.0074, inc: 0.19, periodD: 16.6890, size: 0.12, color: '#5f5a52', fact: 'One of the most heavily cratered surfaces known — a frozen record of the early solar system.' },
	// Jupiter — minor
	{ name: 'Amalthea', parent: 'Jupiter', cls: 'minor', a: 181366, e: 0.0032, inc: 0.38, periodD: 0.49818, size: 0.04, color: '#8a3b2e', fact: 'A small, elongated inner moon — the reddest object in the solar system.' },
	{ name: 'Himalia', parent: 'Jupiter', cls: 'minor', a: 11451000, e: 0.1623, inc: 27.5, periodD: 250.56, size: 0.04, color: '#6b6660', fact: "The largest of Jupiter's distant, irregular outer moons." },
	// Saturn — major
	{ name: 'Mimas', parent: 'Saturn', cls: 'major', a: 185539, e: 0.0196, inc: 1.57, periodD: 0.94242, size: 0.05, color: '#b0aaa0', fact: 'Its giant Herschel crater gives it an uncanny resemblance to the Death Star.' },
	{ name: 'Enceladus', parent: 'Saturn', cls: 'major', a: 237948, e: 0.0047, inc: 0.009, periodD: 1.37022, size: 0.05, color: '#f0f4f5', fact: "Jets icy water from a subsurface ocean through the 'tiger stripe' fractures at its south pole." },
	{ name: 'Tethys', parent: 'Saturn', cls: 'major', a: 294619, e: 0.0001, inc: 1.12, periodD: 1.88780, size: 0.06, color: '#cfc9bd', fact: 'A bright, icy moon scarred by the enormous Odysseus impact crater.' },
	{ name: 'Dione', parent: 'Saturn', cls: 'major', a: 377396, e: 0.0022, inc: 0.019, periodD: 2.73692, size: 0.06, color: '#c3bdb2', fact: 'Wispy bright ice cliffs streak across its trailing hemisphere.' },
	{ name: 'Rhea', parent: 'Saturn', cls: 'major', a: 527108, e: 0.0010, inc: 0.345, periodD: 4.51821, size: 0.07, color: '#b9b3a8', fact: "Saturn's second-largest moon; it may even have a faint ring of its own." },
	{ name: 'Titan', parent: 'Saturn', cls: 'major', a: 1221870, e: 0.0288, inc: 0.34, periodD: 15.945, size: 0.12, color: '#d9923b', fact: 'Bigger than Mercury, wrapped in a thick orange haze, with rivers and lakes of liquid methane.' },
	{ name: 'Iapetus', parent: 'Saturn', cls: 'major', a: 3560820, e: 0.0286, inc: 15.47, periodD: 79.322, size: 0.07, color: '#6b6055', fact: 'Two-faced: one hemisphere is bright ice, the other as dark as coal.' },
	// Saturn — minor
	{ name: 'Hyperion', parent: 'Saturn', cls: 'minor', a: 1481009, e: 0.1230, inc: 0.43, periodD: 21.276, size: 0.04, color: '#9a8a76', fact: 'A chaotically tumbling, sponge-like moon that never spins the same way twice.' },
	{ name: 'Phoebe', parent: 'Saturn', cls: 'minor', a: 12947780, e: 0.1562, inc: 7.0, periodD: 550.31, retro: true, size: 0.04, color: '#4a4641', fact: 'A captured outer moon that orbits backwards — probably a body from the distant Kuiper Belt.' },
	{ name: 'Janus', parent: 'Saturn', cls: 'minor', a: 151460, e: 0.0068, inc: 0.16, periodD: 0.69497, size: 0.035, color: '#a59c8f', fact: 'Swaps orbits with Epimetheus every four years in a slow game of leapfrog.' },
	{ name: 'Epimetheus', parent: 'Saturn', cls: 'minor', a: 151410, e: 0.0210, inc: 0.35, periodD: 0.69433, size: 0.03, color: '#9c9285', fact: 'Shares its orbit with Janus — the two trade places without ever colliding.' },
	// Uranus — major (orbit nearly perpendicular, with the tipped-over planet)
	{ name: 'Miranda', parent: 'Uranus', cls: 'major', a: 129390, e: 0.0013, inc: 4.34, periodD: 1.41348, size: 0.045, color: '#9b9690', fact: 'A jumbled little world with Verona Rupes, a cliff up to 20 km high — the tallest known.' },
	{ name: 'Ariel', parent: 'Uranus', cls: 'major', a: 190900, e: 0.0012, inc: 0.041, periodD: 2.52038, size: 0.06, color: '#c2bcb3', fact: "The brightest of Uranus's moons, cut by deep branching canyons." },
	{ name: 'Umbriel', parent: 'Uranus', cls: 'major', a: 266000, e: 0.0039, inc: 0.128, periodD: 4.14418, size: 0.06, color: '#6a665f', fact: "The darkest of Uranus's large moons, with a mysterious bright ring nicknamed the 'fluorescent cheerio'." },
	{ name: 'Titania', parent: 'Uranus', cls: 'major', a: 435910, e: 0.0011, inc: 0.079, periodD: 8.70587, size: 0.08, color: '#a39c92', fact: "Uranus's largest moon, split by enormous fault canyons." },
	{ name: 'Oberon', parent: 'Uranus', cls: 'major', a: 583520, e: 0.0014, inc: 0.068, periodD: 13.4632, size: 0.075, color: '#8f8780', fact: 'The outermost large Uranian moon, ancient and heavily cratered.' },
	// Uranus — minor
	{ name: 'Puck', parent: 'Uranus', cls: 'minor', a: 86010, e: 0.00012, inc: 0.319, periodD: 0.76183, size: 0.03, color: '#7d766d', fact: 'A small, dark inner moon discovered by Voyager 2 in 1985.' },
	// Neptune
	{ name: 'Triton', parent: 'Neptune', cls: 'major', a: 354759, e: 0.000016, inc: 23.2, periodD: 5.87685, retro: true, size: 0.10, color: '#c9b8a8', fact: 'Orbits backwards, so it was likely captured; nitrogen geysers erupt from its frozen surface.' },
	{ name: 'Proteus', parent: 'Neptune', cls: 'minor', a: 117647, e: 0.0005, inc: 0.026, periodD: 1.12231, size: 0.045, color: '#6a6f72', fact: 'A dark, lumpy moon about as large as a body can be without pulling itself round.' },
	{ name: 'Nereid', parent: 'Neptune', cls: 'minor', a: 5513818, e: 0.7507, inc: 7.09, periodD: 360.13, size: 0.04, color: '#7a7d80', fact: 'One of the most eccentric orbits of any moon — its distance from Neptune varies sevenfold.' },
	// Pluto
	{ name: 'Charon', parent: 'Pluto', cls: 'major', a: 19591, e: 0.0002, inc: 0.0, periodD: 6.38723, size: 0.11, color: '#9a938a', fact: 'So large relative to Pluto that the two orbit a point in space between them — a double world.' },
	{ name: 'Styx', parent: 'Pluto', cls: 'minor', a: 42656, e: 0.0058, inc: 0.81, periodD: 20.162, size: 0.025, color: '#8c867d', fact: 'A tiny moon found in 2012, orbiting in near-resonance with its siblings.' },
	{ name: 'Nix', parent: 'Pluto', cls: 'minor', a: 48694, e: 0.0020, inc: 0.13, periodD: 24.855, size: 0.03, color: '#9a938a', fact: 'A small moon that tumbles unpredictably as it orbits the Pluto–Charon pair.' },
	{ name: 'Kerberos', parent: 'Pluto', cls: 'minor', a: 57783, e: 0.0033, inc: 0.39, periodD: 32.168, size: 0.025, color: '#7f7a72', fact: 'A faint double-lobed moon, far darker than expected for the Pluto system.' },
	{ name: 'Hydra', parent: 'Pluto', cls: 'minor', a: 64738, e: 0.0059, inc: 0.24, periodD: 38.202, size: 0.03, color: '#a39c92', fact: "Pluto's outermost known moon, with a surface of nearly pure water ice." }
];

// Mean equatorial radii (km) of the parent bodies — used only to turn each
// moon's real orbital radius into an illustrative display radius.
const PARENT_R = { Earth: 6371, Mars: 3390, Jupiter: 69911, Saturn: 58232, Uranus: 25362, Neptune: 24622, Pluto: 1188 };
const MOON_SIZE = 0.78; // global shrink so moons read clearly smaller than planets

// Mean longitude at J2000 (deg) = node + arg.periapsis + mean anomaly, from JPL
// satellite mean elements (epoch 2000-01-01.5). Only the MAJOR (regular, near-
// circular) moons get this; with it + the real mean motion they sit at their
// true positions for the modern era. The frame zero differs per planet from our
// display frame by a constant, so within each system the moons' configuration
// and its evolution are right (absolute orientation is arbitrary) — except the
// Moon, whose frame is the ecliptic, so it is also correct relative to the Sun.
const MOON_LON0 = {
	Moon: 218.32,
	Io: 20.0, Europa: 214.4, Ganymede: 221.6, Callisto: 80.3,
	Mimas: 141.9, Enceladus: 176.5, Tethys: 248.3, Dione: 328.0, Rhea: 209.5, Titan: 168.6, Iapetus: 55.8,
	Miranda: 328.7, Ariel: 203.1, Umbriel: 251.2, Titania: 281.6, Oberon: 352.6,
	Triton: 241.1, Charon: 304.1
};
const MOON_ERA = { min: 1900, max: 2100 }; // years the accurate phase is trustworthy

// Per-planet log range of moon orbital radii, so each planet's moons can be
// normalised into one compact display band (keeps systems tight, not sprawling).
const moonRange = {};
for (const m of moonsData) {
	const lg = Math.log10(m.a / PARENT_R[m.parent]);
	const r = moonRange[m.parent] || (moonRange[m.parent] = { min: Infinity, max: -Infinity });
	r.min = Math.min(r.min, lg); r.max = Math.max(r.max, lg);
}

const bodyByName = {};
for (const b of bodies) bodyByName[b.planet.name] = b;

// A moon's offset from its planet, in the planet's local (tilt) frame.
function moonOffset(m, days) {
	const dir = m.retro ? -1 : 1;
	const ci = Math.cos(m.inc * DEG), si = Math.sin(m.inc * DEG);
	let xp, yp;
	if (m.name === 'Moon') {
		// The Moon: full lunar theory (longitude, latitude AND distance), ecliptic
		// -> scene, scaled so the mean distance lands on the display radius.
		const p = moonGeocentric(days), k = m.dispA / MOON_A;
		return new THREE.Vector3(p.x * k, p.z * k, -p.y * k);
	}
	if (m.meanLon0 !== undefined) {
		// Major moon: real mean longitude (circular approximation) — accurate phase.
		const ang = m.meanLon0 + (2 * Math.PI / m.periodD) * days * dir;
		xp = m.dispA * Math.cos(ang);
		yp = m.dispA * Math.sin(ang);
	} else {
		// Minor moon: deterministic placeholder phase, with the real eccentric shape.
		let M = (2 * Math.PI / m.periodD) * days * dir;
		M %= 2 * Math.PI;
		let E = M;
		for (let i = 0; i < 6; i++) E -= (E - m.e * Math.sin(E) - M) / (1 - m.e * Math.cos(E));
		xp = m.dispA * (Math.cos(E) - m.e);
		yp = m.dispA * Math.sqrt(1 - m.e * m.e) * Math.sin(E);
	}
	return new THREE.Vector3(xp, yp * si, -yp * ci); // prograde matches the planets' orbital sense
}

// Orbit-line points in the planet's moonRoot frame. The Moon gets its real mean
// ellipse at century T (node regressing over 18.6 yr, perigee advancing over
// 8.85 yr, in the ecliptic). The other major moons are modelled on circles, so
// they are drawn as circles (their e ≤ 0.03 would not be visible anyway); minor
// moons keep their real eccentric shape, periapsis on +x, matching their solver.
function moonOrbitPoints(m, T) {
	const pts = [], SEG = 96;
	const ci = Math.cos(m.inc * DEG), si = Math.sin(m.inc * DEG);
	if (m.name === 'Moon') {
		const node = (125.0446 - 1934.1363 * T) * DEG, omega = (83.3532 + 4069.0137 * T) * DEG - node;
		const cw = Math.cos(omega), sw = Math.sin(omega), cO = Math.cos(node), sO = Math.sin(node);
		for (let i = 0; i <= SEG; i++) {
			const E = (i / SEG) * 2 * Math.PI;
			const xp = m.dispA * (Math.cos(E) - m.e), yp = m.dispA * Math.sqrt(1 - m.e * m.e) * Math.sin(E);
			const x = (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp;
			const y = (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp;
			const z = (sw * si) * xp + (cw * si) * yp;
			pts.push(new THREE.Vector3(x, z, -y));
		}
		return pts;
	}
	const e = m.meanLon0 !== undefined ? 0 : m.e;
	for (let i = 0; i <= SEG; i++) {
		const E = (i / SEG) * 2 * Math.PI;
		const xp = m.dispA * (Math.cos(E) - e);
		const yp = m.dispA * Math.sqrt(1 - e * e) * Math.sin(E);
		pts.push(new THREE.Vector3(xp, yp * si, -yp * ci));
	}
	return pts;
}

const moonObjs = [];
function buildMoons() {
	for (const m of moonsData) {
		const pb = bodyByName[m.parent];
		if (!pb) continue;
		if (!pb.moonRoot) {
			pb.moonRoot = new THREE.Object3D();              // orbits ride the planet's true spin plane
			const pole = pb.pole || (pb.planet.name !== 'Earth' && pb.iau ? pb.iau : null); // the Moon's elements are ecliptic-referenced
			if (pole) pb.moonRoot.quaternion.copy(poleQuat(pole));
			pb.holder.add(pb.moonRoot);
		}
		// Real orbital radius (planet radii) -> a tight, per-planet display band
		// just outside the planet (or its rings). Normalising each planet's moons
		// into the same narrow band keeps systems compact and well separated
		// rather than sprawling out toward neighbouring orbits.
		const lg = Math.log10(m.a / PARENT_R[m.parent]);
		const rng = moonRange[m.parent];
		const rInner = pb.planet.size * (pb.planet.ring ? 2.35 : 1.4);
		const norm = rng.max > rng.min ? (lg - rng.min) / (rng.max - rng.min) : 0.4;
		m.dispA = rInner + norm * pb.planet.size * 1.65;
		m.orbitScale = 1; // 1 = exaggerated display orbit; driven down toward true scale by the size slider
		if (MOON_LON0[m.name] !== undefined) m.meanLon0 = MOON_LON0[m.name] * DEG; // accurate phase (major moons)
		m.moon = true; // tooltip flag
		m.type = `${m.cls === 'major' ? 'Major' : 'Minor'} moon of ${m.parent}`;

		const seg = m.tex ? 48 : 24; // textured moons get a rounder sphere
		const mesh = new THREE.Mesh(
			new THREE.SphereGeometry(m.size * MOON_SIZE, seg, seg),
			m.tex
				? new THREE.MeshStandardMaterial({ map: loadMap(m.tex), roughness: 0.95, metalness: 0.0 })
				: new THREE.MeshStandardMaterial({ color: new THREE.Color(m.color), roughness: 0.95, metalness: 0.0 })
		);
		mesh.userData = m;
		m.mesh = mesh;
		pb.moonRoot.add(mesh);

		m.orbitDay = 0;
		m.orbitLine = new THREE.LineLoop(
			new THREE.BufferGeometry().setFromPoints(moonOrbitPoints(m, 0)),
			new THREE.LineBasicMaterial({ color: 0x7f8fb8, transparent: true, opacity: 0.0, depthWrite: false })
		);
		m.parentBody = pb;
		pb.moonRoot.add(m.orbitLine);
		moonObjs.push(m);
	}
}
buildMoons();

// =====================================================================
//  Radial display mapping for comets & spacecraft. Their orbits span the
//  whole system, so no single displayA/a scale works: instead the body's
//  instantaneous distance r is mapped through a piecewise log-linear curve
//  anchored to the planets' own compact layout — so a comet crosses each
//  planet's displayed orbit exactly when it crosses the real one. The
//  Orbits slider morphs this toward true scale like everything else.
// =====================================================================
const RADIAL_ANCHORS = planetsData
	.map(p => [p.el.a[0], p.displayA])
	.sort((x, y) => x[0] - y[0]);
let orbitT = 1; // 1 = compact layout, 0 = true scale (set by applyOrbitSpacing)
function compactRadius(rAU) {
	const A = RADIAL_ANCHORS;
	if (rAU <= 0) return 0;
	if (rAU <= A[0][0]) return rAU * (A[0][1] / A[0][0]); // linear inside Mercury
	const lg = Math.log10(rAU);
	for (let i = 0; i < A.length - 1; i++) {
		const l1 = Math.log10(A[i + 1][0]);
		if (lg <= l1) {
			const l0 = Math.log10(A[i][0]);
			return A[i][1] + (A[i + 1][1] - A[i][1]) * (lg - l0) / (l1 - l0);
		}
	}
	// beyond Eris: extend the last log-slope
	const n = A.length;
	const slope = (A[n - 1][1] - A[n - 2][1]) / (Math.log10(A[n - 1][0]) - Math.log10(A[n - 2][0]));
	return A[n - 1][1] + slope * (lg - Math.log10(A[n - 1][0]));
}
function radialDisplay(rAU) {
	const c = compactRadius(rAU);
	return c * Math.pow(rAU * AU_UNITS / c, 1 - orbitT); // geometric morph, like the planets
}

// =====================================================================
//  Comets. Real orbital elements (J2000-era osculating values); comet
//  orbits evolve chaotically between apparitions, so positions are
//  approximate — increasingly so far from the present. tpJD = a recent
//  perihelion (JD). Fed through the same Kepler solver as the planets.
// =====================================================================
const cometsData = [
	// Halley: the two-body period from `a` (75.3 yr) would put the next perihelion
	// ~8 weeks early; planetary perturbations stretch this return. Its period is
	// pinned to JPL's 1986-02-09 → 2061-07-28 interval so the model, the tooltip
	// and the events menu agree on the date.
	{ name: "Halley's Comet", desig: '1P/Halley', a: 17.834, e: 0.96714, inc: 162.262, node: 58.42, argp: 111.33, tpJD: 2446470.95, periodD: 27563.05, size: 0.09, color: '#c7dcec',
	  fact: 'The famous once-in-a-lifetime comet, returning every ~76 years; recorded since at least 240 BC and embroidered into the Bayeux Tapestry. Next perihelion: 2061.' },
	{ name: 'Comet Encke', desig: '2P/Encke', a: 2.215, e: 0.8483, inc: 11.78, node: 334.57, argp: 186.54, tpJD: 2460239.5, size: 0.06, color: '#b8c4c9',
	  fact: 'The shortest-period comet known (3.3 years); its debris stream feeds the Taurid meteor showers.' },
	{ name: 'Comet Hale–Bopp', desig: 'C/1995 O1', a: 186, e: 0.99509, inc: 89.43, node: 282.47, argp: 130.59, tpJD: 2450539.5, size: 0.08, color: '#d8e2ea',
	  fact: 'The great comet of 1997, visible to the naked eye for a record 18 months; it won’t return for roughly 2,500 years.' },
	{ name: 'Comet 67P', desig: '67P/Churyumov–Gerasimenko', a: 3.463, e: 0.64102, inc: 7.04, node: 50.19, argp: 12.78, tpJD: 2457247.5, size: 0.05, color: '#a9a29a',
	  fact: 'The duck-shaped comet orbited by ESA’s Rosetta, whose Philae lander made the first-ever comet touchdown in 2014.' }
];
const cometObjs = [];
for (const c of cometsData) {
	c.tpDays = c.tpJD - J2000;
	c.periodD = c.periodD || Math.pow(c.a, 1.5) * 365.25; // two-body unless pinned above
	const nDay = 360 / c.periodD;                 // deg/day
	const peri = c.node + c.argp;                 // longitude of perihelion
	const L0 = peri + (0 - c.tpDays) * nDay;      // mean longitude at J2000
	c.el = { a: [c.a, 0], e: [c.e, 0], I: [c.inc, 0], L: [L0, nDay * 36525], peri: [peri, 0], node: [c.node, 0] };
	c.type = 'Comet';
	c.comet = true;
	const mesh = new THREE.Mesh(
		new THREE.SphereGeometry(c.size, 20, 20),
		new THREE.MeshStandardMaterial({ color: new THREE.Color(c.color), roughness: 0.9, metalness: 0.0, emissive: new THREE.Color(c.color), emissiveIntensity: 0.25 })
	);
	mesh.userData = c;
	mesh.visible = false;
	scene.add(mesh);
	c.mesh = mesh;
	c.orbitLine = new THREE.LineLoop(
		new THREE.BufferGeometry(), // populated by updateCometOrbits (depends on the Orbits slider)
		new THREE.LineBasicMaterial({ color: 0x79c9c0, transparent: true, opacity: 0.3 })
	);
	c.orbitLine.visible = false;
	scene.add(c.orbitLine);
	cometObjs.push(c);
}
// Rebuild comet orbit paths for the current radial mapping. Sampled in
// eccentric anomaly (naturally dense near perihelion), each point mapped
// through radialDisplay, so the drawn path is exactly where the comet will be.
function updateCometOrbits() {
	for (const c of cometObjs) {
		const pts = [], SEG = 220;
		const w = c.argp * DEG, O = c.node * DEG, I = c.inc * DEG;
		const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
		for (let i = 0; i < SEG; i++) {
			const E = (i / SEG) * 2 * Math.PI;
			const xp = c.a * (Math.cos(E) - c.e);
			const yp = c.a * Math.sqrt(1 - c.e * c.e) * Math.sin(E);
			const x = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp;
			const y = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp;
			const z = (sw * sI) * xp + (cw * sI) * yp;
			const r = Math.sqrt(x * x + y * y + z * z);
			pts.push(toScene({ x, y, z }, radialDisplay(r) / r));
		}
		c.orbitLine.geometry.dispose();
		c.orbitLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
	}
}

// =====================================================================
//  Deep-space probes. Positions linearly interpolated from embedded JPL
//  Horizons waypoints (180-day cadence, launch era – 2049; extrapolated
//  on the last heading beyond). Hidden before launch. Markers are
//  symbols, not to-scale spacecraft.
// =====================================================================
const craftData = [
	{ key: 'v1', name: 'Voyager 1', launched: 1977,
	  fact: 'The most distant human-made object, now in interstellar space. Its Golden Record carries greetings, music and sounds of Earth.' },
	{ key: 'v2', name: 'Voyager 2', launched: 1977,
	  fact: 'The only spacecraft to have visited all four giant planets; it crossed into interstellar space in 2018.' },
	{ key: 'p10', name: 'Pioneer 10', launched: 1972,
	  fact: 'First craft through the asteroid belt and past Jupiter (1973). Contact was lost in 2003; it drifts silently toward Aldebaran.' },
	{ key: 'p11', name: 'Pioneer 11', launched: 1973,
	  fact: 'First spacecraft to fly past Saturn (1979), threading between the planet and its rings. Contact was lost in 1995.' },
	{ key: 'nh', name: 'New Horizons', launched: 2006,
	  fact: 'Gave us the first close look at Pluto (2015) and Kuiper Belt object Arrokoth (2019); still exploring the outer dark.' }
];
const craftObjs = [];
for (const cr of craftData) {
	cr.type = 'Space probe';
	cr.craft = true;
	const mesh = new THREE.Mesh(
		new THREE.OctahedronGeometry(0.055, 0),
		new THREE.MeshBasicMaterial({ color: 0xcfe0d8 }) // self-lit beacon, not a shaded body
	);
	mesh.userData = cr;
	mesh.visible = false;
	scene.add(mesh);
	cr.mesh = mesh;
	cr.pathLine = new THREE.Line(
		new THREE.BufferGeometry(), // populated by updateCraftPaths
		new THREE.LineBasicMaterial({ color: 0x86c9a8, transparent: true, opacity: 0.28 })
	);
	cr.pathLine.visible = false;
	scene.add(cr.pathLine);
	craftObjs.push(cr);
}
// Heliocentric ecliptic position (AU) at `days` since J2000, or null pre-launch.
function craftEcl(tr, days) {
	const f = (days - tr.t0) / tr.dt;
	if (f < 0) return null;
	const n = tr.p.length / 3;
	let i = Math.floor(f), t = f - i;
	if (i >= n - 1) { i = n - 2; t = f - i; } // extrapolate on the final heading
	const a = i * 3, b = a + 3;
	return {
		x: tr.p[a] + (tr.p[b] - tr.p[a]) * t,
		y: tr.p[a + 1] + (tr.p[b + 1] - tr.p[a + 1]) * t,
		z: tr.p[a + 2] + (tr.p[b + 2] - tr.p[a + 2]) * t
	};
}
function updateCraftPaths() {
	for (const cr of craftObjs) {
		const tr = TRAJ[cr.key], pts = [];
		for (let i = 0; i < tr.p.length; i += 3) {
			const x = tr.p[i], y = tr.p[i + 1], z = tr.p[i + 2];
			const r = Math.sqrt(x * x + y * y + z * z);
			pts.push(toScene({ x, y, z }, radialDisplay(r) / r));
		}
		cr.pathLine.geometry.dispose();
		cr.pathLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
	}
}

// =====================================================================
//  Orbit trails (toggled in Show). Each visible body drops breadcrumbs
//  of its displayed position as simulated time runs — planets re-trace
//  their orbits, moons draw spirograph loops, comets dive and climb.
//  Trails live in display space, so anything that re-maps positions
//  (the Size/Orbits sliders, a date jump) clears them.
// =====================================================================
const TRAIL_N = 400;
const TRAIL_COLORS = { body: 0x86a8e0, moon: 0xb9c8e8, comet: 0x9fd8d0, craft: 0x88d0b8 };
const _tw = new THREE.Vector3();
function makeTrailFor(o, color) {
	const arr = new Float32Array(TRAIL_N * 3);
	const geo = new THREE.BufferGeometry();
	const attr = new THREE.BufferAttribute(arr, 3);
	geo.setAttribute('position', attr);
	geo.setDrawRange(0, 0);
	const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false }));
	line.frustumCulled = false; // geometry mutates each sample; skip stale bounds culling
	scene.add(line);
	o.trail = { arr, geo, attr, line, count: 0, last: null };
}
function trailTick(o, visible, wp, step, color) {
	if (!visible) { if (o.trail) o.trail.line.visible = false; return; }
	if (!o.trail) makeTrailFor(o, color);
	const t = o.trail;
	t.line.visible = true;
	if (t.last !== null && Math.abs(simDays - t.last) < step) return;
	if (t.last !== null && Math.abs(simDays - t.last) > step * 60) t.count = 0; // a jump, not motion: restart
	t.last = simDays;
	if (t.count === TRAIL_N) { t.arr.copyWithin(0, 3); t.count--; }
	const i = t.count * 3;
	t.arr[i] = wp.x; t.arr[i + 1] = wp.y; t.arr[i + 2] = wp.z;
	t.count++;
	t.attr.needsUpdate = true;
	t.geo.setDrawRange(0, t.count);
}
function updateTrails() {
	if (!shown.trails) return;
	for (const b of bodies) {
		b.trailStep ??= Math.pow(b.planet.el.a[0], 1.5) * 365.25 / 280;
		trailTick(b, b.tilted.visible, b.holder.position, b.trailStep, TRAIL_COLORS.body);
	}
	for (const m of moonObjs) {
		m.trailStep ??= m.periodD / 48;
		if (m.mesh.visible) m.mesh.getWorldPosition(_tw);
		trailTick(m, m.mesh.visible, _tw, m.trailStep, TRAIL_COLORS.moon);
	}
	for (const c of cometObjs) {
		c.trailStep ??= Math.min(40, Math.max(0.5, c.periodD / 900));
		trailTick(c, c.mesh.visible, c.mesh.position, c.trailStep, TRAIL_COLORS.comet);
	}
	for (const cr of craftObjs) trailTick(cr, cr.mesh.visible, cr.mesh.position, 120, TRAIL_COLORS.craft);
}
function clearAllTrails() {
	for (const list of [bodies, moonObjs, cometObjs, craftObjs])
		for (const o of list)
			if (o.trail) { o.trail.count = 0; o.trail.last = null; o.trail.geo.setDrawRange(0, 0); o.trail.line.visible = false; }
}

// =====================================================================
//  AU grid (toggled in Show): faint distance rings in the ecliptic plane
//  plus a ray toward the vernal equinox (the scene's +x axis). Ring radii
//  go through the same radial mapping as comets/spacecraft, so each ring
//  sits exactly where that distance displays at the current spacing, and
//  the whole grid morphs with the Orbits slider.
// =====================================================================
const GRID_AUS = [1, 2, 5, 10, 20, 30, 50];
let gridObj = null;
function buildGridGeometry() {
	if (!gridObj) return;
	while (gridObj.children.length) {
		const c = gridObj.children.pop();
		c.geometry.dispose();
		c.material.dispose();
	}
	for (const au of GRID_AUS) {
		const r = radialDisplay(au), pts = [];
		for (let i = 0; i <= 128; i++) {
			const a = (i / 128) * 2 * Math.PI;
			pts.push(new THREE.Vector3(Math.cos(a) * r, 0, -Math.sin(a) * r));
		}
		gridObj.add(new THREE.Line(
			new THREE.BufferGeometry().setFromPoints(pts),
			new THREE.LineBasicMaterial({ color: 0x7487ad, transparent: true, opacity: 0.16, depthWrite: false })
		));
	}
	// Vernal equinox ray: 0° ecliptic longitude, the zero point of the sky's
	// coordinate system (slightly brighter than the rings).
	gridObj.add(new THREE.Line(
		new THREE.BufferGeometry().setFromPoints([
			new THREE.Vector3(2.2, 0, 0),
			new THREE.Vector3(radialDisplay(GRID_AUS[GRID_AUS.length - 1]), 0, 0)
		]),
		new THREE.LineBasicMaterial({ color: 0x8fa4c8, transparent: true, opacity: 0.3, depthWrite: false })
	));
}
function ensureGrid() {
	if (gridObj) return;
	gridObj = new THREE.Group();
	gridObj.visible = false;
	scene.add(gridObj);
	buildGridGeometry();
}

// ---- Category filter (Sun is always visible) ------------------------
// Labels default ON (2026-09-12): planets alone read as anonymous dots to newcomers.
const shown = { planet: true, dwarf: false, major: false, minor: false, comets: false, craft: false, labels: true, starlabels: false, trails: false, grid: false, milkyway: false, constellations: false };
const BODY_CATS = ['planet', 'dwarf', 'major', 'minor', 'comets', 'craft']; // categories that map to bodies (backdrops/overlays excluded)
const pickAll = [];
function rebuildPickable() {
	pickAll.length = 0;
	for (const b of bodies) if (b.tilted.visible) pickAll.push(b.mesh);
	for (const m of moonObjs) if (m.mesh.visible) pickAll.push(m.mesh);
	for (const c of cometObjs) if (c.mesh.visible) pickAll.push(c.mesh);
	for (const cr of craftObjs) pickAll.push(cr.mesh); // pre-launch visibility varies per-frame
	pickAll.push(sun);
}
function applyFilter() {
	for (const b of bodies) {
		const v = shown[b.cat];
		b.tilted.visible = v;
		b.orbitLine.visible = v;
	}
	for (const m of moonObjs) {
		// A moon with its planet hidden is just an anonymous dot orbiting nothing
		// (e.g. Charon with Dwarf planets off) - require the parent to be visible too.
		const v = shown[m.cls] && shown[m.parentBody.cat];
		m.mesh.visible = v;
		m.orbitLine.visible = v;
	}
	for (const c of cometObjs) {
		c.mesh.visible = shown.comets;
		c.orbitLine.visible = shown.comets;
	}
	for (const cr of craftObjs) {
		cr.mesh.visible = shown.craft; // placeBodies re-hides pre-launch craft
		cr.pathLine.visible = shown.craft;
	}
	if (shown.milkyway) ensureMilkyWay();             // built (and texture fetched) on first use
	if (milkyWay) milkyWay.visible = shown.milkyway;
	if (shown.constellations) ensureConstellations(); // ditto
	if (constellObj) constellObj.visible = shown.constellations;
	if (shown.grid) ensureGrid();                     // ditto
	if (gridObj) gridObj.visible = shown.grid;
	if (!shown.trails) clearAllTrails();              // history restarts when re-enabled
	rebuildPickable();
	updateMoonWarn();
	if (followTarget && !followTarget.vis()) stopFollowing(); // followed body was just hidden
}

// =====================================================================
//  Accurate star background (HYG catalogue, stars to mag 5.0)
//  data rows: [ raDeg, decDeg, mag, colourIndex(B-V), label ]
// =====================================================================

function bvToColor(bv) {
	// piecewise lerp blue-white -> white -> orange-red
	const stops = [
		[-0.33, 0.61, 0.69, 1.00],
		[ 0.00, 0.79, 0.84, 1.00],
		[ 0.30, 0.97, 0.97, 1.00],
		[ 0.58, 1.00, 0.96, 0.92],
		[ 0.81, 1.00, 0.88, 0.74],
		[ 1.40, 1.00, 0.78, 0.59],
		[ 2.00, 1.00, 0.70, 0.52]
	];
	bv = Math.max(stops[0][0], Math.min(stops[stops.length - 1][0], bv));
	for (let i = 0; i < stops.length - 1; i++) {
		if (bv <= stops[i + 1][0]) {
			const a = stops[i], b = stops[i + 1];
			const t = (bv - a[0]) / (b[0] - a[0]);
			return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
		}
	}
	return [1, 1, 1];
}

const STAR_R = 1600;
let starLabels = []; // {pos:Vector3, name, mag}
let starMat = null;    // kept so resize can refresh the point-size pixel ratio
let starPoints = null; // kept so the orbit-spacing slider can push the sky outward

// Stars come from the embedded STARS module (fetch is blocked by CSP connect-src).
function buildStars() {
	const stars = STARS;
	const n = stars.length;
	const pos = new Float32Array(n * 3);
	const col = new Float32Array(n * 3);
	const siz = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		const [ra, dec, mag, bv, label] = stars[i];
		const raR = ra * DEG, decR = dec * DEG;
		// equatorial unit vector
		const xe = Math.cos(decR) * Math.cos(raR);
		const ye = Math.cos(decR) * Math.sin(raR);
		const ze = Math.sin(decR);
		// equatorial -> ecliptic (rotate about x by -obliquity)
		const xc = xe;
		const yc =  ye * Math.cos(OBLIQUITY) + ze * Math.sin(OBLIQUITY);
		const zc = -ye * Math.sin(OBLIQUITY) + ze * Math.cos(OBLIQUITY);
		// ecliptic -> scene (y = ecliptic north)
		const sx = xc * STAR_R, sy = zc * STAR_R, sz = -yc * STAR_R;
		pos[i * 3] = sx; pos[i * 3 + 1] = sy; pos[i * 3 + 2] = sz;

		const [r, g, b] = bvToColor(bv);
		const bright = Math.min(1.0, Math.max(0.35, 1.25 - mag * 0.13));
		col[i * 3] = r * bright; col[i * 3 + 1] = g * bright; col[i * 3 + 2] = b * bright;
		siz[i] = Math.max(1.4, 7.5 - mag * 1.05);

		if (label && mag < 2.6) starLabels.push({ pos: new THREE.Vector3(sx, sy, sz), name: label });
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
	geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
	geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));

	const mat = new THREE.ShaderMaterial({
		uniforms: { uPixelRatio: { value: renderer.getPixelRatio() } },
		transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
		vertexShader: `
			attribute float aSize; varying vec3 vColor; uniform float uPixelRatio;
			void main(){
				vColor = color;
				vec4 mv = modelViewMatrix * vec4(position, 1.0);
				gl_Position = projectionMatrix * mv;
				gl_PointSize = aSize * uPixelRatio;
			}`,
		fragmentShader: `
			varying vec3 vColor;
			void main(){
				vec2 d = gl_PointCoord - vec2(0.5);
				float r = length(d);
				if (r > 0.5) discard;
				float a = smoothstep(0.5, 0.05, r);
				gl_FragColor = vec4(vColor, a);
			}`
	});
	mat.vertexColors = true;
	starMat = mat;
	starPoints = new THREE.Points(geo, mat);
	scene.add(starPoints);
}

// ---- Milky Way backdrop (optional, toggled in the Show panel) --------
// The stars_milky_way panorama is an equirectangular map in GALACTIC
// coordinates (the band lies along the texture's equator). We orient a large
// inward-facing sphere so the galactic plane sits where it really is on the
// sky, matching the catalogue stars. Drawn additively as a faint backdrop.
// Built lazily on the first toggle (applyFilter), so the 0.3–1.9 MB texture
// is never downloaded for the (default) visits that leave it off.
let milkyWay = null;
function raDecToScene(ra, dec) {
	const r = ra * DEG, d = dec * DEG;
	return eqToScene(new THREE.Vector3(Math.cos(d) * Math.cos(r), Math.cos(d) * Math.sin(r), Math.sin(d))).normalize();
}
function ensureMilkyWay() {
	if (milkyWay) return;
	const ngp = raDecToScene(192.85948, 27.12825);  // galactic north pole (J2000)
	const gc  = raDecToScene(266.40499, -28.93617); // galactic centre (l=0, b=0) -> texture centre
	const gy  = new THREE.Vector3().crossVectors(ngp, gc).normalize(); // toward l=90°
	const basis = new THREE.Matrix4().makeBasis(gc, ngp, gy.negate()); // local +x->GC, +y->NGP
	// 8k on capable desktop GPUs, 4k on phones (whose GPUs often cap textures at
	// 4096 and have less memory/bandwidth to spare).
	const mobile = /Mobi|Android|iPhone|iPod/i.test(navigator.userAgent) ||
		(matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820);
	const file = (!mobile && renderer.capabilities.maxTextureSize >= 8192) ? '8k_stars_milky_way.jpg' : '4k_stars_milky_way.jpg';
	// Unmanaged loader: this large optional backdrop must never hold the loading screen.
	const mwTex = new THREE.TextureLoader().setPath('./textures/').load(file);
	mwTex.colorSpace = THREE.SRGBColorSpace;
	mwTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
	const mesh = new THREE.Mesh(
		new THREE.SphereGeometry(1800, 64, 32),
		// Opaque backdrop skybox: dark sky + the faint galactic band, behind everything.
		new THREE.MeshBasicMaterial({ map: mwTex, side: THREE.BackSide, depthWrite: false, depthTest: false })
	);
	mesh.quaternion.setFromRotationMatrix(basis);
	mesh.renderOrder = -1; // behind the catalogue stars and everything else
	mesh.visible = false;
	mesh.scale.setScalar(skyScale); // match the current orbit-spacing stretch
	scene.add(mesh);
	milkyWay = mesh;
}

// ---- Constellation stick figures (d3-celestial data, toggled in Show) ----
// Polylines of [ra,dec] vertices on the same celestial sphere as the stars.
// Built lazily on first toggle; short chords between vertices are fine.
let constellObj = null;
function ensureConstellations() {
	if (constellObj) return;
	const pts = [];
	for (const poly of CLINES) {
		for (let i = 0; i + 3 < poly.length; i += 2) {
			pts.push(raDecToScene(poly[i], poly[i + 1]).multiplyScalar(STAR_R));
			pts.push(raDecToScene(poly[i + 2], poly[i + 3]).multiplyScalar(STAR_R));
		}
	}
	constellObj = new THREE.LineSegments(
		new THREE.BufferGeometry().setFromPoints(pts),
		new THREE.LineBasicMaterial({ color: 0x54739e, transparent: true, opacity: 0.38, depthWrite: false })
	);
	constellObj.visible = false;
	constellObj.scale.setScalar(skyScale);
	scene.add(constellObj);
}

// =====================================================================
//  UI wiring
// =====================================================================
const speedSlider = document.getElementById('speed');
const speedValue   = document.getElementById('speedValue');
const todayBtn     = document.getElementById('today');
const shareBtn     = document.getElementById('share');
const shareIcon    = shareBtn.innerHTML; // restored after the copied-✓ flash
const dateValue    = document.getElementById('dateValue');
const dateInput    = document.getElementById('dateInput'); // datetime-local, the real control
const dateShow     = document.getElementById('dateShow');  // date-only twin shown at rest
const dateWrap     = document.getElementById('dateWrap');
const eraSel       = document.getElementById('era');
const tooltip      = document.getElementById('tooltip');
const brightSlider = document.getElementById('brightness');
const brightValue  = document.getElementById('brightnessValue');
const sizeSlider   = document.getElementById('bodyScale');
const sizeValue    = document.getElementById('bodyScaleValue');
const orbitSlider  = document.getElementById('orbitScale');
const orbitValue   = document.getElementById('orbitScaleValue');
const rangeWarn    = document.getElementById('rangeWarn');
const moonWarn     = document.getElementById('moonWarn');

// ---- Restore a shared view (?t=…&show=…&light=…&size=…) -------------
// Parsed before the controls initialise below so the filter, light and size
// pick these up; the date (t) is applied where simDays is set, further down.
// Precedence: URL params (a shared link is authoritative) > saved settings
// (localStorage, written by saveSettings below) > defaults.
const params = new URLSearchParams(location.search);
const STORE_KEY = 'orrerySettings';
let stored = null;
try { stored = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { /* private mode / bad JSON */ }
function saveSettings() {
	try {
		localStorage.setItem(STORE_KEY, JSON.stringify({
			show: shown,
			light: +brightSlider.value, size: +sizeSlider.value, orbits: +orbitSlider.value,
			collapsed: ui.classList.contains('collapsed')
		}));
	} catch { /* storage unavailable — settings just don't persist */ }
}
const showParam = params.get('show');
if (showParam !== null) {
	for (const k in shown) shown[k] = false;                      // link is authoritative
	for (const k of showParam.split(',')) if (k in shown) shown[k] = true;
} else if (stored && stored.show) {
	for (const k in shown) if (typeof stored.show[k] === 'boolean') shown[k] = stored.show[k];
}
function sliderInit(slider, param, storedVal) {
	const p = parseFloat(param);
	if (Number.isFinite(p)) slider.value = Math.max(0, Math.min(100, p));
	// Number.isFinite: the global isFinite(null) coerces to 0 and would
	// silently drag missing settings to the slider's minimum.
	else if (Number.isFinite(storedVal)) slider.value = Math.max(0, Math.min(100, storedVal));
}
sliderInit(brightSlider, params.get('light'), stored && stored.light);
sliderInit(sizeSlider, params.get('size'), stored && stored.size);
sliderInit(orbitSlider, params.get('orbits'), stored && stored.orbits);

// Brightness lifts the ambient fill (so planet night-sides become visible)
// and nudges the sky off pure-black — never all the way to white.
const skyDark = new THREE.Color(0x01020a), skyLit = new THREE.Color(0x12182e);
function applyBrightness(v) {
	const t = v / 100;
	ambient.intensity = 0.15 + t * 2.05;                 // 0.15 … 2.2
	scene.background.copy(skyDark).lerp(skyLit, t * 0.7); // subtle sky lift
	brightValue.textContent = v < 22 ? 'Dim' : v < 55 ? 'Medium' : v < 82 ? 'Bright' : 'Max';
}
brightSlider.addEventListener('input', () => { applyBrightness(parseFloat(brightSlider.value)); saveSettings(); });
applyBrightness(parseFloat(brightSlider.value));

// Body-size slider: morph every body (not the Sun) between its current,
// exaggerated display size (slider right) and its TRUE size relative to the
// Sun (slider left). The Sun is 1.7 scene units = 696,000 km, so true display
// radius = realKm · (1.7 / 696000). Interpolation is geometric, so the wide
// size range scrubs smoothly; the mesh's base geometry is the exaggerated size.
const REAL_R_KM = {
	Mercury: 2439.7, Venus: 6051.8, Earth: 6371, Mars: 3389.5, Jupiter: 69911, Saturn: 58232, Uranus: 25362, Neptune: 24622,
	Pluto: 1188.3, Ceres: 469.7, Haumea: 780, Makemake: 715, Eris: 1163,
	Moon: 1737.4, Phobos: 11.1, Deimos: 6.2, Io: 1821.6, Europa: 1560.8, Ganymede: 2634.1, Callisto: 2410.3,
	Amalthea: 83.5, Himalia: 85, Mimas: 198.2, Enceladus: 252.1, Tethys: 531.1, Dione: 561.4, Rhea: 763.8,
	Titan: 2574.7, Iapetus: 734.5, Hyperion: 135, Phoebe: 106.5, Janus: 89.5, Epimetheus: 58.1,
	Miranda: 235.8, Ariel: 578.9, Umbriel: 584.7, Titania: 788.4, Oberon: 761.4, Puck: 81,
	Triton: 1353.4, Proteus: 210, Nereid: 170, Charon: 606, Styx: 8, Nix: 25, Kerberos: 9, Hydra: 26,
	'The Sun': 695700 // tooltip only; the Sun is never rescaled
};
const SIZE_SCALE = 1.7 / 696000; // scene units per km, anchored to the Sun's display radius

// Uniform scale that takes a body from its exaggerated base radius toward its
// true-to-Sun radius as t goes 1 -> 0 (geometric, so t=1 is exactly current).
function sizeFactor(name, baseR, t) {
	const real = REAL_R_KM[name];
	if (!real) return 1;
	return Math.pow((real * SIZE_SCALE) / baseR, 1 - t);
}
function applyBodyScale(v) {
	const t = v / 100;
	for (const b of bodies) b.tilted.scale.setScalar(sizeFactor(b.planet.name, b.planet.size, t)); // scales planet + its ring
	for (const m of moonObjs) {
		m.mesh.scale.setScalar(sizeFactor(m.name, m.size * MOON_SIZE, t));
		// Orbit shrinks with its OWN planet (not the Sun), so each moon system
		// stays compact and attached to its planet rather than flying out to
		// true interplanetary distances.
		m.orbitScale = sizeFactor(m.parentBody.planet.name, m.parentBody.planet.size, t);
		m.orbitLine.scale.setScalar(m.orbitScale);
	}
	clearAllTrails(); // moon display orbits shrink with size, so their trails go stale
	sizeValue.textContent = v >= 99 ? 'Exaggerated' : v <= 1 ? 'True to Sun' : 'Mixed';
}
sizeSlider.addEventListener('input', () => { applyBodyScale(parseFloat(sizeSlider.value)); saveSettings(); });
applyBodyScale(parseFloat(sizeSlider.value));

// Orbit-spacing slider: morph every orbit between the compact display layout
// (slider right) and TRUE distances anchored to the Sun's display size
// (slider left; 1 AU = 215 solar radii ≈ 365 scene units). With Size also at
// "true", the view is a genuine scale model of the solar system. Geometric
// interpolation per planet, like the size slider, so ordering never crosses.
// The starfield, Milky Way backdrop and camera limits stretch so the sky
// always stays beyond the outermost orbit (Eris ends up ~25,000 units out).
const AU_UNITS = 149597870.7 * SIZE_SCALE; // scene units per AU at true scale
let skyScale = 1;      // current stretch of the celestial sphere (stars, Milky Way, star labels)
let outerAphelion = 0; // outermost aphelion in scene units (sizes the home view)
function applyOrbitSpacing(v) {
	const t = v / 100;
	let outer = 0;
	for (const b of bodies) {
		b.spacingF = Math.pow(AU_UNITS / b.scale, 1 - t);
		b.orbitLine.scale.setScalar(b.spacingF);
		outer = Math.max(outer, b.planet.displayA * b.spacingF * (1 + b.planet.el.e[0])); // aphelion
	}
	outerAphelion = outer;
	orbitT = t;                 // comet/spacecraft radial mapping follows the slider
	updateCometOrbits();
	updateCraftPaths();
	buildGridGeometry();        // AU rings sit on the same radial mapping
	clearAllTrails();           // trails are drawn in display space, now invalid
	const sky = Math.max(1, outer * 1.15 / STAR_R);
	skyScale = sky;
	if (starPoints) starPoints.scale.setScalar(sky);
	if (milkyWay) milkyWay.scale.setScalar(sky);
	if (constellObj) constellObj.scale.setScalar(sky);
	camera.far = Math.max(4000, outer * 4);
	camera.updateProjectionMatrix();
	controls.maxDistance = Math.max(140, outer * 1.3);
	orbitValue.textContent = v >= 99 ? 'Compact' : v <= 1 ? 'True to Sun' : 'Mixed';
}
orbitSlider.addEventListener('input', () => { applyOrbitSpacing(parseFloat(orbitSlider.value)); saveSettings(); });
applyOrbitSpacing(parseFloat(orbitSlider.value));

// Collapse / expand the info panel to free up screen real estate.
const ui = document.getElementById('ui');
const collapseBtn = document.getElementById('collapse');
function setCollapsed(collapsed) {
	ui.classList.toggle('collapsed', collapsed);
	collapseBtn.setAttribute('aria-expanded', String(!collapsed));
	collapseBtn.title = collapsed ? 'Expand panel' : 'Collapse panel';
}
collapseBtn.addEventListener('click', () => { setCollapsed(!ui.classList.contains('collapsed')); saveSettings(); updateMiniDate(); });
// Phones: tapping the scene behind the open panel minimises it (the arrow still works too).
const phoneMQ = window.matchMedia('(max-width: 600px)');
document.addEventListener('pointerdown', (e) => {
	if (!phoneMQ.matches) return;
	if (ui.classList.contains('collapsed')) return;
	if (e.target.closest('#ui, #aboutPanel')) return;
	setCollapsed(true);
	saveSettings();
	updateMiniDate();
});
// Phones, panel minimised, time running: a whisper of a date readout below the panel
// so you can see where you have got to. Hidden while paused, expanded, or on desktop
// (the desktop panel already shows the date).
const miniDate = document.getElementById('miniDate');
function updateMiniDate() {
	const on = signedDps !== 0 && ui.classList.contains('collapsed');
	if (on) miniDate.textContent = dateValue.textContent;
	miniDate.hidden = !on;
}
// Saved preference wins; otherwise phones start collapsed so the orrery,
// not the panel, is the first thing seen.
setCollapsed(stored && typeof stored.collapsed === 'boolean'
	? stored.collapsed
	: matchMedia('(max-width: 600px)').matches);

// About & credits live in a slide-out panel that glides over the settings on
// demand and retracts, so the main panel stays compact.
const aboutToggle = document.getElementById('aboutToggle');
const aboutPanel = document.getElementById('aboutPanel');
const aboutClose = document.getElementById('aboutClose');
function setAbout(open) {
	aboutPanel.classList.toggle('open', open);
	aboutPanel.setAttribute('aria-hidden', String(!open));
	aboutToggle.setAttribute('aria-expanded', String(open));
	aboutToggle.innerHTML = open ? 'ⓘ About &amp; credits ◂' : 'ⓘ About &amp; credits ▸';
}
aboutToggle.addEventListener('click', () => setAbout(!aboutPanel.classList.contains('open')));
aboutClose.addEventListener('click', () => setAbout(false));
// Keyboard shortcuts (documented in About & credits). Form controls keep
// the keys they actually use: text/date inputs and selects take everything,
// while checkboxes and buttons only claim Space/Enter — so shortcuts keep
// working after clicking a Show toggle.
document.addEventListener('keydown', (e) => {
	const el = e.target, tag = el && el.tagName;
	if (tag === 'SELECT' || tag === 'TEXTAREA' || (tag === 'INPUT' && el.type !== 'checkbox')) {
		if (e.key === 'Escape') el.blur();
		return;
	}
	if ((tag === 'INPUT' || tag === 'BUTTON') && (e.key === ' ' || e.key === 'Enter')) return; // native activation
	switch (e.key) {
		case 'Escape':
			if (aboutPanel.classList.contains('open')) setAbout(false);
			else stopFollowing();
			break;
		case ' ':
			e.preventDefault();
			if (signedDps !== 0) pausePlayback();
			else { speedSlider.value = lastPlayVal; readSpeed(); } // resume at the last speed
			break;
		case 'ArrowLeft':
		case 'ArrowRight':
			e.preventDefault();
			stepTime(e.ctrlKey ? 'y' : e.shiftKey ? 'm' : 'd', e.key === 'ArrowRight' ? 1 : -1);
			break;
		case '+': case '=':
			speedSlider.value = Math.min(100, parseFloat(speedSlider.value) + 8);
			readSpeed();
			break;
		case '-': case '_':
			speedSlider.value = Math.max(-100, parseFloat(speedSlider.value) - 8);
			readSpeed();
			break;
		case '0':
			pausePlayback(); simDays = todayDays(); refreshDateUI();
			break;
		case 'h': case 'H':
			goHome();
			break;
		case 'f': case 'F':
			toggleFullscreen();
			break;
	}
});

// "Today" is the current instant (not noon of the local calendar day, which
// could be half a day out — 7° for the Moon), so the opening view, the Today
// button and the 0 key show where everything is right now; the label says UTC.
function todayDays() { return dateToDays(new Date()); }
// The date picker spans 9999 BC – 9999 AD; beyond ±4 million days a crafted
// ?t= would reach an invalid JS Date and the formatter would throw at startup.
const MAX_SIM_DAYS = 4e6;
const clampDays = (d) => Math.max(-MAX_SIM_DAYS, Math.min(MAX_SIM_DAYS, d));
let simDays = todayDays();
// A shared link (?t=daysSinceJ2000) restores that exact moment — paused,
// unless the link also carries a ?speed= (shared mid-play), applied below.
const sharedT = parseFloat(params.get('t'));
if (Number.isFinite(sharedT)) simDays = clampDays(sharedT);

// One bidirectional time slider: −100 (rewind) … 0 (pause) … +100 (forward).
// `signedDps` is the signed simulated days/second; 0 means paused.
const DEAD = 7;                       // snap-to-zero latch half-width around centre
const MIN_DPS = 0.25, MAX_DPS = 1000; // magnitude range outside the dead zone
let signedDps = 0;
let lastPlayVal = 60;                 // last non-zero slider value (Space resumes here)

function fmtSpeed(dps) {
	if (dps < 1)   return dps.toFixed(2) + ' days/sec';
	if (dps < 100) return dps.toFixed(1) + ' days/sec';
	if (dps < 700) return Math.round(dps) + ' days/sec';
	return (dps / 365.25).toFixed(2) + ' years/sec';
}
const dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, era: 'short' });
function refreshDateUI() {
	simDays = clampDays(simDays);
	const d = daysToDate(simDays);
	const y = d.getUTCFullYear(); // astronomical year numbering (0 = 1 BC)
	dateValue.textContent = dateFmt.format(d) + ' UTC';
	// The native picker can't show year < 1, so the date input holds a civil
	// year (1–9999) and the era selector carries AD/BC. Map the astronomical
	// year (…, -1=2 BC, 0=1 BC, 1=1 AD, …) to civil year + era.
	if (document.activeElement !== dateInput && document.activeElement !== eraSel) {
		const civil = y <= 0 ? 1 - y : y;
		if (civil >= 1 && civil <= 9999) {
			dateInput.value = inputValueFor(d, true);
			dateShow.value = inputValueFor(d, false);
			eraSel.value = y <= 0 ? 'BC' : 'AD';
		} else {
			dateInput.value = dateShow.value = '';
		}
	}
	// JPL long-range elements are fitted for 3000 BC – 3000 AD; flag anything outside.
	const out = y < -2999 || y > 3000;
	if (out) rangeWarn.textContent = `⚠ Approximate positions — ${y < -2999 ? 'before 3000 BC' : 'after 3000 AD'} is outside the JPL data range (3000 BC – 3000 AD)`;
	rangeWarn.classList.toggle('show', out);
	updateMiniDate();
	updateMoonWarn();
}
// Major-moon positions are calibrated for the modern era; warn if the date is
// outside it while any moons are on screen.
function updateMoonWarn() {
	const y = daysToDate(simDays).getUTCFullYear();
	const moonsShown = shown.major || shown.minor;
	moonWarn.classList.toggle('show', moonsShown && (y < MOON_ERA.min || y > MOON_ERA.max));
}

function readSpeed() {
	let v = parseFloat(speedSlider.value);
	if (Math.abs(v) <= DEAD) {        // latch: snap the thumb to dead-centre = paused
		v = 0;
		speedSlider.value = 0;
	}
	if (v === 0) { signedDps = 0; speedValue.textContent = '❙ Paused'; updateMiniDate(); return; }
	const p = (Math.abs(v) - DEAD) / (100 - DEAD);             // 0..1 outside dead zone
	const dps = MIN_DPS * Math.pow(MAX_DPS / MIN_DPS, p);      // log-scaled magnitude
	signedDps = Math.sign(v) * dps;
	lastPlayVal = v; // remembered so the Space shortcut can resume at this speed
	speedValue.textContent = `${v > 0 ? '▶' : '◀'} ${fmtSpeed(dps)}`;
}
// A shared ?speed= restores mid-play sharing: apply it to the slider before
// the initial read, so the link opens animating at the shared rate.
const speedParam = parseFloat(params.get('speed'));
if (Number.isFinite(speedParam)) speedSlider.value = Math.max(-100, Math.min(100, speedParam));
speedSlider.addEventListener('input', readSpeed);
readSpeed();
// Jumping to a date stops playback so the chosen moment holds still.
function pausePlayback() { speedSlider.value = 0; readSpeed(); }
todayBtn.addEventListener('click', () => { pausePlayback(); simDays = todayDays(); refreshDateUI(); });
// Exact stepping: ±1 day / month / year (pauses playback so the step holds).
// Month and year steps use real calendar arithmetic, so +1m from 15 Jan lands
// on 15 Feb, and stepping works across the AD/BC boundary. Shared by the
// step buttons and the arrow-key shortcuts.
function stepTime(unit, dir) {
	pausePlayback();
	if (unit === 'd') {
		simDays += dir;
	} else {
		const d = daysToDate(simDays);
		if (unit === 'm') d.setUTCMonth(d.getUTCMonth() + dir);
		else d.setUTCFullYear(d.getUTCFullYear() + dir);
		simDays = dateToDays(d);
	}
	refreshDateUI();
}
for (const btn of document.querySelectorAll('#stepRow .step')) {
	btn.addEventListener('click', () => stepTime(btn.dataset.unit, Number(btn.dataset.dir)));
}
shareBtn.addEventListener('click', async () => {
	const sp = new URLSearchParams();
	sp.set('t', simDays.toFixed(3));
	// Shared while playing: the link opens at this moment and keeps playing
	// at the same speed (paused links open paused, as before).
	if (signedDps !== 0) sp.set('speed', speedSlider.value);
	sp.set('show', Object.keys(shown).filter(k => shown[k]).join(',')); // visible categories
	sp.set('light', brightSlider.value);
	sp.set('size', sizeSlider.value);
	sp.set('orbits', orbitSlider.value);
	// Camera pose (position + orbit target), so the link restores the exact
	// viewpoint, not just the moment. If following a body, that's kept too.
	sp.set('cam', [camera.position.x, camera.position.y, camera.position.z,
	               controls.target.x, controls.target.y, controls.target.z]
		.map(n => +n.toFixed(2)).join(','));
	if (followTarget) sp.set('follow', followTarget.name);
	const url = `${location.origin}${location.pathname}?${sp.toString()}`;
	try {
		await navigator.clipboard.writeText(url);
		shareBtn.textContent = '✓'; // flash confirmation in place of the icon
	} catch {
		window.prompt('Copy this link to share this view:', url);
	}
	setTimeout(() => { shareBtn.innerHTML = shareIcon; }, 1600);
});
// Combine the date picker (civil year 1–9999) with the AD/BC selector so the
// full 3000 BC – 3000 AD range is reachable despite the native year limit.
// The field shows just the date at rest (the time is in the bar above it) but
// is a date+time control while it has focus, so the time can be set in the
// same place: #dateShow is an inert date-only twin for display and #dateInput,
// the real datetime-local control, lies over it and is revealed by CSS while
// focused. (Neither input ever changes type — Firefox drops the first click on
// a rebuilt input and leaves its picker stuck after a type change.) Values are
// "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM", read as UTC to match the label; a
// date-only value keeps the current time of day.
function inputValueFor(d, withTime) {
	const p2 = (n) => String(n).padStart(2, '0');
	const y = d.getUTCFullYear(), civil = y <= 0 ? 1 - y : y;
	const date = `${String(civil).padStart(4, '0')}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
	return withTime ? `${date}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}` : date;
}
dateInput.addEventListener('focus', () => dateWrap.classList.add('open'));
dateInput.addEventListener('blur', () => { dateWrap.classList.remove('open'); refreshDateUI(); }); // resync both twins
function applyDateInput() {
	if (!dateInput.value) return;
	const now = daysToDate(simDays);
	const [datePart, timePart = `${now.getUTCHours()}:${now.getUTCMinutes()}`] = dateInput.value.split('T');
	const [civil, mm, dd] = datePart.split('-').map(Number);
	const [hh, mi] = timePart.split(':').map(Number);
	const astroYear = eraSel.value === 'BC' ? 1 - civil : civil;
	const d = new Date(Date.UTC(2000, mm - 1, dd, hh, mi)); // UTC base…
	d.setUTCFullYear(astroYear);                             // …then the real year (handles 0–99 and BC)
	pausePlayback();
	simDays = dateToDays(d);
	refreshDateUI();
}
dateInput.addEventListener('change', applyDateInput);
eraSel.addEventListener('change', applyDateInput);

// Category filter checkboxes (Sun always shows). Also driven by the alignment
// menu below, so a chosen event can declutter to just the relevant bodies.
const filterIds = {
	planet: 'filterPlanets', dwarf: 'filterDwarf', major: 'filterMajor', minor: 'filterMinor',
	comets: 'filterComets', craft: 'filterCraft', labels: 'filterLabels', starlabels: 'filterStarLabels',
	trails: 'filterTrails', grid: 'filterGrid', milkyway: 'filterMilky', constellations: 'filterConst'
};
function syncFilterUI() { for (const cat in filterIds) document.getElementById(filterIds[cat]).checked = shown[cat]; }
for (const cat in filterIds) {
	document.getElementById(filterIds[cat]).addEventListener('change', (e) => { shown[cat] = e.target.checked; applyFilter(); hideTooltip(); saveSettings(); });
}
syncFilterUI();

// Notable configurations found by searching the orbital model across
// 3000 BC – 3000 AD. `days` = days since J2000, so jumps are exact and work
// for BC dates the native picker can't represent. `show` lists the categories
// to display for that event, so selecting it auto-declutters the view.
// (These are planetary events, so Pluto/dwarfs and moons are hidden.)
// "Planet parade" entries are the popular, geocentric kind — several planets
// in the same part of Earth's sky at dusk or dawn — on the dates Wikipedia and
// Star Walk give, each checked against this model's geocentric elongations.
const EVENTS = [
	{ days: -1733223.7, show: ['planet'], note: 'Six planets (incl. Earth) within 10°' },
	{ days: -1544576.7, show: ['planet'], note: 'Tightest five-planet — within 7°' },
	{ days: -1443372.2, show: ['planet'], note: 'The historic five-planet cluster' },
	{ days: -1312814.3, show: ['planet'], note: 'Tightest eight-planet — within 40°' },
	{ days:  -950282, show: ['planet'], note: 'Cleanest planetary spiral (271°)' },
	{ days:  -654480, show: ['planet'], note: 'Planets evenly around the Sun' },
	{ days: -511064.1, show: ['planet'], note: 'Tightest inner-four — within 1°' },
	{ days: -253222.8, show: ['planet'], note: 'All four giant planets within 7°' },
	{ days:   -22228, show: ['planet'], note: 'Planets evenly around the Sun' },
	{ days:    -6506, show: ['planet'], note: '“Jupiter Effect” — within 96°' },
	{ days: -5074.05, show: ['planet', 'comets'], note: "Halley's Comet at perihelion" },
	{ days:    -3741, show: ['planet', 'dwarf'], note: 'Pluto inside Neptune’s orbit' },
	{ days:     7491, show: ['planet'], note: 'Five-planet dawn — within 27°' },
	{ days:     8210, show: ['planet'], note: 'Planet parade — five naked-eye in order at dawn' },
	{ days:     8920, show: ['planet'], note: 'Planet parade — six planets at dawn' },
	{ days:     9152, show: ['planet'], note: 'Planet parade — six planets at dusk' },
	{ days:     9190, show: ['planet'], note: 'Planet parade — all seven planets at dusk' },
	{ days:     9555, show: ['planet'], note: 'Planet parade — six planets at dusk' },
	{ days:     9720, show: ['planet'], note: 'Planet parade — six planets at dawn' },
	{ days:    10220, show: ['planet'], note: 'Planet parade — six planets at dusk' },
	{ days: 10427.305, show: ['planet', 'major'], note: 'Galilean moons tightest (~59°)' },
	{ days:    12452, show: ['planet'], note: 'Planet parade — all seven planets at dusk' },
	{ days:    13228, show: ['planet'], note: 'Venus, Mars, Jupiter & Saturn at dusk' },
	{ days:    14861, show: ['planet'], note: 'Planet parade — five naked-eye within 10° at dusk' },
	{ days: 41905.135, show: ['planet'], note: 'Inner four aligned — within 2°' },
	{ days:   152768, show: ['planet'], note: 'Tight five-planet — within 11°' }
];
const eventFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric', era: 'short' });
const eventsSel = document.getElementById('events');

// ---- Sky-event scanners, shared by the Upcoming menu and tooltips -----
const RAD2DEG = 180 / Math.PI;
function wrap180(x) { return ((x + 180) % 360 + 360) % 360 - 180; }
const _helioPos = (el, d) => heliocentric(el, d / 36525);
// Geocentric elongation (deg) of a body from the Sun, and whether it sits
// east of the Sun (evening sky) or west (morning sky).
function elongationAt(el, d) {
	const p = _helioPos(el, d), e = _helioPos(bodyByName['Earth'].planet.el, d);
	const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z;
	const dot = dx * -e.x + dy * -e.y + dz * -e.z;
	const m = Math.sqrt((dx * dx + dy * dy + dz * dz) * (e.x * e.x + e.y * e.y + e.z * e.z));
	return {
		deg: Math.acos(Math.max(-1, Math.min(1, dot / m))) * RAD2DEG,
		east: wrap180((Math.atan2(dy, dx) - Math.atan2(-e.y, -e.x)) * RAD2DEG) > 0
	};
}
// Next opposition of an outer planet (Earth passing it in heliocentric
// longitude), scanning daily from `from`. Returns days-since-J2000 or null.
function nextOpposition(el, from) {
	const earthEl = bodyByName['Earth'].planet.el;
	const diff = (d) => {
		const p = _helioPos(el, d), e = _helioPos(earthEl, d);
		return wrap180((Math.atan2(p.y, p.x) - Math.atan2(e.y, e.x)) * RAD2DEG);
	};
	let prev = diff(from);
	for (let d = from + 1; d <= from + 900; d++) { // Mars's synodic gaps reach ~811 days
		const cur = diff(d);
		if (Math.abs(prev) < 60 && Math.abs(cur) < 60 && Math.sign(cur) !== Math.sign(prev)) return d;
		prev = cur;
	}
	return null;
}
// Next greatest elongation of an inner planet. Returns {days, east} or null.
function nextElongation(el, from, minDeg) {
	let e0 = elongationAt(el, from).deg, e1 = elongationAt(el, from + 1).deg;
	for (let d = from + 2; d <= from + 700; d++) {
		const e2 = elongationAt(el, d).deg;
		if (e1 > e0 && e1 >= e2 && e1 > minDeg) return { days: d - 1, east: elongationAt(el, d - 1).east };
		e0 = e1; e1 = e2;
	}
	return null;
}

// ---- Upcoming events, computed live from the orbital model ------------
function computeUpcoming() {
	const out = [];
	const start = Math.floor(todayDays());
	for (const nm of ['Mars', 'Jupiter', 'Saturn']) {
		const d = nextOpposition(bodyByName[nm].planet.el, start);
		if (d !== null) out.push({ days: d, show: ['planet'], note: `${nm} at opposition` });
	}
	for (const nm of ['Mercury', 'Venus']) {
		const ge = nextElongation(bodyByName[nm].planet.el, start, nm === 'Venus' ? 40 : 15);
		if (ge) out.push({ days: ge.days, show: ['planet'], note: `${nm}: greatest ${ge.east ? 'evening' : 'morning'} elongation` });
	}
	out.sort((a, b) => a.days - b.days);
	return out;
}
// Halley's next perihelion, from the model's own elements. Decades away, so
// it files by era alongside the curated list rather than under Upcoming.
function nextHalley() {
	const h = cometsData[0];
	const k = Math.ceil((todayDays() - h.tpDays) / h.periodD);
	return { days: h.tpDays + k * h.periodD, show: ['planet', 'comets'], note: "Halley's Comet at perihelion" };
}

// Group the menu: computed Upcoming first, then the curated list by era.
// selectedIndex maps straight onto MENU: the select flattens options across
// optgroups, and index 0 stays the prompt.
const eventEra = (days) => { const y = 2000 + days / 365.25; return y < 1900 ? 'Ancient' : y <= 2100 ? 'Modern era' : 'Future'; };
const MENU = [
	...computeUpcoming().map(ev => ({ ...ev, group: 'Upcoming' })),
	...[...EVENTS, nextHalley()].sort((a, b) => a.days - b.days).map(ev => ({ ...ev, group: eventEra(ev.days) }))
];
let eventGroup = null;
for (const ev of MENU) {
	if (!eventGroup || eventGroup.label !== ev.group) {
		eventGroup = document.createElement('optgroup');
		eventGroup.label = ev.group;
		eventsSel.appendChild(eventGroup);
	}
	const o = document.createElement('option');
	o.value = String(ev.days);
	o.textContent = `${eventFmt.format(daysToDate(ev.days))} · ${ev.note}`;
	eventGroup.appendChild(o);
}
// Alignments read best from above: glide to a top-down view framing the
// visible orbits whenever an event is chosen.
function flyTopDown() {
	let maxR = 8;
	for (const b of bodies) if (b.tilted.visible) maxR = Math.max(maxR, b.planet.displayA * b.spacingF * (1 + b.planet.el.e[0]));
	const d = Math.min(Math.max(maxR * 2.3, 12), controls.maxDistance);
	flyPose = { target: new THREE.Vector3(0, 0, 0), pos: new THREE.Vector3(0, d * 0.966, d * 0.259) }; // ~75° elevation
}
eventsSel.addEventListener('change', () => {
	const ev = MENU[eventsSel.selectedIndex - 1]; // index 0 is the prompt
	if (!ev) return;
	pausePlayback();
	simDays = ev.days;
	for (const k of BODY_CATS) shown[k] = ev.show.includes(k); // show only this alignment's bodies (leave the backdrops alone)
	syncFilterUI();
	applyFilter();
	refreshDateUI();
	stopFollowing();
	flyTopDown();
	saveSettings();
	eventsSel.selectedIndex = 0; // reset to the prompt
	eventsSel.blur();            // hand keyboard shortcuts back to the page
});

// ---- "Go to a body" picker -------------------------------------------
// Reveals the body's category if it's hidden, then focuses and follows it.
// bodyEntryByName is shared with the ?follow= share-link restore.
const gotoSel = document.getElementById('gotoBody');
function bodyEntryByName(nm) {
	const want = String(nm).toLowerCase();
	if (want === 'the sun' || want === 'sun') return { mesh: sun, cat: null };
	for (const b of bodies) if (b.planet.name.toLowerCase() === want) return { mesh: b.mesh, cat: b.cat };
	for (const m of moonObjs) if (m.name.toLowerCase() === want) return { mesh: m.mesh, cat: m.cls };
	for (const c of cometObjs) if (c.name.toLowerCase() === want) return { mesh: c.mesh, cat: 'comets' };
	for (const cr of craftObjs) if (cr.name.toLowerCase() === want) return { mesh: cr.mesh, cat: 'craft' };
	return null;
}
{
	const groups = [
		['Star', ['The Sun']],
		['Planets', bodies.filter(b => b.cat === 'planet').map(b => b.planet.name)],
		['Dwarf planets', bodies.filter(b => b.cat === 'dwarf').map(b => b.planet.name)],
		['Comets', cometObjs.map(c => c.name)],
		['Spacecraft', craftObjs.map(c => c.name)],
		['Major moons', moonObjs.filter(m => m.cls === 'major').map(m => m.name)]
	];
	for (const [label, names] of groups) {
		const g = document.createElement('optgroup');
		g.label = label;
		for (const n of names) {
			const o = document.createElement('option');
			o.value = n;
			o.textContent = n;
			g.appendChild(o);
		}
		gotoSel.appendChild(g);
	}
}
gotoSel.addEventListener('change', () => {
	const entry = gotoSel.value && bodyEntryByName(gotoSel.value);
	gotoSel.selectedIndex = 0; // back to the prompt
	gotoSel.blur();            // hand keyboard shortcuts back to the page
	if (!entry) return;
	if (entry.cat && !shown[entry.cat]) {
		shown[entry.cat] = true;
		syncFilterUI();
		applyFilter();
		saveSettings();
	}
	focusOn(entry.mesh);
});

// ---- Hover tooltip (raycast against planet + sun meshes) -------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
sun.userData = { name: 'The Sun', type: 'G-type main-sequence star', fact: '1.39 million km across and holding 99.86% of the system’s mass; its gravity governs every orbit here.' };

function periodLabel(aAU) {
	const yrs = Math.pow(aAU, 1.5);
	if (yrs < 1) return (yrs * 365.25).toFixed(0) + ' days';
	return yrs.toFixed(yrs < 100 ? 1 : 0) + ' Earth years';
}
function fmtKm(km) {
	return km >= 1e6
		? (km / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' M km'
		: km.toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' km';
}
function moonPeriodLabel(d) {
	if (d < 1) return (d * 24).toFixed(1) + ' hours';
	if (d < 100) return d.toFixed(2) + ' days';
	return (d / 365.25).toFixed(2) + ' years';
}
// Length of one rotation (a body's sidereal "day"), expressed in Earth days so
// it's clear what "day" means here.
function dayDaysLabel(days) {
	const s = days < 1 ? days.toFixed(2) : days < 100 ? days.toFixed(1) : days.toFixed(0);
	return `${s} Earth days`;
}
// From a rotation period in hours; rotH < 0 = retrograde spin (flagged with ↺).
function spinLabel(rotH) {
	return `${dayDaysLabel(Math.abs(rotH) / 24)}${rotH < 0 ? ' ↺' : ''}`;
}

// Mean diameter plus a size comparison with Earth: "× Earth" down to a tenth,
// then a percentage, so the smallest moons don't read as "0.00×".
function sizeRow(name) {
	const r = REAL_R_KM[name];
	if (!r) return '';
	const km = (2 * r).toLocaleString(undefined, { maximumFractionDigits: 0 });
	if (name === 'Earth') return `<dt>Diameter</dt><dd>${km} km</dd>`;
	const x = r / REAL_R_KM.Earth;
	const rel = x >= 0.1 ? `${x.toPrecision(x >= 100 ? 3 : 2)}× Earth` : `${(x * 100).toPrecision(2)}% of Earth`;
	return `<dt>Diameter</dt><dd>${km} km · ${rel}</dd>`;
}

// Earth-relative rows (distance, light time, sky position) for a body at
// heliocentric ecliptic position p (AU).
function earthRelRows(p) {
	const e = _helioPos(bodyByName['Earth'].planet.el, simDays);
	const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z;
	const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
	const lightMin = dist * 8.317; // light covers 1 AU in ~8.317 minutes
	const light = lightMin < 120 ? lightMin.toFixed(1) + ' min' : (lightMin / 60).toFixed(1) + ' h';
	const dot = dx * -e.x + dy * -e.y + dz * -e.z;
	const m = Math.sqrt((dx * dx + dy * dy + dz * dz) * (e.x * e.x + e.y * e.y + e.z * e.z));
	const elong = Math.acos(Math.max(-1, Math.min(1, dot / m))) * RAD2DEG;
	const east = wrap180((Math.atan2(dy, dx) - Math.atan2(-e.y, -e.x)) * RAD2DEG) > 0;
	const sky = elong < 15 ? 'in the Sun’s glare' : elong > 150 ? 'up most of the night' : east ? 'evening sky' : 'morning sky';
	return `<dt>From Earth</dt><dd>${dist.toFixed(3)} AU</dd>` +
	       `<dt>Light time</dt><dd>${light}</dd>` +
	       `<dt>In the sky</dt><dd>${sky}</dd>`;
}
// "Next opposition / greatest elongation" row for the planets, cached per body
// as {from, until, hit} so hovering doesn't rescan every frame while time
// plays. An entry is valid only while the sim time sits between the scan start
// and the event itself, so a passed event is rescanned at once and nothing in
// the next day or two can be skipped; a miss (null) is retried after 15 days.
const NEXT_KIND = { Mercury: 'elong', Venus: 'elong', Mars: 'opp', Jupiter: 'opp', Saturn: 'opp', Uranus: 'opp', Neptune: 'opp' };
const nextEvCache = new Map();
function nextEventRow(name) {
	const kind = NEXT_KIND[name];
	if (!kind) return '';
	let ent = nextEvCache.get(name);
	if (!ent || simDays < ent.from || simDays >= ent.until) {
		const from = Math.floor(simDays), el = bodyByName[name].planet.el;
		let hit;
		if (kind === 'opp') {
			const d = nextOpposition(el, from);
			hit = d === null ? null : { label: 'Next opposition', days: d };
		} else {
			const ge = nextElongation(el, from, name === 'Venus' ? 40 : 15);
			hit = ge === null ? null : { label: `Best ${ge.east ? 'evening' : 'morning'} view`, days: ge.days };
		}
		ent = { from, until: hit ? hit.days : from + 15, hit };
		nextEvCache.set(name, ent);
	}
	const hit = ent.hit;
	return hit ? `<dt>${hit.label}</dt><dd>${eventFmt.format(daysToDate(hit.days))}</dd>` : '';
}

function buildTooltipHTML(d) {
	let html = `<h2>${d.name}</h2><div class="sub">${d.type}</div>`;
	if (d.name === 'The Sun') html += `<dl>${sizeRow(d.name)}</dl>`;
	if (d.comet) {
		const p = _helioPos(d.el, simDays);
		const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
		const k = Math.ceil((simDays - d.tpDays) / d.periodD);
		const nextPeri = d.tpDays + k * d.periodD;
		const period = d.periodD / 365.25;
		html += `<dl><dt>Distance now</dt><dd>${r.toFixed(2)} AU</dd>` +
		        earthRelRows(p) +
		        `<dt>Perihelion</dt><dd>${(d.a * (1 - d.e)).toFixed(2)} AU</dd>` +
		        `<dt>Orbital period</dt><dd>${period < 100 ? period.toFixed(1) : Math.round(period)} years${d.inc > 90 ? ' ↺' : ''}</dd>` +
		        `<dt>Eccentricity</dt><dd>${d.e.toFixed(3)}</dd>` +
		        `<dt>Next perihelion</dt><dd>${eventFmt.format(daysToDate(nextPeri))}</dd></dl>` +
		        `<div class="note">${d.desig} — orbit is real; position is approximate, drifting further from truth away from the present.</div>`;
	}
	if (d.craft) {
		const tr = TRAJ[d.key];
		const p = craftEcl(tr, simDays);
		if (p) {
			const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
			// speed from the local waypoint segment (1 AU/day = 1731.5 km/s)
			const i = Math.max(0, Math.min(tr.p.length / 3 - 2, Math.floor((simDays - tr.t0) / tr.dt))) * 3;
			const vx = tr.p[i + 3] - tr.p[i], vy = tr.p[i + 4] - tr.p[i + 1], vz = tr.p[i + 5] - tr.p[i + 2];
			const kms = Math.sqrt(vx * vx + vy * vy + vz * vz) / tr.dt * 1731.46;
			html += `<dl><dt>Launched</dt><dd>${d.launched}</dd>` +
			        `<dt>Distance now</dt><dd>${r.toFixed(2)} AU</dd>` +
			        earthRelRows(p) +
			        `<dt>Speed</dt><dd>${kms.toFixed(1)} km/s</dd></dl>` +
			        `<div class="note">Position from JPL Horizons trajectory data (to 2049).</div>`;
		}
	}
	if (d.moon) {
		let nowRow = '';
		if (d.name === 'Moon') { // the only moon with a real distance model
			const p = moonGeocentric(simDays);
			nowRow = `<dt>Distance now</dt><dd>${fmtKm(Math.hypot(p.x, p.y, p.z))}</dd>`;
		}
		html += `<dl><dt>Orbits</dt><dd>${d.parent}</dd>` + sizeRow(d.name) + nowRow +
		        `<dt>Mean orbit</dt><dd>${fmtKm(d.a)}</dd>` +
		        `<dt>Orbital period</dt><dd>${moonPeriodLabel(d.periodD)}${d.retro ? ' ↺' : ''}</dd>` +
		        // Day length only for the large, genuinely tidally-locked major moons;
		        // many minor moons rotate non-synchronously (e.g. Hyperion tumbles).
		        (d.cls === 'major' ? `<dt>Day length</dt><dd>${dayDaysLabel(d.periodD)}</dd>` : '') +
		        `<dt>Eccentricity</dt><dd>${d.e.toFixed(3)}</dd></dl>` +
		        (d.cls === 'major' ? `<div class="note">Tidally locked — one rotation per orbit.</div>` : '');
	}
	if (d.el && !d.comet) {
		const p = heliocentric(d.el, simDays / 36525);
		const distAU = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
		const km = distAU * 149597870.7;
		const kmStr = distAU < 10
			? (km / 1e6).toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' M km'
			: (km / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' bn km';
		html += `<dl><dt>Distance now</dt><dd>${distAU.toFixed(3)} AU</dd>` +
		        `<dt></dt><dd>${kmStr}</dd>` +
		        (d.name !== 'Earth' ? earthRelRows(p) : '') +
		        `<dt>Avg. distance</dt><dd>${d.el.a[0].toFixed(2)} AU</dd>` +
		        `<dt>Orbital period</dt><dd>${periodLabel(d.el.a[0])}</dd>` +
		        sizeRow(d.name) +
		        `<dt>Day length</dt><dd>${spinLabel(d.rotH)}</dd>` +
		        `<dt>Eccentricity</dt><dd>${d.el.e[0].toFixed(3)}</dd>` +
		        nextEventRow(d.name) + `</dl>`;
	}
	html += `<div class="fact">${d.fact}</div>`;
	return html;
}

// Place the tooltip on-screen: down-right of the cursor for hover, or centred
// above the finger for a tap (so it isn't hidden under the touch), clamped to
// the viewport either way.
function placeTooltip(x, y, above) {
	const r = tooltip.getBoundingClientRect();
	let left, top;
	if (above) { left = x - r.width / 2; top = y - r.height - 18; if (top < 8) top = y + 22; }
	else { left = x + 14; top = y + 14; }
	left = Math.max(8, Math.min(left, innerWidth - r.width - 8));
	top = Math.max(8, Math.min(top, innerHeight - r.height - 8));
	tooltip.style.left = left + 'px';
	tooltip.style.top = top + 'px';
}

function pickAt(clientX, clientY) {
	pointer.x = (clientX / innerWidth) * 2 - 1;
	pointer.y = -(clientY / innerHeight) * 2 + 1;
	raycaster.setFromCamera(pointer, camera);
	// visible check: pre-launch spacecraft stay in pickAll but hide per-frame
	const hit = raycaster.intersectObjects(pickAll, false).find(h => h.object.visible);
	return hit ? hit.object : null;
}

// Nearest body within a screen-space radius — helps tiny tap targets on mobile.
const _wp = new THREE.Vector3();
function nearestBody(clientX, clientY, maxPx) {
	let best = null, bestD = maxPx;
	for (const obj of pickAll) {
		if (!obj.visible) continue;
		obj.getWorldPosition(_wp).project(camera);
		if (_wp.z > 1) continue; // behind the camera
		const sx = (_wp.x * 0.5 + 0.5) * innerWidth, sy = (-_wp.y * 0.5 + 0.5) * innerHeight;
		const dpx = Math.hypot(sx - clientX, sy - clientY);
		if (dpx < bestD) { bestD = dpx; best = obj; }
	}
	return best;
}

// The shown object and anchor are remembered so a visible tooltip can be
// re-rendered while time plays (its "Distance now" would otherwise go stale).
let tipObj = null, tipX = 0, tipY = 0, tipAbove = false;
function showTooltip(obj, x, y, above) {
	tipObj = obj; tipX = x; tipY = y; tipAbove = above;
	tooltip.innerHTML = buildTooltipHTML(obj.userData);
	tooltip.classList.add('show');
	placeTooltip(x, y, above);
	highlightOrbit(obj.userData);
}
function hideTooltip() { tipObj = null; tooltip.classList.remove('show'); highlightOrbit(null); }

// While a body's tooltip is open its orbit (or spacecraft path) is drawn
// bright and near-opaque, then restored. Moon orbits are re-faded every frame
// by fadeMoonOrbits, which leaves the highlighted one alone.
const ORBIT_HI = { color: new THREE.Color(0xffd27a), opacity: 0.9 };
let hiLine = null, hiColor = new THREE.Color(), hiOpacity = 0;
function orbitLineOf(d) {
	if (!d) return null;
	return d.orbitLine || d.pathLine || (bodyByName[d.name] && bodyByName[d.name].orbitLine) || null;
}
function highlightOrbit(d) {
	const line = orbitLineOf(d);
	if (line === hiLine) return;
	if (hiLine) { hiLine.material.color.copy(hiColor); hiLine.material.opacity = hiOpacity; }
	hiLine = line;
	if (!line) return;
	hiColor.copy(line.material.color); hiOpacity = line.material.opacity;
	line.material.color.copy(ORBIT_HI.color);
	line.material.opacity = ORBIT_HI.opacity;
}
function refreshTooltip() {
	if (!tipObj) return;
	tooltip.innerHTML = buildTooltipHTML(tipObj.userData);
	placeTooltip(tipX, tipY, tipAbove);
}

// Desktop: hover to preview.
renderer.domElement.addEventListener('pointermove', (e) => {
	if (e.pointerType !== 'mouse') return; // touch uses tap-to-pin, below
	const obj = pickAt(e.clientX, e.clientY);
	if (obj) { showTooltip(obj, e.clientX, e.clientY, false); renderer.domElement.style.cursor = 'pointer'; }
	else { hideTooltip(); renderer.domElement.style.cursor = 'grab'; }
});

// Touch / click: tap a body (or near one) to pin its tooltip; tap empty space
// to dismiss. A drag (camera rotate) is ignored. A double-click / double-tap
// focuses the camera on the body and follows it (empty space releases) —
// detected manually because 'dblclick' is unreliable for touch on a
// touch-action:none canvas.
let downX = 0, downY = 0, downT = 0;
let lastTapT = 0, lastTapX = 0, lastTapY = 0;
renderer.domElement.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; downT = performance.now(); });
renderer.domElement.addEventListener('pointerup', (e) => {
	if (Math.hypot(e.clientX - downX, e.clientY - downY) > 12 || performance.now() - downT > 600) return; // a drag, not a tap
	const touch = e.pointerType !== 'mouse';
	const obj = pickAt(e.clientX, e.clientY) || (touch ? nearestBody(e.clientX, e.clientY, 36) : null);
	const now = performance.now();
	const dbl = now - lastTapT < 400 && Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 30;
	lastTapT = now; lastTapX = e.clientX; lastTapY = e.clientY;
	if (dbl) {
		hideTooltip();
		// A slightly forgiving pick for mouse double-clicks too — small bodies
		// are hard to hit twice in exactly the same spot.
		const target = obj || (touch ? null : nearestBody(e.clientX, e.clientY, 16));
		if (target) focusOn(target);
		else stopFollowing();
		return;
	}
	if (obj) showTooltip(obj, e.clientX, e.clientY, touch);
	else hideTooltip();
});

// =====================================================================
//  Camera focus / follow. Double-click (or double-tap) a body to lock the
//  camera onto it: the view glides over and then tracks the body as time
//  plays. Orbit and zoom stay live while following; Esc, the ✕ chip,
//  double-clicking empty space or the ⌂ home button all release it. The ⌂
//  button also glides back to the Sun-centred home view.
// =====================================================================
const homeBtn    = document.getElementById('homeView');
const followRow  = document.getElementById('followRow');
const followName = document.getElementById('followName');
const followStop = document.getElementById('followStop');
const DEFAULT_MIN_DIST = 3;
let followTarget = null; // { obj, name, getR, vis }
let flying = false;      // easing in toward a newly focused body
let flyDist = 0;         // camera distance to settle at
let flyPose = null;      // {target, pos}: easing to a fixed viewpoint (home / top-down)
const HOME_DIR = new THREE.Vector3(0, 16, 30).normalize(); // the startup viewing direction
const _fp = new THREE.Vector3(), _fd = new THREE.Vector3(), _fo = new THREE.Vector3();

// Map a picked mesh to a follow target: the tracked object, a display name,
// its current display radius (size slider included) and a visibility probe.
function focusTargetFor(mesh) {
	if (mesh === sun) return { obj: sun, name: 'the Sun', getR: () => 1.7, vis: () => true };
	for (const b of bodies) if (b.mesh === mesh)
		return { obj: b.holder, name: b.planet.name, getR: () => b.planet.size * b.tilted.scale.x, vis: () => b.tilted.visible };
	for (const m of moonObjs) if (m.mesh === mesh)
		return { obj: m.mesh, name: m.name, getR: () => m.size * MOON_SIZE * m.mesh.scale.x, vis: () => m.mesh.visible };
	for (const c of cometObjs) if (c.mesh === mesh)
		return { obj: c.mesh, name: c.name, getR: () => c.size, vis: () => c.mesh.visible };
	for (const cr of craftObjs) if (cr.mesh === mesh)
		return { obj: cr.mesh, name: cr.name, getR: () => 0.055, vis: () => shown.craft };
	return null;
}

function focusOn(mesh, instant = false) {
	const t = focusTargetFor(mesh);
	if (!t) return;
	followTarget = t;
	flyPose = null;
	flying = false;
	if (!instant) {
		t.obj.getWorldPosition(_fp);
		const r = Math.max(t.getR(), 0.005);
		// Fly in to a comfortable viewing distance (clear of the near plane) —
		// but never push a camera that is already closer back out.
		flyDist = Math.max(Math.min(camera.position.distanceTo(_fp), Math.max(r * 8, 0.4)), r * 2.5);
		flying = true;
	}
	followName.textContent = `◎ Following ${t.name}`;
	followRow.hidden = false;
}

function stopFollowing() {
	followTarget = null;
	flying = false;
	flyPose = null; // (goHome/flyTopDown re-arm this after calling us)
	// Keep the user where they are: don't let the Sun-view minimum shove a
	// close-in camera back out when the lock releases.
	controls.minDistance = Math.min(DEFAULT_MIN_DIST, camera.position.distanceTo(controls.target));
	followRow.hidden = true;
}

function goHome() {
	stopFollowing();
	controls.minDistance = DEFAULT_MIN_DIST;
	// Home: Sun-centred, startup direction, framing the outermost orbit.
	const hd = Math.max(36, outerAphelion * 1.25);
	flyPose = { target: new THREE.Vector3(0, 0, 0), pos: HOME_DIR.clone().multiplyScalar(hd) };
}

function updateFollow(dt) {
	const s = 1 - Math.exp(-6 * dt); // frame-rate-independent easing
	if (flyPose) {
		// Glide to a fixed viewpoint (home view or an alignment's top-down).
		const span = Math.max(1, flyPose.pos.distanceTo(flyPose.target));
		controls.target.lerp(flyPose.target, s);
		camera.position.lerp(flyPose.pos, s);
		if (camera.position.distanceTo(flyPose.pos) < span * 0.005 && controls.target.distanceTo(flyPose.target) < span * 0.005) flyPose = null;
		return;
	}
	if (!followTarget) return;
	followTarget.obj.getWorldPosition(_fp);
	if (flying) {
		// Ease the orbit target onto the (possibly moving) body while easing
		// the camera's distance to it — direction of approach is preserved.
		_fd.copy(_fp).sub(controls.target).multiplyScalar(s);
		controls.target.add(_fd);
		camera.position.add(_fd);
		_fo.copy(camera.position).sub(controls.target);
		const cur = Math.max(_fo.length(), 1e-6);
		const next = cur + (flyDist - cur) * s;
		camera.position.copy(controls.target).add(_fo.multiplyScalar(next / cur));
		if (controls.target.distanceTo(_fp) < flyDist * 0.02 && Math.abs(next - flyDist) < flyDist * 0.02) flying = false;
	} else {
		// Rigid tracking: move camera and target together with the body.
		_fd.copy(_fp).sub(controls.target);
		controls.target.copy(_fp);
		camera.position.add(_fd);
	}
	// Allow zooming right in on whatever is followed (clear of the near plane).
	controls.minDistance = Math.max(0.15, followTarget.getR() * 2.2);
}

// Restore a shared viewpoint (?cam=…) and follow state (?follow=…). Called
// from start() once the scene and filters are ready.
function restoreSharedView() {
	const camParam = params.get('cam');
	if (camParam) {
		const a = camParam.split(',').map(Number);
		// Bounded (the widest zoom is a few hundred units) and with the camera off
		// its target, so a crafted link can't push the controls into NaN territory.
		if (a.length === 6 && a.every(v => Number.isFinite(v) && Math.abs(v) < 1e4) &&
		    Math.hypot(a[0] - a[3], a[1] - a[4], a[2] - a[5]) > 1e-3) {
			camera.position.set(a[0], a[1], a[2]);
			controls.target.set(a[3], a[4], a[5]);
		}
	} else if (params.get('view') === 'top') {
		flyTopDown(); // guide-page links (/planetary-alignment/): alignments read best from above
	}
	const followParam = params.get('follow');
	if (followParam) {
		const entry = bodyEntryByName(followParam);
		if (entry) {
			const t = focusTargetFor(entry.mesh);
			// Engage instantly (no fly-in) — the shared camera pose is already
			// framing the body — and only if it is visible under ?show=.
			if (t && t.vis()) focusOn(entry.mesh, camParam ? true : false);
		}
	}
}

// A user grab takes over any fly-in / fly-to-pose easing (rigid tracking of
// a followed body continues until explicitly released).
controls.addEventListener('start', () => { flying = false; flyPose = null; });
homeBtn.addEventListener('click', goHome);
followStop.addEventListener('click', stopFollowing);

// ---- Fullscreen toggle (floating button, bottom-right; F key) ---------
const fsBtn = document.getElementById('fullscreen');
if (!document.documentElement.requestFullscreen) fsBtn.hidden = true; // e.g. iPhone Safari
function toggleFullscreen() {
	if (document.fullscreenElement) document.exitFullscreen();
	else document.documentElement.requestFullscreen();
}
fsBtn.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
	const on = !!document.fullscreenElement;
	fsBtn.title = on ? 'Exit fullscreen (F)' : 'Fullscreen (F)';
	document.getElementById('fsExpand').classList.toggle('is-hidden', on);
	document.getElementById('fsCompress').classList.toggle('is-hidden', !on);
});

// ---- Reset everything back to the default look ------------------------
// Filters, sliders, playback, trails, follow and camera — but not the date
// (the Today button is right there for that). Also forgets saved settings.
document.getElementById('resetView').addEventListener('click', () => {
	try { localStorage.removeItem(STORE_KEY); } catch { /* storage unavailable */ }
	Object.assign(shown, { planet: true, dwarf: false, major: false, minor: false, comets: false, craft: false, labels: true, starlabels: false, trails: false, grid: false, milkyway: false, constellations: false });
	syncFilterUI();
	applyFilter();
	brightSlider.value = 13; applyBrightness(13);
	sizeSlider.value = 100;  applyBodyScale(100);
	orbitSlider.value = 100; applyOrbitSpacing(100);
	pausePlayback();
	clearAllTrails();
	hideTooltip();
	goHome();
});

window.addEventListener('resize', () => {
	camera.aspect = innerWidth / innerHeight;
	camera.updateProjectionMatrix();
	// DPR can change mid-session (moving between displays, browser zoom):
	// re-apply it and keep the star shader's point sizing in step.
	renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
	renderer.setSize(innerWidth, innerHeight);
	if (starMat) starMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
});

// ---- Animation -------------------------------------------------------
const timer = new THREE.Timer(); // THREE.Clock is deprecated; Timer needs update() each frame
const _MUP = new THREE.Vector3(0, 1, 0);
const _md = new THREE.Vector3(), _my = new THREE.Vector3(), _mz = new THREE.Vector3();
const _mbasis = new THREE.Matrix4();
function placeBodies() {
	const T = simDays / 36525;
	for (const b of bodies) {
		b.holder.position.copy(toScene(heliocentric(b.planet.el, T), b.scale)).multiplyScalar(b.spacingF);
		if (b.orbitEvolves && Math.abs(T - b.orbitT) > 0.2) { // redraw the ellipse every 20 years of sim time
			b.orbitLine.geometry.dispose();
			b.orbitLine.geometry = orbitGeometry(b.planet.el, T, b.scale);
			b.orbitT = T;
		}
		// Date-driven rotation: IAU orientation for the terrestrials, real-rate
		// spin for the rest. Absolute (not incremental) so a paused date holds.
		// Pole-oriented bodies spin positively about their (right-hand) pole —
		// retrograde direction is already encoded in the pole vector.
		if (b.iau) orientAccurate(b, simDays);
		else b.mesh.rotation.y = (b.pole ? Math.abs(b.spinRate) : b.spinRate) * simDays;
	}
	for (const m of moonObjs) {
		if (!m.mesh.visible) continue;
		if (m.name === 'Moon' && Math.abs(simDays - m.orbitDay) > 5) { // node/perigee drift: refresh the drawn ellipse
			m.orbitLine.geometry.dispose();
			m.orbitLine.geometry = new THREE.BufferGeometry().setFromPoints(moonOrbitPoints(m, simDays / 36525));
			m.orbitDay = simDays;
		}
		m.mesh.position.copy(moonOffset(m, simDays)).multiplyScalar(m.orbitScale);
		// Tidal lock: keep the near side (texture centre = local +x) facing the planet,
		// so the Moon shows its familiar face and the Sun lights it through its phases.
		_md.copy(m.mesh.position).negate().normalize();   // toward the planet (moonRoot origin)
		_mz.crossVectors(_md, _MUP).normalize();
		_my.crossVectors(_mz, _md).normalize();
		_mbasis.makeBasis(_md, _my, _mz);
		m.mesh.quaternion.setFromRotationMatrix(_mbasis);
	}
	// Comets: real angular position, radius through the display mapping.
	if (shown.comets) {
		for (const c of cometObjs) {
			const p = heliocentric(c.el, T);
			const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
			c.mesh.position.copy(toScene(p, radialDisplay(r) / r));
		}
	}
	// Spacecraft: waypoint interpolation; hidden before their launch date.
	if (shown.craft) {
		for (const cr of craftObjs) {
			const p = craftEcl(TRAJ[cr.key], simDays);
			cr.mesh.visible = !!p;
			if (!p) continue;
			const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
			cr.mesh.position.copy(toScene(p, radialDisplay(r) / r));
		}
	}
}

// Moon orbit lines clutter the wide view, so fade them in only as the camera
// approaches their planet (full near the system, gone when zoomed right out).
const _pw = new THREE.Vector3();
function fadeMoonOrbits() {
	for (const m of moonObjs) {
		if (!m.orbitLine.visible) continue;
		m.parentBody.holder.getWorldPosition(_pw);
		const camDist = camera.position.distanceTo(_pw);
		// Anchored to the planet's distance from the Sun (the camera orbits the
		// Sun, so it can't get arbitrarily close to the outer planets), and
		// stretched with the orbit-spacing slider.
		const aDisp = m.parentBody.planet.displayA * m.parentBody.spacingF;
		const near = aDisp * 0.8, far = aDisp * 2.6;
		const t = Math.max(0, Math.min(1, (far - camDist) / (far - near)));
		m.prox = t; // remembered for the moon labels, which share this fade
		if (m.orbitLine === hiLine) { hiOpacity = 0.4 * t; continue; } // keep it lit; restore to the live fade
		m.orbitLine.material.opacity = 0.4 * t;
	}
}

// ---- Floating name-tags (projected to the screen; toggled in Show) ----
// One DOM label per planet/dwarf, moon and named bright star, positioned each
// frame. Planet labels show whenever Labels is on and the body is visible;
// moon labels additionally fade in with camera proximity (like their orbit
// lines); star labels ride the celestial sphere.
const labelsContainer = document.getElementById('labels');
function makeLabel(cls, text) {
	const el = document.createElement('div');
	el.className = cls;
	el.textContent = text;
	el.style.display = 'none';
	labelsContainer.appendChild(el);
	return el;
}
for (const b of bodies) b.labelEl = makeLabel('planet-label', b.planet.name);
for (const m of moonObjs) m.labelEl = makeLabel('moon-label', m.name);
for (const c of cometObjs) c.labelEl = makeLabel('planet-label', c.name);
for (const cr of craftObjs) cr.labelEl = makeLabel('moon-label', cr.name);
// AU-grid annotations: ring distances at 45° azimuth (clear of the equinox
// ray on +x) and the ♈ symbol at the ray's tip. Shown with the grid itself,
// independent of the Labels toggle.
const gridLabels = GRID_AUS.map(au => ({ au, el: makeLabel('grid-label', `${au} AU`) }));
const equinoxLabel = makeLabel('grid-label', '♈ vernal equinox');
// Star labels exist only after buildStars() has filled starLabels.
function createStarLabelEls() {
	for (const s of starLabels) s.el = makeLabel('star-label', s.name);
}
const _lp = new THREE.Vector3();
function hideLabel(el) { if (el.style.display !== 'none') el.style.display = 'none'; }
function placeLabel(el) {
	el.style.display = 'block';
	el.style.left = ((_lp.x * 0.5 + 0.5) * innerWidth) + 'px';
	el.style.top = ((-_lp.y * 0.5 + 0.5) * innerHeight) + 'px';
}
function updateLabels() {
	const on = shown.labels;
	for (const b of bodies) {
		const el = b.labelEl;
		if (!on || !b.tilted.visible) { hideLabel(el); continue; }
		b.holder.getWorldPosition(_lp).project(camera);
		if (_lp.z > 1) { hideLabel(el); continue; } // behind camera
		placeLabel(el);
	}
	for (const m of moonObjs) {
		const el = m.labelEl;
		// Labelled only when the camera is near the planet (same fade as the
		// orbit lines) AND the moon visibly separates from it on screen — a
		// distant planet's moons collapse into a blob of overlapping names.
		if (!on || !m.mesh.visible || (m.prox || 0) < 0.35) { hideLabel(el); continue; }
		m.mesh.getWorldPosition(_lp).project(camera);
		if (_lp.z > 1) { hideLabel(el); continue; }
		const mx = (_lp.x * 0.5 + 0.5) * innerWidth, my = (-_lp.y * 0.5 + 0.5) * innerHeight;
		m.parentBody.holder.getWorldPosition(_lp).project(camera);
		const sep = Math.hypot(mx - (_lp.x * 0.5 + 0.5) * innerWidth, my - (-_lp.y * 0.5 + 0.5) * innerHeight);
		if (sep < 16) { hideLabel(el); continue; }
		el.style.display = 'block';
		el.style.left = mx + 'px';
		el.style.top = my + 'px';
	}
	for (const c of cometObjs) {
		const el = c.labelEl;
		if (!on || !c.mesh.visible) { hideLabel(el); continue; }
		c.mesh.getWorldPosition(_lp).project(camera);
		if (_lp.z > 1) { hideLabel(el); continue; }
		placeLabel(el);
	}
	for (const cr of craftObjs) {
		const el = cr.labelEl;
		if (!on || !cr.mesh.visible) { hideLabel(el); continue; }
		cr.mesh.getWorldPosition(_lp).project(camera);
		if (_lp.z > 1) { hideLabel(el); continue; }
		placeLabel(el);
	}
	for (const s of starLabels) {
		const el = s.el;
		if (!el) continue;
		if (!shown.starlabels) { hideLabel(el); continue; } // own toggle — separate from body Labels
		// Star positions scale with the celestial sphere (orbit-spacing slider).
		_lp.copy(s.pos).multiplyScalar(skyScale).project(camera);
		if (_lp.z > 1) { hideLabel(el); continue; }
		placeLabel(el);
	}
	const HALF_ROOT2 = Math.SQRT1_2;
	for (const g of gridLabels) {
		if (!shown.grid) { hideLabel(g.el); continue; }
		const r = radialDisplay(g.au);
		_lp.set(r * HALF_ROOT2, 0, -r * HALF_ROOT2).project(camera);
		if (_lp.z > 1) { hideLabel(g.el); continue; }
		placeLabel(g.el);
	}
	if (!shown.grid) { hideLabel(equinoxLabel); }
	else {
		_lp.set(radialDisplay(GRID_AUS[GRID_AUS.length - 1]) * 1.04, 0, 0).project(camera);
		if (_lp.z > 1) hideLabel(equinoxLabel);
		else placeLabel(equinoxLabel);
	}
}

// =====================================================================
//  Screenshot: save the current view as a PNG. The renderer runs without
//  preserveDrawingBuffer, so we render a frame and read it back in the
//  same task; the DOM name labels are then composited on top (they're
//  HTML, not WebGL) along with a small date caption.
// =====================================================================
const SHOT_STYLES = { // mirror of the label classes in styles.css
	'planet-label': { size: 11, weight: 600, color: '#dfe8ff', dy: 10, baseline: 'top' },
	'moon-label':   { size: 10, weight: 600, color: '#c6d4f2', dy: 8,  baseline: 'top' },
	'star-label':   { size: 9.5, weight: 500, color: '#8fa8dc', dy: 0,  baseline: 'middle' },
	'grid-label':   { size: 9.5, weight: 500, color: '#8ea0c4', dy: 0,  baseline: 'middle' }
};
document.getElementById('shot').addEventListener('click', () => {
	placeBodies();
	renderer.render(scene, camera);
	const src = renderer.domElement, pr = renderer.getPixelRatio();
	const out = document.createElement('canvas');
	out.width = src.width; out.height = src.height;
	const g = out.getContext('2d');
	g.drawImage(src, 0, 0);
	g.textAlign = 'center';
	g.shadowColor = 'rgba(0,0,0,0.9)';
	g.shadowBlur = 4 * pr;
	for (const el of labelsContainer.children) {
		const st = SHOT_STYLES[el.className];
		if (!st || el.style.display === 'none') continue;
		g.font = `${st.weight} ${st.size * pr}px "Segoe UI", system-ui, sans-serif`;
		g.fillStyle = st.color;
		g.textBaseline = st.baseline;
		g.fillText(el.textContent, parseFloat(el.style.left) * pr, (parseFloat(el.style.top) + st.dy) * pr);
	}
	g.textAlign = 'left';
	g.textBaseline = 'bottom';
	g.font = `500 ${11 * pr}px "Segoe UI", system-ui, sans-serif`;
	g.fillStyle = 'rgba(200,215,255,0.6)';
	g.fillText(`${dateValue.textContent} · orrery.live`, 12 * pr, out.height - 10 * pr);
	const d = daysToDate(simDays), y = d.getUTCFullYear();
	const name = `orrery-live-${y <= 0 ? (1 - y) + 'BC' : y}-` +
		`${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}.png`;
	out.toBlob((blob) => {
		if (!blob) return;
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = name;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 5000);
	}, 'image/png');
});

function start() {
	buildStars();
	createStarLabelEls();
	applyFilter(); // builds the Milky Way backdrop here if a shared link shows it
	applyOrbitSpacing(parseFloat(orbitSlider.value)); // sky objects exist now; honours a shared ?orbits=
	restoreSharedView(); // ?cam= viewpoint and ?follow= lock, once everything is placed
	refreshDateUI();
	renderer.setAnimationLoop(() => {
		timer.update();
		const delta = timer.getDelta();
		if (signedDps !== 0) { simDays += delta * signedDps; refreshDateUI(); refreshTooltip(); }
		placeBodies();
		updateFollow(delta);
		updateTrails();
		fadeMoonOrbits();
		updateLabels();
		sun.rotation.y = sunSpin * simDays;
		controls.update();
		renderer.render(scene, camera);
	});
}
start();

// ---- PWA: offline cache + installability ------------------------------
// The service worker (sw.js) serves code network-first (deploys land
// immediately, cache covers offline) and textures cache-first. Registered
// only where service workers exist; localhost is allowed for testing.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
	navigator.serviceWorker.register('./sw.js').catch(() => { /* PWA is optional — the site works without it */ });
}

// Headless-test hook (same convention as the other fleet sites).
window.__ORRERY = { bodies, moonObjs, cometObjs, craftObjs, shown, camera };

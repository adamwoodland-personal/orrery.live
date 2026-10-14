// Night sky (/night-sky/): the sky above the viewer's horizon, from the same
// data as the orrery. Pure astronomy lives in astro.js, phone attitude in
// orientation.js, places in cities.js; this file draws and wires the UI.
//
// Frames (shared by every module of this page):
//   J2000 equatorial unit vectors [x,y,z]: x -> RA 0h, z -> north celestial pole.
//   ENU [east, north, up]; azimuth from north, clockwise.
//   Scene (three.js): x = east, y = up, z = south (-z = north); the camera sits
//   at the origin looking along its local -Z.
import * as THREE from '../lib/three.module.js';
import { STARS } from '../stars.js';
import { CLINES } from '../constellations.js';
import { COLOR, dateToDays, daysToDate } from '../guide-orbits.js';
import * as A from './astro.js';
import { CITIES, TZS, cityForTimeZone, searchCities, cityLabel } from './cities.js';
import { CNAMES, constellationAt } from './constellation-names.js';
import { OrientationSource, declination, decimalYear } from './orientation.js';

const DEG = Math.PI / 180;
const R = 100;                          // radius of the celestial sphere in scene units
const BODIES = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
const PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
const TONIGHT = ['Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
const BODY_COLOR = { ...COLOR, Moon: '#e8e4da', Sun: '#ffd166' };
const STORE = 'orrerySky';
const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrap360 = (x) => ((x % 360) + 360) % 360;
const isTouch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;

// Supported dates. The planets (truncated VSOP87), the Moon (Meeus ch. 47), precession and the ΔT
// fit agree with JPL to arcseconds over 1800–2200 and drift to arcminutes by 1000/3000 AD, where
// Earth's rotation (ΔT) is uncertain by tens of seconds and the stars, which carry no proper motion
// here, have moved by up to half a degree. Outside 1000–3000 the page says so rather than guessing.
const T_MIN = dateToDays(new Date(Date.UTC(1000, 0, 1))), T_MAX = dateToDays(new Date(Date.UTC(2999, 11, 31, 12)));
const T_GOOD_MIN = dateToDays(new Date(Date.UTC(1800, 0, 1))), T_GOOD_MAX = dateToDays(new Date(Date.UTC(2200, 0, 1)));
const utcDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric', era: 'short' });
const RANGE_TEXT = 'This sky map covers the years 1000 to 3000.';
// Formats a requested moment for the range note; JavaScript dates stop at about ±270,000 years.
const fmtAsked = (d) => { const dt = daysToDate(d); return Number.isFinite(dt.getTime()) ? utcDate.format(dt) : 'The requested date'; };

// ---- Persistent state ----------------------------------------------------
let saved = {};
try { saved = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { saved = {}; }
function save() {
	try {
		localStorage.setItem(STORE, JSON.stringify({ place: state.place, opts: state.opts, arFov: state.arFov, camFov: state.camFov }));
	} catch (e) { /* private mode: settings just don't stick */ }
}
const DEFAULT_OPTS = { lines: true, cnames: true, snames: true, milky: true, grid: false, ground: true, red: false };

const deviceTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } })();
function placeFromCity(i, why) {
	const c = CITIES[i];
	return { name: c[0], label: cityLabel(i), lat: c[3], lon: c[4], tz: TZS[c[5]], why };
}
function validTz(tz) { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch (e) { return false; } }

const state = {
	place: null,
	t: dateToDays(new Date()),
	live: true,
	night: null,
	look: { az: 180, alt: 35 },
	fov: 70,
	opts: { ...DEFAULT_OPTS, ...(saved.opts || {}) },
	selected: null,          // { kind: 'body'|'star'|'const', key }
	arFov: saved.arFov || 0, // 0 = automatic
	camFov: saved.camFov || 0,
};

// Place: ?at=lat,lon[&place=…&tz=…] beats the saved place, which beats a guess from the time zone.
(function initPlace() {
	const q = new URLSearchParams(location.search);
	const at = (q.get('at') || '').split(',').map(Number);
	if (at.length === 2 && at.every(Number.isFinite) && Math.abs(at[0]) <= 90 && Math.abs(at[1]) <= 180) {
		const tz = q.get('tz');
		const near = nearestCity(at[0], at[1]);
		state.place = {
			name: q.get('place') || CITIES[near][0], label: q.get('place') || cityLabel(near),
			lat: at[0], lon: at[1], tz: tz && validTz(tz) ? tz : TZS[CITIES[near][5]], why: 'link'
		};
	} else if (saved.place && Number.isFinite(saved.place.lat) && validTz(saved.place.tz)) {
		state.place = { ...saved.place, why: 'saved' };
	} else {
		state.place = placeFromCity(cityForTimeZone(deviceTz), 'guess');
	}
	const t = parseFloat(q.get('t'));
	if (Number.isFinite(t)) {
		state.t = clamp(t, T_MIN, T_MAX);
		state.live = false;
		// Say so when the requested moment is out of range, rather than quietly showing another.
		if (state.t !== t) state.rangeMsg = `${RANGE_TEXT} ${fmtAsked(t)} is shown as ${utcDate.format(daysToDate(state.t))}.`;
	}
	const look = (q.get('look') || '').split(',').map(Number);
	if (look.length === 3 && look.every(Number.isFinite)) {
		state.look = { az: wrap360(look[0]), alt: clamp(look[1], -89, 89) };
		state.fov = clamp(look[2], 10, 100);
		state.lookFromLink = true;
	}
})();

function nearestCity(lat, lon) {
	let best = 0, bd = Infinity;
	const cl = Math.cos(lat * DEG);
	for (let i = 0; i < CITIES.length; i++) {
		const c = CITIES[i];
		const dl = c[3] - lat, dn = ((c[4] - lon + 540) % 360 - 180) * cl;
		const d = dl * dl + dn * dn;
		if (d < bd) { bd = d; best = i; }
	}
	return best;
}

// ---- Renderer, scene, camera ---------------------------------------------
// Without WebGL (switched off, blocked or unsupported) the page still answers the question in text:
// the Tonight list, times, places and dates all work; only the drawn sky and AR are missing.
let renderer = null;
try {
	renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
	renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
	renderer.setSize(innerWidth, innerHeight);
	renderer.outputColorSpace = THREE.SRGBColorSpace;
} catch (e) { renderer = null; }
const canvas = renderer ? renderer.domElement : document.createElement('canvas');
canvas.id = 'sky';
document.body.prepend(canvas);
if (!renderer) document.body.classList.add('nogl');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1000);
camera.rotation.order = 'YXZ';

// Everything fixed to the stars rides this group; its matrix is the J2000 -> scene
// rotation for the current time and place (precession and Earth's spin included).
const skyGroup = new THREE.Group();
skyGroup.matrixAutoUpdate = false;
scene.add(skyGroup);

function eqVec(raDeg, decDeg, r = 1) {
	const ra = raDeg * DEG, dec = decDeg * DEG;
	return new THREE.Vector3(r * Math.cos(dec) * Math.cos(ra), r * Math.cos(dec) * Math.sin(ra), r * Math.sin(dec));
}

// ---- Sky dome: night blue to day blue, with a sunset glow ------------------
const dome = new THREE.Mesh(
	new THREE.SphereGeometry(R * 1.2, 48, 24),
	new THREE.ShaderMaterial({
		side: THREE.BackSide, depthWrite: false, depthTest: false,
		uniforms: { uSun: { value: new THREE.Vector3(0, -1, 0) }, uSunAlt: { value: -30 } },
		vertexShader: `
			varying vec3 vDir;
			void main() {
				vDir = normalize(position);
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}`,
		fragmentShader: `
			varying vec3 vDir; uniform vec3 uSun; uniform float uSunAlt;
			void main() {
				vec3 d = normalize(vDir);
				float h = clamp(d.y, -0.2, 1.0);
				float up = smoothstep(-0.05, 0.6, h);
				// How much daylight: 0 at night (Sun below -18), 1 in full day (Sun above +6).
				float day = smoothstep(-18.0, 6.0, uSunAlt);
				float twi = smoothstep(-16.0, -4.0, uSunAlt) * (1.0 - smoothstep(-2.0, 8.0, uSunAlt));
				vec3 nightTop = vec3(0.006, 0.010, 0.032), nightHor = vec3(0.030, 0.048, 0.105);
				vec3 dayTop = vec3(0.16, 0.36, 0.72), dayHor = vec3(0.58, 0.73, 0.90);
				vec3 night = mix(nightHor, nightTop, up);
				vec3 dayc = mix(dayHor, dayTop, up);
				vec3 col = mix(night, dayc, day * day);
				// Twilight glow: warm near the horizon on the Sun's side.
				float toward = max(dot(normalize(vec3(d.x, 0.0, d.z) + 1e-5), normalize(vec3(uSun.x, 0.0, uSun.z) + 1e-5)), 0.0);
				float glow = twi * pow(toward, 3.0) * (1.0 - smoothstep(0.0, 0.35, h));
				col += glow * vec3(0.55, 0.26, 0.10);
				// Around the Sun itself in daylight.
				float near = max(dot(d, normalize(uSun)), 0.0);
				col += smoothstep(-3.0, 3.0, uSunAlt) * pow(near, 60.0) * vec3(0.5, 0.45, 0.35);
				gl_FragColor = vec4(col, 1.0);
			}`
	})
);
dome.renderOrder = -10;
scene.add(dome);

// ---- Milky Way: NASA SVS "Deep Star Maps 2020" (Gaia DR2), only when dark -----
// The milkyway_2020 layer is the band and the faint stars WITHOUT the bright ones (the
// catalogue points above draw those), tone-mapped by ReferenceFiles/orrery-sky/gen-milkyway.py.
// It is plate carrée in J2000 RA/Dec: RA 0h in the middle, RA increasing to the left, north up.
// On an unrotated SphereGeometry that puts (RA, Dec) at (cos d cos RA, sin d, cos d sin RA) — a
// mirror image of this group's frame (cos d cos RA, cos d sin RA, sin d) — so the texture is
// flipped in u and the sphere turned +90° about x: local (x, y, z) -> (x, -z, y).
// 8k (3.9 MB) on desktop GPUs, 4k (1.1 MB) on phones, like the orrery's own Milky Way.
const MILKY_MAX = 0.42; // opacity when fully dark (this map is far brighter than the old one)
let milky = null;
function ensureMilky() {
	if (milky || !renderer) return;
	const mobile = /Mobi|Android|iPhone|iPod/i.test(navigator.userAgent) ||
		(matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820);
	const file = !mobile && renderer.capabilities.maxTextureSize >= 8192 ? 'milkyway-gaia-8k.jpg' : 'milkyway-gaia-4k.jpg';
	const tex = new THREE.TextureLoader().load('/textures/' + file, () => { dirty = true; });
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.wrapS = THREE.RepeatWrapping;
	tex.repeat.x = -1;
	tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
	milky = new THREE.Mesh(
		new THREE.SphereGeometry(R * 1.1, 96, 48),
		new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })
	);
	milky.rotation.x = Math.PI / 2;
	milky.renderOrder = -9;
	skyGroup.add(milky);
}

// ---- Stars: the orrery's HYG catalogue, sized by magnitude, fading with twilight
function bvToColor(bv) { // same ramp as the orrery
	const stops = [[-0.33, 0.61, 0.69, 1.00], [0.00, 0.79, 0.84, 1.00], [0.30, 0.97, 0.97, 1.00], [0.58, 1.00, 0.96, 0.92], [0.81, 1.00, 0.88, 0.74], [1.40, 1.00, 0.78, 0.59], [2.00, 1.00, 0.70, 0.52]];
	bv = clamp(bv, stops[0][0], stops[stops.length - 1][0]);
	for (let i = 0; i < stops.length - 1; i++) {
		if (bv <= stops[i + 1][0]) {
			const a = stops[i], b = stops[i + 1], t = (bv - a[0]) / (b[0] - a[0]);
			return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
		}
	}
	return [1, 1, 1];
}
const pointShader = {
	vertexShader: `
		attribute float aSize; attribute float aMag; attribute vec3 aColor;
		uniform float uPixelRatio; uniform float uLimit; uniform float uZoom;
		varying vec3 vColor; varying float vAlpha;
		void main() {
			vec4 wp = modelMatrix * vec4(position, 1.0);
			float h = normalize(wp.xyz).y;
			// Fainter near the horizon (extinction), dim below it, gone past the limiting magnitude.
			float ext = 0.35 + 0.65 * smoothstep(-0.02, 0.14, h);
			vAlpha = (1.0 - smoothstep(uLimit - 0.7, uLimit + 0.3, aMag)) * ext;
			vColor = aColor;
			gl_Position = projectionMatrix * viewMatrix * wp;
			gl_PointSize = aSize * uPixelRatio * uZoom;
		}`,
	fragmentShader: `
		varying vec3 vColor; varying float vAlpha;
		void main() {
			vec2 d = gl_PointCoord - vec2(0.5);
			float r = length(d);
			if (r > 0.5) discard;
			float core = smoothstep(0.5, 0.0, r);
			gl_FragColor = vec4(vColor, vAlpha * core * core * 1.4);
		}`
};
const starLabels = [];       // { i, v (eq unit Vector3), name, mag, proper, el, w } — sorted brightest first
// HYG labels are proper names ("Mizar") or Bayer/Flamsteed designations ("Gam2Vel", "13Zet Oph",
// "Mu  Vel", "16    Lyr"); the latter are shown the usual way ("γ² Vel", "ζ Oph", "16 Lyr").
const isProperName = (n) => !!n && !/\d/.test(n) && !/^[A-Z][a-z]{1,2}\s+[A-Z][A-Za-z]{2}$/.test(n) && !/\s{2,}/.test(n);
const GREEK = { Alp: 'α', Bet: 'β', Gam: 'γ', Del: 'δ', Eps: 'ε', Zet: 'ζ', Eta: 'η', The: 'θ', Iot: 'ι', Kap: 'κ', Lam: 'λ', Mu: 'μ', Nu: 'ν', Xi: 'ξ', Omi: 'ο', Pi: 'π', Rho: 'ρ', Sig: 'σ', Tau: 'τ', Ups: 'υ', Phi: 'φ', Chi: 'χ', Psi: 'ψ', Ome: 'ω' };
const SUPER = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
function designation(raw) {
	const m = raw.match(/^(\d{0,3})\s*([A-Z][a-z]{1,2})?\s*(\d?)\s*([A-Z][A-Za-z]{2})$/);
	if (!m) return '';
	const [, num, letter, sup, con] = m;
	if (letter && GREEK[letter]) return GREEK[letter] + (sup ? SUPER[+sup] : '') + ' ' + con;
	return num ? num + ' ' + con : '';
}
const starIndex = [];        // { v, mag, name, bv } for picking
const starMat = new THREE.ShaderMaterial({
	uniforms: { uPixelRatio: { value: renderer ? renderer.getPixelRatio() : 1 }, uLimit: { value: 5.5 }, uZoom: { value: 1 } },
	transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
	vertexShader: pointShader.vertexShader, fragmentShader: pointShader.fragmentShader
});
(function buildStars() {
	const n = STARS.length;
	const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), siz = new Float32Array(n), mag = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		const [ra, dec, m, bv, label] = STARS[i];
		const v = eqVec(ra, dec);
		pos[i * 3] = v.x * R; pos[i * 3 + 1] = v.y * R; pos[i * 3 + 2] = v.z * R;
		const [r, g, b] = bvToColor(bv);
		col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
		siz[i] = clamp(8.5 - m * 1.25, 1.8, 11);
		mag[i] = m;
		const raw = (label || '').trim();
		const proper = isProperName(raw) ? raw : '';
		const desig = proper ? '' : designation(raw);
		starIndex.push({ v, mag: m, name: proper, desig, bv });
		if (proper || desig) starLabels.push({ i, v, name: proper || desig, mag: m, proper: !!proper, el: null, w: 0 });
	}
	starLabels.sort((a, b) => a.mag - b.mag);
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
	geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
	geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
	geo.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
	const pts = new THREE.Points(geo, starMat);
	pts.renderOrder = -5;
	pts.frustumCulled = false;
	skyGroup.add(pts);
})();

// ---- Constellation lines and names -----------------------------------------
const lineMat = new THREE.LineBasicMaterial({ color: 0x5b7bb0, transparent: true, opacity: 0.42, depthWrite: false, depthTest: false });
const constLines = (function () {
	const pts = [];
	for (const poly of CLINES) {
		for (let i = 0; i + 3 < poly.length; i += 2) {
			pts.push(eqVec(poly[i], poly[i + 1], R), eqVec(poly[i + 2], poly[i + 3], R));
		}
	}
	const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
	l.renderOrder = -6;
	l.frustumCulled = false;
	skyGroup.add(l);
	return l;
})();
const constLabels = CNAMES.map(([abbr, name, ra, dec, rank], i) => ({ i, abbr, name, rank: rank || 2, v: eqVec(ra, dec), el: null }));

// ---- Horizon frame: ground, horizon line, altitude grid, compass points ----
const groundMat = new THREE.ShaderMaterial({
	transparent: true, depthWrite: false, depthTest: false, side: THREE.BackSide,
	uniforms: { uDay: { value: 0 }, uOpacity: { value: 0.94 } },
	vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
	fragmentShader: `
		varying vec3 vDir; uniform float uDay; uniform float uOpacity;
		void main(){
			float h = -normalize(vDir).y;               // 0 at the horizon, 1 straight down
			vec3 night = vec3(0.020, 0.026, 0.040), day = vec3(0.13, 0.15, 0.12);
			vec3 c = mix(night, day, uDay) * (1.0 - 0.45 * smoothstep(0.0, 0.6, h));
			float a = uOpacity * smoothstep(-0.004, 0.012, h);
			gl_FragColor = vec4(c, a);
		}`
});
const ground = new THREE.Mesh(new THREE.SphereGeometry(R * 0.97, 64, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), groundMat);
ground.renderOrder = 5;
scene.add(ground);
const horizonLine = (function () {
	const pts = [];
	for (let i = 0; i <= 256; i++) { const a = i / 256 * Math.PI * 2; pts.push(new THREE.Vector3(Math.sin(a) * R * 0.96, 0, -Math.cos(a) * R * 0.96)); }
	const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x9fb4e0, transparent: true, opacity: 0.5, depthTest: false, depthWrite: false }));
	l.renderOrder = 6;
	scene.add(l);
	return l;
})();
const altGrid = (function () {
	const pts = [];
	const P = (az, alt) => new THREE.Vector3(Math.cos(alt * DEG) * Math.sin(az * DEG) * R * 0.95, Math.sin(alt * DEG) * R * 0.95, -Math.cos(alt * DEG) * Math.cos(az * DEG) * R * 0.95);
	for (let alt = 15; alt < 90; alt += 15) for (let az = 0; az < 360; az += 3) pts.push(P(az, alt), P(az + 3, alt));
	for (let az = 0; az < 360; az += 30) for (let alt = 0; alt < 90; alt += 3) pts.push(P(az, alt), P(az, alt + 3));
	const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x6f8fd0, transparent: true, opacity: 0.22, depthTest: false, depthWrite: false }));
	l.renderOrder = -4;
	l.visible = false;
	scene.add(l);
	return l;
})();
function azAltToScene(az, alt, r = R) {
	const ca = Math.cos(alt * DEG);
	return new THREE.Vector3(ca * Math.sin(az * DEG) * r, Math.sin(alt * DEG) * r, -ca * Math.cos(az * DEG) * r);
}
function sceneToAzAlt(v) {
	const n = v.clone().normalize();
	return { az: wrap360(Math.atan2(n.x, -n.z) / DEG), alt: Math.asin(clamp(n.y, -1, 1)) / DEG };
}

// ---- Sun, Moon and planets ---------------------------------------------------
function discTexture(draw, size = 128) {
	const c = document.createElement('canvas'); c.width = c.height = size;
	draw(c.getContext('2d'), size);
	const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
	return t;
}
const glowTex = discTexture((g, s) => {
	const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
	grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.18, 'rgba(255,255,255,0.85)');
	grd.addColorStop(0.32, 'rgba(255,255,255,0.28)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
	g.fillStyle = grd; g.fillRect(0, 0, s, s);
});
const sunGlowTex = discTexture((g, s) => {
	const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
	grd.addColorStop(0, 'rgba(255,250,235,1)'); grd.addColorStop(0.12, 'rgba(255,240,200,1)'); grd.addColorStop(0.16, 'rgba(255,214,130,0.55)');
	grd.addColorStop(0.45, 'rgba(255,170,70,0.12)'); grd.addColorStop(1, 'rgba(255,150,40,0)');
	g.fillStyle = grd; g.fillRect(0, 0, s, s);
}, 256);
const ringTex = discTexture((g, s) => {
	g.strokeStyle = 'rgba(255,210,122,0.95)'; g.lineWidth = s * 0.05;
	g.beginPath(); g.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2); g.stroke();
});

// Moon: a canvas disc redrawn when the phase changes; its lit side is drawn on
// +x and the sprite is turned so that side faces the Sun on screen.
const moonCanvas = document.createElement('canvas'); moonCanvas.width = moonCanvas.height = 128;
const moonTex = new THREE.CanvasTexture(moonCanvas); moonTex.colorSpace = THREE.SRGBColorSpace;
let moonDrawnK = -1;
function drawMoon(k) {
	if (Math.abs(k - moonDrawnK) < 0.004) return;
	moonDrawnK = k;
	const g = moonCanvas.getContext('2d'), s = 128, r = s * 0.46, c = s / 2;
	g.clearRect(0, 0, s, s);
	g.fillStyle = 'rgba(48,52,64,0.92)'; // earthshine side
	g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fill();
	// Lit part = right half-disc +/- an ellipse whose half-width is r*|1-2k|.
	const ex = r * Math.abs(1 - 2 * k);
	g.fillStyle = '#ebe7dc';
	g.beginPath();
	g.arc(c, c, r, -Math.PI / 2, Math.PI / 2, false);
	if (k < 0.5) g.ellipse(c, c, ex, r, 0, Math.PI / 2, -Math.PI / 2, true);  // crescent: carve back in
	else g.ellipse(c, c, ex, r, 0, Math.PI / 2, -Math.PI / 2, false);        // gibbous: bulge out
	g.fill();
	// A hint of maria so it reads as the Moon when zoomed in.
	g.globalCompositeOperation = 'source-atop';
	g.fillStyle = 'rgba(120,118,112,0.28)';
	for (const [x, y, rr] of [[0.42, 0.36, 0.13], [0.58, 0.44, 0.1], [0.5, 0.6, 0.12], [0.36, 0.55, 0.08]]) { g.beginPath(); g.arc(x * s, y * s, rr * s, 0, Math.PI * 2); g.fill(); }
	g.globalCompositeOperation = 'source-over';
	moonTex.needsUpdate = true;
}

const bodyObjs = {};
for (const name of BODIES) {
	let sprite;
	if (name === 'Sun') sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunGlowTex, depthTest: false, depthWrite: false, transparent: true }));
	else if (name === 'Moon') sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, depthTest: false, depthWrite: false, transparent: true }));
	else sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(BODY_COLOR[name]), depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
	sprite.renderOrder = name === 'Sun' ? 1 : name === 'Moon' ? 3 : 2;
	scene.add(sprite);
	bodyObjs[name] = { name, sprite, pos: new THREE.Vector3(), az: 0, alt: 0, mag: 0, el: null, distKm: 0 };
}
const selRing = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, depthTest: false, depthWrite: false, transparent: true }));
selRing.renderOrder = 8;
selRing.visible = false;
scene.add(selRing);

// ---- Labels (HTML, projected each frame) ----------------------------------------
const labelsEl = $('labels');
function makeLabel(cls, text) {
	const el = document.createElement('div');
	el.className = cls;
	el.textContent = text;
	el.hidden = true;
	labelsEl.appendChild(el);
	return el;
}
// Label footprints for the declutter, measured once with the label fonts (see sky.css).
const measureCtx = document.createElement('canvas').getContext('2d');
function textW(text, font, spacing = 0) { measureCtx.font = font + ' -apple-system, "Segoe UI", system-ui, sans-serif'; return measureCtx.measureText(text).width + spacing * text.length; }
for (const b of Object.values(bodyObjs)) { b.el = makeLabel('b-label', b.name); b.el.style.color = BODY_COLOR[b.name]; b.w = textW(b.name, '650 12.5px', 0.25); }
for (const st of starLabels) { st.el = makeLabel(st.proper ? 's-label' : 's-label d', st.name); st.w = textW(st.name, st.proper ? '500 10.5px' : '500 9.5px', 0.3); }
for (const c of constLabels) { c.el = makeLabel('c-label', c.name); c.w = textW(c.name.toUpperCase(), '600 9.5px', 1.52); }
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map((t, i) => ({ az: i * 45, el: makeLabel('k-label' + (i % 2 ? ' minor' : '') + (i === 0 ? ' n' : ''), t), w: textW(t, i % 2 ? '600 11px' : '700 14px') }));
const GRID_LABELS = [15, 30, 45, 60, 75].map((alt) => ({ alt, el: makeLabel('g-label', alt + '°') }));

const _v = new THREE.Vector3();
function project(world) { // -> {x, y, on} in CSS pixels; on = in front of the camera
	_v.copy(world).project(camera);
	return { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight, on: _v.z < 1 && _v.z > -1 };
}
// Declutter: labels claim screen boxes in priority order; one that would overlap an already
// placed label is hidden this frame. A coarse grid keeps it cheap with ~1,500 candidates.
const CELL = 96;
let occ = new Map();
function claim(x, y, w, h) {
	const x0 = x - w / 2 - 3, x1 = x + w / 2 + 3, y0 = y - h / 2 - 1, y1 = y + h / 2 + 1;
	const cx0 = Math.floor(x0 / CELL), cx1 = Math.floor(x1 / CELL), cy0 = Math.floor(y0 / CELL), cy1 = Math.floor(y1 / CELL);
	for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
		const list = occ.get(cx * 10007 + cy);
		if (list) for (const r of list) if (x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1]) return false;
	}
	const r = [x0, y0, x1, y1];
	for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
		const k = cx * 10007 + cy;
		const list = occ.get(k);
		if (list) list.push(r); else occ.set(k, [r]);
	}
	return true;
}
// Like place(), but only if the label's box is free (force: always place, still reserving the box).
function placeFree(el, p, dx, dy, w, h, force) {
	if (!p.on || p.x < -80 || p.x > innerWidth + 80 || p.y < -40 || p.y > innerHeight + 40) { if (!el.hidden) el.hidden = true; return false; }
	if (!claim(p.x + dx, p.y + dy, w, h) && !force) { if (!el.hidden) el.hidden = true; return false; }
	return place(el, p, dx, dy);
}
function place(el, p, dx, dy) {
	if (!p.on || p.x < -80 || p.x > innerWidth + 80 || p.y < -40 || p.y > innerHeight + 40) { if (!el.hidden) el.hidden = true; return false; }
	if (el.hidden) el.hidden = false;
	el.style.transform = `translate3d(${(p.x + dx).toFixed(1)}px,${(p.y + dy).toFixed(1)}px,0) translate(-50%,-50%)`;
	return true;
}

// ---- Time, place and the night ------------------------------------------------------
let fmtTime, fmtDay, fmtDayY, fmtDate, fmtZone;
function setFormatters() {
	const tz = state.place.tz;
	fmtTime = new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit' });
	fmtDay = new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' });
	fmtDayY = new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
	fmtDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
	fmtZone = new Intl.DateTimeFormat(undefined, { timeZone: tz, timeZoneName: 'short' });
}
const tStr = (d) => d == null ? '—' : fmtTime.format(daysToDate(d));
function zoneName(d) {
	const part = fmtZone.formatToParts(daysToDate(d)).find((p) => p.type === 'timeZoneName');
	return part ? part.value : state.place.tz;
}
const localDate = (d) => fmtDate.format(daysToDate(d)); // YYYY-MM-DD in the place's zone
// "Wed 15 Oct", with the year when it is not this year (an orrery link can land in 2030).
const dayStr = (d) => (localDate(d).slice(0, 4) === localDate(dateToDays(new Date())).slice(0, 4) ? fmtDay : fmtDayY).format(daysToDate(d));
// How far the shown moment is from now: "in 5 h", "3 days ago".
function fromNow(t) {
	const diff = t - dateToDays(new Date()), a = Math.abs(diff), min = Math.round(a * 1440);
	const s = min < 1 ? 'under a minute'
		: min < 60 ? `${min} min`
		: min < 180 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`
		: a < 2 ? `${Math.round(a * 24)} h`
		: a < 61 ? `${Math.round(a)} days`
		: a < 730 ? `${Math.round(a / 30.44)} months`
		: `${Math.round(a / 365.25).toLocaleString()} years`;
	return diff > 0 ? `in ${s}` : `${s} ago`;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

let matrixT = NaN, matrixPlace = null, moonKey = '';
const eqToScene = new THREE.Matrix4();
let sunAlt = -90;
const moonSunDir = new THREE.Vector3();
function updateSky(force) {
	const p = state.place;
	if (!force && state.t === matrixT && p === matrixPlace) return false;
	matrixT = state.t; matrixPlace = p;
	const m = A.eqToEnuMatrix(state.t, p.lat, p.lon);
	// scene = S·enu with S: x <- east, y <- up, z <- -north.
	eqToScene.set(
		m[0], m[1], m[2], 0,
		m[6], m[7], m[8], 0,
		-m[3], -m[4], -m[5], 0,
		0, 0, 0, 1
	);
	skyGroup.matrix.copy(eqToScene);
	skyGroup.matrixWorldNeedsUpdate = true;
	const obs = { lat: p.lat, lon: p.lon, heightM: 0 };
	for (const name of BODIES) {
		const b = bodyObjs[name];
		const r = A.bodyJ2000(name, state.t, obs);
		b.pos.set(r.v[0], r.v[1], r.v[2]).applyMatrix4(eqToScene).normalize();
		const aa = sceneToAzAlt(b.pos);
		b.az = aa.az; b.alt = aa.alt;
		b.altApp = aa.alt + A.refraction(aa.alt);
		b.distKm = r.distKm;
		b.mag = A.magnitude(name, state.t);
	}
	// Show refracted positions: lift each body by its refraction (matters only near the horizon).
	for (const name of BODIES) {
		const b = bodyObjs[name];
		b.pos.copy(azAltToScene(b.az, b.altApp, 1));
	}
	sunAlt = bodyObjs.Sun.alt;
	dome.material.uniforms.uSun.value.copy(bodyObjs.Sun.pos);
	dome.material.uniforms.uSunAlt.value = sunAlt;
	groundMat.uniforms.uDay.value = clamp((sunAlt + 6) / 12, 0, 1);
	starMat.uniforms.uLimit.value = limitingMag(sunAlt);
	lineMat.opacity = 0.42 * clamp((-sunAlt + 1) / 11, 0.1, 1);
	if (milky) milky.material.opacity = state.opts.milky ? MILKY_MAX * clamp((-sunAlt - 12) / 6, 0, 1) : 0;
	const ph = A.moonPhase(state.t);
	state.moonPhase = ph;
	drawMoon(ph.fraction);
	// The chips, list and card quote the phase; refresh them when the shown name or percentage changes.
	const mk = ph.name + Math.round(ph.fraction * 100);
	if (mk !== moonKey) {
		moonKey = mk;
		if (tonight) { renderChips(); renderTonight(); }
		if (state.selected && state.selected.key === 'Moon' && activePanel === 'object' && !ar.on) showObject(state.selected);
	}
	return true;
}
// Faintest star you could see for a given Sun altitude (dark site ~6; the catalogue stops at 5).
function limitingMag(sa) {
	if (sa >= 0) return -3.2;
	if (sa >= -6) return -3.2 + (0 - sa) / 6 * 4.4;     // -> 1.2 at civil dusk
	if (sa >= -12) return 1.2 + (-6 - sa) / 6 * 2.8;    // -> 4.0 at nautical dusk
	if (sa >= -18) return 4.0 + (-12 - sa) / 6 * 1.8;   // -> 5.8 when fully dark
	return 5.8;
}
function bodyVisibleNow(b) { return b.mag < limitingMag(sunAlt) + (b.name === 'Moon' || b.name === 'Sun' ? 99 : 0); }

// ---- Per-frame placement of bodies, labels and helpers -------------------------------
function zoomScale() { return clamp(Math.pow(70 / camera.fov, 0.45), 0.75, 2.4); }
function layoutBodies() {
	const z = zoomScale();
	const px = (deg) => deg * DEG * R; // sprite world size for an angular size
	const pxPerDeg = innerHeight / camera.fov;
	for (const name of BODIES) {
		const b = bodyObjs[name];
		const s = b.sprite;
		s.position.copy(b.pos).multiplyScalar(R * 0.9);
		if (name === 'Sun') {
			const deg = Math.max(0.53 * 6, 26 / pxPerDeg);
			s.scale.setScalar(px(deg));
			s.material.opacity = 1;
		} else if (name === 'Moon') {
			// Real size (0.52°) when zoomed in, enlarged when zoomed out so the phase is legible.
			const deg = Math.max(0.52, 22 / pxPerDeg);
			s.scale.setScalar(px(deg));
			s.material.opacity = b.alt < -1 ? 0.5 : 1;
			// Turn the lit limb towards the Sun on screen.
			const a = project(s.position);
			moonSunDir.copy(bodyObjs.Sun.pos).sub(b.pos.clone().multiplyScalar(b.pos.dot(bodyObjs.Sun.pos))).normalize();
			const b2 = project(_tmp.copy(b.pos).addScaledVector(moonSunDir, 0.02).normalize().multiplyScalar(R * 0.9));
			s.material.rotation = Math.atan2(-(b2.y - a.y), b2.x - a.x);
		} else {
			const vis = bodyVisibleNow(b);
			const sizePx = clamp(17 - b.mag * 2.4, 10, 32) * z;
			s.scale.setScalar(px(sizePx / pxPerDeg));
			s.material.opacity = vis ? (b.alt < -1 ? 0.35 : 1) : 0.12;
		}
	}
}
const _tmp = new THREE.Vector3();

// Faintest named star labelled at this zoom; designations ("γ Vel") only once well zoomed in.
// The declutter keeps them apart, so these can be generous.
function properLimit() { const f = camera.fov; return f > 80 ? 2.2 : f > 60 ? 2.7 : f > 42 ? 3.3 : f > 28 ? 4.0 : f > 18 ? 4.6 : 5.1; }
function desigLimit() { const f = camera.fov; return f > 60 ? -99 : f > 42 ? 2.6 : f > 28 ? 3.4 : f > 18 ? 4.2 : 5.1; }
function updateLabels() {
	const sel = state.selected;
	occ = new Map();
	// The floating controls count as occupied, so optional names don't hide half under them.
	for (const id of ['topBar', 'arBar', 'chips', 'timeRow', 'scrubWrap', 'actionRow', 'rangeNote']) {
		const el = $(id);
		if (!el || el.hidden || !el.offsetParent) continue;
		const r = el.getBoundingClientRect();
		if (r.width && r.height) claim((r.left + r.right) / 2, (r.top + r.bottom) / 2, r.width, r.height);
	}
	for (const name of BODIES) {
		const b = bodyObjs[name];
		const p = project(b.sprite.position);
		const visible = name === 'Sun' || name === 'Moon' || bodyVisibleNow(b) || (sel && sel.key === name);
		if (!visible) { b.el.hidden = true; continue; }
		const r = b.sprite.scale.x / (R * 0.9) / DEG * innerHeight / camera.fov / 2; // sprite radius in px
		const ringPx = sel && sel.key === name ? selRing.scale.x / (R * 0.9) / DEG * innerHeight / camera.fov / 2 * 0.84 : 0;
		if (placeFree(b.el, p, 0, Math.max(14, r * 0.55 + 10, ringPx + 9), b.w, 15, true)) {
			b.el.classList.toggle('below', b.alt < -0.5);
			b.el.classList.toggle('sel', !!(sel && sel.key === name));
		}
	}
	for (const k of COMPASS) placeFree(k.el, project(azAltToScene(k.az, 0.6, R * 0.95)), 0, -9, k.w, 16, true);
	const showStars = state.opts.snames && sunAlt < -4;
	const pLim = showStars ? properLimit() : -99, dLim = showStars ? desigLimit() : -99;
	const selStar = sel && sel.kind === 'star' ? sel.key : -1;
	const starLabel = (st, force) => {
		_tmp.copy(st.v).multiplyScalar(R).applyMatrix4(eqToScene);
		if (_tmp.y < -0.5 && state.opts.ground) { st.el.hidden = true; return; }
		placeFree(st.el, project(_tmp), 0, 11, st.w, 12, force);
	};
	// A selected star keeps its label whatever the zoom.
	const done = new Set();
	for (const st of starLabels) if (st.i === selStar && (st.proper || st.name)) { starLabel(st, true); done.add(st); }
	// Brightest stars, then constellation names, then the rest of the named stars, then designations.
	const BRIGHT = 2.0;
	for (const st of starLabels) {
		if (st.mag >= BRIGHT) break;
		if (done.has(st)) continue;
		if (st.proper && st.mag <= pLim) { starLabel(st, false); done.add(st); }
	}
	const showC = state.opts.cnames && sunAlt < -4 && camera.fov < 95;
	// Big/famous figures always; the rest as you zoom in (phones would otherwise drown in names).
	const maxRank = camera.fov > 70 ? 1 : camera.fov > 40 ? 2 : 3;
	for (const c of constLabels) {
		if (!showC || c.rank > maxRank) { c.el.hidden = true; continue; }
		_tmp.copy(c.v).multiplyScalar(R).applyMatrix4(eqToScene);
		if (_tmp.y < 2 && state.opts.ground) { c.el.hidden = true; continue; }
		placeFree(c.el, project(_tmp), 0, 0, c.w, 11, false);
	}
	for (const st of starLabels) {
		if (done.has(st)) continue;
		const lim = st.proper ? pLim : dLim;
		if (st.mag > lim) { if (!st.el.hidden) st.el.hidden = true; continue; }
		starLabel(st, false);
	}
	for (const g of GRID_LABELS) {
		if (!state.opts.grid) { g.el.hidden = true; continue; }
		const az = Math.round(state.look.az / 30) * 30 + 15;
		place(g.el, project(azAltToScene(az, g.alt, R * 0.95)), 0, -7);
	}
	if (sel && selRing.visible) selRing.position.copy(selectedWorld() || selRing.position);
}

// ---- Camera: look direction from drag, or from the phone in AR ---------------------
function applyLook() {
	camera.fov = state.fov;
	camera.rotation.set(state.look.alt * DEG, -state.look.az * DEG, 0, 'YXZ');
	camera.updateProjectionMatrix();
	camera.updateMatrixWorld();
	starMat.uniforms.uZoom.value = zoomScale();
}
function lookAt(az, alt, animate = true) {
	alt = clamp(alt, -60, 85);
	if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { state.look = { az: wrap360(az), alt }; dirty = true; return; }
	const from = { ...state.look }, d = ((az - from.az + 540) % 360) - 180, t0 = performance.now();
	anim = (now) => {
		const k = clamp((now - t0) / 650, 0, 1), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
		state.look = { az: wrap360(from.az + d * e), alt: from.alt + (alt - from.alt) * e };
		if (k >= 1) anim = null;
	};
}
let anim = null;
let dirty = true;

// ---- Pointer input: drag to look (with a little inertia), pinch/wheel to zoom, tap to pick
const pointers = new Map();
let drag = null, pinch = null, vel = { az: 0, alt: 0 }, lastMove = 0;
canvas.addEventListener('pointerdown', (e) => {
	canvas.setPointerCapture(e.pointerId);
	pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
	anim = null;
	vel = { az: 0, alt: 0 };
	if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false };
	else if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: ar.on ? arFovNow() : state.fov }; drag = null; }
});
canvas.addEventListener('pointermove', (e) => {
	if (!pointers.has(e.pointerId)) return;
	pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
	if (pinch && pointers.size === 2) {
		const [a, b] = [...pointers.values()];
		const d = Math.hypot(a.x - b.x, a.y - b.y);
		const f = clamp(pinch.fov * pinch.d / Math.max(d, 1), 10, 100);
		if (ar.on) setArFov(f); else state.fov = f;
		dirty = true;
		return;
	}
	if (!drag) return;
	const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
	if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) { drag.moved = true; canvas.classList.add('dragging'); }
	drag.x = e.clientX; drag.y = e.clientY;
	const degPerPx = camera.fov / innerHeight;
	if (ar.on) { ar.nudge = wrap360(ar.nudge - dx * degPerPx + 180) - 180; showNudge(); return; }
	// "Grab the sky": the point under the finger stays under the finger.
	const dAz = -dx * degPerPx / Math.max(Math.cos(state.look.alt * DEG), 0.25), dAlt = dy * degPerPx;
	state.look = { az: wrap360(state.look.az + dAz), alt: clamp(state.look.alt + dAlt, -60, 89) };
	const now = performance.now(), dt = Math.max(now - lastMove, 8);
	vel = { az: dAz / dt * 16, alt: dAlt / dt * 16 }; lastMove = now;
	dirty = true;
});
function endPointer(e) {
	if (!pointers.has(e.pointerId)) return;
	pointers.delete(e.pointerId);
	canvas.classList.remove('dragging');
	if (pointers.size < 2) pinch = null;
	if (drag && !drag.moved && performance.now() - drag.t0 < 450 && e.type === 'pointerup') pickAt(e.clientX, e.clientY);
	if (drag && drag.moved && performance.now() - lastMove > 60) vel = { az: 0, alt: 0 };
	drag = null;
	if (ar.on) save();
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => {
	e.preventDefault();
	const f = clamp((ar.on ? arFovNow() : state.fov) * Math.exp(e.deltaY * 0.0012), 10, 100);
	if (ar.on) setArFov(f); else state.fov = f;
	dirty = true;
}, { passive: false });
addEventListener('keydown', (e) => {
	if (e.target.closest && e.target.closest('input, textarea, select')) return;
	const step = e.shiftKey ? 15 : 5;
	const k = e.key;
	if (k === 'ArrowLeft') lookAt(state.look.az - step, state.look.alt, false);
	else if (k === 'ArrowRight') lookAt(state.look.az + step, state.look.alt, false);
	else if (k === 'ArrowUp') lookAt(state.look.az, state.look.alt + step, false);
	else if (k === 'ArrowDown') lookAt(state.look.az, state.look.alt - step, false);
	else if (k === '+' || k === '=') state.fov = clamp(state.fov / 1.15, 10, 100);
	else if (k === '-' || k === '_') state.fov = clamp(state.fov * 1.15, 10, 100);
	else if (k === 'Escape') { if (sheetOpen()) closeSheet(); else select(null); }
	else if ('nesw'.includes(k.toLowerCase()) && k.length === 1) lookAt({ n: 0, e: 90, s: 180, w: 270 }[k.toLowerCase()], 25);
	else return;
	dirty = true;
});

// ---- Picking ---------------------------------------------------------------------------
function pickAt(x, y) {
	let best = null, bd = Infinity;
	const consider = (sel, world, bonus, maxPx) => {
		const p = project(world);
		if (!p.on) return;
		const d = Math.hypot(p.x - x, p.y - y) - bonus;
		if (d < bd && d < maxPx) { bd = d; best = sel; }
	};
	for (const name of BODIES) consider({ kind: 'body', key: name }, bodyObjs[name].sprite.position, 10, 34);
	const lim = Math.min(starMat.uniforms.uLimit.value, 4.5);
	for (let i = 0; i < starIndex.length; i++) {
		const s = starIndex[i];
		if (s.mag > lim) continue;
		_tmp.copy(s.v).multiplyScalar(R).applyMatrix4(eqToScene);
		consider({ kind: 'star', key: i }, _tmp.clone(), 4 - s.mag, 26);
	}
	if (!best && state.opts.cnames) {
		for (const c of constLabels) {
			_tmp.copy(c.v).multiplyScalar(R).applyMatrix4(eqToScene);
			if (!c.el.hidden) consider({ kind: 'const', key: c.i }, _tmp.clone(), 0, 40);
		}
	}
	select(best, true);
}
function selectedWorld() {
	const s = state.selected;
	if (!s) return null;
	if (s.kind === 'body') return bodyObjs[s.key].sprite.position;
	if (s.kind === 'star') return _sw.copy(starIndex[s.key].v).multiplyScalar(R * 0.9).applyMatrix4(eqToScene);
	return null;
}
const _sw = new THREE.Vector3();
function select(sel, fromTap) {
	state.selected = sel;
	selRing.visible = !!sel && sel.kind !== 'const';
	if (sel) {
		if (sel.kind === 'body') {
			const b = bodyObjs[sel.key];
			selRing.scale.setScalar(Math.max(b.sprite.scale.x * 1.5, 3.2 * DEG * R * camera.fov / 70));
		} else selRing.scale.setScalar(2.6 * DEG * R * camera.fov / 70);
		showObject(sel);
	} else if (activePanel === 'object') closeSheet();
	renderChips();
	dirty = true;
}

// ---- Tonight: visibility of the Moon and planets, chips and the list -------------------------
let tonight = null; // { night, rows: {name: visibility} }
function computeTonight() {
	const p = state.place;
	const night = A.nightOf(state.t, p.lat, p.lon);
	state.night = night;
	state.moonPhase = A.moonPhase(state.t);
	const rows = {};
	for (const name of TONIGHT) {
		try { rows[name] = A.visibility(name, night, p.lat, p.lon); } catch (e) { rows[name] = { visible: false }; }
	}
	tonight = { night, rows, key: nightKey() };
	renderScrub();
	renderTonight();
	renderChips();
}
function nightKey() { const n = state.night; return n ? `${state.place.lat},${state.place.lon},${Math.round(n.start * 24)}` : ''; }

const WHEN_TEXT = { evening: 'Evening', morning: 'Morning', 'all night': 'All night', 'most of the night': 'Most of the night', 'late night': 'Late night', 'not visible': 'Not visible' };
const DIR_NAME = { N: 'north', NE: 'north-east', E: 'east', SE: 'south-east', S: 'south', SW: 'south-west', W: 'west', NW: 'north-west' };
function visSentence(name, v) {
	if (!v || !v.visible) {
		const nt = state.night;
		if (nt && (nt.polar === 'day' || nt.darkness === 'none') && name !== 'Moon') return 'The sky stays too bright to see it tonight.';
		const el = name === 'Moon' ? null : A.elongation(name, state.t);
		if (el != null && Math.abs(el) < 15) return 'Too close to the Sun to see tonight.';
		return 'Not up while the sky is dark tonight.';
	}
	const h = { low: 'low in the', medium: 'in the', high: 'high in the' }[v.height] || 'in the';
	const dir = DIR_NAME[v.direction] || v.direction;
	const best = `best around <b>${tStr(v.best)}</b>, ${h} ${dir}`;
	// A body can set and rise again within one night: list each stretch, never one span across the gap.
	const ws = v.windows && v.windows.length ? v.windows : [[v.from, v.to]];
	const span = ws.map(([a, b]) => `<b>${tStr(a)}</b> – <b>${tStr(b)}</b>`).join(' and again ');
	const label = ws.length > 1 ? (eveningAndMorning(ws) ? 'Evening and morning' : 'In ' + (ws.length === 2 ? 'two' : ws.length) + ' spells') : (WHEN_TEXT[v.when] || 'Visible');
	return `${label}: ${span}; ${best}.`;
}
// True when the stretches fall either side of the middle of the night.
function eveningAndMorning(ws) {
	const n = state.night;
	const mid = n && n.sunset != null && n.sunrise != null ? (n.sunset + n.sunrise) / 2 : n ? (n.start + n.end) / 2 : 0;
	return ws[0][1] <= mid && ws[ws.length - 1][0] >= mid;
}
function shortHint(v) {
	if (!v || !v.visible) return '';
	if (v.windows && v.windows.length > 1) return `${eveningAndMorning(v.windows) ? 'eve + morning' : 'on and off'} · ${v.direction}`;
	const w = { evening: 'evening', morning: 'morning', 'all night': 'all night', 'most of the night': 'most of night', 'late night': 'late' }[v.when] || '';
	return `${w} · ${v.direction}`;
}
function renderChips() {
	const box = $('chips');
	const keep = box.scrollLeft;
	box.textContent = '';
	if (!tonight) return;
	const list = TONIGHT.filter((n) => tonight.rows[n] && tonight.rows[n].visible && (n !== 'Uranus' && n !== 'Neptune'))
		.sort((a, b) => tonight.rows[a].best - tonight.rows[b].best);
	for (const n of list) {
		const b = document.createElement('button');
		b.className = 'chip pchip' + (state.selected && state.selected.key === n ? ' sel' : '');
		b.setAttribute('role', 'listitem');
		b.style.color = BODY_COLOR[n];
		const dot = document.createElement('span'); dot.className = 'dot';
		const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = n === 'Moon' ? `Moon ${Math.round(state.moonPhase.fraction * 100)}%` : n;
		const hint = document.createElement('span'); hint.className = 'hint'; hint.textContent = shortHint(tonight.rows[n]);
		b.append(dot, nm, hint);
		b.addEventListener('click', () => goToBody(n));
		box.appendChild(b);
	}
	if (!list.length) {
		const b = document.createElement('button');
		b.className = 'chip pchip';
		b.textContent = 'No bright planets tonight';
		b.addEventListener('click', () => openSheet('tonight'));
		box.appendChild(b);
	}
	box.scrollLeft = keep;
	chipFades();
}
// Fade only the side(s) with more chips beyond the edge.
function chipFades() {
	const box = $('chips');
	box.classList.toggle('moreL', box.scrollLeft > 2);
	box.classList.toggle('moreR', box.scrollLeft + box.clientWidth < box.scrollWidth - 2);
}
$('chips').addEventListener('scroll', chipFades, { passive: true });
addEventListener('resize', chipFades);
// A mouse wheel scrolls an overflowing row sideways (narrow desktop windows; phones swipe).
$('chips').addEventListener('wheel', (e) => {
	const box = e.currentTarget;
	if (box.scrollWidth <= box.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
	box.scrollLeft += e.deltaY;
	e.preventDefault();
}, { passive: false });
function renderTonight() {
	if (!tonight) return;
	const n = tonight.night;
	$('tonightPlace').textContent = `${state.place.label} · ${dayStr(n.start + 0.1)}`;
	$('tzNote').textContent = `${state.place.name} (${zoneName(state.t)})`;
	const st = $('sunTimes');
	st.textContent = '';
	const add = (label, d) => { if (d == null) return; const s = document.createElement('span'); s.append(label + ' '); const b = document.createElement('b'); b.textContent = tStr(d); s.append(b); st.append(s); };
	if (n.polar === 'day') st.textContent = 'The Sun stays up all night here at this time of year.';
	else if (n.polar === 'night') st.textContent = 'The Sun does not rise here at this time of year.';
	add('Sunset', n.sunset);
	add(n.darkness === 'astronomical' ? 'Dark from' : 'Darkest', n.darkness === 'astronomical' ? n.astroDusk : null);
	add('Sunrise', n.sunrise);
	if (n.darkness && n.darkness !== 'astronomical' && n.polar == null) {
		const s = document.createElement('span');
		s.textContent = n.darkness === 'none' ? 'It never gets fully dark tonight.' : `Twilight all night (only ${n.darkness} darkness).`;
		st.append(s);
	}
	const list = $('tonightList');
	list.textContent = '';
	const FAINT = ['Uranus', 'Neptune'];
	const vis = TONIGHT.filter((x) => tonight.rows[x].visible && !FAINT.includes(x)).sort((a, b) => tonight.rows[a].best - tonight.rows[b].best);
	const scope = FAINT.filter((x) => tonight.rows[x].visible);
	const not = TONIGHT.filter((x) => !tonight.rows[x].visible);
	const row = (name) => {
		const v = tonight.rows[name];
		const b = document.createElement('button');
		b.className = 'prow' + (v.visible ? '' : ' off');
		b.style.color = BODY_COLOR[name];
		const dot = document.createElement('span'); dot.className = 'dot';
		const nm = document.createElement('span'); nm.className = 'nm';
		nm.textContent = name === 'Moon' ? `Moon · ${state.moonPhase.name.toLowerCase()} (${Math.round(state.moonPhase.fraction * 100)}%)` : name;
		const mag = document.createElement('span'); mag.className = 'mag';
		const m = v.magnitude != null ? v.magnitude : A.magnitude(name, state.t);
		mag.textContent = name === 'Moon' ? '' : `mag ${m.toFixed(1)}`;
		const desc = document.createElement('span'); desc.className = 'desc';
		desc.innerHTML = visSentence(name, v); // our own text: times and fixed words only
		b.append(dot, nm, mag, desc);
		b.addEventListener('click', () => { goToBody(name); if (!wide()) closeSheet(); });
		return b;
	};
	if (vis.length) { const h = document.createElement('p'); h.className = 'listHead'; h.textContent = 'Visible tonight'; list.append(h); vis.forEach((x) => list.append(row(x))); }
	if (!vis.length) { const h = document.createElement('p'); h.className = 'listHead'; h.textContent = 'No bright planets tonight'; list.append(h); }
	if (scope.length) { const h = document.createElement('p'); h.className = 'listHead'; h.textContent = 'With binoculars or a telescope'; list.append(h); scope.forEach((x) => list.append(row(x))); }
	if (not.length) { const h = document.createElement('p'); h.className = 'listHead'; h.textContent = 'Not visible tonight'; list.append(h); not.forEach((x) => list.append(row(x))); }
}
// Centre a body; if it is not up at the current time, jump to its best moment tonight first.
function goToBody(name) {
	const b = bodyObjs[name];
	const v = tonight && tonight.rows[name];
	if (!ar.on && (b.alt < 3 || !bodyVisibleNow(b)) && v && v.visible) setTime(v.best, false);
	updateSky();
	if (!ar.on) lookAt(b.az, clamp(b.altApp, 8, 70) - (wide() ? 0 : state.fov * 0.12));
	select({ kind: 'body', key: name });
}

// ---- Object card ---------------------------------------------------------------------------------
// What to say about each body on its card, with its Wikipedia article. Stars and
// constellations come from sky-info.js, loaded the first time a card needs it.
const BODY_INFO = {
	Sun: ['Our star, a middle-aged yellow dwarf 109 times wider than Earth. Never look at it directly, and never through binoculars or a telescope.', 'Sun'],
	Moon: ['Earth’s only natural satellite. It always turns the same face to us, and its phases repeat every 29.5 days as it circles Earth.', 'Moon'],
	Mercury: ['The smallest planet and the closest to the Sun, so it never strays far from it: look low in the twilight just after sunset or before sunrise.', 'Mercury (planet)'],
	Venus: ['The brightest planet, wrapped in thick cloud that reflects sunlight. Often called the evening or morning star; it can cast faint shadows.', 'Venus'],
	Mars: ['The Red Planet, coloured by rusty dust. Its brightness changes a lot: it shines brightest around opposition, every 26 months.', 'Mars'],
	Jupiter: ['The largest planet, more massive than all the others combined. Binoculars show its four big moons as tiny stars beside it.', 'Jupiter'],
	Saturn: ['The ringed planet. Any small telescope shows the rings; to the eye it is a steady, pale-gold point.', 'Saturn'],
	Uranus: ['An ice giant tipped on its side. At the very edge of naked-eye visibility from a dark site; easy in binoculars once you know where to look.', 'Uranus'],
	Neptune: ['The outermost planet, found in 1846 by maths before anyone saw it. Too faint for the eye: you need a telescope.', 'Neptune'],
};
const wikiHref = (title) => 'https://en.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/g, '/');
let skyInfo = null; // the lazily imported sky-info.js module (null until loaded or if it fails)
function loadSkyInfo() {
	if (!skyInfo) skyInfo = import('./sky-info.js').catch(() => null);
	return skyInfo;
}
function wikiLink(actions, title) {
	if (!title) return;
	const a = document.createElement('a');
	a.className = 'pill wiki';
	a.href = wikiHref(title);
	a.target = '_blank';
	a.rel = 'noopener';
	a.textContent = 'More on Wikipedia ›';
	actions.append(a);
}
function fmtDist(km) {
	if (km < 2e6) return `${Math.round(km).toLocaleString()} km`;
	const au = km / 149597870.7;
	return `${au < 10 ? au.toFixed(2) : au.toFixed(1)} AU · ${(km / 299792.458 / 60).toFixed(km > 1.8e9 ? 0 : 1)} light-min`;
}
function dirText(az, alt) { return `${Math.round(alt)}° up, ${A.compass16(az)} (${Math.round(az)}°)`; }
function showObject(sel) {
	const facts = $('objFacts'), actions = $('objActions'), about = $('objAbout');
	facts.textContent = ''; actions.textContent = ''; about.textContent = '';
	const token = (showObject.seq = (showObject.seq || 0) + 1); // ignore late info for a card already replaced
	const fact = (k, v) => { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; facts.append(dt, dd); };
	const btn = (text, fn, cls = 'pill') => { const b = document.createElement('button'); b.className = cls; b.textContent = text; b.addEventListener('click', fn); actions.append(b); return b; };
	const p = state.place;
	if (sel.kind === 'body') {
		const name = sel.key, b = bodyObjs[name];
		$('objName').textContent = name === 'Moon' ? 'The Moon' : name === 'Sun' ? 'The Sun' : name;
		$('objName').style.color = BODY_COLOR[name];
		const ra = b.pos.clone().applyMatrix4(_inv.copy(eqToScene).invert());
		const con = constellationAt(wrap360(Math.atan2(ra.y, ra.x) / DEG), Math.asin(clamp(ra.z, -1, 1)) / DEG);
		about.textContent = BODY_INFO[name][0];
		$('objSub').textContent = name === 'Sun' ? 'Our star' : name === 'Moon' ? `${state.moonPhase.name}, ${Math.round(state.moonPhase.fraction * 100)}% lit · in ${con}` : `Planet · in ${con}`;
		const v = tonight && tonight.rows[name];
		$('objWhen').innerHTML = name === 'Sun' ? (b.alt > 0 ? 'Up now. Never look straight at the Sun.' : 'Below the horizon.') : visSentence(name, v);
		fact('Position', b.alt < -0.5 ? `below the horizon, ${A.compass16(b.az)}` : dirText(b.az, b.altApp));
		if (name !== 'Sun') fact('Brightness', `magnitude ${b.mag.toFixed(1)}`);
		const ev = A.events(name, state.night ? state.night.start - 0.25 : state.t - 0.5, (state.night ? state.night.end : state.t + 0.5) + 0.25, p.lat, p.lon);
		const pick = (type) => ev.find((e) => e.type === type);
		const rise = pick('rise'), transit = ev.find((e) => e.type === 'transit' && e.alt > 0), set = pick('set');
		if (rise) fact('Rises', `${tStr(rise.days)} · ${A.compass8(rise.az)}`);
		if (transit) fact('Highest', `${tStr(transit.days)} · ${Math.round(transit.alt)}° up`);
		if (set) fact('Sets', `${tStr(set.days)} · ${A.compass8(set.az)}`);
		fact('Distance', fmtDist(b.distKm));
		if (name !== 'Sun' && name !== 'Moon') {
			const el = A.elongation(name, state.t);
			fact('From the Sun', `${Math.abs(el).toFixed(0)}° ${el >= 0 ? 'east (evening side)' : 'west (morning side)'}`);
		}
		if (!ar.on) btn('Centre', () => lookAt(b.az, clamp(b.altApp, -10, 80)));
		if (!ar.on && v && v.visible && Math.abs(state.t - v.best) > 1 / 96) btn('Show at its best', () => { setTime(v.best, false); goToBody(name); });
		if (name !== 'Sun') {
			const a = document.createElement('a');
			a.className = 'pill accent';
			a.href = `/?t=${state.t.toFixed(5)}&view=top`;
			a.textContent = 'See why from space ›';
			a.title = 'Open the 3D orrery at this moment, looking down on the solar system';
			actions.append(a);
		}
		wikiLink(actions, BODY_INFO[name][1]);
	} else if (sel.kind === 'star') {
		const s = starIndex[sel.key];
		const w = _tmp.copy(s.v).applyMatrix4(eqToScene), aa = sceneToAzAlt(w);
		const [ra, dec] = STARS[sel.key];
		if (!ar.on) btn('Centre', () => lookAt(aa.az, clamp(aa.alt, -10, 80)));
		$('objName').textContent = s.name || s.desig || 'Star';
		$('objName').style.color = '#cfe0ff';
		$('objSub').textContent = `Star · in ${constellationAt(ra, dec)}`;
		$('objWhen').textContent = aa.alt < 0 ? 'Below the horizon right now.' : '';
		fact('Position', aa.alt < -0.5 ? `below the horizon, ${A.compass16(aa.az)}` : dirText(aa.az, aa.alt + A.refraction(aa.alt)));
		fact('Brightness', `magnitude ${s.mag.toFixed(1)}`);
		fact('Colour', s.bv < 0 ? 'blue-white' : s.bv < 0.3 ? 'white' : s.bv < 0.6 ? 'yellow-white' : s.bv < 1.0 ? 'yellow-orange' : s.bv < 1.4 ? 'orange' : 'red-orange');
		const key = sel.key;
		loadSkyInfo().then((m) => {
			if (!m || token !== showObject.seq) return;
			const info = m.STAR_INFO[key];
			about.textContent = m.starSentence(key) || '';
			if (!info) return;
			const [ly, spect, desig, title] = info;
			if (desig && desig !== s.name) $('objSub').textContent = `Star · ${desig} · in ${constellationAt(ra, dec)}`;
			if (ly != null) fact('Distance', `${ly.toLocaleString()} light-years`);
			if (spect) fact('Type', spect);
			if (title) wikiLink(actions, title);
		});
	} else {
		const c = constLabels[sel.key];
		$('objName').textContent = c.name;
		$('objName').style.color = '#b9cbf2';
		$('objSub').textContent = 'Constellation';
		$('objWhen').textContent = '';
		const w = _tmp.copy(c.v).applyMatrix4(eqToScene), aa = sceneToAzAlt(w);
		fact('Position', aa.alt < 0 ? `below the horizon, ${A.compass16(aa.az)}` : dirText(aa.az, aa.alt));
		if (!ar.on) btn('Centre', () => lookAt(aa.az, clamp(aa.alt, -10, 80)));
		loadSkyInfo().then((m) => {
			if (!m || token !== showObject.seq) return;
			const info = m.CONST_INFO[c.abbr];
			if (!info) return;
			const [meaning, title, note] = info;
			if (meaning) $('objSub').textContent = `Constellation · ${meaning}`;
			if (note) about.textContent = note;
			if (title) wikiLink(actions, title);
		});
	}
	openSheet('object');
}
const _inv = new THREE.Matrix4();

// ---- Sheet ---------------------------------------------------------------------------------
let activePanel = null;
const PANELS = { tonight: 'panelTonight', object: 'panelObject', place: 'panelPlace', menu: 'panelMenu' };
const wide = () => matchMedia('(min-width: 900px)').matches;
function openSheet(which) {
	activePanel = which;
	for (const [k, id] of Object.entries(PANELS)) $(id).classList.toggle('active', k === which);
	const sh = $('sheet');
	sh.classList.add('open');
	sh.classList.toggle('peek', ar.on && which === 'object');
	sh.setAttribute('aria-hidden', 'false');
	document.body.classList.toggle('docked', wide());
	$('sheetBody').scrollTop = 0;
	if (which === 'place') setTimeout(() => $('placeSearch').focus({ preventScroll: true }), wide() ? 50 : 300);
}
function closeSheet() {
	if (!renderer && activePanel === 'tonight') return;
	const sh = $('sheet');
	sh.classList.remove('open');
	sh.setAttribute('aria-hidden', 'true');
	document.body.classList.remove('docked');
	const was = activePanel;
	if (was === 'object' && state.selected) { state.selected = null; selRing.visible = false; renderChips(); }
	activePanel = null;
	if (was === 'object' && wide() && !ar.on) openSheet('tonight');
}
const sheetOpen = () => $('sheet').classList.contains('open');
$('sheetClose').addEventListener('click', closeSheet);
$('tonightBtn').addEventListener('click', () => activePanel === 'tonight' ? closeSheet() : openSheet('tonight'));
$('menuBtn').addEventListener('click', () => { if (activePanel === 'menu') return closeSheet(); syncCopyButtons(); openSheet('menu'); });
$('placeBtn').addEventListener('click', () => { renderPlaceResults(''); fillTzSelect(); openSheet('place'); });
// Current UTC offset of a zone, in minutes.
function tzOffsetMin(tz, d = new Date()) {
	const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
		.formatToParts(d).map((x) => [x.type, x.value]));
	return Math.round((Date.UTC(+p.year, p.month - 1, +p.day, +p.hour % 24, +p.minute) - d.getTime()) / 60000);
}
// Every zone the city list knows plus this device's, so any place can be given the right clock.
function fillTzSelect() {
	const sel = $('tzSelect');
	if (!sel.options.length) {
		for (const z of [...new Set([deviceTz, ...TZS])].filter(validTz).sort()) sel.add(new Option(z.replace(/_/g, ' ') + (z === deviceTz ? ' (this device)' : ''), z));
	}
	if (![...sel.options].some((o) => o.value === state.place.tz)) sel.add(new Option(state.place.tz.replace(/_/g, ' '), state.place.tz));
	sel.value = state.place.tz;
}
// Swipe the sheet down to close it (phones).
(function () {
	let y0 = null;
	const head = $('sheetHead');
	// Not from the close button (capturing the pointer there stole its click), and no capture at all:
	// a downward swipe that ends anywhere still counts via the window listener below.
	head.addEventListener('pointerdown', (e) => { y0 = e.target.closest('button') ? null : e.clientY; });
	addEventListener('pointerup', (e) => { if (y0 != null && e.clientY - y0 > 40) closeSheet(); y0 = null; });
})();

// ---- Time controls -----------------------------------------------------------------------------
function setTime(t, live) {
	if (t < T_MIN || t > T_MAX) { toast(RANGE_TEXT); t = clamp(t, T_MIN, T_MAX); }
	state.rangeMsg = null;
	state.t = t;
	state.live = !!live;
	const n = state.night;
	if (!n || t < n.start - 1e-6 || t > n.end + 1e-6) computeTonight();
	updateTimeUI();
	dirty = true;
}
function updateTimeUI() {
	const d = daysToDate(state.t);
	$('timeMain').textContent = fmtTime.format(d);
	const n = state.night, live = state.live;
	// Not now: the time row turns amber, leads with how far off the shown moment is ("In 5 h"),
	// and its Now button becomes the loudest thing in it.
	const rel = live ? 'Now' : cap(fromNow(state.t));
	const rest = [dayStr(state.t), state.place.tz !== deviceTz ? zoneName(state.t) : ''].filter(Boolean).join(' · ');
	const sub = $('timeSub');
	if (sub.dataset.k !== rel + '|' + rest) {
		sub.dataset.k = rel + '|' + rest;
		const r = document.createElement('b');
		r.className = 'rel';
		r.textContent = rel;
		sub.replaceChildren(r, ' · ' + rest);
	}
	$('timeRow').classList.toggle('offnow', !live);
	document.body.classList.toggle('offnow', !live);
	const nb = $('nowBtn'), label = live ? 'Live' : 'Back to now';
	if (nb.textContent !== label) {
		nb.textContent = label;
		nb.title = live ? 'Showing the sky right now' : 'Back to the sky right now';
	}
	nb.classList.toggle('live', live);
	if (n) {
		$('scrub').value = String(Math.round(clamp((state.t - n.start) / (n.end - n.start), 0, 1) * 1000));
		// Daylight before the night's window: the thumb has no true place on the bar, so it fades and the bar says so.
		$('scrubWrap').classList.toggle('day', state.t < n.start - 1e-6);
	}
	$('datePick').value = localDate(n ? n.start + 0.02 : state.t);
	const msg = state.rangeMsg || (state.t < T_GOOD_MIN || state.t > T_GOOD_MAX
		? 'Approximate: this map is most accurate between 1800 and 2200. This far out, positions can be off by up to about half a degree and times by a minute or two.' : '');
	const note = $('rangeNote');
	if (note.textContent !== msg) note.textContent = msg;
	note.hidden = !msg;
	$('arNow').hidden = !(ar.on && !live);
	if (ar.on && ar.src) arStatus(ar.src.status);
}
function renderScrub() {
	const n = state.night, wrap = $('scrubWrap'), ticks = $('scrubTicks');
	ticks.textContent = '';
	if (!n) return;
	const span = n.end - n.start;
	const pct = (d) => (d - n.start) / span * 100;
	// Background: daylight -> twilight -> night, from the Sun's altitude along the window.
	const stops = [];
	for (let i = 0; i <= 24; i++) {
		const d = n.start + span * i / 24, sa = A.sunAltitude(d, state.place.lat, state.place.lon);
		const k = clamp((sa + 18) / 24, 0, 1);
		const c = [Math.round(10 + 60 * k * k), Math.round(16 + 110 * k * k), Math.round(32 + 170 * k)];
		stops.push(`rgb(${c[0]},${c[1]},${c[2]}) ${(i / 24 * 100).toFixed(1)}%`);
	}
	wrap.style.background = `linear-gradient(90deg, ${stops.join(', ')})`;
	const tick = (d, label, cls = '') => {
		if (d == null || d < n.start || d > n.end) return;
		const el = document.createElement('div');
		el.className = 'tick ' + cls + (pct(d) > 80 ? ' right' : '');
		el.style.left = pct(d).toFixed(2) + '%';
		if (label) { const s = document.createElement('span'); s.textContent = label; el.append(s); }
		ticks.append(el);
	};
	tick(n.sunset, 'Sunset');
	tick(n.sunrise, 'Sunrise');
	if (n.astroDusk != null && pct(n.astroDusk) - pct(n.sunset ?? n.start) > 14) tick(n.astroDusk, 'Dark');
	const now = dateToDays(new Date());
	tick(now, '', 'now');
}
$('scrub').addEventListener('input', (e) => {
	const n = state.night;
	if (!n) return;
	const t = n.start + (n.end - n.start) * (+e.target.value / 1000);
	state.t = t; state.live = false; state.rangeMsg = null;
	updateTimeUI(); dirty = true;
});
$('nowBtn').addEventListener('click', () => { setTime(dateToDays(new Date()), true); computeTonight(); });
$('prevNight').addEventListener('click', () => { state.night = null; setTime(state.t - 1, false); });
$('nextNight').addEventListener('click', () => { state.night = null; setTime(state.t + 1, false); });
$('datePick').addEventListener('change', (e) => {
	const v = e.target.value;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !state.night) return;
	// Keep the same point in the night, moved to the chosen date.
	const cur = localDate(state.night.start + 0.02);
	const diff = Math.round((Date.parse(v) - Date.parse(cur)) / 86400000);
	if (!diff) return;
	state.night = null;
	setTime(state.t + diff, false);
});
// A tap anywhere on the time opens the native date picker where showPicker exists.
$('datePick').addEventListener('click', (e) => { try { e.target.showPicker(); } catch (err) { /* the input opens its own picker */ } });

// ---- Place: search, GPS ---------------------------------------------------------------------------
function setPlace(pl, why) {
	// A time picked inside the night stays in the night at the new place; any other moment
	// (an orrery link to a daytime instant, say) is kept exactly.
	const n0 = state.night, inNight = !state.live && n0 && state.t >= n0.start && state.t <= n0.end;
	state.place = { ...pl, why };
	setFormatters();
	$('placeName').textContent = state.place.name;
	state.night = null;
	if (state.live) state.t = dateToDays(new Date());
	computeTonight();
	if (inNight && (state.t < state.night.start || state.t > state.night.end)) setTime(defaultTimeFor(state.night), false);
	updateSky(true);
	updateTimeUI();
	save();
	dirty = true;
}
function renderPlaceResults(q) {
	const ul = $('placeResults');
	ul.textContent = '';
	const idx = q.trim() ? searchCities(q, 8) : [];
	for (const i of idx) {
		const li = document.createElement('li');
		const b = document.createElement('button');
		const c = CITIES[i];
		b.append(c[0]);
		const where = document.createElement('span'); where.className = 'where';
		where.textContent = cityLabel(i).slice(c[0].length).replace(/^,\s*/, '');
		b.append(where);
		b.addEventListener('click', () => { setPlace(placeFromCity(i, 'search'), 'search'); closeSheet(); $('placeSearch').value = ''; });
		li.append(b);
		ul.append(li);
	}
}
$('placeSearch').addEventListener('input', (e) => renderPlaceResults(e.target.value));
$('tzSelect').addEventListener('change', (e) => { if (validTz(e.target.value)) { setPlace({ ...state.place, tz: e.target.value }, state.place.why); toast(`Times now in ${e.target.value.replace(/_/g, ' ')}`); } });
$('placeSearch').addEventListener('focus', () => { searchCities('a', 1); }, { once: true });
$('placeSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const f = $('placeResults').querySelector('button'); if (f) f.click(); } });
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const STANDALONE = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
$('gpsBtn').addEventListener('click', () => {
	const msg = $('gpsMsg');
	msg.hidden = true;
	if (!navigator.geolocation) { msg.textContent = 'This browser cannot share a location. Search for your city instead.'; msg.hidden = false; return; }
	$('gpsBtn').disabled = true;
	navigator.geolocation.getCurrentPosition((pos) => {
		$('gpsBtn').disabled = false;
		// About 1 km is plenty for the sky and keeps less of the position than the phone gives.
		const lat = +pos.coords.latitude.toFixed(2), lon = +pos.coords.longitude.toFixed(2);
		const near = nearestCity(lat, lon), cityTz = TZS[CITIES[near][5]];
		// The phone is physically here, so its own zone is the safer clock: the nearest town's zone can
		// be wrong near borders, on islands and at sea. The picker under the place name can change it.
		const tz = validTz(deviceTz) ? deviceTz : cityTz;
		setPlace({ name: 'My location', label: `My location (near ${CITIES[near][0]})`, lat, lon, tz }, 'gps');
		closeSheet();
		toast(tzOffsetMin(tz) !== tzOffsetMin(cityTz)
			? `Using your location, near ${CITIES[near][0]}. Times are in this device's time zone (${tz.replace(/_/g, ' ')}); change it under the place name if that's wrong.`
			: `Using your location, near ${CITIES[near][0]}`, 5000);
	}, (err) => {
		$('gpsBtn').disabled = false;
		let t = 'Could not get your location. Search for your city instead — city-level is plenty for the sky.';
		if (err.code === 1) {
			t = IOS && STANDALONE
				? 'Location is blocked. On iPhone, an app added to the Home Screen needs Settings › Privacy & Security › Location Services › System Services › In-App Web Browsing switched on - then close this app fully and open it again. Or search for your city.'
				: IOS ? 'Location is blocked. Allow it in Settings › Privacy & Security › Location Services for your browser, or search for your city.'
					: 'Location is blocked for this site. Allow it in the browser’s site settings, or search for your city.';
		}
		msg.textContent = t; msg.hidden = false;
	}, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
});

// ---- Settings -------------------------------------------------------------------------------------
const OPT_IDS = { lines: 'optLines', cnames: 'optCNames', snames: 'optSNames', milky: 'optMilky', grid: 'optGrid', ground: 'optGround', red: 'optRed' };
function applyOpts() {
	const o = state.opts;
	constLines.visible = o.lines;
	altGrid.visible = o.grid;
	if (o.milky) ensureMilky();
	groundMat.uniforms.uOpacity.value = o.ground ? (camOn() ? 0.55 : 0.94) : 0.0;
	$('redFilter').hidden = !o.red;
	if (milky) milky.material.opacity = o.milky ? MILKY_MAX * clamp((-sunAlt - 12) / 6, 0, 1) : 0;
	for (const [k, id] of Object.entries(OPT_IDS)) $(id).checked = !!o[k];
	dirty = true;
}
for (const [k, id] of Object.entries(OPT_IDS)) $(id).addEventListener('change', (e) => { state.opts[k] = e.target.checked; applyOpts(); save(); });
// Share links. With "My location" in use, the ordinary link carries the nearest town instead, and
// a separate, clearly labelled button shares the device's own position.
function skyLink(p, withLabel) {
	const q = new URLSearchParams({ at: `${p.lat},${p.lon}` });
	if (withLabel) q.set('place', p.label);
	q.set('tz', p.tz);
	if (!state.live) q.set('t', state.t.toFixed(4));
	q.set('look', `${state.look.az.toFixed(0)},${state.look.alt.toFixed(0)},${state.fov.toFixed(0)}`);
	return `${location.origin}/night-sky/?${q}`;
}
async function copyText(url, done) {
	try { await navigator.clipboard.writeText(url); toast(done); } catch (e) { prompt('Copy this link', url); }
}
function syncCopyButtons() {
	const gps = state.place.why === 'gps';
	$('copyLink').textContent = gps ? `Copy a link (shows ${CITIES[nearestCity(state.place.lat, state.place.lon)][0]})` : 'Copy a link to this sky';
	$('copyExact').hidden = !gps;
	$('copyNote').hidden = !gps;
}
$('copyLink').addEventListener('click', () => {
	const p = state.place;
	if (p.why === 'gps') copyText(skyLink(placeFromCity(nearestCity(p.lat, p.lon)), true), 'Link copied (nearest town, not your location)');
	else copyText(skyLink(p, p.name !== 'My location'), 'Link copied');
});
$('copyExact').addEventListener('click', () => copyText(skyLink(state.place, false), 'Link with your location copied'));

let toastTimer = 0;
function toast(text, ms = 2600) {
	const t = $('toast');
	t.textContent = text;
	t.classList.add('show');
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---- AR: point the phone at the sky ------------------------------------------------------------------
const ar = { on: false, src: null, nudge: 0, decl: 0, stream: null, savedLook: null, savedFov: 70, nudgeTimer: 0, wake: null };
const camOn = () => !!ar.stream;
function arFovNow() { return camOn() ? (state.camFov || autoCamFov()) : (state.arFov || autoArFov()); }
function setArFov(f) { if (camOn()) state.camFov = f; else state.arFov = f; }
// A phone's main camera sees about 67° along the long side of the frame; with
// object-fit: cover the screen shows the long side (portrait) or a crop of it.
function autoCamFov() {
	const v = $('camFeed'), vw = v.videoWidth || 1080, vh = v.videoHeight || 1920;
	const long = 67 * DEG, va = vw / vh, sa = innerWidth / innerHeight;
	const vFovV = vh >= vw ? long : 2 * Math.atan(Math.tan(long / 2) / va);       // video's own vertical FOV
	const shown = sa < va ? vFovV : 2 * Math.atan(Math.tan(vFovV / 2) * va / sa);  // cover-crop
	return clamp(shown / DEG, 20, 100);
}
function autoArFov() { return innerHeight > innerWidth ? 67 : 45; }
if (renderer && isTouch && typeof DeviceOrientationEvent !== 'undefined') $('arBtn').hidden = false;
$('arBtn').addEventListener('click', startAR);
$('arExit').addEventListener('click', stopAR);
$('reticleName').addEventListener('click', () => { if (ar.on && ar.reticleSel) select({ ...ar.reticleSel }); });
$('arNow').addEventListener('click', () => { setTime(dateToDays(new Date()), true); computeTonight(); arStatus(ar.src && ar.src.status); });
$('camBtn').addEventListener('click', () => camOn() ? stopCamera() : startCamera());
async function startAR() {
	closeSheet();
	clearTimeout(toastTimer); $('toast').classList.remove('show'); // start-up hints would cover the AR status
	ar.src = new OrientationSource();
	ar.src.onstatus = arStatus;
	let ok = false;
	try { ok = await ar.src.start(); } catch (e) { ok = false; }
	if (ar.src.status === 'denied') { toast('Motion sensors are blocked. Allow them in the browser’s site settings to use this.'); ar.src.stop(); ar.src = null; return; }
	ar.on = true;
	ar.savedLook = { ...state.look }; ar.savedFov = state.fov;
	// The phone measures today's magnetic field, whatever date the map is showing.
	try { ar.decl = declination(state.place.lat, state.place.lon, decimalYear(new Date())); } catch (e) { ar.decl = 0; }
	document.body.classList.add('ar');
	$('topBar').hidden = true; $('arBar').hidden = false; $('reticle').hidden = false;
	updateTimeUI(); // shows Back to now at once when the map is on another time; also sets the status
	try { ar.wake = await navigator.wakeLock.request('screen'); } catch (e) { ar.wake = null; }
	dirty = true;
	void ok;
}
function arStatus(s) {
	const el = $('arStatus');
	if (!ar.on) return;
	const unsure = ar.src && ar.src.accuracy != null && ar.src.accuracy >= 25;
	const msg = s === 'ok' ? (unsure ? 'Compass is unsure: move your phone in a figure of eight' : state.live ? 'Drag sideways to line up · pinch to zoom' : '')
		// iPhone: the compass offset is learnt while the phone is flat or upright facing the horizon.
		: s === 'waiting' ? (unsure ? 'Move your phone in a figure of eight to wake the compass' : ar.src && ar.src.calibrating ? 'Hold the phone upright, facing the horizon, for a moment' : 'Starting the compass…')
		: s === 'relative-only' ? (IOS ? 'This phone is not giving a compass direction, so the map cannot follow it.' : 'This browser gives no compass direction. Try Chrome.')
		: s === 'unsupported' ? 'No motion sensors found on this device.'
		: s === 'denied' ? 'Motion sensors are blocked for this site.' : null;
	if (msg == null) return;
	// Another time: amber, and said first, above any compass message.
	el.classList.toggle('off', !state.live);
	if (state.live) { el.textContent = msg; return; }
	const b = document.createElement('b'), when = document.createElement('span');
	b.textContent = 'Not the sky right now';
	when.textContent = `${fmtTime.format(daysToDate(state.t))} · ${dayStr(state.t)} · ${fromNow(state.t)}`;
	const parts = [b, when];
	if (msg) { const m = document.createElement('span'); m.className = 'msg'; m.textContent = msg; parts.push(m); }
	el.replaceChildren(...parts);
}
function stopAR() {
	if (!ar.on) return;
	// Keep looking where the phone pointed, so the switch back is seamless.
	const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
	const aa = sceneToAzAlt(dir);
	state.look = { az: aa.az, alt: clamp(aa.alt, -60, 85) };
	state.fov = clamp(camera.fov, 10, 100);
	stopCamera();
	if (ar.src) ar.src.stop();
	ar.src = null; ar.on = false;
	if (ar.wake) { ar.wake.release().catch(() => {}); ar.wake = null; }
	document.body.classList.remove('ar');
	$('sheet').classList.remove('peek');
	$('topBar').hidden = false; $('arBar').hidden = true; $('reticle').hidden = true; $('pointer').hidden = true;
	save();
	dirty = true;
}
function showNudge() {
	const el = $('arStatus');
	el.textContent = `Lined up by ${ar.nudge >= 0 ? '+' : ''}${ar.nudge.toFixed(0)}°`;
	clearTimeout(ar.nudgeTimer);
	ar.nudgeTimer = setTimeout(() => arStatus(ar.src && ar.src.status), 1600);
}
async function startCamera() {
	if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('This browser cannot show the camera here.'); return; }
	try {
		ar.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
	} catch (e) {
		ar.stream = null;
		toast(e && e.name === 'NotAllowedError' ? 'Camera access was refused.' : 'Could not start the camera.');
		return;
	}
	const v = $('camFeed');
	v.srcObject = ar.stream;
	v.hidden = false;
	try { await v.play(); } catch (e) { /* autoplay with muted+playsinline normally succeeds */ }
	$('camBtn').setAttribute('aria-pressed', 'true');
	applyOpts();
	dirty = true;
}
function stopCamera() {
	if (ar.stream) for (const tr of ar.stream.getTracks()) tr.stop();
	ar.stream = null;
	const v = $('camFeed');
	v.srcObject = null; v.hidden = true;
	$('camBtn').setAttribute('aria-pressed', 'false');
	applyOpts();
	dirty = true;
}
addEventListener('visibilitychange', () => {
	if (document.hidden && camOn()) stopCamera();
	if (!document.hidden && ar.on && ar.wake === null) navigator.wakeLock?.request('screen').then((w) => { ar.wake = w; }).catch(() => {});
});

// The arrow that points the way to the selected object when it is off screen.
function updatePointer() {
	const el = $('pointer');
	const w = selectedWorld();
	if (!w || !state.selected) { el.hidden = true; return; }
	_v.copy(w).project(camera);
	const behind = _v.z > 1;
	let x = _v.x, y = _v.y;
	if (behind) { x = -x; y = -y; }
	const onScreen = !behind && Math.abs(x) < 0.92 && Math.abs(y) < 0.88;
	if (onScreen) { el.hidden = true; return; }
	// Direction in pixels from the centre, clamped to an inset ellipse.
	let dx = x * innerWidth / 2, dy = -y * innerHeight / 2;
	if (behind && Math.hypot(dx, dy) < 1) dx = 1;
	const ang = Math.atan2(dy, dx);
	const rx = innerWidth / 2 - 46, ry = innerHeight / 2 - (ar.on ? 120 : 170);
	const px = innerWidth / 2 + Math.cos(ang) * rx, py = innerHeight / 2 + Math.sin(ang) * ry;
	el.hidden = false;
	el.style.transform = `translate3d(${px.toFixed(0)}px,${py.toFixed(0)}px,0) translate(-50%,-50%)`;
	$('pointerArrow').style.transform = `rotate(${(ang / DEG + 90).toFixed(1)}deg)`;
	const s = state.selected;
	$('pointerText').textContent = s.kind === 'body' ? s.key : (starIndex[s.key].name || 'Star');
}
// What sits under the AR reticle.
function updateReticle() {
	let best = null, target = null, bd = 6 * camera.fov / 67; // degrees
	const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
	for (const name of BODIES) {
		const b = bodyObjs[name];
		const d = Math.acos(clamp(fwd.dot(b.pos), -1, 1)) / DEG;
		if (d < bd && (b.alt > -1 || !state.opts.ground)) {
			bd = d;
			best = name === 'Moon' ? 'The Moon' : name === 'Sun' ? 'The Sun' : bodyVisibleNow(b) ? name : `${name} (${b.mag > 6.5 ? 'telescope' : 'binoculars'})`;
			target = { kind: 'body', key: name };
		}
	}
	if (!best) {
		let sd = 3.5 * camera.fov / 67;
		for (let i = 0; i < starIndex.length; i++) {
			const s = starIndex[i];
			if (!(s.name || s.desig) || s.mag > 3.5) continue;
			_tmp.copy(s.v).applyMatrix4(eqToScene);
			const d = Math.acos(clamp(fwd.dot(_tmp), -1, 1)) / DEG;
			if (d < sd) { sd = d; best = s.name || s.desig; target = { kind: 'star', key: i }; }
		}
	}
	if (!best) {
		const raDec = fwd.clone().applyMatrix4(_inv.copy(eqToScene).invert());
		const aa = sceneToAzAlt(fwd);
		const con = constellationAt(wrap360(Math.atan2(raDec.y, raDec.x) / DEG), Math.asin(clamp(raDec.z, -1, 1)) / DEG);
		best = aa.alt < -2 ? `Below the horizon · ${A.compass16(aa.az)}` : `${con} · ${A.compass16(aa.az)} ${Math.round(aa.alt)}°`;
		const ci = aa.alt < -2 ? -1 : constLabels.findIndex((c) => c.name === con);
		if (ci >= 0) target = { kind: 'const', key: ci };
	}
	ar.reticleSel = target;
	const el = $('reticleName');
	if (el.textContent !== best) el.textContent = best;
	el.classList.toggle('tap', !!target);
}

// ---- Defaults: when to show, where to look --------------------------------------------------------
// A good time to look on night n: half an hour after nautical dusk. Used when a time picked in the
// night lands in daylight at a newly chosen place. (The page itself always opens on now, or a link's ?t=.)
function defaultTimeFor(n) {
	if (n.polar === 'day' || n.sunset == null) return state.t;
	const dark = n.nauticalDusk ?? n.civilDusk ?? n.sunset + 1 / 24;
	return Math.min(dark + 0.5 / 24, n.end);
}
function defaultLook() {
	// The brightest planet or the Moon that is well up; otherwise the equator-facing horizon.
	let best = null;
	for (const name of ['Venus', 'Jupiter', 'Moon', 'Mars', 'Saturn', 'Mercury']) {
		const b = bodyObjs[name];
		if (b.alt > 12 && bodyVisibleNow(b) && (!best || b.mag < best.mag)) best = b;
	}
	const fov = innerHeight > innerWidth ? 90 : 62;
	const low = fov * 0.27; // looking this high puts the horizon about three-quarters of the way down
	if (best) return { az: best.az, alt: clamp(Math.max(low, best.alt - fov * 0.15), low, 60), fov };
	return { az: state.place.lat >= 0 ? 180 : 0, alt: low + 5, fov };
}

// ---- Resize, loop, start --------------------------------------------------------------------------
function onResize() {
	if (!renderer) return;
	renderer.setSize(innerWidth, innerHeight);
	camera.aspect = innerWidth / innerHeight;
	camera.updateProjectionMatrix();
	starMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
	dirty = true;
}
addEventListener('resize', onResize);

let lastLiveTick = 0, lastNightCheck = 0;
function frame(now) {
	if (state.live && now - lastLiveTick > 1000) {
		lastLiveTick = now;
		state.t = dateToDays(new Date());
		updateTimeUI();
		dirty = true;
	}
	if (now - lastNightCheck > 60000) {
		lastNightCheck = now;
		if (state.night && state.t > state.night.end) computeTonight();
		if (!state.live) updateTimeUI(); // "in 5 h" counts down
	}
	if (anim) { anim(now); dirty = true; }
	if (!drag && !pinch && !ar.on && (Math.abs(vel.az) > 0.01 || Math.abs(vel.alt) > 0.01)) {
		state.look = { az: wrap360(state.look.az + vel.az), alt: clamp(state.look.alt + vel.alt, -60, 89) };
		vel.az *= 0.92; vel.alt *= 0.92;
		dirty = true;
	}
	if (updateSky()) dirty = true;
	if (ar.on && ar.src && ar.src.status === 'ok') {
		const q = ar.src.getCameraQuat(ar.decl + ar.nudge);
		camera.quaternion.set(q[0], q[1], q[2], q[3]);
		camera.updateMatrixWorld();
		const f = arFovNow();
		if (Math.abs(camera.fov - f) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); starMat.uniforms.uZoom.value = zoomScale(); }
		dirty = true;
	} else if (dirty && !ar.on) applyLook();
	if (!dirty) return;
	dirty = false;
	dome.visible = !camOn();
	layoutBodies();
	updateLabels();
	updatePointer();
	if (ar.on) updateReticle();
	if (renderer) renderer.render(scene, camera);
}

function start() {
	setFormatters();
	$('placeName').textContent = state.place.name;
	// Always opens on now (or a link's ?t=), never jumps ahead to tonight; in daylight the time bar
	// and a toast say how to get to the night.
	computeTonight();
	updateSky(true);
	if (!state.lookFromLink) { const d = defaultLook(); state.look = { az: d.az, alt: d.alt }; state.fov = d.fov; }
	applyOpts();
	applyLook();
	updateTimeUI();
	if (wide() || !renderer) openSheet('tonight');
	if (renderer) renderer.setAnimationLoop(frame);
	else setInterval(() => frame(performance.now()), 1000); // keeps the live time and list current
	requestAnimationFrame(() => { const l = $('loading'); l.classList.add('done'); setTimeout(() => l.remove(), 400); });
	const hints = [];
	if (state.place.why === 'guess') hints.push(`Showing the sky from ${state.place.name}. Tap the place name to change it.`);
	if (sunAlt > -0.8333 && state.night.polar !== 'day' && state.t < state.night.start) {
		hints.push(state.live ? 'It’s daytime, so the stars are hidden: slide the time bar to see tonight.'
			: 'That moment is in daylight, so the stars are hidden: slide the time bar to see the night.');
	}
	if (hints.length) toast(hints.join(' '), 2600 + 1800 * hints.length);
}
start();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
	navigator.serviceWorker.register('/sw.js').catch(() => { /* optional */ });
}

// Headless-test hook (same convention as the other fleet sites).
window.__SKY = { state, bodyObjs, camera, A, select, setTime, setPlace, ar, starIndex, project, lookAt, visSentence, renderer };

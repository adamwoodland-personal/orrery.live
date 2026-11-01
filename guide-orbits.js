// Orbital model for orrery.live's guide pages (/now/, /planetary-alignment/).
// Generated from app.js on 2026-11-01: the element table is a verbatim copy of the
// planetsData `el` rows there (JPL/Standish long-range Keplerian elements,
// fitted for 3000 BC – 3000 AD) and heliocentric() is the same Kepler solver,
// so the text pages agree with the 3D view without loading three.js. The
// Earth–Moon-barycentre → Earth-centre step that app.js applies is omitted
// here (3e-5 AU, far below anything these pages print). If app.js's elements
// or solver ever change, regenerate this file rather than editing it.
export const J2000 = 2451545.0;
export const AU_KM = 149597870.7;
export const LIGHT_S_PER_AU = 499.004784; // light time for one AU, seconds
const DEG = Math.PI / 180, RAD = 180 / Math.PI;

export const EL = {
	Mercury: { a:[0.38709843,0.0], e:[0.20563661,0.00002123], I:[7.00559432,-0.00590158], L:[252.25166724,149472.67486623], peri:[77.45771895,0.15940013], node:[48.33961819,-0.12214182] },
	Venus: { a:[0.72332102,-0.00000026], e:[0.00676399,-0.00005107], I:[3.39777545,0.00043494], L:[181.97970850,58517.81560260], peri:[131.76755713,0.05679648], node:[76.67261496,-0.27274174] },
	Earth: { a:[1.00000018,-0.00000003], e:[0.01673163,-0.00003661], I:[-0.00054346,-0.01337178], L:[100.46691572,35999.37306329], peri:[102.93005885,0.31795260], node:[-5.11260389,-0.24123856] },
	Mars: { a:[1.52371243,0.00000097], e:[0.09336511,0.00009149], I:[1.85181869,-0.00724757], L:[-4.56813164,19140.29934243], peri:[-23.91744784,0.45223625], node:[49.71320984,-0.26852431] },
	Jupiter: { a:[5.20248019,-0.00002864], e:[0.04853590,0.00018026], I:[1.29861416,-0.00322699], L:[34.33479152,3034.90371757], peri:[14.27495244,0.18199196], node:[100.29282654,0.13024619], bcsf:[-0.00012452,0.06064060,-0.35635438,38.35125] },
	Saturn: { a:[9.54149883,-0.00003065], e:[0.05550825,-0.00032044], I:[2.49424102,0.00451969], L:[50.07571329,1222.11494724], peri:[92.86136063,0.54179478], node:[113.63998702,-0.25015002], bcsf:[0.00025899,-0.13434469,0.87320147,38.35125] },
	Uranus: { a:[19.18797948,-0.00020455], e:[0.04685740,-0.00001550], I:[0.77298127,-0.00180155], L:[314.20276625,428.49512595], peri:[172.43404441,0.09266985], node:[73.96250215,0.05739699], bcsf:[0.00058331,-0.97731848,0.17689245,7.67025] },
	Neptune: { a:[30.06952752,0.00006447], e:[0.00895439,0.00000818], I:[1.77005520,0.00022400], L:[304.22289287,218.46515314], peri:[46.68158724,0.01009938], node:[131.78635853,-0.00606302], bcsf:[-0.00041348,0.68346318,-0.10162547,7.67025] },
	Pluto: { a:[39.48686035,0.00449751], e:[0.24885238,0.00006016], I:[17.14104260,0.00000501], L:[238.96535011,145.18042903], peri:[224.09702598,-0.00968827], node:[110.30167986,-0.00809981], bcsf:[-0.01262724,0.0,0.0,0.0] },
};
// Orbit spacing used by the orrery's compact view (displayA in app.js), so the
// top-down map matches what the 3D view shows.
export const DISPLAY_A = { Mercury: 2.6, Venus: 3.7, Earth: 4.9, Mars: 6.1, Jupiter: 8.9, Saturn: 11.4, Uranus: 13.3, Neptune: 14.8, Pluto: 16.3 };
export const PLANETS = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
export const NAKED_EYE = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];

export function dateToDays(date) { return date.getTime() / 86400000 + 2440587.5 - J2000; }
export function daysToDate(days) { return new Date(Math.round((days + J2000 - 2440587.5) * 86400000)); }
export const wrap360 = (x) => ((x % 360) + 360) % 360;
export const wrap180 = (x) => ((x + 180) % 360 + 360) % 360 - 180;

// Heliocentric ecliptic position (AU, J2000 frame) from elements at century T.
export function heliocentric(el, T) {
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
	return { x, y, z };
}
export const helio = (name, days) => heliocentric(EL[name], days / 36525);

// Geocentric Moon (km, J2000 ecliptic): Meeus, Astronomical Algorithms ch. 47 — the ELP-2000/82
// series truncated to its 60 largest terms in longitude and distance and 60 in latitude (the same
// series as night-sky/astro.js) — rotated from the mean ecliptic and equinox of date to J2000 with
// the IAU 1976 precession. `days` is read as dynamical time, like the planets'. Checked against JPL
// Horizons DE441 geocentric vectors every 7 days 1900–2100 (10,436 dates): direction within 0.004°,
// distance within 0.004% (13 km). The low-precision formulae used before were up to 0.37° out.
export const EARTH_MOON_MASS = 1 / 82.30057; // Moon / (Earth + Moon)
export const MOON_A = 384400;                // km, mean distance (the display-radius reference)
export function moonGeocentric(days) {
	// Rows: multiples of D, M, M′, F, then the longitude (1e-6°) and distance (m) amplitudes
	// (Meeus table 47.A); latitude rows end with one amplitude in 1e-6° (table 47.B). Built once.
	const LR = moonGeocentric.LR ??= [
		0, 0, 1, 0, 6288774, -20905355, 2, 0, -1, 0, 1274027, -3699111, 2, 0, 0, 0, 658314, -2955968, 0, 0, 2, 0, 213618, -569925,
		0, 1, 0, 0, -185116, 48888, 0, 0, 0, 2, -114332, -3149, 2, 0, -2, 0, 58793, 246158, 2, -1, -1, 0, 57066, -152138,
		2, 0, 1, 0, 53322, -170733, 2, -1, 0, 0, 45758, -204586, 0, 1, -1, 0, -40923, -129620, 1, 0, 0, 0, -34720, 108743,
		0, 1, 1, 0, -30383, 104755, 2, 0, 0, -2, 15327, 10321, 0, 0, 1, 2, -12528, 0, 0, 0, 1, -2, 10980, 79661,
		4, 0, -1, 0, 10675, -34782, 0, 0, 3, 0, 10034, -23210, 4, 0, -2, 0, 8548, -21636, 2, 1, -1, 0, -7888, 24208,
		2, 1, 0, 0, -6766, 30824, 1, 0, -1, 0, -5163, -8379, 1, 1, 0, 0, 4987, -16675, 2, -1, 1, 0, 4036, -12831,
		2, 0, 2, 0, 3994, -10445, 4, 0, 0, 0, 3861, -11650, 2, 0, -3, 0, 3665, 14403, 0, 1, -2, 0, -2689, -7003,
		2, 0, -1, 2, -2602, 0, 2, -1, -2, 0, 2390, 10056, 1, 0, 1, 0, -2348, 6322, 2, -2, 0, 0, 2236, -9884,
		0, 1, 2, 0, -2120, 5751, 0, 2, 0, 0, -2069, 0, 2, -2, -1, 0, 2048, -4950, 2, 0, 1, -2, -1773, 4130,
		2, 0, 0, 2, -1595, 0, 4, -1, -1, 0, 1215, -3958, 0, 0, 2, 2, -1110, 0, 3, 0, -1, 0, -892, 3258,
		2, 1, 1, 0, -810, 2616, 4, -1, -2, 0, 759, -1897, 0, 2, -1, 0, -713, -2117, 2, 2, -1, 0, -700, 2354,
		2, 1, -2, 0, 691, 0, 2, -1, 0, -2, 596, 0, 4, 0, 1, 0, 549, -1423, 0, 0, 4, 0, 537, -1117,
		4, -1, 0, 0, 520, -1571, 1, 0, -2, 0, -487, -1739, 2, 1, 0, -2, -399, 0, 0, 0, 2, -2, -381, -4421,
		1, 1, 1, 0, 351, 0, 3, 0, -2, 0, -340, 0, 4, 0, -3, 0, 330, 0, 2, -1, 2, 0, 327, 0,
		0, 2, 1, 0, -323, 1165, 1, 1, -1, 0, 299, 0, 2, 0, 3, 0, 294, 0, 2, 0, -1, -2, 0, 8752];
	const LB = moonGeocentric.LB ??= [
		0, 0, 0, 1, 5128122, 0, 0, 1, 1, 280602, 0, 0, 1, -1, 277693, 2, 0, 0, -1, 173237, 2, 0, -1, 1, 55413, 2, 0, -1, -1, 46271,
		2, 0, 0, 1, 32573, 0, 0, 2, 1, 17198, 2, 0, 1, -1, 9266, 0, 0, 2, -1, 8822, 2, -1, 0, -1, 8216, 2, 0, -2, -1, 4324,
		2, 0, 1, 1, 4200, 2, 1, 0, -1, -3359, 2, -1, -1, 1, 2463, 2, -1, 0, 1, 2211, 2, -1, -1, -1, 2065, 0, 1, -1, -1, -1870,
		4, 0, -1, -1, 1828, 0, 1, 0, 1, -1794, 0, 0, 0, 3, -1749, 0, 1, -1, 1, -1565, 1, 0, 0, 1, -1491, 0, 1, 1, 1, -1475,
		0, 1, 1, -1, -1410, 0, 1, 0, -1, -1344, 1, 0, 0, -1, -1335, 0, 0, 3, 1, 1107, 4, 0, 0, -1, 1021, 4, 0, -1, 1, 833,
		0, 0, 1, -3, 777, 4, 0, -2, 1, 671, 2, 0, 0, -3, 607, 2, 0, 2, -1, 596, 2, -1, 1, -1, 491, 2, 0, -2, 1, -451,
		0, 0, 3, -1, 439, 2, 0, 2, 1, 422, 2, 0, -3, -1, 421, 2, 1, -1, 1, -366, 2, 1, 0, 1, -351, 4, 0, 0, 1, 331,
		2, -1, 1, 1, 315, 2, -2, 0, -1, 302, 0, 0, 1, 3, -283, 2, 1, 1, -1, -229, 1, 1, 0, -1, 223, 1, 1, 0, 1, 223,
		0, 1, -2, -1, -220, 2, 1, -1, -1, -220, 1, 0, 1, 1, -185, 2, -1, -2, -1, 181, 0, 1, 2, 1, -177, 4, 0, -2, -1, 176,
		4, -1, -1, -1, 166, 1, 0, 1, -1, -164, 4, 0, 1, -1, 132, 1, 0, -1, -1, -119, 4, -1, 0, -1, 115, 2, -2, 0, 1, 107];
	const T = days / 36525, sin = Math.sin, cos = Math.cos, AS = DEG / 3600;
	const p = (c0, c1, c2, c3, c4) => (c0 + T * (c1 + T * (c2 + T * (c3 + T * c4)))) * DEG;
	const Lp = p(218.3164477, 481267.88123421, -0.0015786, 1 / 538841, -1 / 65194000);   // mean longitude
	const D = p(297.8501921, 445267.1114034, -0.0018819, 1 / 545868, -1 / 113065000);    // mean elongation
	const M = p(357.5291092, 35999.0502909, -0.0001536, 1 / 24490000, 0);                // Sun's mean anomaly
	const Mp = p(134.9633964, 477198.8675055, 0.0087414, 1 / 69699, -1 / 14712000);      // Moon's mean anomaly
	const F = p(93.2720950, 483202.0175233, -0.0036539, -1 / 3526000, 1 / 863310000);    // argument of latitude
	const A1 = (119.75 + 131.849 * T) * DEG, A2 = (53.09 + 479264.290 * T) * DEG, A3 = (313.45 + 481266.484 * T) * DEG;
	const E = 1 - T * (0.002516 + 0.0000074 * T), Ek = [1, E, E * E]; // eccentricity factor for terms in M
	let sl = 3958 * sin(A1) + 1962 * sin(Lp - F) + 318 * sin(A2), sr = 0;
	let sb = -2235 * sin(Lp) + 382 * sin(A3) + 175 * sin(A1 - F) + 175 * sin(A1 + F) + 127 * sin(Lp - Mp) - 115 * sin(Lp + Mp);
	for (let i = 0; i < LR.length; i += 6) {
		const a = LR[i] * D + LR[i + 1] * M + LR[i + 2] * Mp + LR[i + 3] * F, e = Ek[Math.abs(LR[i + 1])];
		sl += LR[i + 4] * e * sin(a); sr += LR[i + 5] * e * cos(a);
	}
	for (let i = 0; i < LB.length; i += 5) sb += LB[i + 4] * Ek[Math.abs(LB[i + 1])] * sin(LB[i] * D + LB[i + 1] * M + LB[i + 2] * Mp + LB[i + 3] * F);
	const lam = Lp + sl * 1e-6 * DEG, bet = sb * 1e-6 * DEG, r = 385000.56 + sr / 1000;
	// Mean ecliptic of date -> mean equator of date (obliquity of date) -> J2000 equator (the
	// transposed IAU 1976 precession matrix, Meeus 21.2–21.4) -> J2000 ecliptic.
	const eps = (84381.448 - (46.8150 + (0.00059 - 0.001813 * T) * T) * T) * AS, eps0 = 84381.448 * AS;
	const xd = r * cos(bet) * cos(lam), yl = r * cos(bet) * sin(lam), zl = r * sin(bet);
	const yd = yl * cos(eps) - zl * sin(eps), zd = yl * sin(eps) + zl * cos(eps);
	const ze = (2306.2181 + (0.30188 + 0.017998 * T) * T) * T * AS;
	const zz = (2306.2181 + (1.09468 + 0.018203 * T) * T) * T * AS;
	const th = (2004.3109 - (0.42665 + 0.041833 * T) * T) * T * AS;
	const cz = cos(ze), sz = sin(ze), cZ = cos(zz), sZ = sin(zz), ct = cos(th), st = sin(th);
	const x = (cZ * ct * cz - sZ * sz) * xd + (sZ * ct * cz + cZ * sz) * yd + (st * cz) * zd;
	const y = (-cZ * ct * sz - sZ * cz) * xd + (-sZ * ct * sz + cZ * cz) * yd + (-st * sz) * zd;
	const z = (-cZ * st) * xd + (-sZ * st) * yd + ct * zd;
	return { x, y: y * cos(eps0) + z * sin(eps0), z: -y * sin(eps0) + z * cos(eps0) };
}

// A planet as seen from Earth: distances (AU), ecliptic longitude and the
// elongation from the Sun (degrees; positive = east of the Sun = evening sky).
export function geocentric(name, days) {
	const e = helio('Earth', days), p = helio(name, days);
	const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z;
	const sunLon = wrap360(Math.atan2(-e.y, -e.x) * RAD);
	const lon = wrap360(Math.atan2(dy, dx) * RAD);
	return { r: Math.hypot(dx, dy, dz), rSun: Math.hypot(p.x, p.y, p.z), lon, sunLon,
	         elong: wrap180(lon - sunLon), helioLon: wrap360(Math.atan2(p.y, p.x) * RAD) };
}
// Same thresholds as the orrery's tooltips.
export function skyPhrase(elong) {
	const a = Math.abs(elong);
	return a < 15 ? 'lost in the Sun’s glare' : a > 150 ? 'up most of the night' : elong > 0 ? 'evening sky' : 'morning sky';
}
// Apparent retrograde motion: geocentric longitude decreasing over ±1 day.
export function isRetrograde(name, days) {
	return wrap180(geocentric(name, days + 1).lon - geocentric(name, days - 1).lon) < 0;
}
// Next opposition of an outer planet (Earth passing it in heliocentric
// longitude), scanning daily from `from`. Returns days since J2000 or null.
export function nextOpposition(name, from) {
	const diff = (d) => { const p = helio(name, d), e = helio('Earth', d); return wrap180((Math.atan2(p.y, p.x) - Math.atan2(e.y, e.x)) * RAD); };
	let prev = diff(from);
	for (let d = from + 1; d <= from + 900; d++) { // Mars's synodic gaps reach ~811 days
		const cur = diff(d);
		if (Math.abs(prev) < 60 && Math.abs(cur) < 60 && Math.sign(cur) !== Math.sign(prev)) return d;
		prev = cur;
	}
	return null;
}
// Next greatest elongation of an inner planet: { days, east } or null.
export function nextElongation(name, from, minDeg) {
	const el = (d) => Math.abs(geocentric(name, d).elong);
	let e0 = el(from), e1 = el(from + 1);
	for (let d = from + 2; d <= from + 700; d++) {
		const e2 = el(d);
		if (e1 > e0 && e1 >= e2 && e1 > minDeg) return { days: d - 1, east: geocentric(name, d - 1).elong > 0 };
		e0 = e1; e1 = e2;
	}
	return null;
}
// Smallest arc of sky (degrees) that holds all the named planets, as seen from Earth.
export function skySpan(names, days) {
	const L = names.map(n => geocentric(n, days).lon).sort((a, b) => a - b);
	let best = 360;
	for (let i = 0; i < L.length; i++) best = Math.min(best, 360 - wrap360(L[(i + 1) % L.length] - L[i]));
	return best;
}

const dFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
const dtFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
export const fmtDate = (days) => dFmt.format(daysToDate(days));
export const fmtDateTime = (days) => dtFmt.format(daysToDate(days)) + ' UTC';
export const COLOR = { Mercury: '#b9b9b9', Venus: '#efd39f', Earth: '#6fa8ff', Mars: '#e8714d', Jupiter: '#dbb48a', Saturn: '#ead7a4', Uranus: '#9fd9e2', Neptune: '#6d8dff', Pluto: '#cdbcaa', Sun: '#ffd166' };

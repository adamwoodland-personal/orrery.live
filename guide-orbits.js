// Orbital model for orrery.live's guide pages (/now/, /planetary-alignment/).
// Generated from app.js on 2026-10-12: the element table is a verbatim copy of the
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

// Geocentric Moon (km, J2000 ecliptic) from the Astronomical Almanac's
// low-precision lunar formulae (ecliptic of date), precessed to J2000 so it
// shares the planets' frame. Checked against JPL Horizons DE441 geocentric
// vectors at six dates 1900–2100: direction within 0.12°, distance within 0.15%.
export const EARTH_MOON_MASS = 1 / 82.30057; // Moon / (Earth + Moon)
export const MOON_A = 384400;                // km, mean distance (the display-radius reference)
export function moonGeocentric(days) {
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

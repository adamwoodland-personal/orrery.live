// Astronomy core for orrery.live's /night-sky/ page: where the Sun, Moon and
// planets sit in the viewer's sky, when they rise and set, and what is worth
// looking at tonight. A plain ES module with no DOM and no third-party code, so
// the page runs it under the strict CSP and Node runs it for the JPL Horizons
// checks (ReferenceFiles/orrery-sky/astro-test.mjs).
//
// Conventions shared with sky.js and orientation.js:
//  - `days` = days since J2000.0 on the UTC scale (dateToDays). It is treated as
//    UT1 for the Earth's rotation; the ephemerides add ΔT to get TT.
//  - Public angles are degrees. Azimuth from north through east (N 0, E 90, S 180,
//    W 270); altitude positive up; east longitude and north latitude positive.
//  - J2000 equatorial unit vectors [x, y, z]: x -> RA 0h, z -> north celestial pole.
//  - Horizon frame ENU = [east, north, up].
//
// Sources: planets and the Earth from a truncated VSOP87B (vsop87.js, generated;
// within ~10" of the full theory over 1800–2200). The Standish elements in
// guide-orbits.js are up to 0.3° out for Saturn, too coarse for a sky map; the
// orrery's 3D view keeps them. The Moon from Meeus ch. 47 (truncated ELP-2000/82,
// ~10"; see moonKm). Precession IAU 1976 (Meeus ch. 21), nutation the four largest
// terms (Meeus ch. 22, 0.5"), sidereal time IAU 1982 (Meeus 12.4), refraction
// Saemundsson (Meeus 16.4), magnitudes Mallama & Hilton (2018), position angles
// Meeus ch. 14 and 48. Checked against JPL Horizons: see astro-test.mjs for the numbers.
import { AU_KM, LIGHT_S_PER_AU, wrap360, wrap180 } from '../guide-orbits.js';
import { VSOP87 } from './vsop87.js';

const DEG = Math.PI / 180, RAD = 180 / Math.PI, AS = DEG / 3600;
const { sin, cos, asin, atan2, sqrt, hypot } = Math;
const EPS0 = 84381.448 * AS;                     // obliquity at J2000 (IAU 1976): VSOP87 ecliptic -> equator
const CE0 = cos(EPS0), SE0 = sin(EPS0);
const LT_MILL = LIGHT_S_PER_AU / 86400 / 365250; // light time per AU, in Julian millennia
const R_MOON_KM = 1737.4;
const WGS_A = 6378.137, WGS_E2 = (2 - 1 / 298.257223563) / 298.257223563; // WGS84 equatorial radius (km), e²
const STEP = 10 / 1440;                          // coarse scan step for rise/set/twilight searches
export const BODIES = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];

// ---- Time --------------------------------------------------------------------------------------
// ΔT = TT − UT in seconds. 1900–2025: observed values every five years (IERS / USNO).
// 2025–2100: held at 69.2 s, as JPL Horizons does beyond its prediction interval (the
// Earth has not been slowing lately, and any guess is as good). Outside 1900–2100 the
// Morrison & Stephenson parabola −20 + 32u² takes over, shifted to join the table.
// Only the Moon notices: 30 s of ΔT moves it 16".
const DT = [-2.8, 3.9, 10.5, 17.2, 21.2, 23.6, 24.0, 23.9, 24.3, 26.8, 29.2, 31.1, 33.2,
	35.7, 40.2, 45.5, 50.5, 54.3, 56.9, 60.8, 63.8, 64.7, 66.1, 67.6, 69.4, 69.2];
const dtParabola = (y) => -20 + 32 * ((y - 1820) / 100) ** 2;
export function deltaT(days) {
	const y = 2000 + days / 365.25;
	if (y < 1900) return dtParabola(y) - dtParabola(1900) + DT[0];
	if (y >= 2025) return 69.2 + (y > 2100 ? dtParabola(y) - dtParabola(2100) : 0);
	const i = Math.floor((y - 1900) / 5), f = (y - 1900) / 5 - i;
	return DT[i] + (DT[i + 1] - DT[i]) * f;
}
const tt = (days) => days + deltaT(days) / 86400;
// Greenwich mean sidereal time, degrees (IAU 1982, Meeus 12.4); days as UT1.
function gmst(days) {
	const T = days / 36525;
	return 280.46061837 + 360.98564736629 * days + (0.000387933 - T / 38710000) * T * T;
}

// ---- Small vector helpers (3×3 matrices are row-major arrays of 9) -------------------------------
const mulMV = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
const mulTV = (m, v) => [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
function mulMM(a, b) {
	const r = new Float64Array(9);
	for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
	return r;
}
const unit = (v) => { const d = hypot(v[0], v[1], v[2]); return [v[0] / d, v[1] / d, v[2] / d]; };
const angle = (a, b) => atan2(hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
const eclLon = (v) => atan2(v[1] * CE0 + v[2] * SE0, v[0]); // J2000 equatorial -> J2000 ecliptic longitude (rad)

// ---- Precession, nutation and the horizon frame ---------------------------------------------------
// J2000 mean equator -> true equator and equinox of date: N·P. P is IAU 1976 (Meeus
// 21.2–21.4, P = R3(−z)·R2(θ)·R3(−ζ)); N = R1(−ε)·R3(−Δψ)·R1(ε₀) with the four
// largest nutation terms. Also returns the equation of the equinoxes (degrees),
// which turns mean sidereal time into apparent.
function precession(T) {
	const ze = (2306.2181 + (0.30188 + 0.017998 * T) * T) * T * AS;
	const z = (2306.2181 + (1.09468 + 0.018203 * T) * T) * T * AS;
	const th = (2004.3109 - (0.42665 + 0.041833 * T) * T) * T * AS;
	const cz = cos(ze), sz = sin(ze), cZ = cos(z), sZ = sin(z), ct = cos(th), st = sin(th);
	return [cZ * ct * cz - sZ * sz, -cZ * ct * sz - sZ * cz, -cZ * st,
		sZ * ct * cz + cZ * sz, -sZ * ct * sz + cZ * cz, -sZ * st,
		st * cz, -st * sz, ct];
}
const meanObliquity = (T) => (84381.448 - (46.8150 + (0.00059 - 0.001813 * T) * T) * T) * AS;
function precNut(dTT) {
	const T = dTT / 36525, P = precession(T);
	const om = (125.04452 - 1934.136261 * T) * DEG, L = (280.4665 + 36000.7698 * T) * DEG, Lm = (218.3165 + 481267.8813 * T) * DEG;
	const dpsi = (-17.20 * sin(om) - 1.32 * sin(2 * L) - 0.23 * sin(2 * Lm) + 0.21 * sin(2 * om)) * AS;
	const deps = (9.20 * cos(om) + 0.57 * cos(2 * L) + 0.10 * cos(2 * Lm) - 0.09 * cos(2 * om)) * AS;
	const e0 = meanObliquity(T), e = e0 + deps;
	const cp = cos(dpsi), sp = sin(dpsi), c0 = cos(e0), s0 = sin(e0), c = cos(e), s = sin(e);
	const N = [cp, -sp * c0, -sp * s0,
		c * sp, c * cp * c0 + s * s0, c * cp * s0 - s * c0,
		s * sp, s * cp * c0 - c * s0, s * cp * s0 + c * c0];
	return { m: mulMM(N, P), eqeq: dpsi * c * RAD };
}
// True-of-date equatorial -> ENU for local apparent sidereal time th and latitude phi (radians).
function enuRot(th, phi) {
	const ct = cos(th), st = sin(th), cp = cos(phi), sp = sin(phi);
	return [-st, ct, 0, -sp * ct, -sp * st, cp, cp * ct, cp * st, sp];
}
// The observer's position relative to the Earth's centre, in their own ENU frame (km), on
// the WGS84 ellipsoid: east 0, a small northward term because the geodetic vertical
// misses the centre, and up.
function obsEnu(lat, heightM) {
	const p = lat * DEG, s = sin(p), c = cos(p), N = WGS_A / sqrt(1 - WGS_E2 * s * s);
	return [0, -N * WGS_E2 * s * c, N * (1 - WGS_E2 * s * s) + (heightM || 0) / 1000];
}
// One-entry memo: the renderer asks for the same frame for the matrix and for each body.
let memoKey = '', memo = null;
function frame(days, lat, lon) {
	const key = days + ',' + lat + ',' + lon;
	if (key === memoKey) return memo;
	const pn = precNut(tt(days)), last = gmst(days) + pn.eqeq + lon;
	memo = { pn, last, M: mulMM(enuRot(last * DEG, lat * DEG), pn.m) };
	memoKey = key;
	return memo;
}
// M with enu = M·v for J2000 equatorial unit vectors v (row-major). Includes precession,
// nutation and apparent sidereal time; annual aberration of the stars (≤ 20") is left out.
export function eqToEnuMatrix(days, latDeg, lonDeg) {
	return Float64Array.from(frame(days, latDeg, lonDeg).M);
}
// Local apparent sidereal time, degrees (the hour angle of the equinox of date).
export function localSiderealTime(days, lonDeg) { return wrap360(gmst(days) + precNut(tt(days)).eqeq + lonDeg); }

// ---- Ephemerides --------------------------------------------------------------------------------
function series(s, tau) {
	let sum = 0, tp = 1;
	for (let k = 0; k < s.length; k++, tp *= tau) {
		const a = s[k];
		let acc = 0;
		for (let i = 0; i < a.length; i += 3) acc += a[i] * cos(a[i + 1] + a[i + 2] * tau);
		sum += acc * tp;
	}
	return sum;
}
// Heliocentric position (AU), J2000 equatorial, at tau Julian millennia of TT.
function vsop(name, tau) {
	const s = VSOP87[name], L = series(s[0], tau), B = series(s[1], tau), R = series(s[2], tau);
	const x = R * cos(B) * cos(L), y = R * cos(B) * sin(L), z = R * sin(B);
	return [x, y * CE0 - z * SE0, y * SE0 + z * CE0];
}
// Geocentric Moon, km, J2000 equatorial: Meeus ch. 47, the ELP-2000/82 series truncated to 60
// terms in longitude and distance and 60 in latitude (~10" and 4"; reproduces Meeus's example
// 47.a to the last digit). The orrery's own lunar formulae (moonGeocentric in guide-orbits.js)
// were 0.21° out against Horizons — fine for the 3D view, half a Moon-width on a sky map.
// Rows: multiples of D, M, M′, F, then the sine (longitude, 1e-6°) and cosine (distance, m)
// amplitudes (Table 47.A); latitude rows end with the sine amplitude in 1e-6° (Table 47.B).
const MOON_LR = [
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
const MOON_B = [
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
function moonKm(dTT) {
	const T = dTT / 36525, p = (c0, c1, c2, c3, c4) => (c0 + T * (c1 + T * (c2 + T * (c3 + T * c4)))) * DEG;
	const Lp = p(218.3164477, 481267.88123421, -0.0015786, 1 / 538841, -1 / 65194000);   // mean longitude
	const D = p(297.8501921, 445267.1114034, -0.0018819, 1 / 545868, -1 / 113065000);    // mean elongation
	const M = p(357.5291092, 35999.0502909, -0.0001536, 1 / 24490000, 0);                // Sun's mean anomaly
	const Mp = p(134.9633964, 477198.8675055, 0.0087414, 1 / 69699, -1 / 14712000);      // Moon's mean anomaly
	const F = p(93.2720950, 483202.0175233, -0.0036539, -1 / 3526000, 1 / 863310000);    // argument of latitude
	const A1 = (119.75 + 131.849 * T) * DEG, A2 = (53.09 + 479264.290 * T) * DEG, A3 = (313.45 + 481266.484 * T) * DEG;
	const E = 1 - T * (0.002516 + 0.0000074 * T), Ek = [1, E, E * E]; // eccentricity factor for terms in M
	let sl = 3958 * sin(A1) + 1962 * sin(Lp - F) + 318 * sin(A2), sr = 0;
	let sb = -2235 * sin(Lp) + 382 * sin(A3) + 175 * sin(A1 - F) + 175 * sin(A1 + F) + 127 * sin(Lp - Mp) - 115 * sin(Lp + Mp);
	for (let i = 0; i < MOON_LR.length; i += 6) {
		const r = MOON_LR, a = r[i] * D + r[i + 1] * M + r[i + 2] * Mp + r[i + 3] * F, e = Ek[Math.abs(r[i + 1])];
		sl += r[i + 4] * e * sin(a); sr += r[i + 5] * e * cos(a);
	}
	for (let i = 0; i < MOON_B.length; i += 5) {
		const r = MOON_B;
		sb += r[i + 4] * Ek[Math.abs(r[i + 1])] * sin(r[i] * D + r[i + 1] * M + r[i + 2] * Mp + r[i + 3] * F);
	}
	const lam = Lp + sl * 1e-6 * DEG, bet = sb * 1e-6 * DEG, dist = 385000.56 + sr / 1000;
	// Mean ecliptic of date -> mean equator of date -> J2000 (transposed precession).
	const x = dist * cos(bet) * cos(lam), y = dist * cos(bet) * sin(lam), z = dist * sin(bet), eps = meanObliquity(T);
	return mulTV(precession(T), [x, y * cos(eps) - z * sin(eps), y * sin(eps) + z * cos(eps)]);
}
// Geocentric apparent place (km, J2000 equatorial) plus the distances (AU) that phases and
// magnitudes need. Light-time and annual aberration come together from taking both the
// body and the Earth at t − τ (the "planetary aberration" form): to first order that is
// the body's light-time position seen with the Earth's velocity. The Sun is the origin.
function geoInfo(name, dTT) {
	const tau = dTT / 365250, e0 = vsop('Earth', tau), R = hypot(e0[0], e0[1], e0[2]);
	if (name === 'Moon') {
		const m = moonKm(dTT), d = hypot(m[0], m[1], m[2]);
		const s = [-e0[0] * AU_KM - m[0], -e0[1] * AU_KM - m[1], -e0[2] * AU_KM - m[2]]; // Moon -> Sun
		return { g: m, delta: d / AU_KM, r: hypot(s[0], s[1], s[2]) / AU_KM, R, alpha: angle(s, [-m[0], -m[1], -m[2]]) * RAD };
	}
	const p0 = name === 'Sun' ? [0, 0, 0] : vsop(name, tau);
	const t1 = tau - hypot(p0[0] - e0[0], p0[1] - e0[1], p0[2] - e0[2]) * LT_MILL;
	const p = name === 'Sun' ? p0 : vsop(name, t1), e1 = vsop('Earth', t1);
	const u = unit([p[0] - e1[0], p[1] - e1[1], p[2] - e1[2]]);
	const delta = hypot(p[0] - e0[0], p[1] - e0[1], p[2] - e0[2]), r = hypot(p[0], p[1], p[2]);
	const k = delta * AU_KM;
	return { g: [u[0] * k, u[1] * k, u[2] * k], delta, r, R, helio: p,
		alpha: name === 'Sun' ? 0 : Math.acos(Math.max(-1, Math.min(1, (r * r + delta * delta - R * R) / (2 * r * delta)))) * RAD };
}
const geoKm = (name, dTT) => geoInfo(name, dTT).g;

// Apparent direction from the observer (unit J2000 vector) and distance. With an observer
// the position is topocentric for every body (it matters for the Moon, ~1°; 9" at most for
// the Sun and planets): the observer's offset is taken from ENU back to J2000 with the
// transpose of the same matrix eqToEnuMatrix returns, so M·v is exactly the topocentric
// direction in the horizon frame.
export function bodyJ2000(name, days, observer) {
	let g = geoKm(name, tt(days));
	if (observer) {
		const o = mulTV(frame(days, observer.lat, observer.lon).M, obsEnu(observer.lat, observer.heightM));
		g = [g[0] - o[0], g[1] - o[1], g[2] - o[2]];
	}
	const d = hypot(g[0], g[1], g[2]);
	return { v: [g[0] / d, g[1] / d, g[2] / d], distKm: d, distAU: d / AU_KM };
}

// ---- Horizon coordinates ---------------------------------------------------------------------
// Saemundsson's formula: refraction (degrees) to add to a true altitude, for 1010 hPa and
// 10 °C, with Meeus's offset so it is zero at the zenith. Below −1° it tapers linearly to 0
// at −5° so apparent altitude stays continuous and increasing through the horizon.
export function refraction(alt) {
	if (alt > 89.9) return 0;
	const R = (h) => (1.02 / Math.tan((h + 10.3 / (h + 5.11)) * DEG) + 0.0019279) / 60;
	if (alt >= -1) return Math.max(0, R(alt));
	return alt <= -5 ? 0 : R(-1) * (alt + 5) / 4;
}
function altAz(e) { return { alt: asin(Math.max(-1, Math.min(1, e[2]))) * RAD, az: wrap360(atan2(e[0], e[1]) * RAD) }; }
// alt/az: true (airless) topocentric; altApparent adds refraction; ra/dec: apparent,
// true equator and equinox of date, topocentric.
export function horizontal(name, days, lat, lon) {
	const b = bodyJ2000(name, days, { lat, lon, heightM: 0 }), f = frame(days, lat, lon);
	const h = altAz(mulMV(f.M, b.v)), q = mulMV(f.pn.m, b.v);
	return { alt: h.alt, az: h.az, altApparent: h.alt + refraction(h.alt),
		ra: wrap360(atan2(q[1], q[0]) * RAD), dec: asin(q[2]) * RAD, distKm: b.distKm };
}
export function starHorizontal(raJ2000, decJ2000, days, lat, lon) {
	const r = raJ2000 * DEG, d = decJ2000 * DEG;
	const h = altAz(mulMV(frame(days, lat, lon).M, [cos(d) * cos(r), cos(d) * sin(r), sin(d)]));
	return { alt: h.alt, az: h.az, altApparent: h.alt + refraction(h.alt) };
}
export function sunAltitude(days, lat, lon) { return horizontal('Sun', days, lat, lon).alt; }

// ---- Scans: many times over a short window -------------------------------------------------------
// For rise/set, twilight and visibility searches. Precession–nutation is fixed at the window's
// middle (it moves 0.14" a day) and only the sidereal angle changes per sample; each body's
// geocentric place is computed at nodes (Moon every 2 h, the rest every 12 h) and
// interpolated quadratically, which stays within 1" of the direct calculation.
function scanner(t0, t1, lat, lon, heightM = 0) {
	const pn = precNut(tt((t0 + t1) / 2)), phi = lat * DEG, sp = sin(phi), cp = cos(phi), o = obsEnu(lat, heightM);
	const tracks = {};
	function track(name) {
		const h0 = name === 'Moon' ? 1 / 12 : 0.5, n = Math.max(2, Math.ceil((t1 - t0) / h0)), h = (t1 - t0) / n || h0;
		const nodes = [];
		for (let i = 0; i <= n; i++) nodes.push(mulMV(pn.m, geoKm(name, tt(t0 + i * h))));
		return (t) => {
			const s = (t - t0) / h, i = Math.min(n - 1, Math.max(1, Math.round(s))), u = s - i;
			const a = nodes[i - 1], b = nodes[i], c = nodes[i + 1];
			return [0, 1, 2].map((k) => b[k] + u * (c[k] - a[k]) / 2 + u * u * (c[k] - 2 * b[k] + a[k]) / 2);
		};
	}
	// Topocentric [e, n, u] unit vector and distance (km) of a body at t.
	function enu(name, t) {
		const v = (tracks[name] ||= track(name))(t);
		const th = (gmst(t) + pn.eqeq + lon) * DEG, c = cos(th), s = sin(th), xy = c * v[0] + s * v[1];
		const e = -s * v[0] + c * v[1] - o[0], n = -sp * xy + cp * v[2] - o[1], u = cp * xy + sp * v[2] - o[2];
		const d = hypot(e, n, u);
		return [e / d, n / d, u / d, d];
	}
	return { enu, alt: (name, t) => asin(enu(name, t)[2]) * RAD };
}
// Root of f in [a, b] (fa, fb of opposite sign) to ~1 s: Illinois regula falsi.
function root(f, a, b, fa, fb) {
	let side = 0;
	for (let i = 0; i < 60 && b - a > 1e-5; i++) {
		const c = (a * fb - b * fa) / (fb - fa), fc = f(c);
		if ((fc < 0) === (fb < 0)) { b = c; fb = fc; if (side === -1) fa /= 2; side = -1; }
		else { a = c; fa = fc; if (side === 1) fb /= 2; side = 1; }
		if (fc === 0) return c;
	}
	return (a * fb - b * fa) / (fb - fa);
}
// Zero crossings of f over [t0, t1]: [{ t, dir }] with dir +1 rising, −1 falling. Sampled
// every `step`; with `graze`, a local extreme that a parabola says dips across zero
// between samples is split into its two crossings (a Moon or Sun that only just clears
// the horizon near the polar circles).
function crossings(f, t0, t1, step, graze) {
	const n = Math.max(2, Math.ceil((t1 - t0) / step)), h = (t1 - t0) / n;
	const T = [], F = [];
	for (let i = 0; i <= n; i++) { T.push(t0 + i * h); F.push(f(T[i])); }
	const out = [];
	const add = (a, b, fa, fb) => out.push({ t: root(f, a, b, fa, fb), dir: fb > fa ? 1 : -1 });
	for (let i = 0; i < n; i++) {
		if ((F[i] < 0) !== (F[i + 1] < 0)) add(T[i], T[i + 1], F[i], F[i + 1]);
		else if (graze && i > 0 && (F[i] - F[i - 1]) * (F[i + 1] - F[i]) < 0 && (F[i - 1] < 0) === (F[i] < 0)) {
			const c2 = F[i - 1] - 2 * F[i] + F[i + 1], u = (F[i - 1] - F[i + 1]) / (2 * c2);
			if (Math.abs(u) > 1 || (F[i] - (F[i + 1] - F[i - 1]) ** 2 / (8 * c2) < 0) === (F[i] < 0)) continue;
			const tv = T[i] + u * h, fv = f(tv);
			if ((fv < 0) === (F[i] < 0)) continue;
			add(T[i - 1], tv, F[i - 1], fv); add(tv, T[i + 1], fv, F[i + 1]);
		}
	}
	return out.sort((a, b) => a.t - b.t);
}
// Standard altitude of the centre at rise and set (true topocentric, degrees): the Sun's
// upper limb (16') with 34' of refraction; planets' centres with 34'; the Moon's upper
// limb from its topocentric semidiameter.
const horizonAlt = (name, distKm) => name === 'Sun' ? -0.8333 : name === 'Moon' ? -0.5667 - asin(R_MOON_KM / distKm) * RAD : -0.5667;

// Rise, set and (upper) transit times in [fromDays, toDays], in time order: { type, days,
// az, alt } with alt the apparent (refracted) altitude of the centre then. Transits are
// listed even when the body stays below the horizon (alt < 0); a body that never rises or
// never sets in the window simply has no rise/set entries.
export function events(name, fromDays, toDays, lat, lon) {
	const sc = scanner(fromDays, toDays, lat, lon);
	const fAlt = (t) => { const e = sc.enu(name, t); return asin(e[2]) * RAD - horizonAlt(name, e[3]); };
	const fMer = (t) => sc.enu(name, t)[0]; // east component: + before the upper transit, − after
	const make = (type, t) => { const h = altAz(sc.enu(name, t)); return { type, days: t, az: h.az, alt: h.alt + refraction(h.alt) }; };
	const out = crossings(fAlt, fromDays, toDays, STEP, true).map((c) => make(c.dir > 0 ? 'rise' : 'set', c.t));
	for (const c of crossings(fMer, fromDays, toDays, STEP, false)) if (c.dir < 0) out.push(make('transit', c.t));
	return out.sort((a, b) => a.days - b.days);
}

// ---- Tonight ------------------------------------------------------------------------------------
// The night in progress at `days` or, in daylight, the coming one: sunset (Sun's upper limb
// down, −0.8333°) to sunrise, the three twilights, and a scrub window start..end (sunset −
// 1 h to sunrise + 1 h). "Tonight" is tied to local mean midnight (longitude/15 hours from
// UT, never the device's time zone): the night around the nearest one, or, in daylight
// once that night has ended, the next one. With no sunset or no sunrise around that
// midnight (polar day or night, or the edge of one) `polar` says which, from the Sun at
// midnight, and the window is that midnight ± 12 h (for the nearest midnight it contains
// `days`). Events that do not happen, or fall outside the window, are null. `darkness` is the deepest reached: Sun below −18°
// 'astronomical', −12° 'nautical', −6° 'civil', else 'none'.
export function nightOf(days, lat, lon) {
	const sc = scanner(days - 1.2, days + 2.2, lat, lon), sunAlt = (t) => sc.alt('Sun', t);
	// Local mean midnights fall where days + off is a whole number. The night belonging to
	// midnight M runs from the last sunset in M − 12.5 h .. M + 2.4 h (very short arctic nights
	// can set just after mean midnight) to the first sunrise after it, before M + 12.5 h.
	const off = 0.5 + lon / 360;
	const around = (M) => {
		const c = crossings((t) => sunAlt(t) + 0.8333, M - 0.52, M + 0.52, STEP, true);
		const s = c.filter((x) => x.dir < 0 && x.t <= M + 0.1).pop(), r = c.find((x) => x.dir > 0 && x.t > (s ? s.t : M - 0.52));
		return { M, sunset: s ? s.t : null, sunrise: r ? r.t : null };
	};
	// The nearest midnight's night, unless it is daylight and that night is over (morning):
	// then the coming one.
	let n = around(Math.round(days + off) - off);
	if (sunAlt(days) > -0.8333 && n.sunrise !== null && days > n.sunrise + 1 / 24) n = around(n.M + 1);
	let { M, sunset, sunrise } = n, polar = null, start, end;
	if (sunset !== null && sunrise !== null) { start = sunset - 1 / 24; end = sunrise + 1 / 24; }
	else { // polar day or night, or its edge: midnight ± 12 h, named from the Sun at midnight
		polar = sunAlt(M) > -0.8333 ? 'day' : 'night';
		start = M - 0.5; end = M + 0.5;
		if (sunset !== null && (sunset < start || sunset > end)) sunset = null;
		if (sunrise !== null && (sunrise < start || sunrise > end)) sunrise = null;
	}
	// Twilight: dusk crossings before the Sun's lowest point, dawn crossings after it.
	const lo = sunset ?? start, hi = sunrise ?? end;
	let nadir = lo, minAlt = Infinity;
	for (let t = lo; t <= hi + 1e-9; t += STEP / 2) { const a = sunAlt(t); if (a < minAlt) { minAlt = a; nadir = t; } }
	const tw = (level) => {
		const c = crossings((t) => sunAlt(t) - level, lo, hi, STEP, true);
		const dusk = c.find((x) => x.dir < 0 && x.t <= nadir + STEP), dawn = c.filter((x) => x.dir > 0 && x.t >= nadir - STEP).pop();
		return [dusk ? dusk.t : null, dawn ? dawn.t : null];
	};
	const [civilDusk, civilDawn] = tw(-6), [nauticalDusk, nauticalDawn] = tw(-12), [astroDusk, astroDawn] = tw(-18);
	const darkness = minAlt <= -18 ? 'astronomical' : minAlt <= -12 ? 'nautical' : minAlt <= -6 ? 'civil' : 'none';
	return { sunset, civilDusk, nauticalDusk, astroDusk, astroDawn, nauticalDawn, civilDawn, sunrise, start, end, darkness, polar };
}

// When a body is worth looking for during `night` (from nightOf). Visible = apparent
// altitude ≥ 5° while the Sun is below −6° (magnitude < −2: Venus, Jupiter, the Moon),
// −9° (magnitude < 1) or −12° (fainter). Sampled every 5 minutes; window edges are
// interpolated, the best moment refined with a parabola.
//   from / to   first and last visible moment (null if never); `windows` lists every
//               separate stretch [from, to] when the body sets and rises again in the night
//   best        greatest altitude inside the visible stretches; bestAlt (apparent), bestAz
//   rise / set  first rise / first set inside night.start..night.end, or null
//   when        D = the dark interval for this body (Sun below its threshold) and f = the
//               fraction of D covered by the window(s); "midnight" = the Sun's lowest point.
//               'not visible'         no window;
//               'all night'           f ≥ 0.85;
//               'most of the night'   f ≥ 0.6;
//               otherwise, taking the longest stretch,
//               'evening'             it ends by midnight + 1 h, or it begins within the
//                                     first 10% of D (visible from dusk) and runs past it;
//               'morning'             it begins at or after midnight − 1 h;
//               'late night'          it spans midnight, starting after dusk — up from
//                                     the late evening into the small hours or to dawn.
//   direction   compass8(bestAz); height 'low' < 20°, 'medium' 20–50°, 'high' > 50°.
export function visibility(name, night, lat, lon) {
	const t0 = night.start, t1 = night.end, n = Math.max(2, Math.ceil((t1 - t0) / (5 / 1440))), h = (t1 - t0) / n;
	const sc = scanner(t0, t1, lat, lon);
	const mag0 = magnitude(name, (t0 + t1) / 2), sunMax = mag0 < -2 ? -6 : mag0 < 1 ? -9 : -12;
	const T = [], S = [], A = [];
	for (let i = 0; i <= n; i++) {
		const t = t0 + i * h, alt = asin(sc.enu(name, t)[2]) * RAD;
		T.push(t); S.push(sc.alt('Sun', t)); A.push(alt + refraction(alt));
	}
	const vis = (i) => A[i] >= 5 && S[i] <= sunMax, dark = (i) => S[i] <= sunMax;
	// Interpolated moment between samples i and i+1 at which a margin m (≥ 0 = good) crosses zero.
	const cut = (i, m) => T[i] + h * m(i) / (m(i) - m(i + 1));
	const mAlt = (i) => A[i] - 5, mSun = (i) => sunMax - S[i];
	const edge = (i, opening) => { // first failing condition decides the edge
		const fails = [mAlt, mSun].filter((m) => (opening ? m(i) < 0 : m(i + 1) < 0));
		const ts = fails.map((m) => cut(i, m));
		return opening ? Math.max(...ts) : Math.min(...ts);
	};
	const windows = [];
	let open = vis(0) ? t0 : null;
	for (let i = 0; i < n; i++) {
		if (!vis(i) && vis(i + 1)) open = edge(i, true);
		if (vis(i) && !vis(i + 1)) { windows.push([open, edge(i, false)]); open = null; }
	}
	if (open !== null) windows.push([open, t1]);
	// Dark interval for this body's threshold, and the Sun's lowest moment ("midnight").
	let d0 = null, d1 = null, ni = 0;
	for (let i = 0; i <= n; i++) {
		if (S[i] < S[ni]) ni = i;
		if (!dark(i)) continue;
		if (d0 === null) d0 = i === 0 ? t0 : cut(i - 1, mSun);
		if (i === n) d1 = t1; else if (!dark(i + 1)) d1 = cut(i, mSun);
	}
	const nadir = T[ni];
	const rise = [], set = [];
	for (const c of crossings((t) => { const e = sc.enu(name, t); return asin(e[2]) * RAD - horizonAlt(name, e[3]); }, t0, t1, 5 / 1440, true)) (c.dir > 0 ? rise : set).push(c.t);
	const res = { visible: windows.length > 0, from: null, to: null, best: null, bestAlt: null, bestAz: null, magnitude: mag0,
		rise: rise[0] ?? null, set: set[0] ?? null, when: 'not visible', direction: null, height: null, windows };
	if (!windows.length) return res;
	// Best: highest sample inside a window, refined with a parabola, kept inside the window.
	let bi = -1;
	for (let i = 0; i <= n; i++) if (windows.some(([a, b]) => T[i] >= a && T[i] <= b) && (bi < 0 || A[i] > A[bi])) bi = i;
	let best = bi >= 0 ? T[bi] : windows[0][0];
	if (bi > 0 && bi < n) {
		const c2 = A[bi - 1] - 2 * A[bi] + A[bi + 1];
		if (c2 < 0) best += h * Math.max(-1, Math.min(1, (A[bi - 1] - A[bi + 1]) / (2 * c2)));
		const w = windows.find(([a, b]) => T[bi] >= a && T[bi] <= b);
		best = Math.max(w[0], Math.min(w[1], best));
	}
	const be = sc.enu(name, best), bh = altAz(be);
	res.from = windows[0][0]; res.to = windows[windows.length - 1][1];
	res.best = best; res.bestAlt = bh.alt + refraction(bh.alt); res.bestAz = bh.az;
	res.magnitude = magnitude(name, best);
	res.direction = compass8(bh.az);
	res.height = res.bestAlt < 20 ? 'low' : res.bestAlt <= 50 ? 'medium' : 'high';
	const D = (d1 ?? t1) - (d0 ?? t0), f = windows.reduce((s, [a, b]) => s + b - a, 0) / D;
	const [a, b] = windows.reduce((p, w) => (w[1] - w[0] > p[1] - p[0] ? w : p));
	res.when = f >= 0.85 ? 'all night' : f >= 0.6 ? 'most of the night'
		: b <= nadir + 1 / 24 || a - (d0 ?? t0) <= 0.1 * D ? 'evening'
		: a >= nadir - 1 / 24 ? 'morning' : 'late night';
	return res;
}

// ---- Brightness and phase -----------------------------------------------------------------------
const POLE = (ra, dec) => [cos(dec * DEG) * cos(ra * DEG), cos(dec * DEG) * sin(ra * DEG), sin(dec * DEG)];
const SATURN_POLE = POLE(40.589, 83.537), URANUS_POLE = POLE(257.311, -15.175); // IAU, J2000
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// Apparent visual magnitude (geocentric). Planets: Mallama & Hilton (2018), as adopted by
// the Astronomical Almanac, with α the phase angle in degrees; Saturn includes the rings
// through the sub-Earth latitude of its ring plane; Uranus the latitude term. Moon: the
// classic phase law V = 0.23 + 5 log(rΔ) + 0.026α + 4e-9α⁴ (Allen). Sun: −26.74 at 1 AU.
export function magnitude(name, days) {
	const g = geoInfo(name, tt(days)), a = g.alpha, base = 5 * Math.log10(g.r * g.delta);
	switch (name) {
	case 'Sun': return -26.74 + 5 * Math.log10(g.delta);
	case 'Moon': return 0.23 + base + 0.026 * a + 4e-9 * a ** 4;
	case 'Mercury': return base - 0.613 + a * (6.3280e-2 + a * (-1.6336e-3 + a * (3.3644e-5 + a * (-3.4265e-7 + a * (1.6893e-9 - 3.0334e-12 * a)))));
	case 'Venus': return a < 163.7 ? base - 4.384 + a * (-1.044e-3 + a * (3.687e-4 + a * (-2.814e-6 + 8.938e-9 * a)))
		: base + 236.05828 + a * (-2.81914 + 8.39034e-3 * a);
	case 'Mars': return base + (a <= 50 ? -1.601 + a * (0.02267 - 0.0001302 * a) : -0.367 + a * (-0.02573 + 0.0003445 * a));
	case 'Jupiter': return base - 9.395 + a * (-3.7e-4 + 6.16e-4 * a);
	case 'Saturn': {
		const sb = Math.abs(dot(SATURN_POLE, unit(g.g))); // |sin| of the ring plane's tilt to the line of sight
		return base - 8.914 - 1.825 * sb + 0.026 * a - 0.378 * sb * Math.exp(-2.25 * a);
	}
	case 'Uranus': { // φ′: mean |planetographic latitude| of the sub-Earth and sub-Sun points
		const lat = (u) => Math.abs(asin(dot(URANUS_POLE, u))) * RAD;
		const phi = (lat(unit(g.g)) + lat(unit(g.helio))) / 2;
		return base - 7.110 - 8.4e-4 * phi + a * (6.587e-3 + 1.045e-4 * a);
	}
	case 'Neptune': {
		const y = 2000 + days / 365.25, v0 = y >= 2000 ? -7.00 : y <= 1980 ? -6.89 : -6.89 - 0.0055 * (y - 1980);
		return base + v0 + a * (7.944e-3 + 9.617e-5 * a);
	}
	}
	throw new Error('unknown body ' + name);
}
// Sun–body angle (degrees), positive when the body is east of the Sun (evening sky),
// negative west (morning sky); the sign comes from the ecliptic longitudes.
export function elongation(name, days) {
	if (name === 'Sun') return 0;
	const d = tt(days), b = geoKm(name, d), s = geoKm('Sun', d);
	return (wrap180((eclLon(b) - eclLon(s)) * RAD) < 0 ? -1 : 1) * angle(b, s) * RAD;
}
// Geocentric phase of the Moon. fraction = illuminated fraction (1 + cos i)/2 with i the
// phaseAngle (Sun–Moon–Earth); elongation = the Sun–Moon angle (0–180); waxing while the
// Moon is east of the Sun. name from D = Moon − Sun ecliptic longitude: the four
// principal phases within ±18° of 0/90/180/270 (±1.5 days), the in-between names outside.
// brightLimbPA: position angle of the bright limb's midpoint, degrees from celestial
// north through east, on the true equator of date (Meeus 48.5).
const PHASES = ['New Moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full Moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
export function moonPhase(days) {
	const d = tt(days), m = geoInfo('Moon', d), s = geoKm('Sun', d), pn = precNut(d).m;
	const D = wrap360((eclLon(m.g) - eclLon(s)) * RAD);
	const k = Math.floor(((D + 18) % 360) / 90) * 2, name = PHASES[(D + 18) % 90 < 36 ? k : k + 1];
	const q = unit(mulMV(pn, m.g)), q0 = unit(mulMV(pn, s));
	const ra = atan2(q[1], q[0]), dec = asin(q[2]), ra0 = atan2(q0[1], q0[0]), dec0 = asin(q0[2]);
	const pa = atan2(cos(dec0) * sin(ra0 - ra), sin(dec0) * cos(dec) - cos(dec0) * sin(dec) * cos(ra0 - ra));
	return { fraction: (1 + cos(m.alpha * DEG)) / 2, phaseAngle: m.alpha, elongation: angle(m.g, s) * RAD,
		waxing: D < 180, name, brightLimbPA: wrap360(pa * RAD) };
}
// Parallactic angle q (Meeus 14.1), degrees, of the body as seen by the observer: the
// position angle of the zenith measured at the body from celestial north through east, so
// positive west of the meridian (hour angle > 0), negative east, 0 on the meridian south
// of the pole. On a sky drawn with the zenith straight up, a feature at position angle P
// (such as brightLimbPA) appears (P − q) degrees anticlockwise from straight up, i.e. to
// the left for positive values, as the observer sees it.
export function parallacticAngle(name, days, lat, lon) {
	const b = bodyJ2000(name, days, { lat, lon, heightM: 0 }), f = frame(days, lat, lon), q = mulMV(f.pn.m, b.v);
	const H = f.last * DEG - atan2(q[1], q[0]), dec = asin(q[2]), phi = lat * DEG;
	return atan2(sin(H) * cos(phi), sin(phi) * cos(dec) - cos(phi) * sin(dec) * cos(H)) * RAD;
}

const C8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const C16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compass8 = (az) => C8[Math.round(wrap360(az) / 45) % 8];
export const compass16 = (az) => C16[Math.round(wrap360(az) / 22.5) % 16];

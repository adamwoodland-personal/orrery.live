// /halleys-comet/ — "Where is Halley's Comet now?": live distance, speed and a top-down
// map, from the same comet elements as the 3D orrery (cometsData in app.js) and the
// planets in guide-orbits.js. halleyView(days) builds plain view trees (see guide-ui.js)
// so the publish-time build pre-renders the page's snapshot (ReferenceFiles/orrery-guides/
// build-guides.mjs) and, in the browser, replaces it with live values every minute.
import { AU_KM, LIGHT_S_PER_AU, J2000, COLOR, helio, daysToDate, fmtDate, fmtDateTime } from './guide-orbits.js';
import { fill, toDOM, flatten } from './guide-ui.js';

const DEG = Math.PI / 180;
// Verbatim from app.js cometsData (1P/Halley). The period is pinned to JPL's
// 1986-02-09 → 2061-07-28 perihelion interval, so the 2061 date is exact; the position in
// between is a two-body approximation (planetary perturbations are ignored).
export const HALLEY = { a: 17.834, e: 0.96714, inc: 162.262, node: 58.42, argp: 111.33, tpJD: 2446470.95, periodD: 27563.05 };
const TP = HALLEY.tpJD - J2000, P = HALLEY.periodD;
const GM = 1.32712440018e20; // m^3/s^2, the Sun
const ORBITS = [['Earth', 1.0], ['Jupiter', 5.2], ['Saturn', 9.58], ['Uranus', 19.2], ['Neptune', 30.07]];

function toEcliptic(xp, yp) {
	const { inc, node, argp } = HALLEY, w = argp * DEG, O = node * DEG, I = inc * DEG;
	const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
	return {
		x: (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
		y: (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
		z: (sw * sI) * xp + (cw * sI) * yp
	};
}
function pointAtE(E) {
	const { a, e } = HALLEY;
	return toEcliptic(a * (Math.cos(E) - e), a * Math.sqrt(1 - e * e) * Math.sin(E));
}
// Heliocentric ecliptic position (AU) at `days` since J2000.
export function halleyHelio(days) {
	const e = HALLEY.e;
	let M = (2 * Math.PI * (days - TP) / P) % (2 * Math.PI);
	if (M > Math.PI) M -= 2 * Math.PI; else if (M < -Math.PI) M += 2 * Math.PI;
	let E = M + 0.85 * e * Math.sign(Math.sin(M) || 1); // Danby's starter: stable for e near 1
	for (let i = 0; i < 50; i++) { const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); E -= dE; if (Math.abs(dE) < 1e-12) break; }
	const p = pointAtE(E);
	return { ...p, r: Math.hypot(p.x, p.y, p.z), M };
}
export const nextPerihelion = (days) => TP + Math.ceil((days - TP) / P) * P;
const speedKms = (r) => Math.sqrt(GM * (2 / (r * AU_KM * 1000) - 1 / (HALLEY.a * AU_KM * 1000))) / 1000;

function region(r) {
	if (r > 30.07) return 'beyond the orbit of Neptune';
	if (r > 19.2) return 'between the orbits of Uranus and Neptune';
	if (r > 9.58) return 'between the orbits of Saturn and Uranus';
	if (r > 5.2) return 'between the orbits of Jupiter and Saturn';
	if (r > 1.52) return 'between the orbits of Mars and Jupiter';
	return 'in the inner solar system';
}
// "34 years and 10 months" between two dates (calendar months, rounded down).
function span(fromDays, toDays) {
	const a = daysToDate(fromDays), b = daysToDate(toDays);
	let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
	if (b.getUTCDate() < a.getUTCDate()) months--;
	const y = Math.floor(months / 12), m = months % 12;
	if (y === 0) return `${m} month${m === 1 ? '' : 's'}`;
	return `${y} year${y === 1 ? '' : 's'}${m ? ` and ${m} month${m === 1 ? '' : 's'}` : ''}`;
}

export function halleyView(days) {
	const h = halleyHelio(days), earth = helio('Earth', days);
	const dE = Math.hypot(h.x - earth.x, h.y - earth.y, h.z - earth.z);
	const inbound = h.M < 0;                     // mean anomaly in (−π, 0): after aphelion, falling back in
	const v = speedKms(h.r), next = nextPerihelion(days), last = next - P;
	const lightH = dE * LIGHT_S_PER_AU / 3600;
	const frac = (days - last) / P;
	const bn = (au) => `${(au * AU_KM / 1e9).toLocaleString('en-GB', { maximumFractionDigits: 2 })} billion km`;

	const summary = `Halley’s Comet is ${h.r.toFixed(2)} AU (${bn(h.r)}) from the Sun right now, ${region(h.r)}, and ` +
		(inbound ? `falling back towards the Sun at ${v.toFixed(2)} km/s after turning round at the far end of its orbit in late 2023. `
		         : `heading away from the Sun at ${v.toFixed(2)} km/s. `) +
		`Its next perihelion — closest approach to the Sun — is on ${fmtDate(next)}, in ${span(days, next)}.`;

	const stats = [
		['dt', null, 'From the Sun'], ['dd', null, `${h.r.toFixed(2)} AU`, ['span', { class: 'sub' }, bn(h.r)]],
		['dt', null, 'From Earth'], ['dd', null, `${dE.toFixed(2)} AU`, ['span', { class: 'sub' }, `light takes ${lightH.toFixed(1)} hours`]],
		['dt', null, 'Speed'], ['dd', null, `${v.toFixed(2)} km/s`, ['span', { class: 'sub' }, `about ${speedKms(HALLEY.a * (1 - HALLEY.e)).toFixed(0)} km/s at perihelion`]],
		['dt', null, 'Heading'], ['dd', null, inbound ? 'inbound, towards the Sun' : 'outbound, away from the Sun'],
		['dt', null, 'Through its orbit'], ['dd', null, `${(frac * 100).toFixed(0)}%`, ['span', { class: 'sub' }, `of the time from ${daysToDate(last).getUTCFullYear()} to ${daysToDate(next).getUTCFullYear()}`]],
		['dt', null, 'Next perihelion'], ['dd', null, fmtDate(next), ['span', { class: 'sub' }, `in ${span(days, next)} (${Math.round(next - days).toLocaleString('en-GB')} days)`]]
	];

	// Top-down map (ecliptic north towards the viewer, 0° longitude to the right), true scale.
	const C = 300, K = 268 / (HALLEY.a * (1 + HALLEY.e));
	const xy = (p) => [C + p.x * K, C - p.y * K];
	const path = [];
	for (let i = 0; i <= 360; i++) { const [x, y] = xy(pointAtE(i / 360 * 2 * Math.PI)); path.push(`${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`); }
	const [hx, hy] = xy(h), [px, py] = xy(pointAtE(0));
	const map = [
		...ORBITS.map(([n, a]) => ['circle', { cx: C, cy: C, r: (a * K).toFixed(1), fill: 'none', stroke: 'rgba(138,172,255,0.28)' }]),
		['path', { d: path.join(''), fill: 'none', stroke: '#79c9c0', 'stroke-width': 1.5 }],
		['circle', { cx: C, cy: C, r: 5, fill: COLOR.Sun }],
		...ORBITS.filter(([n]) => n !== 'Earth').map(([n]) => {
			const [x, y] = xy(helio(n, days));
			return [['circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 4, fill: COLOR[n] }],
				['text', { x: (x + 7).toFixed(1), y: (y + 4).toFixed(1), 'font-size': 12, fill: '#c9d4f0' }, n]];
		}),
		['text', { x: (px - 10).toFixed(1), y: (py + 20).toFixed(1), 'font-size': 11, fill: '#9fb0d8', 'text-anchor': 'end' }, 'perihelion 1986 & 2061'],
		['circle', { cx: hx.toFixed(1), cy: hy.toFixed(1), r: 6, fill: '#c7dcec', stroke: '#01020a', 'stroke-width': 1.5 }],
		['text', { x: (hx + (hx > C ? -10 : 10)).toFixed(1), y: (hy + 18).toFixed(1), 'font-size': 13, fill: '#edf2ff', 'font-weight': 700, 'text-anchor': hx > C ? 'end' : 'start' }, 'Halley now'],
		['text', { x: 8, y: 576, 'font-size': 11, fill: '#9fb0d8' }, `Top-down view to scale, ${fmtDate(days)}. Halley orbits the opposite way to the planets (clockwise here);`],
		['text', { x: 8, y: 592, 'font-size': 11, fill: '#9fb0d8' }, 'Earth’s orbit is the small ring round the Sun.']
	];
	return { stamp: fmtDateTime(days), summary, stats, map, nextShort: `${fmtDate(next)} — in ${span(days, next)}` };
}

function render() {
	const v = halleyView(Date.now() / 86400000 + 2440587.5 - J2000);
	document.getElementById('stamp').textContent = v.stamp;
	document.getElementById('summary').textContent = v.summary;
	document.getElementById('nextShort').textContent = v.nextShort;
	fill('stats', v.stats);
	const svg = document.getElementById('halleymap');
	for (const e of [...svg.children]) if (e.tagName.toLowerCase() !== 'title') e.remove();
	for (const n of flatten(v.map)) svg.appendChild(toDOM(n, true));
}
if (typeof document !== 'undefined') { render(); setInterval(render, 60000); }

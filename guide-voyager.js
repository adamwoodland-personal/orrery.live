// /voyager-1/ — "Where is Voyager 1 now?": live distance, speed and direction, the one
// light-day milestone and a side-view map, from the same JPL Horizons trajectories as the
// 3D orrery (spacecraft.js) and the planets in guide-orbits.js. voyagerView(days) builds
// plain view trees (see guide-ui.js) so the publish-time build pre-renders the page's
// snapshot (ReferenceFiles/orrery-guides/build-guides.mjs) and, in the browser, replaces it
// with live values every minute.
import { AU_KM, LIGHT_S_PER_AU, J2000, COLOR, helio, daysToDate, fmtDate, fmtDateTime } from './guide-orbits.js';
import { fill, toDOM, flatten } from './guide-ui.js';
import { TRAJ } from './spacecraft.js';
import { constellationAt } from './night-sky/constellation-names.js';

const DEG = Math.PI / 180, EPS = 23.4392911 * DEG;
const dayOf = (y, m, d) => Date.UTC(y, m - 1, d) / 86400000 + 2440587.5 - J2000;
export const LIGHT_DAY_AU = 86400 / LIGHT_S_PER_AU; // 173.14 AU
// NASA's time for Voyager 1 reaching one light-day from Earth: 18 Nov 2026, 5:16:07 am EST.
// The countdown runs from this fixed moment; this site's model crosses about five minutes later.
export const LIGHT_DAY_T = Date.UTC(2026, 10, 18, 10, 16, 7) / 86400000 + 2440587.5 - J2000;
const CRAFT = {
	v1: { name: 'Voyager 1', launch: dayOf(1977, 9, 5), color: '#7fe3ff' },
	v2: { name: 'Voyager 2', launch: dayOf(1977, 8, 20), color: '#c6a8ff' },
	p10: { name: 'Pioneer 10', color: '#8f9bbd' },
	p11: { name: 'Pioneer 11', color: '#8f9bbd' },
	nh: { name: 'New Horizons', color: '#a3d69a' }
};

// Same as craftEcl in app.js: linear between the 180-day Horizons samples, extrapolated on
// the final heading after the last one.
function craftAt(tr, days) {
	const f = (days - tr.t0) / tr.dt;
	if (f < 0) return null;
	const n = tr.p.length / 3;
	let i = Math.floor(f), t = f - i;
	if (i >= n - 1) { i = n - 2; t = f - i; }
	const a = i * 3, b = a + 3;
	return {
		x: tr.p[a] + (tr.p[b] - tr.p[a]) * t,
		y: tr.p[a + 1] + (tr.p[b + 1] - tr.p[a + 1]) * t,
		z: tr.p[a + 2] + (tr.p[b + 2] - tr.p[a + 2]) * t
	};
}
const len = (p) => Math.hypot(p.x, p.y, p.z);
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const fromEarth = (key, days) => len(sub(craftAt(TRAJ[key], days), helio('Earth', days)));

function state(key, days) {
	const tr = TRAJ[key], p = craftAt(tr, days), g = sub(p, helio('Earth', days)), r = len(p);
	const v = len(sub(craftAt(tr, days + 0.5), craftAt(tr, days - 0.5))) * AU_KM / 86400;
	// Direction from Earth, ecliptic → equatorial J2000, for the constellation.
	const y = g.y * Math.cos(EPS) - g.z * Math.sin(EPS), z = g.y * Math.sin(EPS) + g.z * Math.cos(EPS);
	const ra = (Math.atan2(y, g.x) / DEG + 360) % 360, dec = Math.atan2(z, Math.hypot(g.x, y)) / DEG;
	return { p, r, dE: len(g), v, lat: Math.asin(p.z / r) / DEG, ra, dec, con: constellationAt(ra, dec) };
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const bn = (au) => `${(au * AU_KM / 1e9).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} billion km`;
export const kmText = (au) => `${Math.round(au * AU_KM).toLocaleString('en-GB')} km`;
const lightMin = (au) => Math.round(au * LIGHT_S_PER_AU / 60);
const hm = (au) => { const m = lightMin(au); return `${Math.floor(m / 60)} h ${m % 60} min`; };
const hmWords = (au) => { const m = lightMin(au); return `${plural(Math.floor(m / 60), 'hour')} and ${plural(m % 60, 'minute')}`; };
const raText = (ra) => { const m = Math.round(ra / 15 * 60) % 1440; return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };
const decText = (d) => `${d < 0 ? '−' : '+'}${Math.abs(Math.round(d))}°`;
const side = (lat) => `${Math.abs(lat).toFixed(0)}° ${lat >= 0 ? 'above' : 'below'} the plane of the planets`;
const kmh = (v) => `about ${(Math.round(v * 3.6) * 1000).toLocaleString('en-GB')} km/h`;
const auYear = (v) => (v * 86400 * 365.25 / AU_KM).toFixed(1);
// "49 years and 1 month" between two dates (calendar months, rounded down).
function span(fromDays, toDays) {
	const a = daysToDate(fromDays), b = daysToDate(toDays);
	let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
	if (b.getUTCDate() < a.getUTCDate()) months--;
	const y = Math.floor(months / 12), m = months % 12;
	if (y === 0) return plural(m, 'month');
	return `${plural(y, 'year')}${m ? ` and ${plural(m, 'month')}` : ''}`;
}
// Time to or from the light-day moment, in words.
function until(days) {
	const min = Math.max(0, Math.floor((LIGHT_DAY_T - days) * 1440)), h = Math.floor(min / 60);
	if (h >= 48) return `${plural(Math.floor(h / 24), 'day')}${h % 24 ? ` and ${plural(h % 24, 'hour')}` : ''}`;
	if (h >= 1) return `${plural(h, 'hour')} and ${plural(min % 60, 'minute')}`;
	return min ? plural(min, 'minute') : 'less than a minute';
}
function ago(days) {
	const min = Math.floor((days - LIGHT_DAY_T) * 1440), h = Math.floor(min / 60), d = Math.floor(h / 24);
	if (h < 1) return `${plural(min, 'minute')} ago`;
	if (h < 48) return `${plural(h, 'hour')} ago`;
	if (d < 60) return `${d} days ago`;
	return `${span(LIGHT_DAY_T, days)} ago`;
}

function statRows(key, s, days, extra) {
	return [
		['dt', null, 'From Earth'], ['dd', null, `${s.dE.toFixed(2)} AU`, ['span', { class: 'sub', id: key + 'km' }, kmText(s.dE)]],
		['dt', null, 'Radio signal'], ['dd', null, hm(s.dE), ['span', { class: 'sub' }, 'one way, at the speed of light']],
		['dt', null, 'From the Sun'], ['dd', null, `${s.r.toFixed(2)} AU`, ['span', { class: 'sub' }, bn(s.r)]],
		['dt', null, 'Speed'], ['dd', null, `${s.v.toFixed(1)} km/s`, ['span', { class: 'sub' }, `${kmh(s.v)}, ${auYear(s.v)} AU a year`]],
		extra,
		['dt', null, 'Direction'], ['dd', null, s.con, ['span', { class: 'sub' }, `${side(s.lat)}; RA ${raText(s.ra)}, Dec ${decText(s.dec)}`]],
		['dt', null, 'Launched'], ['dd', null, fmtDate(CRAFT[key].launch), ['span', { class: 'sub' }, `${span(CRAFT[key].launch, days)} ago`]]
	];
}

// Side view to scale, looking along the plane of the planets, square to Voyager 1's
// direction: Voyager 1 is drawn at its true distance and angle, the others foreshortened.
function sideMap(days, s1) {
	const L = Math.atan2(s1.p.y, s1.p.x), cL = Math.cos(L), sL = Math.sin(L);
	const C = 300, K = 250 / Math.max(LIGHT_DAY_AU, s1.r), f = (n) => n.toFixed(1);
	const xy = (p) => [C + (p.x * cL + p.y * sL) * K, C - p.z * K];
	const label = (x, y, text, o = {}) => ['text', { x: f(x), y: f(y), 'font-size': o.size || 14, fill: o.fill || '#c9d4f0', 'font-weight': o.bold ? 700 : null,
		'text-anchor': o.anchor || 'start', stroke: '#01020a', 'stroke-width': 3, 'stroke-linejoin': 'round', 'paint-order': 'stroke' }, text];
	const path = (key) => {
		const tr = TRAJ[key], pts = [];
		for (let d = tr.t0; d < days; d += tr.dt) pts.push(xy(craftAt(tr, d)));
		pts.push(xy(craftAt(tr, days)));
		return 'M' + pts.map(([x, y]) => f(x) + ',' + f(y)).join('L');
	};
	const ld = LIGHT_DAY_AU * K, nep = 30.07 * K;
	const out = [
		['circle', { cx: C, cy: C, r: f(ld), fill: 'none', stroke: 'rgba(255,209,102,0.55)', 'stroke-dasharray': '5 5' }],
		label(C, C - ld - 8, `one light-day from Earth (${LIGHT_DAY_AU.toFixed(0)} AU)`, { anchor: 'middle', fill: '#ffd166', size: 15 }),
		['line', { x1: f(C - nep), y1: C, x2: f(C + nep), y2: C, stroke: 'rgba(138,172,255,0.7)', 'stroke-width': 2 }]
	];
	for (const k of ['p10', 'p11', 'nh', 'v2', 'v1']) {
		const vg = k === 'v1' || k === 'v2';
		out.push(['path', { d: path(k), fill: 'none', stroke: CRAFT[k].color, 'stroke-width': vg ? 1.6 : 1.1, 'stroke-opacity': vg ? 1 : 0.75 }]);
	}
	out.push(['circle', { cx: C, cy: C, r: 5, fill: COLOR.Sun }], label(C, C - 11, 'Sun', { anchor: 'middle' }),
		label(C, C + 22, 'the planets, out to Neptune', { anchor: 'middle', fill: '#9fb0d8' }));
	for (const [k, d, year, end] of [['v1', dayOf(2012, 8, 25), 2012, true], ['v2', dayOf(2018, 11, 5), 2018, false]]) {
		const [x, y] = xy(craftAt(TRAJ[k], d));
		out.push(['circle', { cx: f(x), cy: f(y), r: 4, fill: '#01020a', stroke: CRAFT[k].color, 'stroke-width': 1.5 }],
			label(end ? x - 8 : x + 8, y + 4, `left the heliosphere, ${year}`, { anchor: end ? 'end' : 'start', fill: '#9fb0d8', size: 13 }));
	}
	for (const k of ['p10', 'p11', 'nh', 'v2', 'v1']) {
		const [x, y] = xy(craftAt(TRAJ[k], days)), vg = k === 'v1' || k === 'v2';
		out.push(['circle', { cx: f(x), cy: f(y), r: vg ? 6 : 4, fill: CRAFT[k].color, stroke: '#01020a', 'stroke-width': 1.5 }]);
		if (k === 'v1') out.push(label(x, y - 40, 'Voyager 1', { anchor: 'middle', bold: true, size: 17, fill: '#edf2ff' }), label(x, y - 16, `${Math.abs(s1.lat).toFixed(0)}° above the planets`, { anchor: 'middle' }));
		else if (k === 'v2') {
			const lat = Math.asin(craftAt(TRAJ.v2, days).z / len(craftAt(TRAJ.v2, days))) / DEG;
			out.push(label(x, y + 27, 'Voyager 2', { anchor: 'middle', bold: true, size: 17, fill: '#edf2ff' }), label(x, y + 51, `${Math.abs(lat).toFixed(0)}° below the planets`, { anchor: 'middle' }));
		} else if (k === 'p10') out.push(label(x, y + 23, 'Pioneer 10', { anchor: 'middle', fill: '#9fb0d8' }));
		else out.push(label(x + 10, y + 5, CRAFT[k].name, { fill: '#9fb0d8' }));
	}
	return out;
}

export function voyagerView(days) {
	const s1 = state('v1', days), s2 = state('v2', days), before = days < LIGHT_DAY_T;
	const summary = `Voyager 1 is ${s1.dE.toFixed(2)} AU (${bn(s1.dE)}) from Earth right now, farther than any other spacecraft has ever been, ` +
		`so a radio signal takes ${hmWords(s1.dE)} to reach it. It is leaving the solar system at ${s1.v.toFixed(1)} km/s, ${side(s1.lat)}, towards the constellation ${s1.con}. ` +
		(before ? `It will be one light-day from Earth, the distance light travels in 24 hours, on 18 November 2026 at 10:16 UTC: in ${until(days)}.`
		        : `It passed one light-day from Earth, the distance light travels in 24 hours, on 18 November 2026 at 10:16 UTC, ${ago(days)}.`);
	const ldRow = [['dt', null, 'One light-day'], before
		? ['dd', null, `in ${until(days)}`, ['span', { class: 'sub' }, '18 Nov 2026, 10:16 UTC (NASA)']]
		: ['dd', null, `passed ${ago(days)}`, ['span', { class: 'sub' }, 'on 18 Nov 2026, 10:16 UTC (NASA)']]];
	return {
		stamp: fmtDateTime(days), summary,
		stats: statRows('v1', s1, days, ldRow),
		stats2: statRows('v2', s2, days, null),
		ldShort: before ? `in ${until(days)}` : ago(days),
		map: sideMap(days, s1)
	};
}

const nowDays = () => Date.now() / 86400000 + 2440587.5 - J2000;
function render() {
	const v = voyagerView(nowDays());
	document.getElementById('stamp').textContent = v.stamp;
	document.getElementById('summary').textContent = v.summary;
	document.getElementById('ldShort').textContent = v.ldShort;
	fill('stats', v.stats);
	fill('stats2', v.stats2);
	const svg = document.getElementById('voyagermap');
	for (const e of [...svg.children]) if (e.tagName.toLowerCase() !== 'title') e.remove();
	for (const n of flatten(v.map)) svg.appendChild(toDOM(n, true));
}
// The kilometre figures tick every second; the last digits show the motion, not the precision.
function tick() {
	const d = nowDays();
	for (const k of ['v1', 'v2']) { const e = document.getElementById(k + 'km'); if (e) e.textContent = kmText(fromEarth(k, d)); }
}
if (typeof document !== 'undefined') {
	const local = document.getElementById('ldLocal');
	if (local) local.textContent = ` In your time zone: ${new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
		.format(new Date(Date.UTC(2026, 10, 18, 10, 16, 7)))}.`;
	render(); setInterval(render, 60000); setInterval(tick, 1000);
}

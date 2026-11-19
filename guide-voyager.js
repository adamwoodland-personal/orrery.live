// /voyager-1/ — "Where is Voyager 1 now?": live distance, speed and direction, the one
// light-day milestone and a side-view map, from the same JPL Horizons trajectories as the
// 3D orrery (spacecraft.js) and the planets in guide-orbits.js. voyagerView(days) builds
// plain view trees (see guide-ui.js) so the publish-time build pre-renders the page's
// snapshot (ReferenceFiles/orrery-guides/build-guides.mjs, which passes { snapshot: true }:
// absolute times only, no "in 3 hours" that would go stale) and, in the browser, replaces it
// with live values: the countdown every second, everything else every minute.
import { AU_KM, LIGHT_S_PER_AU, J2000, COLOR, helio, daysToDate, fmtDate, fmtDateTime } from './guide-orbits.js';
import { fill, toDOM, flatten } from './guide-ui.js';
import { TRAJ } from './spacecraft.js';
import { constellationAt } from './night-sky/constellation-names.js';

const DEG = Math.PI / 180, EPS = 23.4392911 * DEG;
const dayOf = (y, m, d) => Date.UTC(y, m - 1, d) / 86400000 + 2440587.5 - J2000;
export const LIGHT_DAY_AU = 86400 / LIGHT_S_PER_AU; // 173.14 AU
// NASA's time for Voyager 1 reaching one light-day from Earth: 18 Nov 2026, 5:16:07 am EST.
// The countdown and every "before/after" switch run from this fixed moment. This site's model
// crosses 5 min 44 s later (10:21:51 UTC; 8,735 km short at NASA's moment, with the Earth
// distance growing ~25.4 km/s), which the page explains in #model.
export const LIGHT_DAY_MS = Date.UTC(2026, 10, 18, 10, 16, 7);
export const LIGHT_DAY_T = LIGHT_DAY_MS / 86400000 + 2440587.5 - J2000;
const msOf = (days) => (days + J2000 - 2440587.5) * 86400000;
// NASA's own events around it (checked 17 Nov 2026 against NASA's advisory, updated 13 Nov,
// and the Shine Bright page, updated 16 Nov). Shine Bright is "after sunset" in local time
// on 17 Nov; the JPL discussion starts 12 pm EST on 19 Nov, length unannounced (3 h assumed).
const SHINE_DATE = '2026-11-17';
const TALK_MS = Date.UTC(2026, 10, 19, 17, 0, 0), TALK_END_MS = TALK_MS + 3 * 3600000;
const URL_NASA_LD = 'https://science.nasa.gov/mission/voyager/voyager-1/voyager-1-what-is-a-light-day/';
const URL_SHINE = 'https://science.nasa.gov/mission/voyager/voyager-1/shine-bright-for-voyagers-light-day/';
const URL_VGR = 'https://go.nasa.gov/vgr', URL_LIVE = 'https://www.nasa.gov/live', URL_VOYAGER = 'https://science.nasa.gov/mission/voyager/';
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
// Distance as light-travel time, rounded DOWN to the second: rounding to the nearest minute
// showed "24 h 0 min" for days before the crossing while the page still counted down to it.
const lightHMS = (au) => { const s = Math.floor(au * LIGHT_S_PER_AU); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]; };
export const hms = (au) => { const [h, m, s] = lightHMS(au); return `${h} h ${m} min ${s} s`; };
const hmsWords = (au) => { const [h, m, s] = lightHMS(au); return `${plural(h, 'hour')}, ${plural(m, 'minute')} and ${plural(s, 'second')}`; };
const p2 = (n) => String(n).padStart(2, '0');
// The countdown clock, HH:MM:SS to NASA's moment (hours keep counting past 24). Rounded up,
// so it reads 00:00:01 in the last second and the page flips to "Milestone reached" at 0.
export function clockText(ms) {
	const s = Math.max(0, Math.ceil((LIGHT_DAY_MS - ms) / 1000));
	return `${p2(Math.floor(s / 3600))}:${p2(Math.floor(s / 60) % 60)}:${p2(s % 60)}`;
}
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
// null in the first minute after the moment: the callers then say "Milestone reached" (or
// "less than a minute ago" inside a sentence) rather than "0 minutes ago".
function ago(days) {
	const min = Math.floor((days - LIGHT_DAY_T) * 1440), h = Math.floor(min / 60), d = Math.floor(h / 24);
	if (min < 1) return null;
	if (h < 1) return `${plural(min, 'minute')} ago`;
	if (h < 48) return `${plural(h, 'hour')} ago`;
	if (d < 60) return `${d} days ago`;
	return `${span(LIGHT_DAY_T, days)} ago`;
}

function statRows(key, s, days, extra) {
	return [
		['dt', null, 'From Earth'], ['dd', null, `${s.dE.toFixed(2)} AU`, ['span', { class: 'sub', id: key + 'km' }, kmText(s.dE)]],
		['dt', null, 'Light time'], ['dd', null, ['span', { id: key + 'lt' }, hms(s.dE)], ['span', { class: 'sub' }, 'distance expressed as light-travel time']],
		['dt', null, 'From the Sun'], ['dd', null, `${s.r.toFixed(2)} AU`, ['span', { class: 'sub' }, bn(s.r)]],
		['dt', null, 'Speed'], ['dd', null, `${s.v.toFixed(1)} km/s`, ['span', { class: 'sub' }, `${kmh(s.v)}, ${auYear(s.v)} AU a year`]],
		extra,
		['dt', null, 'Direction'], ['dd', null, s.con, ['span', { class: 'sub' }, `${side(s.lat)}; RA ${raText(s.ra)}, Dec ${decText(s.dec)}`]],
		['dt', null, 'Launched'], ['dd', null, fmtDate(CRAFT[key].launch), ['span', { class: 'sub' }, `${span(CRAFT[key].launch, days)} ago`]]
	];
}

// Side view to scale, looking along the plane of the planets, square to Voyager 1's
// direction: Voyager 1 is drawn at its true distance and angle, the others foreshortened.
// The Sun is at the centre (C, C); Earth is not drawn (its orbit is inside the Sun's dot).
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
	// The light-day circle is centred on Earth as seen in this view (within 1 AU of the Sun, so about
	// a pixel away), which puts Voyager 1 inside it exactly while it is less than a light-day from
	// Earth (Earth's depth out of the view changes that distance by 0.003 AU at most). Centred on the
	// Sun, it showed Voyager 1 still inside for about three months after the crossing.
	const [ex, ey] = xy(helio('Earth', days));
	const out = [
		['circle', { cx: f(ex), cy: f(ey), r: f(ld), fill: 'none', stroke: 'rgba(255,209,102,0.55)', 'stroke-dasharray': '5 5' }],
		label(ex, ey - ld - 8, `one light-day from Earth (${LIGHT_DAY_AU.toFixed(0)} AU)`, { anchor: 'middle', fill: '#ffd166', size: 15 }),
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

const WHEN_UTC = 'Wednesday 18 November 2026 at 10:16:07 UTC';
// The countdown card (#ldcard). Live: HH:MM:SS to NASA's moment, the moment in UTC and in the
// visitor's own zone (o.local), then "Milestone reached". Snapshot: the absolute time only.
function ldCard(ms, days, o) {
	const before = ms < LIGHT_DAY_MS, a = before ? null : ago(days);
	const src = ['p', { class: 'ldsrc' }, 'Time from ', ['a', { href: URL_NASA_LD, rel: 'noopener' }, 'NASA'],
		'. This site’s own model crosses 5 min 44 s later (', ['a', { href: '#model' }, 'why'], ').',
		...(ms < TALK_END_MS ? [' ', ['a', { href: '#celebrate' }, 'Join NASA’s celebration'], '.'] : [])];
	const yours = o.local ? ` Your time: ${o.local}.` : '';
	if (before) return [
		['p', { class: 'ldlabel' }, `Voyager 1 reaches one light-day from Earth ${o.snapshot ? 'on' : 'in'}`],
		o.snapshot ? ['p', { class: 'ldbig ldword' }, '18 November 2026'] : ['p', { class: 'ldbig', id: 'ldClock', role: 'timer' }, clockText(ms)],
		['p', { class: 'ldwhen' }, o.snapshot ? 'Wednesday, at 10:16:07 UTC (5:16:07 am EST)' : `${WHEN_UTC}.${yours}`], src];
	return [
		['p', { class: 'ldlabel' }, 'Voyager 1, one light-day from Earth'],
		['p', { class: 'ldbig ldword' }, 'Milestone reached'],
		['p', { class: 'ldwhen' }, o.snapshot ? `Passed on ${WHEN_UTC} (5:16:07 am EST).` : `Passed ${a || 'just now'}, on ${WHEN_UTC}.${yours}`], src];
}

// "Join the celebration" (#events): NASA's two events either side of the crossing, kept
// visibly separate from the crossing itself. Shine Bright goes by the visitor's own date
// (o.localDate), since it is "after sunset" wherever they are.
function events(ms, o) {
	const shine = o.snapshot ? (ms >= Date.UTC(2026, 10, 18, 12) ? 'past' : 'soon')
		: o.localDate > SHINE_DATE ? 'past' : o.localDate === SHINE_DATE ? 'tonight' : 'soon';
	const talk = ms >= TALK_END_MS ? 'past' : ms >= TALK_MS ? 'on' : 'soon';
	const when = (tag, text) => ['p', { class: 'evwhen' }, ['span', { class: 'evtag' }, tag], ' ', text];
	const link = (href, text) => ['a', { href, rel: 'noopener' }, text];
	const morse = 'Voyager’s call sign, V-G-R, at the sky in Morse code (dot-dot-dot-dash, dash-dash-dot, dot-dash-dot)';
	return [
		['p', null, talk === 'past'
			? 'NASA celebrated the milestone with two events of its own, the evening before the crossing and the day after it.'
			: 'NASA is celebrating the milestone with two events of its own, the evening before the crossing and the day after it. They are separate from the crossing itself, which comes at NASA’s time whatever anyone does.'],
		['ol', { class: 'events' },
			['li', null,
				when('NASA event', shine === 'tonight' ? 'Tonight, Tuesday 17 November, after sunset' : shine === 'past' ? 'Tuesday 17 November, after sunset' : 'Tuesday 17 November, after sunset where you are'),
				['p', null, ['b', null, link(URL_SHINE, 'Shine Bright for Voyager’s Light-Day')], ...(shine === 'past'
					? [`: NASA invited everyone to flash ${morse}, making a wave of light round the world as night fell.`]
					: [`: flash ${morse} for about a minute, with a torch, a phone or a glow stick. NASA’s flasher page turns a phone into the light: `, link(URL_VGR, 'go.nasa.gov/vgr'),
						'. Share a photo or video and tag @NASA. It is a symbolic wave of light round the world: the flashes do not reach the spacecraft.'])]],
			['li', { class: 'milestone' },
				when('The crossing', `Wednesday 18 November, 10:16:07 UTC${o.local ? `; your time: ${o.local}` : ''}`),
				['p', null, ...(ms < LIGHT_DAY_MS
					? ['Voyager 1 reaches one light-day from Earth', ...(o.snapshot ? [] : [' (', ['a', { href: '#countdown' }, 'the countdown'], ' is at the top of this page)']),
						'. It is a milestone of distance, not a manoeuvre, so nothing changes on board.']
					: ['Voyager 1 passed one light-day from Earth. It is a milestone of distance, not a manoeuvre, so nothing changed on board.'])]],
			['li', null,
				when('NASA event', talk === 'past' ? 'Thursday 19 November' : `Thursday 19 November, 12 pm EST (17:00 UTC)${o.talkLocal ? `; your time: ${o.talkLocal}` : ''}`),
				['p', null, ['b', null, 'Live discussion from NASA JPL'], ...(talk === 'past'
					? [': NASA hosted a moderated discussion with the Voyager team at JPL, with a preview of the NASA+ Voyager documentary due in 2027. More from NASA: ', link(URL_VOYAGER, 'Voyager'), '.']
					: talk === 'on'
					? [': it started at 12 pm EST (17:00 UTC) in JPL’s von Kármán Auditorium, with NASA science leaders and the Voyager team. Watch at ', link(URL_LIVE, 'nasa.gov/live'), '.']
					: [': a moderated discussion with NASA science leaders and the Voyager team in JPL’s von Kármán Auditorium, with questions from the audience and a preview of the NASA+ Voyager documentary, due in 2027 for the mission’s 50th anniversary. Watch it at ',
						link(URL_LIVE, 'nasa.gov/live'), '.'])]]]
	];
}

// o.snapshot: the publish-time build (absolute times only). In the browser, o.local and
// o.talkLocal are NASA's moment and the JPL discussion in the visitor's zone, and o.localDate
// is the visitor's own date (YYYY-MM-DD).
export function voyagerView(days, o = {}) {
	const ms = msOf(days), s1 = state('v1', days), s2 = state('v2', days), before = ms < LIGHT_DAY_MS, a = before ? null : ago(days);
	const summary = `Voyager 1 is ${s1.dE.toFixed(2)} AU (${bn(s1.dE)}) from Earth right now, farther than any other spacecraft has ever been: ` +
		`light takes ${hmsWords(s1.dE)} to cross that distance. It is leaving the solar system at ${s1.v.toFixed(1)} km/s, ${side(s1.lat)}, towards the constellation ${s1.con}. ` +
		(before ? `It will be one light-day from Earth, the distance light travels in 24 hours, on 18 November 2026 at 10:16 UTC${o.snapshot ? '' : `: in ${until(days)}`}.`
		        : `It passed one light-day from Earth, the distance light travels in 24 hours, on 18 November 2026 at 10:16 UTC${o.snapshot ? '' : `, ${a || 'less than a minute ago'}`}.`);
	const ldRow = [['dt', null, 'One light-day'], before
		? ['dd', null, o.snapshot ? '18 Nov 2026' : `in ${until(days)}`, ['span', { class: 'sub' }, `${o.snapshot ? '' : '18 Nov 2026, '}10:16:07 UTC (NASA)`]]
		: ['dd', null, 'Milestone reached', ['span', { class: 'sub' }, `${o.snapshot ? '' : `passed ${a || 'just now'}: `}18 Nov 2026, 10:16:07 UTC (NASA)`]]];
	return {
		stamp: fmtDateTime(days), summary,
		stats: statRows('v1', s1, days, ldRow),
		stats2: statRows('v2', s2, days, null),
		ldShort: o.snapshot ? '' : before ? ` (in ${until(days)})` : ` (${a || 'milestone reached'})`,
		lead: before
			? 'On 18 November 2026 it reaches one light-day from Earth, the first spacecraft ever to get so far: from then on a radio signal takes more than a day to cross the gap.'
			: 'On 18 November 2026 it became the first spacecraft ever to reach one light-day from Earth: a radio signal now takes more than a day to cross the gap.',
		ldcard: ldCard(ms, days, o),
		events: events(ms, o),
		map: sideMap(days, s1)
	};
}

const nowDays = (ms = Date.now()) => ms / 86400000 + 2440587.5 - J2000;
// Changes whenever any countdown/"ago" wording would: tick() re-renders the moment it does,
// so the page flips to "Milestone reached" on the second, not up to a minute late.
const phaseKey = (d) => d < LIGHT_DAY_T ? 'in ' + until(d) : 'ago ' + ago(d);
let opts = {}, shown = '';
function render() {
	const d = nowDays(), v = voyagerView(d, opts);
	shown = phaseKey(d);
	document.getElementById('stamp').textContent = v.stamp;
	document.getElementById('summary').textContent = v.summary;
	document.getElementById('ldShort').textContent = v.ldShort;
	document.getElementById('leadLd').textContent = v.lead;
	fill('ldcard', v.ldcard);
	fill('events', v.events);
	fill('stats', v.stats);
	fill('stats2', v.stats2);
	const svg = document.getElementById('voyagermap');
	for (const e of [...svg.children]) if (e.tagName.toLowerCase() !== 'title') e.remove();
	for (const n of flatten(v.map)) svg.appendChild(toDOM(n, true));
}
// Every second, just after the second turns: the countdown clock, and the kilometre and
// light-time figures (the last digits show the motion, not the precision).
function tick() {
	const now = Date.now(), d = nowDays(now);
	if (phaseKey(d) !== shown) render();
	const c = document.getElementById('ldClock');
	if (c) c.textContent = clockText(now);
	for (const k of ['v1', 'v2']) {
		const dE = fromEarth(k, d), km = document.getElementById(k + 'km'), lt = document.getElementById(k + 'lt');
		if (km) km.textContent = kmText(dE);
		if (lt) lt.textContent = hms(dE);
	}
	setTimeout(tick, 1020 - (Date.now() % 1000));
}
if (typeof document !== 'undefined') {
	const fmt = (ms, sec) => new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
		second: sec ? '2-digit' : undefined, timeZoneName: 'short' }).format(new Date(ms));
	// Visitors on UTC/GMT get no "your time" (it would repeat the UTC time beside it).
	const zoned = (ms) => new Date(ms).getTimezoneOffset() !== 0;
	opts = { local: zoned(LIGHT_DAY_MS) ? fmt(LIGHT_DAY_MS, true) : null, talkLocal: zoned(TALK_MS) ? fmt(TALK_MS, false) : null,
		get localDate() { const n = new Date(); return `${n.getFullYear()}-${p2(n.getMonth() + 1)}-${p2(n.getDate())}`; } };
	const local = document.getElementById('ldLocal');
	if (local && zoned(LIGHT_DAY_MS)) local.textContent = ` In your time zone: ${fmt(LIGHT_DAY_MS, false)}.`;
	render(); setInterval(render, 60000); tick();
}

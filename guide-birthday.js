// /planets-on-your-birthday/ — "Where were the planets on the day you were born?" For any date
// from 1000 to 3000 AD: which planets were in the evening or morning sky, the constellation each
// one (and the Sun and Moon) was in, how bright and how far away, which were moving retrograde,
// the Moon's phase, a top-down map, and the visitor's age in each planet's years.
// The sky comes from the night-sky page's model (night-sky/astro.js: VSOP87 and Meeus, checked
// against JPL Horizons) at noon UTC on the date; the map from the orrery's own elements
// (guide-map.js), so it matches the 3D view the page links to. birthdayView() builds plain view
// trees (see guide-ui.js), so build-guides.mjs pre-renders the example date into the HTML and the
// browser replaces it with the visitor's own date. ?date=YYYY-MM-DD opens a date directly.
import { AU_KM, NAKED_EYE, dateToDays, daysToDate, skyPhrase, skySpan, wrap180, wrap360 } from './guide-orbits.js';
import { bodyJ2000, elongation, magnitude, moonPhase, deltaT } from './night-sky/astro.js';
import { constellationAt } from './night-sky/constellation-names.js';
import { topDownMap } from './guide-map.js';
import { fill, toDOM, flatten, listNames } from './guide-ui.js';

export const EXAMPLE = '2000-01-01';
export const MIN_YEAR = 1000, MAX_YEAR = 3000;
const RAD = 180 / Math.PI, EPS = 23.4392911 / RAD; // J2000 obliquity: equatorial -> ecliptic
const PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
// One year on each world: sidereal orbital periods in Earth days (NASA planetary fact sheets).
const YEAR = { Mercury: 87.969, Venus: 224.701, Earth: 365.256, Mars: 686.980, Jupiter: 4332.59,
	Saturn: 10759.22, Uranus: 30685.4, Neptune: 60189, Pluto: 90560 };
const KM_PER_DAY = 29.78 * 86400; // the Earth's mean speed round the Sun
// Share of days from 1900 to 2100 on which the five naked-eye planets fit in an arc of sky of at
// most 0°, 5°, … 360° (ReferenceFiles/orrery-guides/gen-span-cdf.mjs; median 172.5°, tightest 9.5°).
const SPAN_CDF = [0, 0, 0, 0.0002, 0.0007, 0.0013, 0.0025, 0.0039, 0.0057, 0.0089, 0.0116, 0.0168, 0.0227, 0.032, 0.0416, 0.0505, 0.0607, 0.0736, 0.0889, 0.1061, 0.1222, 0.1414, 0.1589, 0.1779, 0.2005, 0.2259, 0.2494, 0.2748, 0.3025, 0.3285, 0.3561, 0.3839, 0.4131, 0.4428, 0.4796, 0.5189, 0.5577, 0.5947, 0.6342, 0.6721, 0.7108, 0.7495, 0.786, 0.8195, 0.8517, 0.8822, 0.9107, 0.9325, 0.9517, 0.9678, 0.9788, 0.9865, 0.993, 0.9971, 0.9989, 0.9998, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
const PHASE_WORDS = { 'New Moon': 'new', 'Waxing crescent': 'a waxing crescent', 'First quarter': 'at first quarter',
	'Waxing gibbous': 'a waxing gibbous', 'Full Moon': 'full', 'Waning gibbous': 'a waning gibbous',
	'Last quarter': 'at last quarter', 'Waning crescent': 'a waning crescent' };

const longFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
const noonUTC = (y, m, d) => { const t = new Date(0); t.setUTCFullYear(y, m - 1, d); t.setUTCHours(12, 0, 0, 0); return t; };
export const longDate = (days) => longFmt.format(daysToDate(days));
const mag = (m) => (m < 0 ? '−' : '') + Math.abs(m).toFixed(1);
const seeWith = (m) => m <= 5.5 ? 'naked eye' : m <= 6.5 ? 'naked-eye limit' : 'binoculars or telescope';
const num = (x, d) => x.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
const ageText = (x) => num(Math.floor(x * 100 + 1e-9) / 100, 2); // ages count down, as usual: 29.99 until the birthday

// "YYYY-MM-DD" -> { iso, y, m, d, days } (days = noon UTC on that date), or { error }.
export function parseDate(s) {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? '').trim());
	if (!m) return { error: 'Enter a date as day, month and year.' };
	const y = +m[1], mo = +m[2], d = +m[3], t = noonUTC(y, mo, d);
	if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return { error: 'That date doesn’t exist.' };
	if (y < MIN_YEAR || y > MAX_YEAR) return { error: `Pick a date from ${MIN_YEAR} to ${MAX_YEAR} AD.` };
	return { iso: m[0], y, m: mo, d, days: dateToDays(t) };
}
// Noon UTC on a JS date's calendar day in the browser's own zone (the visitor's "today").
export const todayDays = (now = new Date()) => dateToDays(noonUTC(now.getFullYear(), now.getMonth() + 1, now.getDate()));

// Where a body was as seen from Earth: constellation, distance, ecliptic longitude.
function where(name, days) {
	const b = bodyJ2000(name, days), [x, y, z] = b.v;
	return { con: constellationAt(wrap360(Math.atan2(y, x) * RAD), Math.asin(z) * RAD), au: b.distAU,
		lon: wrap360(Math.atan2(y * Math.cos(EPS) + z * Math.sin(EPS), x) * RAD) };
}
const retrograde = (name, days) => wrap180(where(name, days + 1).lon - where(name, days - 1).lon) < 0;
function spanShare(span) {
	const i = Math.min(71, Math.floor(span / 5)), f = span / 5 - i;
	return SPAN_CDF[i] + (SPAN_CDF[i + 1] - SPAN_CDF[i]) * f;
}
// The orrery's ?t= is days of dynamical time (TT): add ΔT so it opens at noon UTC.
export const orreryT = (days) => (days + deltaT(days) / 86400).toFixed(5);

export function birthdayView(iso, today = todayDays()) {
	const p = parseDate(iso);
	if (p.error) return p;
	const { days } = p, long = longDate(days), t = orreryT(days);
	const groups = { evening: [], morning: [], night: [], glare: [] }, rows = [];
	for (const name of PLANETS) {
		const el = elongation(name, days), a = Math.abs(el), w = where(name, days), m = magnitude(name, days), retro = retrograde(name, days);
		groups[a < 15 ? 'glare' : a > 150 ? 'night' : el > 0 ? 'evening' : 'morning'].push(name);
		rows.push(['tr', null,
			['th', { scope: 'row' }, name],
			['td', { 'data-label': 'In the sky' }, skyPhrase(el), ['span', { class: 'sub' }, `${a.toFixed(0)}° ${el > 0 ? 'east' : 'west'} of the Sun`]],
			['td', { 'data-label': 'Constellation' }, w.con],
			['td', { class: 'num', 'data-label': 'Brightness' }, `mag ${mag(m)}`, a < 15 ? null : ['span', { class: 'sub' }, seeWith(m)]],
			['td', { class: 'num', 'data-label': 'From Earth' }, `${w.au.toFixed(2)} AU`, ['span', { class: 'sub' }, `${Math.round(w.au * AU_KM / 1e6).toLocaleString('en-GB')} million km`]],
			['td', { class: retro ? 'retro' : null, 'data-label': 'Motion' }, retro ? 'retrograde' : 'direct'],
			['td', { class: 'act' }, ['a', { href: `/?t=${t}&follow=${name}`, title: `Open the 3D orrery on this date, following ${name}` }, '3D view']]
		]);
	}
	const sun = where('Sun', days), moon = where('Moon', days), ph = moonPhase(days);
	const span = skySpan(NAKED_EYE, days), tighter = Math.round(100 * (1 - spanShare(span)));
	const were = Math.abs(days - today) < 0.5 ? 'are' : days < today ? 'were' : 'will be';
	const summary = `On ${long}, at noon UTC: the Sun in ${sun.con}; the Moon ${PHASE_WORDS[ph.name]}, ${Math.round(100 * ph.fraction)}% lit, in ${moon.con}. ` +
		`Evening sky after sunset: ${listNames(groups.evening)}. Morning sky before sunrise: ${listNames(groups.morning)}. ` +
		`Up most of the night: ${listNames(groups.night)}. Too close to the Sun to see: ${listNames(groups.glare)}.`;
	const spread = `As seen from Earth, the five planets you can see without a telescope (Mercury, Venus, Mars, Jupiter and Saturn) ${were} spread across ${span.toFixed(0)}° of sky: ` +
		(tighter >= 100 ? 'a tighter group than on any day from 1900 to 2100.' : tighter < 1 ? 'more spread out than on almost every day from 1900 to 2100.'
			: `a tighter group than on ${tighter}% of days from 1900 to 2100${tighter >= 95 ? ', a close gathering' : ''}.`);
	const notes = [];
	if (p.y < 1800 || p.y > 2200) notes.push('Dates before 1800 and after 2200 are less exact: positions may be out by up to about half a degree.');
	if (p.y < 1583) notes.push('Dates are in the modern (Gregorian) calendar. History books usually give dates before 1582 in the older Julian calendar, 6 to 10 days different.');
	const links = ['p', { class: 'ctarow' },
		['a', { class: 'cta', href: `/?t=${t}` }, 'Open the 3D orrery on this date'],
		['span', null, 'The night sky that day: ', ['a', { href: `/night-sky/?date=${p.iso}&when=dusk` }, 'after sunset'], ' · ',
			['a', { href: `/night-sky/?date=${p.iso}&when=dawn` }, 'before sunrise']]];
	return { iso: p.iso, head: `The planets on ${long}`, summary, spread, rows, notes: notes.join(' '), links,
		map: topDownMap(days, `Top-down view, ${long}. Planets move anticlockwise; 0° longitude is to the right.`),
		age: ageView(p, today) };
}

// Age on each world, and the date of the next birthday there.
function ageView(p, today) {
	const elapsed = Math.round(today - p.days);
	if (elapsed < 0) return ['p', null, `That date is still to come, ${(-elapsed).toLocaleString('en-GB')} days from today, so the planets above are where they will be.`];
	if (elapsed === 0) return ['p', null, 'That’s today, so the planets above are where they are now: see also ', ['a', { href: '/now/' }, 'where the planets are right now'], '.'];
	// On Earth, the calendar age: whole years since the date, plus the share of the current one.
	// (Someone born on 29 February has the birthday on 1 March in other years.)
	const ann = (k) => dateToDays(noonUTC(p.y + k, p.m, p.d));
	let k = 0; while (ann(k + 1) <= today) k++;
	const earthAge = k + (today - ann(k)) / (ann(k + 1) - ann(k));
	const rows = Object.keys(YEAR).map((name) => {
		const P = YEAR[name], age = name === 'Earth' ? earthAge : elapsed / P;
		const next = name === 'Earth' ? ann(k + 1) : p.days + (Math.floor(age) + 1) * P;
		const yr = P < 400 ? `${Math.round(P)} days` : `${num(P / 365.25, P < 3000 ? 2 : 1)} years`;
		return ['tr', null,
			['th', { scope: 'row' }, name, name === 'Pluto' ? ['span', { class: 'sub' }, 'dwarf planet'] : null],
			['td', { class: 'num', 'data-label': 'Your age there' }, ageText(age)],
			['td', { class: 'num', 'data-label': 'One year there' }, yr],
			['td', { 'data-label': 'Next birthday there' }, longDate(next)]
		];
	});
	return [
		['p', null, `From ${longDate(p.days)} to ${longDate(today)} is ${elapsed.toLocaleString('en-GB')} days. In that time the Earth has gone round the Sun ${ageText(earthAge)} times, carrying you about ${num(elapsed * KM_PER_DAY / 1e9, 1)} billion km.`],
		['div', { class: 'tablewrap' }, ['table', { class: 'stack ages' },
			['thead', null, ['tr', null, ['th', { scope: 'col' }, 'World'], ['th', { scope: 'col' }, 'Your age there'], ['th', { scope: 'col' }, 'One year there'], ['th', { scope: 'col' }, 'Next birthday there']]],
			['tbody', null, rows]]]
	];
}

// ---- Browser ---------------------------------------------------------------------------------------
function show(v, example) {
	document.getElementById('resultHead').textContent = v.head;
	document.getElementById('exampleNote').hidden = !example;
	document.getElementById('summary').textContent = v.summary;
	document.getElementById('spread').textContent = v.spread;
	const n = document.getElementById('dateNotes');
	n.textContent = v.notes; n.hidden = !v.notes;
	fill('planetRows', v.rows);
	fill('links', v.links);
	fill('age', v.age);
	const svg = document.getElementById('bdMap');
	for (const e of [...svg.children]) if (e.tagName.toLowerCase() !== 'title') e.remove();
	for (const node of flatten(v.map)) svg.appendChild(toDOM(node, true));
}
if (typeof document !== 'undefined') {
	const form = document.getElementById('bdForm'), input = document.getElementById('bdDate'), status = document.getElementById('bdStatus');
	const asked = new URLSearchParams(location.search).get('date');
	const first = asked !== null ? birthdayView(asked) : null;
	if (first && !first.error) { input.value = first.iso; show(first, false); }
	else {
		if (first) status.textContent = `The link’s date didn’t work: ${first.error.charAt(0).toLowerCase() + first.error.slice(1)}`;
		show(birthdayView(EXAMPLE), true);
	}
	form.addEventListener('submit', (e) => {
		e.preventDefault();
		const v = birthdayView(input.value);
		if (v.error) { status.textContent = v.error; input.focus(); return; }
		status.textContent = '';
		show(v, false);
		history.replaceState(null, '', `?date=${v.iso}`);
		const head = document.getElementById('resultHead');
		head.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
		head.focus({ preventScroll: true });
	});
}

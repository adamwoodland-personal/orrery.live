// /planetary-alignment/ — planet parades past and future (guide-parades.js),
// each with a strip showing where the planets sit relative to the Sun that day
// and which of them can really be seen, plus a live box describing today's sky.
// alignmentView(days) builds view trees so the page can be pre-rendered at
// publish time and refreshed in the browser.
import { NAKED_EYE, COLOR, dateToDays, daysToDate, geocentric, skySpan, fmtDate } from './guide-orbits.js';
import { PARADES, PARADE_SWEEP } from './guide-parades.js';
import { fill, listNames } from './guide-ui.js';

const INITIAL = { Mercury: 'Me', Venus: 'V', Mars: 'Ma', Jupiter: 'J', Saturn: 'S', Uranus: 'U', Neptune: 'N' };
const skyText = (p) => p.sky === 'dusk' ? 'evening sky, after sunset' : 'morning sky, before sunrise';
const orreryLink = (p) => `/?t=${p.days}&show=planet,labels,milkyway&view=top`;
const iso = (p) => daysToDate(p.days).toISOString().slice(0, 10);
// The night-sky page on the parade's local date: it works out that date's evening (or morning)
// in the visitor's own time zone once it knows where they are.
const skyLink = (p) => `/night-sky/?date=${iso(p)}&when=${p.sky === 'dusk' ? 'dusk' : 'dawn'}`;

// Where can each planet be seen? p.vis holds the night-sky page's visibility test on the night of
// the date, swept over latitude (PARADE_SWEEP, see guide-parades.js): true = everywhere checked,
// [] = nowhere, else [south, north, k] ranges where it passed at k of the longitudes at most.
// Returns null (no note), 'nowhere', or a phrase such as 'only between about 20°S and 26°N'.
const latText = (l) => l === 0 ? 'the equator' : `${Math.abs(l)}°${l < 0 ? 'S' : 'N'}`;
function rangeText([a, b, k]) {
	const S = PARADE_SWEEP;
	const t = a <= S.south ? `south of about ${latText(b)}` : b >= S.north ? `north of about ${latText(a)}`
		: a === b ? `near ${latText(a)}` : a === 0 ? `between the equator and about ${latText(b)}`
		: b === 0 ? `between about ${latText(a)} and the equator` : `between about ${latText(a)} and ${latText(b)}`;
	return k <= 2 ? `${t} (barely)` : k < S.lons ? `${t} (only just)` : t;
}
export function whereSeen(v) {
	if (v == null || v === true) return null;
	if (!v.length) return 'nowhere';
	if (v.length === 1 && v[0][0] <= PARADE_SWEEP.south && v[0][1] >= PARADE_SWEEP.north) return null; // at every latitude checked
	return 'only ' + listNames(v.map(rangeText));
}
// "Mercury (8° from the Sun) is too close to the Sun to see; Mars (19°) can be seen only between about
// 20°S and 26°N; Venus (34°) only south of about 52°N."
export function seenText(p) {
	const flagged = p.planets.map((n, i) => ({ n, w: whereSeen(p.vis && p.vis[i]) })).filter(x => x.w);
	if (!flagged.length) return '';
	let first = true;
	const deg = (n) => { const a = Math.abs(geocentric(n, p.days).elong).toFixed(0); const s = first ? `${a}° from the Sun` : `${a}°`; first = false; return `${n} (${s})`; };
	const lost = flagged.filter(x => x.w === 'nowhere').map(x => deg(x.n));
	const items = lost.length ? [`${listNames(lost)} ${lost.length > 1 ? 'are' : 'is'} too close to the Sun to see`] : [];
	let said = false;
	for (const x of flagged) if (x.w !== 'nowhere') { items.push(`${deg(x.n)} ${said ? '' : 'can be seen '}${x.w}`); said = true; }
	return items.join('; ') + '.';
}

// Where the planets sit relative to the Sun that day: a 360°-wide strip with
// the Sun in the middle, morning (west) to the left, evening (east) to the right.
// A hollow dot is a planet that passes the visibility test nowhere checked; a faded one
// passes it only at some latitudes.
function strip(p) {
	const pts = p.planets.map((n, i) => ({ n, e: geocentric(n, p.days).elong, w: whereSeen(p.vis && p.vis[i]) })).sort((a, b) => a.e - b.e);
	const label = 'Sky positions on ' + p.date + ': ' + pts.map(x => `${x.n} ${Math.abs(x.e).toFixed(0)}° ${x.e > 0 ? 'east' : 'west'} of the Sun` +
		(x.w === 'nowhere' ? ' (too close to the Sun to see)' : x.w ? ' (can be seen ' + x.w + ')' : '')).join(', ');
	return ['svg', { class: 'strip', viewBox: '0 0 240 50', role: 'img', 'aria-label': label },
		['line', { x1: 10, y1: 34, x2: 230, y2: 34, stroke: '#3a4a70' }],
		['text', { x: 10, y: 47, 'font-size': 8, fill: '#9fb0d8' }, '◀ morning sky'],
		['text', { x: 230, y: 47, 'font-size': 8, fill: '#9fb0d8', 'text-anchor': 'end' }, 'evening sky ▶'],
		['circle', { cx: 120, cy: 34, r: 5, fill: COLOR.Sun }],
		// Labels cycle through three rows in order of position, so neighbours never share a row.
		...pts.map((x, i) => {
			const cx = (120 + x.e / 180 * 108).toFixed(1);
			const dot = x.w === 'nowhere' ? { fill: '#01020a', stroke: COLOR[x.n], 'stroke-width': 1.2 } : x.w ? { fill: COLOR[x.n], 'fill-opacity': 0.45 } : { fill: COLOR[x.n] };
			return [['circle', { cx, cy: 34, r: 3.5, ...dot }],
			        ['text', { x: cx, y: 9 + (i % 3) * 8, 'font-size': 8, fill: '#c9d4f0', 'text-anchor': 'middle' }, INITIAL[x.n]]];
		})
	];
}
function when(p, days) {
	const dd = Math.round(p.days - days), a = Math.abs(dd);
	if (a < 1) return 'today';
	const span = a < 60 ? `${a} day${a === 1 ? '' : 's'}` : a < 700 ? `${Math.round(a / 30.44)} months` : `${(a / 365.25).toFixed(1)} years`;
	return dd > 0 ? `in ${span}` : `${span} ago`;
}
export function alignmentView(days) {
	const upcoming = PARADES.filter(p => p.days >= days - 0.5), past = PARADES.filter(p => p.days < days - 0.5).reverse();
	const cards = upcoming.map(p => {
		const seen = seenText(p);
		return ['article', { class: 'card' },
			['h3', null, ['time', { datetime: iso(p) }, p.date], ` — ${p.planets.length} planets in the ${skyText(p)} `, ['span', { class: 'muted' }, `(${when(p, days)})`]],
			['p', null, ['strong', null, listNames(p.planets)], '. ', p.note],
			strip(p),
			seen ? ['p', null, 'On the night: ', seen] : null,
			['p', { class: 'muted' }, ['a', { href: skyLink(p) }, 'What you can see from your location'], ' · ', ['a', { href: orreryLink(p) }, 'See it from above in the orrery'], ' · Source: ', ['a', { href: p.source, rel: 'noopener' }, p.sourceName]]
		];
	});
	const pastRows = past.map(p => ['tr', null,
		['th', { scope: 'row' }, ['time', { datetime: iso(p) }, p.date]],
		['td', { 'data-label': 'Planets' }, `${p.planets.length}: ${p.planets.join(', ')}`, seenText(p) ? [['br', null], ['span', { class: 'muted' }, seenText(p)]] : null],
		['td', { 'data-label': 'Sky' }, p.sky === 'dusk' ? 'Evening' : 'Morning'],
		['td', { class: 'stripcell' }, strip(p)],
		['td', { class: 'act' }, ['a', { href: orreryLink(p) }, 'See it from above'], ['span', { class: 'sub' }, 'Source: ', ['a', { href: p.source, rel: 'noopener' }, p.sourceName]]]
	]);
	// Today: how bunched the naked-eye planets are, and which side of the Sun they are on.
	// No yes/no verdict: the parade lists count any few planets, Uranus and Neptune
	// included, on one side of the Sun, so a single rule would contradict them.
	const span = skySpan(NAKED_EYE, days), evening = [], morning = [], glare = [];
	for (const n of NAKED_EYE) { const e = geocentric(n, days).elong; (Math.abs(e) < 15 ? glare : e > 0 ? evening : morning).push(n); }
	const next = upcoming[0];
	const today = ['span', null,
		`Today (${fmtDate(days)}) the five naked-eye planets are spread across ${span.toFixed(0)}° of sky. `,
		`Evening sky: ${listNames(evening)}. Morning sky: ${listNames(morning)}.`, glare.length ? ` Lost in the Sun’s glare: ${listNames(glare)}.` : '',
		' ', ['a', { href: '/now/' }, 'See every planet’s position right now'], ' or ', ['a', { href: '/night-sky/' }, 'what is up tonight where you are'], '.'
	];
	const nextSeen = next ? seenText(next) : '';
	const nextline = next ? ['span', null, 'Next planet parade: ', ['strong', null, next.date], ` — ${listNames(next.planets)} in the ${skyText(next)} (${when(next, days)}).`, nextSeen ? ' ' + nextSeen : ''] : ['span', null, 'No further parades are listed yet.'];
	return { today, nextline, cards, pastRows };
}

function render() {
	const v = alignmentView(dateToDays(new Date()));
	fill('today', v.today);
	fill('nextline', v.nextline);
	fill('upcoming', v.cards);
	fill('pastRows', v.pastRows);
}
// Only on /planetary-alignment/ itself: /now/ imports seenText from this module.
if (typeof document !== 'undefined' && document.getElementById('upcoming')) render();

// /planetary-alignment/ — planet parades past and future (guide-parades.js),
// each with a strip showing where the planets sit relative to the Sun that day,
// plus a live "is there one today?" box. alignmentView(days) builds view trees
// so the page can be pre-rendered at publish time and refreshed in the browser.
import { NAKED_EYE, COLOR, dateToDays, daysToDate, geocentric, skySpan, fmtDate } from './guide-orbits.js';
import { PARADES } from './guide-parades.js';
import { fill, listNames } from './guide-ui.js';

const INITIAL = { Mercury: 'Me', Venus: 'V', Mars: 'Ma', Jupiter: 'J', Saturn: 'S', Uranus: 'U', Neptune: 'N' };
const skyText = (p) => p.sky === 'dusk' ? 'evening sky, after sunset' : 'morning sky, before sunrise';
const orreryLink = (p) => `/?t=${p.days}&show=planet,labels,milkyway&view=top`;

// Where the planets sit relative to the Sun that day: a 360°-wide strip with
// the Sun in the middle, morning (west) to the left, evening (east) to the right.
function strip(p) {
	const pts = p.planets.map(n => ({ n, e: geocentric(n, p.days).elong })).sort((a, b) => a.e - b.e);
	const label = 'Sky positions on ' + p.date + ': ' + pts.map(x => `${x.n} ${Math.abs(x.e).toFixed(0)}° ${x.e > 0 ? 'east' : 'west'} of the Sun`).join(', ');
	return ['svg', { class: 'strip', viewBox: '0 0 240 50', role: 'img', 'aria-label': label },
		['line', { x1: 10, y1: 34, x2: 230, y2: 34, stroke: '#3a4a70' }],
		['text', { x: 10, y: 47, 'font-size': 8, fill: '#9fb0d8' }, '◀ morning sky'],
		['text', { x: 230, y: 47, 'font-size': 8, fill: '#9fb0d8', 'text-anchor': 'end' }, 'evening sky ▶'],
		['circle', { cx: 120, cy: 34, r: 5, fill: COLOR.Sun }],
		// Labels cycle through three rows in order of position, so neighbours never share a row.
		...pts.map((x, i) => {
			const cx = (120 + x.e / 180 * 108).toFixed(1);
			return [['circle', { cx, cy: 34, r: 3.5, fill: COLOR[x.n] }],
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
const iso = (p) => daysToDate(p.days).toISOString().slice(0, 10);

export function alignmentView(days) {
	const upcoming = PARADES.filter(p => p.days >= days - 0.5), past = PARADES.filter(p => p.days < days - 0.5).reverse();
	const cards = upcoming.map(p => ['article', { class: 'card' },
		['h3', null, ['time', { datetime: iso(p) }, p.date], ` — ${p.planets.length} planets in the ${skyText(p)} `, ['span', { class: 'muted' }, `(${when(p, days)})`]],
		['p', null, ['strong', null, listNames(p.planets)], '. ', p.note],
		strip(p),
		['p', { class: 'muted' }, ['a', { href: orreryLink(p) }, 'See it from above in the orrery'], ' · Source: ', ['a', { href: p.source, rel: 'noopener' }, p.sourceName]]
	]);
	const pastRows = past.map(p => ['tr', null,
		['th', { scope: 'row' }, ['time', { datetime: iso(p) }, p.date]],
		['td', { 'data-label': 'Planets' }, `${p.planets.length}: ${p.planets.join(', ')}`],
		['td', { 'data-label': 'Sky' }, p.sky === 'dusk' ? 'Evening' : 'Morning'],
		['td', { class: 'stripcell' }, strip(p)],
		['td', { class: 'act' }, ['a', { href: orreryLink(p) }, 'See it from above'], ['span', { class: 'sub' }, 'Source: ', ['a', { href: p.source, rel: 'noopener' }, p.sourceName]]]
	]);
	// Today: how bunched the naked-eye planets are, and which side of the Sun they are on.
	const span = skySpan(NAKED_EYE, days), evening = [], morning = [], glare = [];
	for (const n of NAKED_EYE) { const e = geocentric(n, days).elong; (Math.abs(e) < 15 ? glare : e > 0 ? evening : morning).push(n); }
	const next = upcoming[0];
	const today = ['span', null,
		`Today (${fmtDate(days)}) the five naked-eye planets are spread across ${span.toFixed(0)}° of sky`,
		span <= 60 ? ' — bunched enough to call a planet parade. ' : ' — no parade today. ',
		`Evening sky: ${listNames(evening)}. Morning sky: ${listNames(morning)}.`, glare.length ? ` Lost in the Sun’s glare: ${listNames(glare)}.` : '',
		' ', ['a', { href: '/now/' }, 'See every planet’s position right now'], '.'
	];
	const nextline = next ? ['span', null, 'Next planet parade: ', ['strong', null, next.date], ` — ${listNames(next.planets)} in the ${skyText(next)} (${when(next, days)}).`] : ['span', null, 'No further parades are listed yet.'];
	return { today, nextline, cards, pastRows };
}

function render() {
	const v = alignmentView(dateToDays(new Date()));
	fill('today', v.today);
	fill('nextline', v.nextline);
	fill('upcoming', v.cards);
	fill('pastRows', v.pastRows);
}
if (typeof document !== 'undefined') render();

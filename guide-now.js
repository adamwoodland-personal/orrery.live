// /now/ — "Where are the planets right now?": a live table, a top-down map and a
// planet-parade check, all computed from guide-orbits.js. nowView(days) builds
// plain view trees (see guide-ui.js) so the same code pre-renders the page's
// snapshot at publish time (scratch build script; see CLAUDE.md) and, in the
// browser, replaces it with live values on load and every minute after.
import { PLANETS, NAKED_EYE, AU_KM, LIGHT_S_PER_AU, DISPLAY_A, COLOR, dateToDays, helio, geocentric,
         skyPhrase, isRetrograde, nextOpposition, nextElongation, skySpan, fmtDate, fmtDateTime, wrap360 } from './guide-orbits.js';
import { PARADES } from './guide-parades.js';
import { fill, toDOM, flatten, listNames } from './guide-ui.js';
import { seenText } from './guide-alignment.js';

const RAD = 180 / Math.PI;
const KIND = { Pluto: 'dwarf planet' };

export function nowView(days) {
	const rows = [], groups = { evening: [], morning: [], night: [], glare: [] }, dots = [];
	const start = Math.floor(days); // scan from the same noon-UTC samples the orrery's Upcoming menu uses
	for (const name of PLANETS) {
		const h = helio(name, days);
		dots.push({ name, lon: wrap360(Math.atan2(h.y, h.x) * RAD) });
		if (name === 'Earth') continue;
		const g = geocentric(name, days), a = Math.abs(g.elong), east = g.elong > 0;
		const inner = name === 'Mercury' || name === 'Venus';
		let next = '';
		if (inner) {
			const e = nextElongation(name, start, name === 'Venus' ? 40 : 15);
			if (e) next = `Best ${e.east ? 'evening' : 'morning'} view ${fmtDate(e.days)}`;
		} else {
			const d = nextOpposition(name, start);
			if (d !== null) next = `Opposition ${fmtDate(d)}`;
		}
		groups[a < 15 ? 'glare' : a > 150 ? 'night' : east ? 'evening' : 'morning'].push(name);
		const lightMin = g.r * LIGHT_S_PER_AU / 60, retro = isRetrograde(name, days);
		rows.push(['tr', null,
			['th', { scope: 'row' }, name, KIND[name] ? ['span', { class: 'sub' }, KIND[name]] : null],
			['td', { class: 'num', 'data-label': 'From the Sun' }, `${g.rSun.toFixed(2)} AU`],
			['td', { class: 'num', 'data-label': 'From Earth' }, `${g.r.toFixed(2)} AU`, ['span', { class: 'sub' }, `${Math.round(g.r * AU_KM / 1e6).toLocaleString('en-GB')} million km`]],
			['td', { class: 'num', 'data-label': 'Light time' }, lightMin < 90 ? `${lightMin.toFixed(1)} min` : `${(lightMin / 60).toFixed(2)} h`],
			['td', { 'data-label': 'In the sky' }, skyPhrase(g.elong), ['span', { class: 'sub' }, `${a.toFixed(0)}° ${east ? 'east' : 'west'} of the Sun`]],
			['td', { class: retro ? 'retro' : null, 'data-label': 'Motion' }, retro ? 'retrograde' : 'direct'],
			['td', { class: 'next', 'data-label': 'Next' }, next],
			['td', { class: 'act' }, ['a', { href: `/?follow=${encodeURIComponent(name)}`, title: `Open the 3D orrery following ${name}` }, '3D view']]
		]);
	}
	const summary = `Evening sky after sunset: ${listNames(groups.evening)}. Morning sky before sunrise: ${listNames(groups.morning)}. ` +
		`Up most of the night: ${listNames(groups.night)}. Lost in the Sun’s glare: ${listNames(groups.glare)}. ` +
		'(Uranus is at the limit of naked-eye visibility from a dark site and easy in binoculars; Neptune and Pluto need a telescope.)';

	// Top-down map: ecliptic north towards the viewer, 0° longitude to the right,
	// so the planets run anticlockwise. Orbit spacing as in the orrery's compact view.
	const C = 300, K = 280 / DISPLAY_A.Pluto;
	const map = [
		...PLANETS.map(n => ['circle', { cx: C, cy: C, r: (DISPLAY_A[n] * K).toFixed(1), fill: 'none', stroke: 'rgba(138,172,255,0.28)' }]),
		['circle', { cx: C, cy: C, r: 9, fill: COLOR.Sun }],
		...dots.map(d => {
			const r = DISPLAY_A[d.name] * K, c = Math.cos(d.lon / RAD), s = Math.sin(d.lon / RAD);
			const x = C + r * c, y = C - r * s, big = d.name === 'Jupiter' || d.name === 'Saturn';
			return [
				['circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: big ? 6 : 4.5, fill: COLOR[d.name] }],
				['text', { x: (x + (c >= 0 ? 9 : -9)).toFixed(1), y: (y + 4).toFixed(1), 'font-size': 13, fill: '#edf2ff', 'text-anchor': c >= 0 ? 'start' : 'end' }, d.name]
			];
		}),
		['text', { x: 8, y: 592, 'font-size': 11, fill: '#9fb0d8' }, `Top-down view, ${fmtDate(days)}. Planets move anticlockwise; 0° longitude is to the right.`]
	];

	// Planet-parade check: how bunched the five naked-eye planets are, as seen from Earth.
	// Reported as a measurement, not a yes/no: the parade lists count any few planets
	// (Uranus and Neptune included) on one side of the Sun, which no single span rule matches.
	const span = skySpan(NAKED_EYE, days), next = PARADES.find(p => p.days >= days - 0.5), nextSeen = next ? seenText(next) : '';
	const parade = ['span', null,
		`The five naked-eye planets (Mercury, Venus, Mars, Jupiter and Saturn) are spread across ${span.toFixed(0)}° of sky right now; the summary at the top says which of them are in the evening or morning sky. `,
		next ? ['span', null, 'The next listed planet parade is on ', ['a', { href: '/planetary-alignment/' }, next.date], `: ${listNames(next.planets)} in the ${next.sky === 'dusk' ? 'evening sky after sunset' : 'morning sky before sunrise'}.`, nextSeen ? ' ' + nextSeen : ''] : null
	];
	return { stamp: fmtDateTime(days), summary, rows, map, parade };
}

function render() {
	const v = nowView(dateToDays(new Date()));
	document.getElementById('stamp').textContent = v.stamp;
	document.getElementById('summary').textContent = v.summary;
	fill('planetRows', v.rows);
	fill('parade', v.parade);
	const svg = document.getElementById('topdown');
	for (const e of [...svg.children]) if (e.tagName.toLowerCase() !== 'title') e.remove();
	for (const n of flatten(v.map)) svg.appendChild(toDOM(n, true));
}
if (typeof document !== 'undefined') { render(); setInterval(render, 60000); }

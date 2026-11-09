// Top-down map of the planets for the guide pages (/now/, /planets-on-your-birthday/):
// ecliptic north towards the viewer, 0° longitude to the right, so the planets run
// anticlockwise. Orbit spacing as in the orrery's compact view, positions along the
// orbits real. Returns view trees (see guide-ui.js) for an <svg viewBox="-70 0 740 600">.
import { PLANETS, DISPLAY_A, COLOR, helio, wrap360 } from './guide-orbits.js';

const RAD = 180 / Math.PI;

export function topDownMap(days, caption) {
	const C = 300, K = 280 / DISPLAY_A.Pluto;
	return [
		...PLANETS.map(n => ['circle', { cx: C, cy: C, r: (DISPLAY_A[n] * K).toFixed(1), fill: 'none', stroke: 'rgba(138,172,255,0.28)' }]),
		['circle', { cx: C, cy: C, r: 9, fill: COLOR.Sun }],
		...PLANETS.map(name => {
			const h = helio(name, days), lon = wrap360(Math.atan2(h.y, h.x) * RAD);
			const r = DISPLAY_A[name] * K, c = Math.cos(lon / RAD), s = Math.sin(lon / RAD);
			const x = C + r * c, y = C - r * s, big = name === 'Jupiter' || name === 'Saturn';
			return [
				['circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: big ? 6 : 4.5, fill: COLOR[name] }],
				['text', { x: (x + (c >= 0 ? 9 : -9)).toFixed(1), y: (y + 4).toFixed(1), 'font-size': 13, fill: '#edf2ff', 'text-anchor': c >= 0 ? 'start' : 'end' }, name]
			];
		}),
		['text', { x: 8, y: 592, 'font-size': 11, fill: '#9fb0d8' }, caption]
	];
}

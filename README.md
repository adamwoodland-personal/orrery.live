# orrery.live

**Live: <https://orrery.live/>**

An interactive 3D solar system in the browser. Real planet positions computed from JPL data,
comets, spacecraft, a naked-eye star background with constellations, and a time machine covering
3000 BC to 3000 AD. Free, no account, no adverts.

## What it does

- Shows where the planets are right now, or on any date you choose. Drag to orbit, scroll to
  zoom, step time forwards or backwards and watch conjunctions, alignments and retrograde loops
  play out.
- The eight planets and their major moons, dwarf planets, notable comets, and spacecraft
  trajectories (Voyager, New Horizons and others).
- Bookmarked historical events and famous planetary alignments to jump straight to.
- A true star field with constellation lines behind it all.
- Installable as an app and usable offline once loaded.
- A night-sky map at [/night-sky/](https://orrery.live/night-sky/): the sky above your own
  horizon tonight, which planets you can see and when, with a point-your-phone-at-the-sky mode.
- Two text guides that share the model: [/now/](https://orrery.live/now/) (where every planet is
  right now) and [/planetary-alignment/](https://orrery.live/planetary-alignment/) (planet parade
  dates, past and future).

## How it works

- Static site built on [three.js](https://threejs.org/) (vendored in `lib/`, no CDN):
  `index.html`, `styles.css`, `app.js`, with the data in `stars.js`, `constellations.js` and
  `spacecraft.js`. No backend.
- Positions are computed client-side in the J2000 reference frame from NASA/JPL Horizons
  ephemeris data, with correct planetary spin axes; the time machine is just a change of epoch.
- The guide pages use `guide-orbits.js`, a copy of the planet elements and Kepler solver generated
  from `app.js`, plus `guide-parades.js` (parade dates), `guide-ui.js` and `guide.css`; their live
  sections are pre-rendered into the HTML at publish time and refreshed by JavaScript.
- The star background is the HYG catalogue; constellation lines derive from d3-celestial;
  planet and sky textures are from Solar System Scope.
- Installable PWA: `manifest.json` and a service worker (`sw.js`) — code and navigations are
  served network-first, the large textures cache-first, so repeat visits and offline use skip the
  downloads.
- Hosted as static files on S3 behind CloudFront with a strict Content-Security-Policy
  (`script-src 'self'`, no inline scripts or styles).

## Licence

MIT for this project's own code — see [LICENSE](LICENSE), which also lists the third-party
components and their licences:

- three.js — MIT
- Constellation lines (from d3-celestial) — BSD-3-Clause
- Star catalogue (from the HYG database) — CC BY-SA 4.0 (share-alike applies to that data)
- Spacecraft trajectories — generated from NASA/JPL Horizons, US government work
- Textures — CC BY 4.0, Solar System Scope

Built by Adam Woodland with the assistance of AI (Anthropic Claude).

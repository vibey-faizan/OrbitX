# ORBITX — Immersive 3D Solar System Explorer

ORBITX is a cinematic, fully interactive 3D Solar System you can explore in the browser. Orbit the Sun, fly the camera to any planet, read sourced planet profiles, compare worlds side by side and browse curated space facts.

It is a **static site**: plain HTML, CSS and ES-module JavaScript, with no build step and no backend. It deploys directly to GitHub Pages.

---

## Screenshots

> Add your own captures to `assets/images/` and reference them here, for example:
>
> `![ORBITX hero](assets/images/hero.png)`
>
> Suggested shots: the hero, the overview with orbits, a focused planet with the info panel, the Compare section and the mobile layout.

---

## Features

**3D Solar System (Three.js)**
- The Sun and all eight planets in the correct order, plus Earth's Moon.
- The International Space Station orbiting Earth on its real 51.6° inclined orbit, with a clickable profile.
- An asteroid belt between Mars and Jupiter that orbits at roughly its real period (~4.6 years).
- Procedurally generated surface textures (Earth with a separate cloud layer, banded gas giants with Jupiter's Great Red Spot, cratered Mercury and Moon, and so on). They are painted in a Web Worker, so nothing has to download and nothing can go missing.
- Saturn's rings follow the real C/B/A ring layout with the Cassini Division. Uranus has faint ringlets.
- Real axial tilts: Uranus rolls on its side, and Venus is effectively upside-down.
- Emissive Sun with a corona shader and glow. Planets have day-side atmosphere rims.
- Point-light shadows: Saturn's rings and globe shadow each other, and the Earth–Moon system casts shadows.
- Twinkling starfield with a galactic band, glowing bright stars with diffraction spikes, and faint nebulae.
- Shooting stars that streak across the scene.
- Planet Explorer cards whose planets float and spin faster on hover.

**Honest motion**
- Each planet starts at its *approximate position for today*, from its mean longitude at J2000.
- Orbital speeds keep their real ratios. A "simulated date" readout shows the passage of time.
- Orbits are simplified to circles, and spin speeds are compressed for visibility. Sizes and distances are labelled as illustrative.
- An optional **proportional distance** mode spaces the orbits in true AU ratio.

**Camera and exploration**
- Rotate (drag), zoom (wheel or pinch) and pan (right-drag or two fingers).
- Click a planet, its label, the quick-focus rail, a search result or a card to fly there. The camera then follows the planet along its orbit.
- **Explore planet** gives a close-up view. **Back to Solar System** returns to the full overview. **Reset camera** restores the default framing.

**Planet profiles**
- Category, introduction, diameter, distance from the Sun, orbital period, rotation period (retrograde flagged), average temperature with context, known moons with a dated note, axial tilt, atmosphere and three facts.
- Previous/next navigation. The 3D scene stays interactive while the panel is open.

**Control center**
- Every control is functional: play/pause, speed (0.1× to 100×), orbits, labels, Moon, star effects, reset camera, overview/explore mode, ambient audio, and reduced effects.
- View settings: distance scale, planet size and cinematic transitions.

**Site sections**
- Planet Explorer cards with type filters.
- Compare Planets: bars, to-scale discs, a shared temperature scale and plain-language ratios.
- Space Facts: a grid of facts plus a random-fact spotlight.
- About.

**Search**
- An accessible combobox that matches names, nicknames ("red planet", "ringed") and categories ("ice giant").
- Full keyboard support and a clear empty state.

**Accessibility and performance**
- Semantic HTML, labelled controls, visible focus and keyboard shortcuts.
- Respects `prefers-reduced-motion`.
- Device pixel ratio is capped. Rendering pauses when the 3D stage is off-screen.
- Reduced-effects mode turns on automatically on low-power devices or sustained low frame rates.
- Shared geometries, no per-frame allocations, and a `dispose()` that frees GPU resources.
- If WebGL is unavailable, or Three.js fails to load, a friendly fallback appears and every non-3D feature keeps working.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `/` | Focus search |
| `Space` | Play / pause motion |
| `←` `→` | Previous / next body (while exploring) |
| `O` / `L` | Toggle orbits / labels |
| `R` | Reset camera |
| `Esc` | Close the info panel, menu or search |

---

## Technology stack

| Technology | Use |
| --- | --- |
| HTML5 / CSS3 | Semantic structure, responsive layout, glassmorphism, transitions |
| Vanilla JavaScript (ES modules) | Application logic — no framework |
| [Three.js](https://threejs.org/) `0.160.0` | 3D scene, materials, lighting, shadows, OrbitControls, CSS2D labels |
| [GSAP](https://gsap.com/) `3.12.5` | Hero entrance and panel animations (optional — the site works without it) |
| [Lucide](https://lucide.dev/) `0.344.0` | Interface icons |
| Web Audio API | Synthesised ambient soundscape (no audio files) |

All third-party libraries load from public CDNs (jsDelivr, cdnjs, unpkg) with pinned versions. Three.js is resolved through an [import map](https://developer.mozilla.org/docs/Web/HTML/Element/script/type/importmap) in `index.html`. There is nothing to `npm install`.

---

## Project structure

```
ORBITX/
├── index.html              # Page structure, import map, CDN scripts
├── start.bat               # Windows: start a local server and open the site
├── README.md
├── LICENSE
├── .gitignore
├── css/
│   ├── style.css           # Design tokens and all components
│   ├── animations.css      # Keyframes, scroll reveal, reduced motion
│   └── responsive.css      # Breakpoints: laptop, tablet, phone, landscape
└── js/
    ├── main.js             # Entry point: app state, wiring, keyboard shortcuts
    ├── solar-system.js     # Renderer, scene, simulation clock, picking, settings
    ├── planets.js          # Sun / planet / Moon / ring meshes and shaders
    ├── starfield.js        # Stars, galactic band, nebulae
    ├── camera-controls.js  # OrbitControls + cinematic fly-to and follow
    ├── textures.js         # Texture store, worker management, effect textures
    ├── texture-painters.js # Pure procedural painters (shared with the worker)
    ├── texture-worker.js   # Module worker that paints textures off-thread
    ├── ui.js               # Navigation, cards, info panel, controls, facts, toasts
    ├── search.js           # Accessible planet search
    ├── comparison.js       # Compare Planets tool
    ├── audio.js            # Optional ambient audio
    ├── utils.js            # Shared helpers and formatters
    └── data/
        ├── planet-data.js  # Single source of truth for all body data
        └── space-facts.js  # Curated facts
```

There is no `assets/` folder because the project needs no binary assets: textures, audio and icons are all generated or loaded at runtime. If you add screenshots or your own textures, create `assets/images/` or `assets/textures/` and use **relative** paths.

### Why there is no Python backend

The brief allowed an optional Flask backend only if it was genuinely needed. Nothing in ORBITX needs a server: the data is curated and versioned in `js/data/`, and there are no API keys to protect. Adding Flask would only complicate deployment, because GitHub Pages cannot run Python. If you later want live data, such as NASA's APOD API, see [Extending with NASA APIs](#extending-with-nasa-apis).

---

## Running locally

Browsers block ES modules and Web Workers on `file://` URLs, so serve the folder over HTTP. ORBITX shows a warning banner if you open it from `file://`.

**Windows shortcut:** double-click `start.bat`. It starts the server and opens the browser.

**Python (built into most systems):**

```bash
cd ORBITX
python -m http.server 8000
```

Then open <http://localhost:8000>.

**Node.js alternative:**

```bash
npx serve ORBITX
```

An internet connection is needed the first time, for the CDN libraries and Google Fonts. Without one, the 3D view shows its fallback message and the rest of the site still works.

### Testing checklist

- [ ] The hero loads and the 3D scene fades in. **Skip intro** and **Enter Exploration** work.
- [ ] All eight planets, the Sun and the Moon are visible and labelled.
- [ ] Drag rotates, the wheel or a pinch zooms, and clicking a planet opens the correct profile.
- [ ] Previous/next, **Explore planet**, close, and **Back to Solar System** work.
- [ ] Every control-center button changes the scene, and its pressed state updates.
- [ ] Search finds "mars", "ringed" and "ice giant". Nonsense input shows the empty state.
- [ ] Compare updates for every pair, and swap works.
- [ ] At a phone width (≈375 px), the dock collapses behind **Controls**, the panel becomes a bottom sheet, and there is no horizontal scroll.
- [ ] With "Reduce motion" enabled in the OS, there are no camera fly-throughs or twinkling.

---

## Deploying to GitHub Pages

1. Create a repository and push the project folder, so that `index.html` sits at the repository root:
   ```bash
   cd ORBITX
   git init
   git add .
   git commit -m "Initial commit: ORBITX"
   git branch -M main
   git remote add origin https://github.com/<you>/orbitx.git
   git push -u origin main
   ```
2. On GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, then select `main` and `/ (root)`, and save.
4. After a minute the site is live at `https://<you>.github.io/orbitx/`.

Every asset path in the project is relative (`css/style.css`, `js/main.js`, `./texture-worker.js`), so the site works from the `/orbitx/` subdirectory without any configuration.

---

## Data and accuracy

- Figures come from the [NASA Planetary Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/) and [NASA Science](https://science.nasa.gov/solar-system/) and are rounded for display.
- Gas- and ice-giant temperatures are quoted at the 1-bar pressure level, because those planets have no solid surface.
- Moon counts change as discoveries are confirmed. Each count has a note saying what it represents and when (for example, Saturn's 274 as of 2025).
- **Visual scale is illustrative.**
  - Planet radii follow the square root of their real diameters, and the Sun is shrunk.
  - Compact mode uses hand-tuned spacing. Proportional mode spaces orbits linearly in AU.
  - Orbits are circular and coplanar.
  - Orbital speeds use the real ratios. Starting positions are mean longitudes, accurate to a few degrees.
  - Spin speeds are compressed, so the scene never claims real-time rotation.

To edit or extend the data, change `js/data/planet-data.js`. The panel, cards, search and comparison all read from it.

## Extending with NASA APIs

ORBITX deliberately ships without API keys. To add live content (for example the [Astronomy Picture of the Day](https://api.nasa.gov/)):

- For a static site, call the API from the browser using NASA's public `DEMO_KEY`, or your own **public** key with rate limits in mind. Never commit a private key.
- If you need to hide a key, put a small proxy on a separate host (a Cloudflare Worker, a Vercel/Netlify function, or a Flask app on Render or Fly.io). Store the key there as an environment variable, such as `NASA_API_KEY`, and call the proxy from the front end. GitHub Pages cannot run that server code itself.

---

## License

[MIT](LICENSE)

/**
 * DOM-facing UI components. Each function receives the elements and callbacks
 * it needs; app state lives in main.js.
 */
import { $, $$, formatNumber, formatDays, formatRotation, refreshIcons, escapeHTML } from './utils.js';
import { DATA_SOURCES } from './data/planet-data.js';

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export function initNavigation({ header, toggle, drawer }) {
  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    drawer.classList.toggle('is-open', open);
    document.body.classList.toggle('menu-open', open);
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));

  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 12);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  return {
    close: () => setOpen(false),
    get isOpen() {
      return toggle.getAttribute('aria-expanded') === 'true';
    },
    setActive(id) {
      $$('[data-nav-link]').forEach((link) => {
        const active = link.getAttribute('href') === `#${id}`;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    },
  };
}

/** Adds .is-visible to .reveal elements as they scroll into view. */
export function initReveal() {
  const items = $$('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  items.forEach((el) => observer.observe(el));
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

/** Short entrance timeline (GSAP). Returns null when skipped or unavailable. */
export function playHeroIntro({ reducedMotion }) {
  const gsap = window.gsap;
  if (!gsap || reducedMotion) return null;
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  tl.from('.hero-eyebrow', { y: 14, opacity: 0, duration: 0.6 })
    .from('.hero-title .line', { yPercent: 60, opacity: 0, duration: 0.9, stagger: 0.12 }, '-=0.35')
    .from('.hero-subtitle', { y: 16, opacity: 0, duration: 0.7 }, '-=0.5')
    .from('.hero-actions > *', { y: 14, opacity: 0, duration: 0.6, stagger: 0.08 }, '-=0.45')
    .from('.hero-meta li', { opacity: 0, duration: 0.6, stagger: 0.06 }, '-=0.3')
    .from('.scroll-cue', { opacity: 0, y: -8, duration: 0.6 }, '-=0.3');
  return tl;
}

// ---------------------------------------------------------------------------
// Planet cards & previews
// ---------------------------------------------------------------------------

const previewUrls = new Map();

/** Remembers a texture preview and applies it to every matching orb. */
export function setOrbPreview(id, url) {
  previewUrls.set(id, url);
  applyOrbPreviews(document);
}

export function applyOrbPreviews(root) {
  $$('[data-orb]', root).forEach((el) => {
    const url = previewUrls.get(el.dataset.orb);
    if (url && !el.classList.contains('has-texture')) {
      el.style.setProperty('--orb-image', `url("${url}")`);
      el.classList.add('has-texture');
    }
  });
}

export function renderPlanetCards(container, planets, { onExplore }) {
  container.innerHTML = planets.map((p) => `
    <article class="planet-card reveal" data-id="${p.id}" data-group="${p.group}" style="--accent:${p.color}">
      <div class="planet-card-visual">
        <div class="orb-wrap">
          ${p.id === 'saturn' ? '<span class="orb-ring back" aria-hidden="true"></span>' : ''}
          <div class="orb" data-orb="${p.id}" style="--orb-color:${p.color}" role="img" aria-label="Rendered preview of ${p.name}"></div>
          ${p.id === 'saturn' ? '<span class="orb-ring front" aria-hidden="true"></span>' : ''}
        </div>
      </div>
      <div class="planet-card-body">
        <p class="chip">${p.category}</p>
        <h3 class="planet-card-title">${p.name}</h3>
        <p class="planet-card-text">${p.tagline}</p>
        <dl class="mini-stats">
          <div><dt>Diameter</dt><dd>${formatNumber(p.stats.diameterKm)} km</dd></div>
          <div><dt>From Sun</dt><dd>${p.stats.distanceAU} AU</dd></div>
          <div><dt>Moons</dt><dd>${p.stats.moons}</dd></div>
        </dl>
        <button type="button" class="btn btn-outline btn-sm" data-explore="${p.id}">
          Explore ${p.name} <i data-lucide="arrow-right"></i>
        </button>
      </div>
    </article>`).join('');

  container.addEventListener('click', (event) => {
    const button = event.target.closest('[data-explore]');
    if (button) onExplore(button.dataset.explore);
  });
}

export function initCardFilters(toolbar, grid) {
  toolbar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    const filter = button.dataset.filter;
    $$('[data-filter]', toolbar).forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    let shown = 0;
    $$('.planet-card', grid).forEach((card) => {
      const visible = filter === 'all' || card.dataset.group === filter;
      card.hidden = !visible;
      if (visible) shown++;
    });
    $('#filter-status').textContent = `Showing ${shown} planet${shown === 1 ? '' : 's'}`;
  });
}

// ---------------------------------------------------------------------------
// Planet rail (quick focus inside the 3D stage)
// ---------------------------------------------------------------------------

export function renderPlanetRail(container, bodies, onSelect) {
  container.innerHTML = bodies.map((b) => `
    <button type="button" class="rail-item" data-id="${b.id}" aria-label="Focus ${b.name}" data-tip="${b.name}">
      <span class="rail-dot" style="--dot:${b.color}" aria-hidden="true"></span>
      <span class="rail-name">${b.name}</span>
    </button>`).join('');
  container.addEventListener('click', (event) => {
    const item = event.target.closest('.rail-item');
    if (item) onSelect(item.dataset.id);
  });
}

export function setRailActive(container, id) {
  $$('.rail-item', container).forEach((item) => {
    const active = item.dataset.id === id;
    item.classList.toggle('is-active', active);
    if (active) item.setAttribute('aria-current', 'true');
    else item.removeAttribute('aria-current');
  });
}

// ---------------------------------------------------------------------------
// Planet information panel
// ---------------------------------------------------------------------------

function buildStatRows(body) {
  const s = body.stats;
  const d = body.display ?? {};
  const rows = [
    { label: 'Diameter', value: d.diameter ?? `${formatNumber(s.diameterKm)} km` },
    {
      label: d.distanceLabel ?? 'Distance from Sun',
      value: d.distance ?? `${formatNumber(s.distanceMkm, 1)} million km · ${s.distanceAU} AU`,
      note: s.distanceMkm ? 'Average orbital distance.' : null,
    },
    { label: 'Orbital period', value: d.orbit ?? formatDays(s.orbitalPeriodDays) },
    { label: 'Rotation period', value: d.rotation ?? formatRotation(s) },
    { label: 'Average temperature', value: d.temperature ?? `${formatNumber(s.meanTempC)} °C`, note: d.temperatureNote ?? s.tempNote },
    { label: d.moonsLabel ?? 'Known moons', value: d.moons ?? formatNumber(s.moons), note: s.moonsNote },
  ];
  if (s.axialTiltDeg != null) rows.push({ label: 'Axial tilt', value: `${s.axialTiltDeg}°`, note: d.tiltNote });
  return rows;
}

export class PlanetPanel {
  constructor(root, handlers) {
    this.root = root;
    this.handlers = handlers;
    this.body = null;
    this.refs = {
      category: $('#panel-category', root),
      name: $('#panel-name', root),
      intro: $('#panel-intro', root),
      stats: $('#panel-stats', root),
      atmosphere: $('#panel-atmosphere', root),
      facts: $('#panel-facts', root),
      source: $('#panel-source', root),
      explore: $('#panel-explore', root),
      exploreLabel: $('#panel-explore-label', root),
      toggle: $('#panel-toggle', root),
      prev: $('#panel-prev', root),
      next: $('#panel-next', root),
    };
    $('#panel-close', root).addEventListener('click', () => handlers.onClose());
    $('#panel-back', root).addEventListener('click', () => handlers.onBack());
    this.refs.prev.addEventListener('click', () => handlers.onStep(-1));
    this.refs.next.addEventListener('click', () => handlers.onStep(1));
    this.refs.explore.addEventListener('click', () => handlers.onExplore(this.body.id));
    this.refs.toggle.addEventListener('click', () => this.setCompact(!this.compact));
    this.setOpen(false);
  }

  get isOpen() {
    return this.root.dataset.state === 'open';
  }

  setOpen(open) {
    this.root.dataset.state = open ? 'open' : 'closed';
    this.root.toggleAttribute('inert', !open);
    this.root.setAttribute('aria-hidden', String(!open));
  }

  setCompact(compact) {
    this.compact = compact;
    this.root.classList.toggle('is-compact', compact);
    this.refs.toggle.setAttribute('aria-expanded', String(!compact));
    const label = compact ? 'Show details' : 'Collapse details';
    this.refs.toggle.setAttribute('aria-label', label);
    this.refs.toggle.dataset.tip = label;
    this.handlers.onCompactChange?.(compact);
  }

  show(body, { compact = false, neighbours } = {}) {
    const changed = this.body?.id !== body.id;
    this.body = body;
    if (changed) this.render(body);
    if (neighbours) {
      this.refs.prev.setAttribute('aria-label', `Previous: ${neighbours.prev.name}`);
      this.refs.prev.dataset.tip = `← ${neighbours.prev.name}`;
      this.refs.next.setAttribute('aria-label', `Next: ${neighbours.next.name}`);
      this.refs.next.dataset.tip = `${neighbours.next.name} →`;
    }
    this.setCompact(compact);
    const wasOpen = this.isOpen;
    this.setOpen(true);
    if (changed || !wasOpen) this.animateIn();
  }

  hide() {
    this.setOpen(false);
  }

  render(body) {
    const r = this.refs;
    this.root.style.setProperty('--accent', body.color);
    r.category.textContent = body.category;
    r.name.textContent = body.name;
    r.intro.textContent = body.intro;
    r.stats.innerHTML = buildStatRows(body).map((row) => `
      <div class="stat">
        <dt>${row.label}</dt>
        <dd>${escapeHTML(row.value)}${row.note ? `<small>${escapeHTML(row.note)}</small>` : ''}</dd>
      </div>`).join('');
    r.atmosphere.textContent = body.atmosphere;
    r.facts.innerHTML = body.facts.map((fact) => `<li>${escapeHTML(fact)}</li>`).join('');
    r.source.innerHTML = `Data: ${DATA_SOURCES.map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${s.label}</a>`).join(' · ')}. Values are rounded; moon counts change as discoveries are confirmed.`;
    const exploreLabels = { planet: 'Explore planet', star: 'Explore the Sun', moon: 'Explore the Moon', satellite: 'Explore the ISS' };
    r.exploreLabel.textContent = exploreLabels[body.type] ?? 'Explore';
    this.root.querySelector('.panel-body').scrollTop = 0;
  }

  animateIn() {
    const gsap = window.gsap;
    if (!gsap || document.documentElement.classList.contains('reduce-motion')) return;
    gsap.fromTo(this.root.querySelectorAll('.panel-header, .panel-intro, .stat, .panel-section'),
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.45, stagger: 0.03, ease: 'power2.out', clearProps: 'opacity,transform' });
  }
}

// ---------------------------------------------------------------------------
// Control center
// ---------------------------------------------------------------------------

export const SPEED_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100];

const TOGGLE_COPY = {
  playing: ['Pause planetary motion', 'Play planetary motion'],
  orbits: ['Hide orbital paths', 'Show orbital paths'],
  labels: ['Hide planet labels', 'Show planet labels'],
  moon: ['Hide the Moon', 'Show the Moon'],
  starEffects: ['Turn off star effects', 'Turn on star effects'],
  audio: ['Mute ambient audio', 'Play ambient audio'],
  reducedEffects: ['Restore full visual effects', 'Reduce visual effects'],
  cinematic: ['Turn off cinematic camera transitions', 'Turn on cinematic camera transitions'],
};
const SHORTCUTS = { playing: 'Space', orbits: 'O', labels: 'L' };

export function initControlCenter(root, { onToggle, onAction, onSpeed, onScaleMode, onPlanetScale }) {
  root.addEventListener('click', (event) => {
    const toggleButton = event.target.closest('[data-toggle]');
    if (toggleButton) onToggle(toggleButton.dataset.toggle);
    const actionButton = event.target.closest('[data-action]');
    if (actionButton) onAction(actionButton.dataset.action, actionButton);
  });
  $('#speed-range', root).addEventListener('input', (event) => onSpeed(Number(event.target.value)));
  $$('input[name="scale-mode"]', root).forEach((radio) => radio.addEventListener('change', () => onScaleMode(radio.value)));
  $('#size-range', root).addEventListener('input', (event) => onPlanetScale(Number(event.target.value)));

  // View-settings popover
  const settingsButton = $('#view-settings-toggle', root);
  const popover = $('#view-settings', root);
  const setPopover = (open) => {
    popover.hidden = !open;
    settingsButton.setAttribute('aria-expanded', String(open));
  };
  settingsButton.addEventListener('click', () => setPopover(popover.hidden));
  document.addEventListener('pointerdown', (event) => {
    if (!popover.hidden && !popover.contains(event.target) && !settingsButton.contains(event.target)) setPopover(false);
  });
  popover.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setPopover(false);
      settingsButton.focus();
    }
  });

  // Mobile: the dock collapses behind a toggle button.
  const dockToggle = $('#dock-toggle');
  dockToggle?.addEventListener('click', () => {
    const open = dockToggle.getAttribute('aria-expanded') !== 'true';
    dockToggle.setAttribute('aria-expanded', String(open));
    root.classList.toggle('is-open', open);
  });
}

/** Reflects settings/state in the control center (pressed states, labels, values). */
export function syncControls(root, settings, state) {
  $$('[data-toggle]', root).forEach((button) => {
    const key = button.dataset.toggle;
    const on = Boolean(settings[key]);
    button.setAttribute('aria-pressed', String(on));
    const copy = TOGGLE_COPY[key];
    if (copy) {
      const label = on ? copy[0] : copy[1];
      button.setAttribute('aria-label', label);
      button.dataset.tip = SHORTCUTS[key] ? `${label} (${SHORTCUTS[key]})` : label;
    }
  });
  const speed = SPEED_STEPS[settings.speedIndex];
  $('#speed-range', root).value = settings.speedIndex;
  const speedText = `${speed}×`;
  $('#speed-output', root).textContent = speedText;
  $('#speed-range', root).setAttribute('aria-valuetext', `${speedText}, about ${formatNumber(speed * 5, 1)} days per second`);
  $('#speed-detail', root).textContent = `≈ ${formatNumber(speed * 5, 1)} days / second`;

  $$('input[name="scale-mode"]', root).forEach((radio) => { radio.checked = radio.value === settings.scaleMode; });
  $('#size-range', root).value = settings.planetScale;
  $('#size-output', root).textContent = `${formatNumber(settings.planetScale, 2)}×`;

  const modeButton = $('[data-action="mode"]', root);
  const exploring = state.mode === 'explore';
  modeButton.setAttribute('aria-pressed', String(exploring));
  const modeLabel = exploring ? 'Switch to overview mode' : 'Switch to exploration mode';
  modeButton.setAttribute('aria-label', modeLabel);
  modeButton.dataset.tip = modeLabel;
  $('.mode-text', modeButton).textContent = exploring ? 'Overview' : 'Explore';
}

// ---------------------------------------------------------------------------
// Space facts
// ---------------------------------------------------------------------------

export function initFacts({ grid, spotlight, button, facts }) {
  grid.innerHTML = facts.map((fact) => `
    <article class="fact-card reveal">
      <span class="fact-icon"><i data-lucide="${fact.icon}"></i></span>
      <p class="fact-topic">${fact.topic}</p>
      <p class="fact-text">${fact.text}</p>
    </article>`).join('');

  const text = $('.spotlight-text', spotlight);
  const topic = $('.spotlight-topic', spotlight);
  let current = Math.floor(Math.random() * facts.length);
  const show = (index) => {
    current = index;
    spotlight.classList.remove('is-changing');
    void spotlight.offsetWidth; // restart the CSS animation
    spotlight.classList.add('is-changing');
    topic.textContent = facts[index].topic;
    text.textContent = facts[index].text;
  };
  show(current);
  button.addEventListener('click', () => {
    let next = current;
    while (next === current && facts.length > 1) next = Math.floor(Math.random() * facts.length);
    show(next);
  });
  refreshIcons();
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

let toastTimer;
export function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2600);
}

/**
 * ORBITX entry point — owns app state and wires the UI to the 3D scene.
 *
 * The 3D engine (Three.js) is loaded with a dynamic import so that every
 * non-3D feature (cards, comparison, facts, search, info panel) keeps working
 * if WebGL or the CDN is unavailable.
 */
import { BODIES, PLANETS, NAVIGATION_ORDER, getBody } from './data/planet-data.js';
import { SPACE_FACTS } from './data/space-facts.js';
import { generateTextures, textureEvents, getPreviewURL, readyTextureCount, TEXTURE_COUNT } from './textures.js';
import {
  initNavigation, initReveal, playHeroIntro, renderPlanetCards, initCardFilters, setOrbPreview, applyOrbPreviews,
  renderPlanetRail, setRailActive, PlanetPanel, initControlCenter, syncControls, SPEED_STEPS, initFacts, toast,
} from './ui.js';
import { initSearch } from './search.js';
import { initComparison } from './comparison.js';
import { AmbientAudio } from './audio.js';
import {
  $, hasWebGL, prefersReducedMotion, isLikelyLowPower, loadPrefs, savePrefs, refreshIcons,
} from './utils.js';

const PREFS_KEY = 'orbitx:prefs:v1';
const PERSISTED = ['orbits', 'labels', 'moon', 'starEffects', 'reducedEffects', 'cinematic'];

const reducedMotion = prefersReducedMotion();
const lowPower = isLikelyLowPower();
const saved = loadPrefs(PREFS_KEY);

const settings = {
  playing: true,
  speedIndex: SPEED_STEPS.indexOf(1),
  orbits: true,
  labels: true,
  moon: true,
  starEffects: !reducedMotion,
  reducedEffects: lowPower,
  cinematic: !reducedMotion,
  scaleMode: 'compact',
  planetScale: 1,
  audio: false, // never restored: audio must always start from a user action
};
PERSISTED.forEach((key) => { if (typeof saved[key] === 'boolean') settings[key] = saved[key]; });

const state = {
  mode: 'hero', // 'hero' | 'overview' | 'explore'
  selectedId: null,
  lastSelectedId: 'earth',
};

const dom = {
  root: document.documentElement,
  stage: $('#solar-system'),
  sceneContainer: $('#scene-container'),
  hero: $('#home'),
  status: $('#scene-status'),
  statusText: $('#scene-status-text'),
  fallback: $('#scene-fallback'),
  fallbackReason: $('#fallback-reason'),
  controls: $('#control-center'),
  rail: $('#planet-rail'),
  simDate: $('#sim-date'),
};

const audio = new AmbientAudio();
let system = null;
let heroTimeline = null;
let nav;
let panel;
let search;

// ---------------------------------------------------------------------------
// App actions
// ---------------------------------------------------------------------------

function scrollToStage() {
  window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
}

function setHeroVisible(visible) {
  dom.stage.classList.toggle('is-hero', visible);
  dom.hero.toggleAttribute('inert', !visible);
  dom.hero.setAttribute('aria-hidden', String(!visible));
}

function hideHero() {
  if (state.mode !== 'hero') return;
  heroTimeline?.progress(1);
  state.mode = 'overview';
  setHeroVisible(false);
  system?.setHeroMode(false);
}

function showHero() {
  closePanel({ clearSelection: true });
  state.mode = 'hero';
  setHeroVisible(true);
  system?.setHeroMode(true);
  refreshUI();
}

function enterExploration() {
  hideHero();
  closePanel({ clearSelection: true });
  state.mode = 'overview';
  system?.showOverview();
  refreshUI();
  dom.stage.focus({ preventScroll: true });
}

function neighboursOf(id) {
  const order = NAVIGATION_ORDER;
  // The Moon and the ISS step from Earth's position in the order.
  const anchor = id === 'moon' || id === 'iss' ? 'earth' : id;
  const index = order.indexOf(anchor);
  return {
    prev: getBody(order[(index - 1 + order.length) % order.length]),
    next: getBody(order[(index + 1) % order.length]),
  };
}

/** Keeps the focused body visible beside the side panel on wide screens. */
function updateFrameShift() {
  if (!system) return;
  const panelEl = $('#planet-panel');
  const open = panel.isOpen && !panel.compact;
  if (!open) system.setFrameShift(0, 0);
  else if (window.innerWidth > 768) system.setFrameShift(-(panelEl.offsetWidth / 2 + 12) / window.innerWidth, 0);
  else system.setFrameShift(0, panelEl.offsetHeight / 2 / window.innerHeight);
}

function selectBody(id, { closeUp = false, scroll = false } = {}) {
  const body = getBody(id);
  if (!body) return;
  if (id === 'moon' && !settings.moon) setSetting('moon', true, { silent: true });
  hideHero();
  state.mode = 'explore';
  state.selectedId = id;
  state.lastSelectedId = id;
  panel.show(body, { compact: closeUp, neighbours: neighboursOf(id) });
  dom.stage.classList.add('panel-open');
  setRailActive(dom.rail, id);
  system?.focusBody(id, { closeUp });
  audio.chime();
  if (scroll) scrollToStage();
  refreshUI();
}

function closePanel({ clearSelection = false } = {}) {
  panel.hide();
  dom.stage.classList.remove('panel-open');
  if (clearSelection) {
    state.selectedId = null;
    setRailActive(dom.rail, null);
    system?.clearSelection();
  }
  refreshUI();
}

function backToSystem() {
  closePanel({ clearSelection: true });
  state.mode = 'overview';
  system?.showOverview();
  refreshUI();
}

function stepBody(direction) {
  const current = state.selectedId ?? state.lastSelectedId;
  const { prev, next } = neighboursOf(current);
  selectBody((direction < 0 ? prev : next).id);
}

function toggleMode() {
  if (state.mode === 'explore') backToSystem();
  else selectBody(state.selectedId ?? state.lastSelectedId);
}

function resetCamera() {
  if (!system) return;
  system.resetCamera();
  toast(state.selectedId ? `Camera re-centred on ${getBody(state.selectedId).name}` : 'Camera reset to overview');
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const TOAST_COPY = {
  playing: ['Motion resumed', 'Motion paused'],
  orbits: ['Orbital paths shown', 'Orbital paths hidden'],
  labels: ['Labels shown', 'Labels hidden'],
  moon: ['Moon shown', 'Moon hidden'],
  starEffects: ['Star effects on', 'Star effects off'],
  reducedEffects: ['Reduced effects on — lighter rendering', 'Full visual effects restored'],
  cinematic: ['Cinematic transitions on', 'Cinematic transitions off'],
  audio: ['Ambient audio on', 'Ambient audio muted'],
};

function setSetting(key, value, { silent = false } = {}) {
  settings[key] = value;
  switch (key) {
    case 'speedIndex':
      system?.set('speed', SPEED_STEPS[value]);
      break;
    case 'reducedEffects':
      dom.root.classList.toggle('reduced-effects', value);
      system?.set(key, value);
      break;
    case 'moon':
      system?.set(key, value);
      if (!value && state.selectedId === 'moon') selectBody('earth');
      break;
    case 'audio':
      break;
    default:
      system?.set(key, value);
  }
  const persisted = {};
  PERSISTED.forEach((k) => { persisted[k] = settings[k]; });
  savePrefs(PREFS_KEY, persisted);
  if (!silent && TOAST_COPY[key]) toast(TOAST_COPY[key][value ? 0 : 1]);
  refreshUI();
}

async function toggleAudio() {
  if (settings.audio) {
    audio.disable();
    setSetting('audio', false);
    return;
  }
  try {
    await audio.enable();
    setSetting('audio', true);
  } catch {
    toast('Ambient audio isn’t supported in this browser');
  }
}

function refreshUI() {
  syncControls(dom.controls, settings, state);
  if (panel) updateFrameShift();
  nav?.setActive(activeSectionId ?? (state.mode === 'hero' ? 'home' : 'solar-system'));
}

// ---------------------------------------------------------------------------
// 3D scene
// ---------------------------------------------------------------------------

function showFallback(reason) {
  dom.stage.classList.add('no-webgl');
  dom.fallback.hidden = false;
  if (reason) dom.fallbackReason.textContent = reason;
  dom.status.hidden = true;
}

function updateStatus() {
  const ready = readyTextureCount();
  if (!system) {
    dom.statusText.textContent = 'Loading 3D engine…';
  } else if (ready < TEXTURE_COUNT) {
    dom.statusText.textContent = `Rendering planetary surfaces ${ready}/${TEXTURE_COUNT}`;
  } else {
    dom.status.classList.add('is-done');
    setTimeout(() => { dom.status.hidden = true; }, 600);
  }
}

async function init3D() {
  if (!hasWebGL()) {
    showFallback('Your browser or device doesn’t support WebGL, which the 3D view needs. Everything else on the page still works.');
    return;
  }
  try {
    const { SolarSystem } = await import('./solar-system.js');
    system = new SolarSystem(dom.sceneContainer, {
      reducedMotion,
      lowPower,
      settings: {
        playing: settings.playing,
        speed: SPEED_STEPS[settings.speedIndex],
        orbits: settings.orbits,
        labels: settings.labels,
        moon: settings.moon,
        starEffects: settings.starEffects,
        reducedEffects: settings.reducedEffects,
        cinematic: settings.cinematic,
        scaleMode: settings.scaleMode,
        planetScale: settings.planetScale,
      },
    });
  } catch (error) {
    console.error('[ORBITX] 3D initialisation failed:', error);
    showFallback('The 3D engine couldn’t start (it may have failed to load from the CDN, or graphics acceleration is disabled).');
    return;
  }

  // Bring the scene in line with whatever the user did while it was loading.
  if (state.mode === 'hero') system.setHeroMode(true, { intro: true });
  else if (state.selectedId) system.focusBody(state.selectedId);
  else system.showOverview({ duration: 0 });

  system.addEventListener('select', (event) => selectBody(event.detail.id));
  const showDate = (date) => {
    if (Number.isNaN(date.getTime())) return;
    dom.simDate.textContent = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
    dom.simDate.dateTime = date.toISOString().slice(0, 10);
  };
  showDate(system.getSimDate());
  system.addEventListener('datechange', (event) => showDate(event.detail.date));
  system.addEventListener('lowperformance', () => {
    if (settings.reducedEffects) return;
    setSetting('reducedEffects', true, { silent: true });
    toast('Reduced effects enabled to keep things smooth — you can turn them back on in the controls.');
  });
  system.addEventListener('contextlost', () => {
    showFallback('The graphics context was lost (this can happen when the GPU is busy). Reload the page to restore the 3D view.');
  });

  dom.stage.classList.add('scene-ready');
  updateStatus();

  // Opt-in debugging handle: open the site with ?debug to inspect from the console.
  if (new URLSearchParams(location.search).has('debug')) window.orbitx = { system, settings, state };
}

// ---------------------------------------------------------------------------
// Navigation & keyboard
// ---------------------------------------------------------------------------

let activeSectionId = null;

function navigate(id) {
  nav.close();
  if (id === 'home') {
    showHero();
    scrollToStage();
    history.replaceState(null, '', location.pathname + location.search);
    return;
  }
  if (id === 'solar-system') {
    if (state.mode === 'hero') enterExploration();
    scrollToStage();
    history.replaceState(null, '', '#solar-system');
    return;
  }
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  target.focus({ preventScroll: true });
  history.replaceState(null, '', `#${id}`);
}

function observeSections() {
  const sections = ['solar-system', 'explorer', 'compare', 'facts', 'about'].map((id) => document.getElementById(id));
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const id = entry.target.id;
      activeSectionId = id === 'solar-system' ? null : id;
      refreshUI();
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach((section) => observer.observe(section));
}

function stageInView() {
  return dom.stage.getBoundingClientRect().bottom > window.innerHeight * 0.5;
}

function onKeyDown(event) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target;
  const typing = target.matches?.('input, textarea, select, [contenteditable="true"]');
  if (event.key === '/' && !typing) {
    event.preventDefault();
    if (window.matchMedia('(max-width: 1120px)').matches && !nav.isOpen) $('#menu-toggle').click();
    search.focus();
    return;
  }
  if (typing) return;

  if (event.key === 'Escape') {
    if (nav.isOpen) nav.close();
    else if (panel.isOpen) closePanel();
    else if (heroTimeline?.isActive()) heroTimeline.progress(1);
    return;
  }

  if (!stageInView() || state.mode === 'hero') return;
  const onButton = target.closest?.('button, a, [role="option"]');
  switch (event.key) {
    case ' ':
      if (onButton) return;
      event.preventDefault();
      setSetting('playing', !settings.playing);
      break;
    case 'o': case 'O':
      setSetting('orbits', !settings.orbits);
      break;
    case 'l': case 'L':
      setSetting('labels', !settings.labels);
      break;
    case 'r': case 'R':
      resetCamera();
      break;
    case 'ArrowLeft':
    case 'ArrowRight':
      if (state.mode === 'explore' && !target.matches?.('input[type="range"]')) {
        event.preventDefault();
        stepBody(event.key === 'ArrowLeft' ? -1 : 1);
      }
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function init() {
  dom.root.classList.toggle('reduce-motion', reducedMotion);
  dom.root.classList.toggle('reduced-effects', settings.reducedEffects);

  nav = initNavigation({ header: $('#site-header'), toggle: $('#menu-toggle'), drawer: $('#nav-drawer') });

  // All in-page links route through navigate() so Home/Solar System also
  // change the 3D stage's mode.
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || link.getAttribute('href').length < 2) return;
    event.preventDefault();
    navigate(link.getAttribute('href').slice(1));
  });

  renderPlanetCards($('#planet-grid'), PLANETS, { onExplore: (id) => selectBody(id, { scroll: true }) });
  initCardFilters($('#planet-filters'), $('#planet-grid'));
  // Sun and planets first, then the Moon and the ISS.
  const railBodies = BODIES.filter((b) => b.type === 'star' || b.type === 'planet').concat(getBody('moon'), getBody('iss'));
  renderPlanetRail(dom.rail, railBodies, (id) => selectBody(id));
  initFacts({ grid: $('#facts-grid'), spotlight: $('#fact-spotlight'), button: $('#fact-random'), facts: SPACE_FACTS });

  const compareRoot = $('#compare');
  initComparison({ root: compareRoot, planets: PLANETS });
  compareRoot.addEventListener('compare:update', () => applyOrbPreviews(compareRoot));

  search = initSearch({
    input: $('#planet-search'),
    listbox: $('#search-results'),
    status: $('#search-status'),
    bodies: BODIES,
    onSelect: (id) => {
      nav.close();
      selectBody(id, { scroll: true });
    },
  });

  panel = new PlanetPanel($('#planet-panel'), {
    onClose: () => closePanel(),
    onBack: backToSystem,
    onStep: stepBody,
    onExplore: (id) => selectBody(id, { closeUp: true }),
    onCompactChange: () => updateFrameShift(),
  });
  window.addEventListener('resize', () => updateFrameShift());

  initControlCenter(dom.controls, {
    onToggle: (key) => (key === 'audio' ? toggleAudio() : setSetting(key, !settings[key])),
    onAction: (action) => {
      if (action === 'reset-camera') resetCamera();
      else if (action === 'mode') toggleMode();
      else if (action === 'now') {
        system?.resetDate();
        toast('Simulation date reset to today');
      }
    },
    onSpeed: (index) => setSetting('speedIndex', index, { silent: true }),
    onScaleMode: (mode) => {
      setSetting('scaleMode', mode, { silent: true });
      toast(mode === 'proportional' ? 'Distances now proportional to AU (sizes still enlarged)' : 'Compact layout');
    },
    onPlanetScale: (scale) => setSetting('planetScale', scale, { silent: true }),
  });
  $('#sim-now').addEventListener('click', () => {
    system?.resetDate();
    toast('Simulation date reset to today');
  });

  $('#enter-btn').addEventListener('click', enterExploration);
  $('#skip-intro').addEventListener('click', () => {
    heroTimeline?.progress(1);
    enterExploration();
  });

  document.addEventListener('keydown', onKeyDown);

  // The "Illustrative scale" note closes when clicking anywhere else.
  const scaleNote = $('.scale-note');
  document.addEventListener('pointerdown', (event) => {
    if (scaleNote.open && !scaleNote.contains(event.target)) scaleNote.open = false;
  });
  setHeroVisible(true);
  heroTimeline = playHeroIntro({ reducedMotion });
  refreshIcons();
  initReveal();
  observeSections();
  refreshUI();

  // Textures: update card previews and the loading indicator as they arrive.
  textureEvents.addEventListener('texture', async (event) => {
    updateStatus();
    const id = event.detail.id;
    if (!PLANETS.some((p) => p.id === id)) return;
    const url = await getPreviewURL(id);
    if (url) setOrbPreview(id, url);
  });
  generateTextures({ quality: settings.reducedEffects ? 'low' : 'high' });

  init3D();
}

init();

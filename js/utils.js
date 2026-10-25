/** Shared helpers with no Three.js dependency. */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** Rough heuristic for starting in reduced-effects mode. */
export function isLikelyLowPower() {
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const smallScreen = Math.min(window.screen.width, window.screen.height) < 500;
  return cores <= 2 || memory <= 2 || (coarse && smallScreen);
}

export function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  } catch {
    return false;
  }
}

const formatters = new Map();
export function formatNumber(value, maxDigits = 0) {
  if (!formatters.has(maxDigits)) {
    formatters.set(maxDigits, new Intl.NumberFormat('en-US', { maximumFractionDigits: maxDigits }));
  }
  return formatters.get(maxDigits).format(value);
}

export function formatDays(days) {
  if (days < 1000) return `${formatNumber(days, 1)} days`;
  return `${formatNumber(days)} days (≈${formatNumber(days / 365.25, 1)} years)`;
}

export function formatRotation(stats) {
  const hours = Math.abs(stats.rotationHours);
  const base = hours >= 48 ? `${formatNumber(hours / 24, 1)} days` : `${formatNumber(hours, 1)} hours`;
  return stats.retrograde ? `${base} (retrograde)` : base;
}

export function formatRatio(ratio) {
  return ratio < 10 ? formatNumber(ratio, 1) : formatNumber(ratio);
}

/** Replaces <i data-lucide> placeholders with SVG icons, if Lucide loaded. */
export function refreshIcons() {
  if (window.lucide?.createIcons) {
    window.lucide.createIcons({ attrs: { 'aria-hidden': 'true', focusable: 'false' } });
  }
}

export function loadPrefs(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? {};
  } catch {
    return {};
  }
}

export function savePrefs(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode) — preferences simply won't persist */
  }
}

export function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

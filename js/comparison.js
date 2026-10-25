/**
 * Compare Planets: side-by-side metrics for any two planets, with bars scaled
 * to the larger value of the pair, a to-scale size comparison, and a shared
 * temperature scale (temperatures can be negative, so they are plotted as
 * positions rather than bar lengths).
 */
import { formatNumber, formatDays, formatRotation, formatRatio } from './utils.js';

const METRICS = [
  {
    key: 'diameter',
    label: 'Diameter',
    value: (p) => p.stats.diameterKm,
    format: (p) => `${formatNumber(p.stats.diameterKm)} km`,
    insight: (big, small, r) => `${big.name} is ${r}× wider than ${small.name}.`,
  },
  {
    key: 'distance',
    label: 'Average distance from the Sun',
    value: (p) => p.stats.distanceMkm,
    format: (p) => `${formatNumber(p.stats.distanceMkm, 1)} million km · ${p.stats.distanceAU} AU`,
    insight: (big, small, r) => `${big.name} orbits ${r}× farther from the Sun than ${small.name}.`,
  },
  {
    key: 'orbit',
    label: 'Orbital period (one year)',
    value: (p) => p.stats.orbitalPeriodDays,
    format: (p) => formatDays(p.stats.orbitalPeriodDays),
    insight: (big, small, r) => `A year on ${big.name} lasts ${r}× longer than on ${small.name}.`,
  },
  {
    key: 'rotation',
    label: 'Rotation period (sidereal)',
    value: (p) => Math.abs(p.stats.rotationHours),
    format: (p) => formatRotation(p.stats),
    insight: (big, small, r) => `${big.name} takes ${r}× longer to spin once than ${small.name}.`,
  },
];

const TEMP_MIN = -230;
const TEMP_MAX = 480;

export function initComparison({ root, planets, defaults = ['earth', 'jupiter'] }) {
  const selectA = root.querySelector('#compare-a');
  const selectB = root.querySelector('#compare-b');
  const swap = root.querySelector('#compare-swap');
  const metricsHost = root.querySelector('#compare-metrics');
  const sizeHost = root.querySelector('#compare-size');

  const options = planets.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
  selectA.innerHTML = options;
  selectB.innerHTML = options;
  selectA.value = defaults[0];
  selectB.value = defaults[1];

  // Static skeleton; values are filled by update().
  metricsHost.innerHTML = METRICS.map((m) => `
    <article class="metric" data-metric="${m.key}">
      <h3 class="metric-label">${m.label}</h3>
      <div class="metric-row" data-side="a">
        <span class="metric-name"></span>
        <div class="metric-track" aria-hidden="true"><span class="metric-bar"></span></div>
        <span class="metric-value"></span>
      </div>
      <div class="metric-row" data-side="b">
        <span class="metric-name"></span>
        <div class="metric-track" aria-hidden="true"><span class="metric-bar"></span></div>
        <span class="metric-value"></span>
      </div>
      <p class="metric-insight"></p>
    </article>`).join('') + `
    <article class="metric metric-temperature" data-metric="temperature">
      <h3 class="metric-label">Average temperature</h3>
      <div class="temp-scale" aria-hidden="true">
        <div class="temp-track"></div>
        <span class="temp-marker" data-side="a"><span class="temp-marker-label"></span></span>
        <span class="temp-marker" data-side="b"><span class="temp-marker-label"></span></span>
        <div class="temp-ticks"><span>${TEMP_MIN} °C</span><span>0 °C</span><span>${TEMP_MAX} °C</span></div>
      </div>
      <dl class="temp-values">
        <div data-side="a"><dt></dt><dd></dd></div>
        <div data-side="b"><dt></dt><dd></dd></div>
      </dl>
      <p class="metric-insight"></p>
      <p class="metric-note">Gas and ice giants have no solid surface; their temperatures are quoted at the 1-bar pressure level.</p>
    </article>`;

  const zeroPosition = ((0 - TEMP_MIN) / (TEMP_MAX - TEMP_MIN)) * 100;
  metricsHost.querySelector('.temp-ticks span:nth-child(2)').style.left = `${zeroPosition}%`;

  function update() {
    const a = planets.find((p) => p.id === selectA.value);
    const b = planets.find((p) => p.id === selectB.value);
    root.style.setProperty('--compare-a', a.color);
    root.style.setProperty('--compare-b', b.color);

    for (const metric of METRICS) {
      const card = metricsHost.querySelector(`[data-metric="${metric.key}"]`);
      const va = metric.value(a);
      const vb = metric.value(b);
      const max = Math.max(va, vb);
      [[a, va, 'a'], [b, vb, 'b']].forEach(([planet, value, side]) => {
        const row = card.querySelector(`[data-side="${side}"]`);
        row.querySelector('.metric-name').textContent = planet.name;
        row.querySelector('.metric-value').textContent = metric.format(planet);
        row.querySelector('.metric-bar').style.width = `${Math.max(1.5, (value / max) * 100)}%`;
      });
      const insight = card.querySelector('.metric-insight');
      if (a.id === b.id || va === vb) insight.textContent = 'Same value — pick two different planets to compare.';
      else {
        const [big, small] = va > vb ? [a, b] : [b, a];
        insight.textContent = metric.insight(big, small, formatRatio(Math.max(va, vb) / Math.min(va, vb)));
      }
    }

    const temp = metricsHost.querySelector('[data-metric="temperature"]');
    [[a, 'a'], [b, 'b']].forEach(([planet, side]) => {
      const t = planet.stats.meanTempC;
      const marker = temp.querySelector(`.temp-marker[data-side="${side}"]`);
      marker.style.left = `${((t - TEMP_MIN) / (TEMP_MAX - TEMP_MIN)) * 100}%`;
      marker.querySelector('.temp-marker-label').textContent = planet.name;
      const item = temp.querySelector(`.temp-values [data-side="${side}"]`);
      item.querySelector('dt').textContent = planet.name;
      item.querySelector('dd').textContent = `${formatNumber(t)} °C`;
    });
    const diff = Math.abs(a.stats.meanTempC - b.stats.meanTempC);
    const [hot, cold] = a.stats.meanTempC >= b.stats.meanTempC ? [a, b] : [b, a];
    temp.querySelector('.metric-insight').textContent = diff === 0
      ? 'Same average temperature.'
      : `${hot.name} is about ${formatNumber(diff)} °C warmer on average than ${cold.name}.`;

    // True relative sizes: the larger planet is drawn at full size.
    const maxDiameter = Math.max(a.stats.diameterKm, b.stats.diameterKm);
    sizeHost.innerHTML = [a, b].map((planet) => {
      const size = Math.max(3, (planet.stats.diameterKm / maxDiameter) * 100);
      return `
        <figure class="compare-orb-figure">
          <div class="compare-orb-box"><span class="compare-orb" data-orb="${planet.id}" style="--orb-color:${planet.color}; --size:${size}%"></span></div>
          <figcaption>${planet.name}<span>${formatNumber(planet.stats.diameterKm)} km</span></figcaption>
        </figure>`;
    }).join('');
    root.dispatchEvent(new CustomEvent('compare:update'));
  }

  selectA.addEventListener('change', update);
  selectB.addEventListener('change', update);
  swap.addEventListener('click', () => {
    [selectA.value, selectB.value] = [selectB.value, selectA.value];
    update();
  });
  update();

  return { update };
}

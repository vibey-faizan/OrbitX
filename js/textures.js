/**
 * Texture store: generates procedural planet surfaces (in a worker when
 * possible), keeps the resulting canvases, and notifies listeners as each one
 * becomes available. Also provides small canvas textures for glows, rings,
 * the selection reticle and nebulae.
 *
 * No Three.js dependency — the planet cards use these canvases too, so they
 * work even when WebGL is unavailable.
 */
import { TEXTURE_IDS, textureWidth, paintTexture, createNoise, smoothstep } from './texture-painters.js';

export const textureEvents = new EventTarget();
export const TEXTURE_COUNT = TEXTURE_IDS.length;

const canvases = new Map();
const previewUrls = new Map();
let generation = null;

export function getTextureCanvas(id) {
  return canvases.get(id) ?? null;
}

export function readyTextureCount() {
  return canvases.size;
}

function storeTexture(id, width, height, data) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
  canvases.set(id, canvas);
  textureEvents.dispatchEvent(new CustomEvent('texture', { detail: { id, canvas } }));
}

/** Starts generation once; later calls return the same promise. */
export function generateTextures({ quality = 'high' } = {}) {
  if (generation) return generation;
  const jobs = TEXTURE_IDS.map((id) => ({ id, width: textureWidth(id, quality) }));
  generation = runInWorker(jobs)
    .catch((error) => {
      console.info('[ORBITX] Texture worker unavailable, painting on the main thread.', error?.message ?? error);
      return runOnMainThread(jobs.filter((job) => !canvases.has(job.id)));
    })
    .finally(() => textureEvents.dispatchEvent(new Event('complete')));
  return generation;
}

function runInWorker(jobs) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL('./texture-worker.js', import.meta.url), { type: 'module' });
    } catch (error) {
      reject(error);
      return;
    }
    worker.onmessage = ({ data }) => {
      if (data.type === 'texture') {
        storeTexture(data.id, data.width, data.height, new Uint8ClampedArray(data.buffer));
      } else if (data.type === 'error') {
        console.warn(`[ORBITX] Could not paint ${data.id}:`, data.message);
      } else if (data.type === 'done') {
        worker.terminate();
        resolve();
      }
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      worker.terminate();
      reject(new Error(event.message || 'Texture worker failed to start'));
    };
    worker.postMessage({ jobs });
  });
}

async function runOnMainThread(jobs) {
  for (const job of jobs) {
    // Yield between textures so the page stays responsive.
    await new Promise((resolve) => setTimeout(resolve, 16));
    try {
      const { width, height, data } = paintTexture(job.id, job.width);
      storeTexture(job.id, width, height, data);
    } catch (error) {
      console.warn(`[ORBITX] Could not paint ${job.id}:`, error);
    }
  }
}

/** Compressed JPEG object URL of a planet texture, for CSS previews. */
export function getPreviewURL(id) {
  if (previewUrls.has(id)) return previewUrls.get(id);
  const canvas = canvases.get(id);
  if (!canvas) return Promise.resolve(null);
  const promise = new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), 'image/jpeg', 0.85);
  });
  previewUrls.set(id, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Small effect textures (cheap, generated synchronously)
// ---------------------------------------------------------------------------

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Soft radial glow, white at the centre fading to transparent. */
export function createGlowCanvas(size = 256) {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.65)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

/** Thin circular reticle with four tick marks, drawn in white (tinted by material). */
export function createReticleCanvas(size = 256) {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.shadowColor = 'rgba(255,255,255,0.8)';
  ctx.shadowBlur = 8;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(c, c, size * 0.4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 4;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * size * 0.43, c + Math.sin(a) * size * 0.43);
    ctx.lineTo(c + Math.cos(a) * size * 0.49, c + Math.sin(a) * size * 0.49);
    ctx.stroke();
  }
  return canvas;
}

/**
 * Radial ring profile; x maps from inner to outer edge.
 * 'saturn' follows the real C/B/A ring layout with the Cassini Division and
 * Encke Gap; 'uranus' draws a few narrow, faint ringlets.
 */
export function createRingCanvas(kind = 'saturn', width = 1024) {
  const canvas = makeCanvas(width, 4);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, 4);
  const noise = createNoise(kind === 'saturn' ? 7 : 11);
  for (let i = 0; i < width; i++) {
    const t = i / (width - 1);
    const grain = noise.fbm(t * 60, 0.5, 0.5, 4);
    let r, g, b, a;
    if (kind === 'saturn') {
      if (t < 0.28) { [r, g, b] = [150, 138, 120]; a = 0.16 + grain * 0.18; }               // C ring
      else if (t < 0.693) { [r, g, b] = [232, 214, 178]; a = 0.72 + grain * 0.28; }         // B ring
      else if (t < 0.767) { [r, g, b] = [90, 80, 70]; a = 0.05; }                           // Cassini Division
      else if (t > 0.945 && t < 0.953) { [r, g, b] = [90, 80, 70]; a = 0.04; }              // Encke Gap
      else { [r, g, b] = [205, 186, 150]; a = 0.5 + grain * 0.25; }                         // A ring
      a *= 0.82 + 0.18 * Math.sin(i * 0.9 + grain * 6);
      a *= smoothstep(0, 0.02, t) * smoothstep(1, 0.985, t);
    } else {
      const ringlets = [0.12, 0.3, 0.45, 0.62, 0.92];
      a = 0;
      for (const center of ringlets) a = Math.max(a, smoothstep(0.012, 0, Math.abs(t - center)));
      [r, g, b] = [190, 215, 222];
      a *= 0.55;
    }
    for (let row = 0; row < 4; row++) {
      const o = (row * width + i) * 4;
      image.data[o] = r; image.data[o + 1] = g; image.data[o + 2] = b;
      image.data[o + 3] = Math.max(0, Math.min(1, a)) * 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Wispy nebula cloud in the given colour. */
export function createNebulaCanvas(seed, color, size = 128) {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const noise = createNoise(seed);
  const [cr, cg, cb] = color;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const dx = i / size - 0.5, dy = j / size - 0.5;
      const falloff = smoothstep(0.5, 0.05, Math.sqrt(dx * dx + dy * dy));
      const cloud = noise.fbm(i * 0.035, j * 0.035, seed * 0.1, 5);
      const a = smoothstep(0.42, 0.72, cloud) * falloff;
      const o = (j * size + i) * 4;
      image.data[o] = cr; image.data[o + 1] = cg; image.data[o + 2] = cb;
      image.data[o + 3] = a * 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

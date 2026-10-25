/**
 * Procedural planet surface painters.
 *
 * Pure functions with no DOM access, so they run inside a Web Worker (see
 * texture-worker.js) or on the main thread as a fallback. Each painter fills an
 * equirectangular RGBA buffer by sampling 3D noise on the unit sphere, which
 * makes the textures seamless at the longitude seam and at the poles.
 *
 * These are artistic impressions informed by each world's real appearance,
 * not mission imagery.
 */

const D2R = Math.PI / 180;

/** Texture ids in generation order (most visible first). */
export const TEXTURE_IDS = [
  'earth', 'earth-clouds', 'sun', 'jupiter', 'saturn', 'mars',
  'venus', 'neptune', 'mercury', 'uranus', 'moon',
];

const BASE_WIDTH = {
  sun: 512, mercury: 512, venus: 512, earth: 1024, 'earth-clouds': 1024,
  mars: 1024, jupiter: 1024, saturn: 1024, uranus: 512, neptune: 512, moon: 512,
};

export function textureWidth(id, quality = 'high') {
  const width = BASE_WIDTH[id] ?? 512;
  return quality === 'low' ? Math.max(256, width / 2) : width;
}

// ---------------------------------------------------------------------------
// Noise
// ---------------------------------------------------------------------------

/** Seeded 3D value noise with fractal Brownian motion. */
export function createNoise(seed = 1) {
  let state = seed >>> 0;
  // mulberry32 PRNG — small, fast, deterministic.
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const values = new Float32Array(256);
  for (let i = 0; i < 256; i++) values[i] = random();

  function noise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const w = zf * zf * (3 - 2 * zf);
    const X = xi & 255, Y = yi & 255, Z = zi & 255;
    const a = perm[X] + Y, b = perm[X + 1] + Y;
    const aa = perm[a] + Z, ab = perm[a + 1] + Z;
    const ba = perm[b] + Z, bb = perm[b + 1] + Z;
    const x00 = values[perm[aa]] + (values[perm[ba]] - values[perm[aa]]) * u;
    const x10 = values[perm[ab]] + (values[perm[bb]] - values[perm[ab]]) * u;
    const x01 = values[perm[aa + 1]] + (values[perm[ba + 1]] - values[perm[aa + 1]]) * u;
    const x11 = values[perm[ab + 1]] + (values[perm[bb + 1]] - values[perm[ab + 1]]) * u;
    const y0 = x00 + (x10 - x00) * v;
    const y1 = x01 + (x11 - x01) * v;
    return y0 + (y1 - y0) * w;
  }

  function fbm(x, y, z, octaves = 5, lacunarity = 2, gain = 0.5) {
    let sum = 0, amplitude = 0.5, frequency = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amplitude * noise(x * frequency + i * 17.3, y * frequency, z * frequency);
      norm += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }
    return sum / norm;
  }

  return { noise, fbm, random };
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

export const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Returns fn(t, out) that writes a colour interpolated between the stops. */
function ramp(stops) {
  const ts = stops.map((s) => s[0]);
  const cs = stops.map((s) => hexToRgb(s[1]));
  const last = stops.length - 1;
  return (t, out) => {
    let a, b, k;
    if (t <= ts[0]) { a = b = cs[0]; k = 0; }
    else if (t >= ts[last]) { a = b = cs[last]; k = 0; }
    else {
      let i = 1;
      while (t > ts[i]) i++;
      a = cs[i - 1]; b = cs[i];
      k = (t - ts[i - 1]) / (ts[i] - ts[i - 1]);
    }
    out[0] = a[0] + (b[0] - a[0]) * k;
    out[1] = a[1] + (b[1] - a[1]) * k;
    out[2] = a[2] + (b[2] - a[2]) * k;
    return out;
  };
}

function mix(out, rgb, k) {
  if (k <= 0) return;
  if (k > 1) k = 1;
  out[0] += (rgb[0] - out[0]) * k;
  out[1] += (rgb[1] - out[1]) * k;
  out[2] += (rgb[2] - out[2]) * k;
}

/** Elliptical feature at (u0, lat0) — returns squared normalised distance. */
function ellipseDistance(u, lat, u0, lat0, width, height) {
  let du = u - u0;
  du -= Math.round(du);
  const ex = (du * 2 * Math.PI * Math.cos(lat0)) / width;
  const ey = (lat - lat0) / height;
  return ex * ex + ey * ey;
}

// ---------------------------------------------------------------------------
// Craters
// ---------------------------------------------------------------------------

function makeCraters(random, count, minRadius, maxRadius) {
  const craters = [];
  for (let i = 0; i < count; i++) {
    const y = random() * 2 - 1;
    const theta = random() * Math.PI * 2;
    const s = Math.sqrt(1 - y * y);
    const r = minRadius + (maxRadius - minRadius) * Math.pow(random(), 3);
    craters.push({ x: s * Math.cos(theta), y, z: s * Math.sin(theta), r, cosLimit: Math.cos(r * 1.25) });
  }
  return craters;
}

/** Darkened bowls with bright rims. Returns a brightness offset. */
function craterField(craters, x, y, z) {
  let value = 0;
  for (let i = 0; i < craters.length; i++) {
    const c = craters[i];
    const d = x * c.x + y * c.y + z * c.z;
    if (d < c.cosLimit) continue;
    const q = Math.acos(Math.min(1, d)) / c.r;
    if (q < 1) value -= 0.15 * (1 - q * q);
    value += 0.11 * Math.max(0, 1 - Math.abs(q - 1) / 0.22);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Painters — each returns shade(x, y, z, lat, u, out)
// ---------------------------------------------------------------------------

const PAINTERS = {
  sun(n) {
    const pal = ramp([[0, '#8a1f00'], [0.3, '#e65c00'], [0.55, '#ff9a1f'], [0.8, '#ffd166'], [1, '#fff4cf']]);
    return (x, y, z, lat, u, out) => {
      const granules = n.fbm(x * 14, y * 14, z * 14, 4);
      const cells = n.fbm(x * 3 + 9, y * 3, z * 3, 3);
      pal(0.62 + (granules - 0.5) * 1.15 + (cells - 0.5) * 0.7, out);
    };
  },

  mercury(n) {
    const pal = ramp([[0, '#2e2a27'], [0.4, '#6b625a'], [0.65, '#9b9188'], [1, '#d6cdc3']]);
    const craters = makeCraters(n.random, 190, 0.015, 0.16);
    return (x, y, z, lat, u, out) => {
      const broad = n.fbm(x * 3, y * 3, z * 3, 5);
      const fine = n.fbm(x * 12, y * 12, z * 12, 3);
      pal(0.55 + (broad - 0.5) * 1.4 + (fine - 0.5) * 0.5 + craterField(craters, x, y, z), out);
    };
  },

  moon(n) {
    const pal = ramp([[0, '#262626'], [0.35, '#5a5a5c'], [0.6, '#8f8f90'], [1, '#dcdcda']]);
    const craters = makeCraters(n.random, 160, 0.012, 0.14);
    return (x, y, z, lat, u, out) => {
      const broad = n.fbm(x * 3, y * 3, z * 3, 5);
      const maria = n.fbm(x * 1.4 + 3, y * 1.4, z * 1.4, 4);
      let t = 0.62 + (broad - 0.5) * 0.9 + craterField(craters, x, y, z) * 0.9;
      t -= smoothstep(0.5, 0.6, maria) * 0.26;
      pal(t, out);
    };
  },

  venus(n) {
    const pal = ramp([[0, '#6e3f16'], [0.3, '#b07a3a'], [0.55, '#d9b06f'], [0.78, '#efd7a3'], [1, '#fff1d2']]);
    return (x, y, z, lat, u, out) => {
      const warp = n.fbm(x * 2, y * 2, z * 2, 4);
      const band = n.fbm(x * 1.4 + warp * 2.2, y * 6 + warp, z * 1.4 + warp * 2.2, 5);
      pal(0.54 + (band - 0.5) * 2.6, out);
    };
  },

  earth(n) {
    const ocean = ramp([[0, '#020b24'], [0.5, '#06275a'], [0.85, '#0f4c86'], [1, '#2a82b3']]);
    const green = hexToRgb('#2f5e29');
    const forest = hexToRgb('#1d4220');
    const desert = hexToRgb('#c4a46a');
    const rock = hexToRgb('#6e6152');
    const snow = hexToRgb('#eef3f6');
    const ice = hexToRgb('#e6eff5');
    const SEA = 0.55;
    return (x, y, z, lat, u, out) => {
      const h = 0.5 + (n.fbm(x * 1.7, y * 1.7, z * 1.7, 6) - 0.5) * 2.4;
      const alat = Math.abs(lat) / D2R;
      if (h < SEA) {
        ocean(smoothstep(0.15, SEA, h), out);
      } else {
        const elevation = (h - SEA) / (1 - SEA);
        const moisture = n.fbm(x * 3 + 17, y * 3, z * 3, 4);
        out[0] = green[0]; out[1] = green[1]; out[2] = green[2];
        mix(out, forest, smoothstep(0.5, 0.62, moisture));
        const aridBand = Math.exp(-(((alat - 24) / 11) ** 2));
        mix(out, desert, smoothstep(0.45, 0.72, aridBand * 0.8 + (0.55 - moisture) * 1.5));
        mix(out, rock, smoothstep(0.35, 0.7, elevation));
        mix(out, snow, smoothstep(0.78, 0.95, elevation) + smoothstep(55, 70, alat) * 0.6);
      }
      const capEdge = 72 + (n.fbm(x * 4, y * 4, z * 4, 3) - 0.5) * 16;
      if (alat > capEdge) mix(out, ice, smoothstep(capEdge, capEdge + 3, alat));
    };
  },

  'earth-clouds'(n) {
    return (x, y, z, lat, u, out) => {
      const warp = n.fbm(x * 2, y * 2, z * 2, 3);
      const c = n.fbm(x * 3 + warp * 1.6, y * 6 + warp, z * 3 + warp * 1.6, 6);
      out[0] = out[1] = out[2] = 255;
      out[3] = smoothstep(0.5, 0.68, c) * 235;
    };
  },

  mars(n) {
    const pal = ramp([[0, '#2a120b'], [0.3, '#6b2a14'], [0.52, '#a8492a'], [0.72, '#c96a3d'], [1, '#e6a873']]);
    const cap = hexToRgb('#f2ebe4');
    const craters = makeCraters(n.random, 70, 0.01, 0.07);
    return (x, y, z, lat, u, out) => {
      const broad = n.fbm(x * 2.2, y * 2.2, z * 2.2, 6);
      const dark = n.fbm(x * 1.1 + 5, y * 1.1, z * 1.1, 4);
      pal(0.58 + (broad - 0.5) * 1.6 - smoothstep(0.5, 0.62, dark) * 0.28 + craterField(craters, x, y, z) * 0.6, out);
      const alat = Math.abs(lat) / D2R;
      const edge = 79 + (n.fbm(x * 5, y * 5, z * 5, 3) - 0.5) * 10;
      if (alat > edge) mix(out, cap, smoothstep(edge, edge + 2.5, alat));
    };
  },

  jupiter(n) {
    const pal = ramp([[0, '#6e4428'], [0.2, '#9a6440'], [0.4, '#c49a6c'], [0.6, '#e2c9a2'], [0.8, '#f1e4cc'], [1, '#fbf4e6']]);
    const spotCore = hexToRgb('#b8532f');
    const spotRim = hexToRgb('#e8b089');
    const pole = hexToRgb('#857668');
    const spotLat = -22 * D2R;
    return (x, y, z, lat, u, out) => {
      const turbulence = n.fbm(x * 3, y * 3, z * 3, 5);
      const streak = n.fbm(x * 1.5, y * 38, z * 1.5, 3);
      pal(0.55 + 0.32 * Math.cos(lat * 13.5 + (turbulence - 0.5) * 3.2) + (streak - 0.5) * 0.5, out);
      const d2 = ellipseDistance(u, lat, 0.62, spotLat, 0.15, 0.075);
      if (d2 < 1.7) {
        const swirl = n.fbm(x * 9, y * 9, z * 9, 3);
        mix(out, spotRim, smoothstep(1.7, 1.0, d2) * 0.8);
        mix(out, spotCore, smoothstep(1.05, 0.25, d2 + (swirl - 0.5) * 0.7));
      }
      mix(out, pole, smoothstep(0.72, 0.97, Math.abs(y)) * 0.75);
    };
  },

  saturn(n) {
    const pal = ramp([[0, '#9c7a45'], [0.3, '#c2a066'], [0.55, '#dcc391'], [0.8, '#ecdcb5'], [1, '#f6ecd2']]);
    const pole = hexToRgb('#8f8a74');
    return (x, y, z, lat, u, out) => {
      const turbulence = n.fbm(x * 2.5, y * 2.5, z * 2.5, 4);
      const streak = n.fbm(x * 1.2, y * 45, z * 1.2, 3);
      pal(0.58 + 0.22 * Math.cos(lat * 17 + (turbulence - 0.5) * 1.4) + (streak - 0.5) * 0.45, out);
      mix(out, pole, smoothstep(0.8, 0.98, Math.abs(y)) * 0.6);
    };
  },

  uranus(n) {
    const pal = ramp([[0, '#6fb7c4'], [0.5, '#9ad8df'], [1, '#c9f1f3']]);
    return (x, y, z, lat, u, out) => {
      const streak = n.fbm(x * 2, y * 14, z * 2, 3);
      pal(0.5 + 0.12 * Math.cos(lat * 9) + (streak - 0.5) * 0.35 + smoothstep(0.6, 1, y) * 0.15, out);
    };
  },

  neptune(n) {
    const pal = ramp([[0, '#0d1f5c'], [0.35, '#1b3d99'], [0.65, '#2f63cf'], [1, '#6d9bf0']]);
    const white = hexToRgb('#e8f0ff');
    const dark = hexToRgb('#0a1542');
    const spotLat = -20 * D2R;
    return (x, y, z, lat, u, out) => {
      const turbulence = n.fbm(x * 3, y * 3, z * 3, 4);
      const streak = n.fbm(x * 2, y * 32, z * 2, 3);
      pal(0.5 + 0.2 * Math.cos(lat * 8 + (turbulence - 0.5) * 2.5) + (streak - 0.5) * 0.5, out);
      mix(out, white, smoothstep(0.62, 0.72, streak) * 0.7);
      const d2 = ellipseDistance(u, lat, 0.3, spotLat, 0.12, 0.06);
      if (d2 < 1.2) mix(out, dark, smoothstep(1.2, 0.4, d2) * 0.85);
    };
  },
};

function seedFor(id) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return hash >>> 0;
}

/**
 * Paints one texture.
 * @returns {{ width: number, height: number, data: Uint8ClampedArray }}
 */
export function paintTexture(id, width) {
  const painter = PAINTERS[id];
  if (!painter) throw new Error(`Unknown texture: ${id}`);
  const height = width / 2;
  const shade = painter(createNoise(seedFor(id)));
  const data = new Uint8ClampedArray(width * height * 4);

  const cosLon = new Float32Array(width);
  const sinLon = new Float32Array(width);
  for (let i = 0; i < width; i++) {
    const lon = (i / width) * Math.PI * 2;
    cosLon[i] = Math.cos(lon);
    sinLon[i] = Math.sin(lon);
  }

  const out = [0, 0, 0, 255];
  let offset = 0;
  for (let j = 0; j < height; j++) {
    const lat = Math.PI / 2 - ((j + 0.5) / height) * Math.PI;
    const cosLat = Math.cos(lat);
    const y = Math.sin(lat);
    for (let i = 0; i < width; i++) {
      out[3] = 255;
      shade(cosLat * cosLon[i], y, cosLat * sinLon[i], lat, i / width, out);
      data[offset] = out[0];
      data[offset + 1] = out[1];
      data[offset + 2] = out[2];
      data[offset + 3] = out[3];
      offset += 4;
    }
  }
  return { width, height, data };
}

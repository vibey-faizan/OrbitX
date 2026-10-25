/**
 * Builds the Three.js objects for the Sun, planets and Moon.
 *
 * Object hierarchy for each planet:
 *   anchor     – positioned on the orbit each frame (heliocentric)
 *   └ sizeGroup – scaled by the "planet size" setting
 *     └ tiltGroup – fixed axial tilt (pole direction stays fixed in space)
 *       ├ mesh    – spins about its own axis
 *       └ ring    – Saturn / Uranus rings
 *
 * Retrograde rotators (Venus, Uranus) are handled by their >90° axial tilt,
 * so every mesh spins in the same local direction.
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { BODIES, getBody } from './data/planet-data.js';
import {
  getTextureCanvas, textureEvents, createGlowCanvas, createReticleCanvas, createRingCanvas,
} from './textures.js';

const DEG = Math.PI / 180;

/** Illustrative Sun radius in scene units (not to scale with the planets). */
export const SUN_RADIUS = 4.2;
/** In "proportional" mode, orbit radius = AU × this value. */
export const UNITS_PER_AU = 24;

/**
 * Visual configuration. Radii follow diameter^0.5 so small and giant planets
 * remain visible together; `compact` distances are hand-tuned for overview.
 */
export const VISUALS = {
  sun: { radius: SUN_RADIUS, color: '#ffb54d' },
  mercury: { radius: 0.36, compact: 8.5, color: '#9c9187', bump: 0.6 },
  venus: { radius: 0.56, compact: 11.5, color: '#d9b77e', atmosphere: { color: '#ffd9a0', intensity: 0.9, power: 2.6 } },
  earth: { radius: 0.58, compact: 15, color: '#3a7bd5', roughness: 0.8, clouds: true, atmosphere: { color: '#5fb4ff', intensity: 1.3, power: 2.8 } },
  mars: { radius: 0.42, compact: 19, color: '#c1440e', bump: 0.35, atmosphere: { color: '#ff9a6b', intensity: 0.45, power: 3.5 } },
  jupiter: { radius: 1.9, compact: 27, color: '#c99e72', atmosphere: { color: '#ffe2b8', intensity: 0.4, power: 3.5 } },
  saturn: { radius: 1.65, compact: 36.5, color: '#e3c78f', ring: { kind: 'saturn', inner: 1.24, outer: 2.27 }, atmosphere: { color: '#ffe9bf', intensity: 0.35, power: 3.5 } },
  uranus: { radius: 1.12, compact: 45, color: '#9fe3ea', ring: { kind: 'uranus', inner: 1.6, outer: 2.0 }, atmosphere: { color: '#b5f6ff', intensity: 0.55, power: 3 } },
  neptune: { radius: 1.1, compact: 53, color: '#3f6fe0', atmosphere: { color: '#7aa2ff', intensity: 0.6, power: 3 } },
  // Moon radius keeps the true Moon/Earth ratio (0.273); orbit distance is illustrative.
  moon: { radius: 0.158, orbitRadius: 1.45, inclination: 5.14, color: '#a7a7a7', bump: 0.6 },
};

export const OUTER_COMPACT_RADIUS = VISUALS.neptune.compact;
export const OUTER_PROPORTIONAL_RADIUS = getBody('neptune').stats.distanceAU * UNITS_PER_AU;

// ---------------------------------------------------------------------------
// Shared resources
// ---------------------------------------------------------------------------

function canvasTexture(canvas, ctx, { srgb = true } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = ctx.anisotropy;
  ctx.disposables.push(texture);
  return texture;
}

/** Applies a procedural texture now, or as soon as the worker delivers it. */
function bindTexture(id, apply) {
  const ready = getTextureCanvas(id);
  if (ready) {
    apply(ready);
    return;
  }
  const handler = (event) => {
    if (event.detail.id !== id) return;
    textureEvents.removeEventListener('texture', handler);
    apply(event.detail.canvas);
  };
  textureEvents.addEventListener('texture', handler);
}

/**
 * Rim-light shader for atmospheres. When `lit` is 1 the glow fades on the
 * night side (the Sun sits at the world origin).
 */
export function createAtmosphereMaterial({ color, intensity = 1, power = 3, lit = true }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(color) },
      intensity: { value: intensity },
      power: { value: power },
      lit: { value: lit ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 glowColor;
      uniform float intensity;
      uniform float power;
      uniform float lit;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), power);
        float daylight = smoothstep(-0.25, 0.45, dot(N, normalize(-vWorldPos)));
        float shade = mix(1.0, daylight, lit);
        gl_FragColor = vec4(glowColor, clamp(rim * shade * intensity, 0.0, 1.0));
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

function createLabel(body, { small = false } = {}) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `planet-label${small ? ' is-small' : ''}`;
  el.tabIndex = -1; // The planet rail provides the keyboard-accessible equivalent.
  el.dataset.id = body.id;
  el.setAttribute('aria-label', `Focus ${body.name}`);
  el.innerHTML = `<span class="planet-label-dot" style="--dot:${body.color}"></span><span>${body.name}</span>`;
  return { el, object: new CSS2DObject(el) };
}

function createOrbitLine(geometry, color) {
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false });
  const line = new THREE.LineLoop(geometry, material);
  line.userData.baseColor = new THREE.Color(color);
  return line;
}

function createRing(vis, ctx) {
  const inner = vis.radius * vis.ring.inner;
  const outer = vis.radius * vis.ring.outer;
  const geometry = new THREE.RingGeometry(inner, outer, 160, 1);
  // Remap UVs so u runs radially from the inner to the outer edge.
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
  }
  geometry.rotateX(-Math.PI / 2);
  ctx.disposables.push(geometry);

  const material = new THREE.MeshStandardMaterial({
    map: canvasTexture(createRingCanvas(vis.ring.kind), ctx),
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    alphaTest: 0.02,
    roughness: 1,
    metalness: 0,
  });
  const ring = new THREE.Mesh(geometry, material);
  ring.renderOrder = 1;
  return ring;
}

// ---------------------------------------------------------------------------
// Body factories
// ---------------------------------------------------------------------------

function createSun(body, ctx) {
  const anchor = new THREE.Group();
  anchor.name = 'sun';
  const material = new THREE.MeshBasicMaterial({ color: VISUALS.sun.color, toneMapped: false });
  const mesh = new THREE.Mesh(ctx.sphere, material);
  mesh.scale.setScalar(SUN_RADIUS);
  bindTexture('sun', (canvas) => {
    material.map = canvasTexture(canvas, ctx);
    material.color.set(0xffffff);
    material.needsUpdate = true;
  });

  const corona = new THREE.Mesh(ctx.sphere, createAtmosphereMaterial({ color: '#ff9a3c', intensity: 1.5, power: 2.0, lit: false }));
  corona.scale.setScalar(1.08);
  mesh.add(corona);

  const glowTexture = canvasTexture(createGlowCanvas(), ctx);
  const glowMaterial = (color, opacity) => new THREE.SpriteMaterial({
    map: glowTexture, color, opacity, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const innerGlow = new THREE.Sprite(glowMaterial('#ffc46b', 0.85));
  innerGlow.scale.setScalar(SUN_RADIUS * 5.2);
  const outerGlow = new THREE.Sprite(glowMaterial('#ff7a1a', 0.32));
  outerGlow.scale.setScalar(SUN_RADIUS * 13);
  anchor.add(mesh, innerGlow, outerGlow);

  const label = createLabel(body);
  label.object.position.set(0, SUN_RADIUS + 1.2, 0);
  anchor.add(label.object);

  return {
    id: 'sun', data: body, vis: VISUALS.sun, anchor, mesh, radius: SUN_RADIUS,
    label, innerGlow, outerGlow, spin: rotationRate(609.1), isSun: true,
  };
}

/** Visual spin rate (rad/s at 1×). Compressed so slow and fast rotators are both visible. */
function rotationRate(hours) {
  return 0.55 * Math.pow(24 / Math.abs(hours), 0.35);
}

function createPlanet(body, ctx) {
  const vis = VISUALS[body.id];
  const anchor = new THREE.Group();
  anchor.name = body.id;
  const sizeGroup = new THREE.Group();
  const tiltGroup = new THREE.Group();
  tiltGroup.rotation.z = (body.stats.axialTiltDeg ?? 0) * DEG;
  anchor.add(sizeGroup);
  sizeGroup.add(tiltGroup);

  const material = new THREE.MeshStandardMaterial({ color: vis.color, roughness: vis.roughness ?? 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(ctx.sphere, material);
  mesh.scale.setScalar(vis.radius);
  tiltGroup.add(mesh);
  bindTexture(body.id, (canvas) => {
    const texture = canvasTexture(canvas, ctx);
    material.map = texture;
    if (vis.bump) {
      material.bumpMap = texture;
      material.bumpScale = vis.bump;
    }
    material.color.set(0xffffff);
    material.needsUpdate = true;
  });

  let clouds = null;
  if (vis.clouds) {
    const cloudMaterial = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0, depthWrite: false, roughness: 1 });
    clouds = new THREE.Mesh(ctx.sphere, cloudMaterial);
    clouds.scale.setScalar(1.012);
    mesh.add(clouds);
    bindTexture('earth-clouds', (canvas) => {
      cloudMaterial.map = canvasTexture(canvas, ctx);
      cloudMaterial.opacity = 0.9;
      cloudMaterial.needsUpdate = true;
    });
  }

  if (vis.atmosphere) {
    const atmosphere = new THREE.Mesh(ctx.sphere, createAtmosphereMaterial(vis.atmosphere));
    atmosphere.scale.setScalar(1.035);
    mesh.add(atmosphere);
  }

  let ring = null;
  if (vis.ring) {
    ring = createRing(vis, ctx);
    tiltGroup.add(ring);
  }

  if (body.id === 'saturn' || body.id === 'earth') {
    mesh.castShadow = mesh.receiveShadow = true;
    if (ring) ring.castShadow = ring.receiveShadow = true;
  }

  const label = createLabel(body);
  anchor.add(label.object);

  const orbitLine = createOrbitLine(ctx.circle, body.color);

  return {
    id: body.id, data: body, vis, anchor, sizeGroup, tiltGroup, mesh, clouds, ring, label, orbitLine,
    radius: vis.radius,
    labelOffset: vis.ring ? vis.radius * 1.15 : vis.radius,
    spin: rotationRate(body.stats.rotationHours),
    compactDistance: vis.compact,
    proportionalDistance: body.stats.distanceAU * UNITS_PER_AU,
    meanLongitude: body.orbit.meanLongitudeJ2000,
    periodDays: body.stats.orbitalPeriodDays,
  };
}

function createMoon(body, earth, ctx) {
  const vis = VISUALS.moon;
  // Orbit plane inclined ~5.1° to the ecliptic; pivot spins to place the Moon.
  const orbitPlane = new THREE.Group();
  orbitPlane.rotation.x = vis.inclination * DEG;
  const pivot = new THREE.Group();
  orbitPlane.add(pivot);
  const anchor = new THREE.Group();
  anchor.position.set(vis.orbitRadius, 0, 0);
  pivot.add(anchor);

  const material = new THREE.MeshStandardMaterial({ color: vis.color, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(ctx.sphere, material);
  mesh.scale.setScalar(vis.radius);
  // Fixed relative to the pivot, so the same face always points at Earth.
  mesh.rotation.y = Math.PI;
  mesh.castShadow = mesh.receiveShadow = true;
  anchor.add(mesh);
  bindTexture('moon', (canvas) => {
    const texture = canvasTexture(canvas, ctx);
    material.map = texture;
    material.bumpMap = texture;
    material.bumpScale = vis.bump;
    material.color.set(0xffffff);
    material.needsUpdate = true;
  });

  const orbitLine = createOrbitLine(ctx.circle, '#9aa3b5');
  orbitLine.scale.setScalar(vis.orbitRadius);
  orbitLine.material.opacity = 0.22;
  orbitPlane.add(orbitLine);

  const label = createLabel(body, { small: true });
  label.object.position.set(0, vis.radius + 0.22, 0);
  anchor.add(label.object);

  earth.sizeGroup.add(orbitPlane);
  return { id: 'moon', data: body, vis, anchor, orbitPlane, pivot, mesh, label, orbitLine, radius: vis.radius, parent: earth };
}

/**
 * Creates every body and returns handles used by the simulation.
 * @param {{ segments: number, anisotropy: number }} options
 */
export function createSolarBodies({ segments = 64, anisotropy = 4 } = {}) {
  const sphere = new THREE.SphereGeometry(1, segments, Math.round(segments / 2));
  const circlePoints = [];
  for (let i = 0; i < 256; i++) {
    const a = (i / 256) * Math.PI * 2;
    circlePoints.push(new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)));
  }
  const circle = new THREE.BufferGeometry().setFromPoints(circlePoints);
  const ctx = { sphere, circle, anisotropy, disposables: [sphere, circle] };

  const root = new THREE.Group();
  const orbitGroup = new THREE.Group();
  root.add(orbitGroup);

  const sun = createSun(getBody('sun'), ctx);
  root.add(sun.anchor);

  const planets = BODIES.filter((b) => b.type === 'planet').map((body) => {
    const planet = createPlanet(body, ctx);
    root.add(planet.anchor);
    orbitGroup.add(planet.orbitLine);
    return planet;
  });

  const earth = planets.find((p) => p.id === 'earth');
  const moon = createMoon(getBody('moon'), earth, ctx);

  const reticleTexture = canvasTexture(createReticleCanvas(), ctx);
  const makeReticle = (opacity) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: reticleTexture, color: '#4de3ff', opacity, transparent: true,
      depthTest: false, depthWrite: false, toneMapped: false,
    }));
    sprite.renderOrder = 10;
    sprite.visible = false;
    return sprite;
  };

  const all = [sun, ...planets, moon];
  return {
    root, orbitGroup, sun, planets, moon, all,
    byId: new Map(all.map((b) => [b.id, b])),
    reticle: makeReticle(0.9),
    hoverReticle: makeReticle(0.4),
    disposables: ctx.disposables,
  };
}

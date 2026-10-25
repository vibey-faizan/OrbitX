/**
 * Deep-space backdrop: a twinkling point starfield with a denser galactic band
 * and a few faint nebula sprites. Effects (twinkle, drift, nebulae) can be
 * switched off for reduced motion or lower-powered devices.
 */
import * as THREE from 'three';
import { createNebulaCanvas } from './textures.js';

const STAR_COLORS = [
  [1.0, 1.0, 1.0], [0.8, 0.88, 1.0], [0.68, 0.8, 1.0], [1.0, 0.95, 0.82], [1.0, 0.82, 0.62],
];

export function createStarfield({ count = 7000, innerRadius = 3000, outerRadius = 4500, pixelRatio = 1 } = {}) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);

  // The galactic band is a great circle tilted against the ecliptic.
  const bandTilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.05, 0.3, 0.4));
  const v = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const inBand = i < count * 0.35;
    const theta = Math.random() * Math.PI * 2;
    let y = Math.random() * 2 - 1;
    if (inBand) y = (Math.random() + Math.random() + Math.random() - 1.5) * 0.12;
    const s = Math.sqrt(1 - y * y);
    v.set(s * Math.cos(theta), y, s * Math.sin(theta));
    if (inBand) v.applyQuaternion(bandTilt);
    v.multiplyScalar(innerRadius + Math.random() * (outerRadius - innerRadius));
    positions.set([v.x, v.y, v.z], i * 3);

    const roll = Math.random();
    const color = STAR_COLORS[roll < 0.55 ? 0 : roll < 0.72 ? 1 : roll < 0.8 ? 2 : roll < 0.92 ? 3 : 4];
    colors.set(color, i * 3);
    sizes[i] = (inBand ? 0.7 : 0.9) + Math.pow(Math.random(), 7) * 3.4;
    phases[i] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uTwinkle: { value: 1 },
      uPixelRatio: { value: pixelRatio },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aPhase;
      uniform float uTime;
      uniform float uTwinkle;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        float twinkle = 1.0 + uTwinkle * 0.4 * sin(uTime * (0.6 + aPhase * 1.8) + aPhase * 6.2831);
        gl_PointSize = max(1.0, aSize * uPixelRatio * twinkle * 1.6);
        vColor = aColor;
        vAlpha = clamp(0.45 + 0.4 * twinkle * (aSize / 2.0), 0.25, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vColor, a * a * vAlpha);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const group = new THREE.Group();
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  group.add(points);

  // Nebulae: large, faint, additive sprites far beyond the planets.
  const nebulae = new THREE.Group();
  const nebulaSpecs = [
    { seed: 3, color: [139, 92, 246], dir: [-0.6, 0.35, -0.7], scale: 2600, opacity: 0.22 },
    { seed: 8, color: [56, 189, 248], dir: [0.75, -0.2, -0.5], scale: 2200, opacity: 0.16 },
    { seed: 13, color: [168, 85, 247], dir: [0.3, 0.55, 0.8], scale: 2000, opacity: 0.14 },
    { seed: 21, color: [34, 211, 238], dir: [-0.8, -0.45, 0.4], scale: 1800, opacity: 0.12 },
  ];
  const nebulaResources = [];
  for (const spec of nebulaSpecs) {
    const texture = new THREE.CanvasTexture(createNebulaCanvas(spec.seed, spec.color));
    texture.colorSpace = THREE.SRGBColorSpace;
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture, opacity: spec.opacity, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.position.set(...spec.dir).normalize().multiplyScalar(innerRadius * 0.9);
    sprite.scale.setScalar(spec.scale);
    sprite.material.rotation = spec.seed;
    nebulae.add(sprite);
    nebulaResources.push(texture, spriteMaterial);
  }
  group.add(nebulae);

  let effects = true;

  return {
    group,
    update(elapsed, dt) {
      material.uniforms.uTime.value = elapsed;
      if (effects) group.rotation.y += dt * 0.0025;
    },
    setEffects(enabled) {
      effects = enabled;
      material.uniforms.uTwinkle.value = enabled ? 1 : 0;
      nebulae.visible = enabled;
    },
    setPixelRatio(ratio) {
      material.uniforms.uPixelRatio.value = ratio;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      nebulaResources.forEach((resource) => resource.dispose());
    },
  };
}

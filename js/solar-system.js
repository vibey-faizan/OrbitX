/**
 * SolarSystem — owns the renderer, scene, simulation clock and picking.
 *
 * Motion model
 * - Orbits are circular and coplanar (simplified). Each planet's angle is its
 *   mean longitude at J2000 advanced at 360° / orbital period, so relative
 *   orbital speeds are real and the starting layout approximates today's sky.
 * - Axial spin is compressed for visibility (see planets.js rotationRate).
 * - Sizes and distances use illustrative scales, switchable between a compact
 *   layout and AU-proportional distances.
 *
 * Events (CustomEvent): 'select' {id}, 'datechange' {date},
 * 'lowperformance', 'contextlost'.
 */
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { SIM_CONFIG } from './data/planet-data.js';
import {
  createSolarBodies, SUN_RADIUS, OUTER_COMPACT_RADIUS, OUTER_PROPORTIONAL_RADIUS,
} from './planets.js';
import { createStarfield } from './starfield.js';
import { CameraDirector } from './camera-controls.js';

const DEG = Math.PI / 180;
const lerp = (a, b, t) => a + (b - a) * t;

export class SolarSystem extends EventTarget {
  /**
   * @param {HTMLElement} container
   * @param {object} options
   */
  constructor(container, { settings = {}, reducedMotion = false, lowPower = false } = {}) {
    super();
    this.container = container;
    this.reducedMotion = reducedMotion;
    this.lowPower = lowPower;
    this.settings = {
      playing: true, speed: 1, orbits: true, labels: true, moon: true, starEffects: true,
      reducedEffects: false, cinematic: true, scaleMode: 'compact', planetScale: 1,
      ...settings,
    };

    this.simDays = (Date.now() - SIM_CONFIG.j2000) / SIM_CONFIG.msPerDay;
    this.scaleBlend = this.settings.scaleMode === 'proportional' ? 1 : 0;
    this.selectedId = null;
    this.hoveredId = null;
    this.heroMode = false;
    this.viewShift = { x: 0, y: 0 };
    this.viewShiftTarget = { x: 0, y: 0 };
    this.frameShift = { x: 0, y: 0 };
    this.elapsed = 0;
    this.running = false;
    this.inView = true;

    this._pointer = { x: 0, y: 0, dirty: false, inside: false, downX: 0, downY: 0, downTime: 0 };
    this._perf = { frames: 0, time: 0, slowWindows: 0, reported: false };
    this._dateTimer = 0;
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();

    this._initRenderer();
    this._initScene();
    this._bindEvents();
    this._applyAllSettings();
    this._resize();
    this._updateBodies(0);
    this.start();
  }

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------

  _initRenderer() {
    const renderer = new THREE.WebGLRenderer({ antialias: !this.lowPower, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x020309, 1);
    renderer.domElement.className = 'scene-canvas';
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute(
      'aria-label',
      'Interactive 3D view of the Sun and eight planets. Drag to rotate, scroll or pinch to zoom, click a planet to learn about it.',
    );
    this.renderer = renderer;
    this.container.appendChild(renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = 'label-layer';
    this.container.appendChild(this.labelRenderer.domElement);
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 15000);
    this.camera.position.set(0, 60, 140);

    this.director = new CameraDirector(this.camera, this.renderer.domElement);
    this.director.cinematic = this.settings.cinematic && !this.reducedMotion;

    this.scene.add(new THREE.AmbientLight(0x8899bb, 0.32));
    const sunLight = new THREE.PointLight(0xfff1dc, 3.4, 0, 0);
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 900;
    sunLight.shadow.bias = -0.0008;
    sunLight.shadow.normalBias = 0.02;
    this.sunLight = sunLight;
    this.scene.add(sunLight);

    this.bodies = createSolarBodies({
      segments: this.lowPower ? 40 : 64,
      anisotropy: Math.min(8, this.renderer.capabilities.getMaxAnisotropy()),
    });
    this.scene.add(this.bodies.root, this.bodies.reticle, this.bodies.hoverReticle);

    this.stars = createStarfield({ count: this.lowPower ? 3500 : 7000 });
    this.scene.add(this.stars.group);
  }

  _bindEvents() {
    const canvas = this.renderer.domElement;
    this._onPointerDown = (e) => {
      Object.assign(this._pointer, { downX: e.clientX, downY: e.clientY, downTime: performance.now() });
    };
    this._onPointerUp = (e) => {
      const p = this._pointer;
      const moved = Math.hypot(e.clientX - p.downX, e.clientY - p.downY);
      if (this.heroMode || moved > 6 || performance.now() - p.downTime > 600) return;
      const id = this.pick(e.clientX, e.clientY);
      if (id) this._emit('select', { id });
    };
    this._onPointerMove = (e) => {
      if (e.pointerType === 'touch') return;
      Object.assign(this._pointer, { x: e.clientX, y: e.clientY, dirty: true, inside: true });
    };
    this._onPointerLeave = () => {
      this._pointer.inside = false;
      this._setHovered(null);
    };
    this._onLabelClick = (e) => {
      const label = e.target.closest('.planet-label');
      if (label && !this.heroMode) this._emit('select', { id: label.dataset.id });
    };
    this._onContextLost = (e) => {
      e.preventDefault();
      this.stop();
      this._emit('contextlost');
    };

    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointerup', this._onPointerUp);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerleave', this._onPointerLeave);
    canvas.addEventListener('webglcontextlost', this._onContextLost);
    this.labelRenderer.domElement.addEventListener('click', this._onLabelClick);

    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(this.container);

    // Stop rendering entirely while the stage is scrolled out of view.
    this._intersection = new IntersectionObserver(([entry]) => {
      this.inView = entry.isIntersecting;
      if (this.inView) this.start();
      else this.stop();
    });
    this._intersection.observe(this.container);
  }

  _resize() {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.renderer.setSize(width, height);
    this.labelRenderer.setSize(width, height);
    this.camera.aspect = width / height;
    this._applyViewOffset();
  }

  /**
   * Shifts the projection so overlays (hero copy, info panel) don't cover the
   * subject. viewShift.x > 0 moves the scene right, viewShift.y > 0 moves it up,
   * both as fractions of the viewport.
   */
  _applyViewOffset() {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    const { x, y } = this.viewShift;
    if (Math.abs(x) < 0.001 && Math.abs(y) < 0.001) this.camera.clearViewOffset();
    else this.camera.setViewOffset(width, height, -x * width, y * height, width, height);
    this.camera.updateProjectionMatrix();
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  // -------------------------------------------------------------------------
  // Loop
  // -------------------------------------------------------------------------

  start() {
    if (this.running || !this.inView) return;
    this.running = true;
    this._lastTime = performance.now();
    this._raf = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  _tick = (now) => {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._tick);
    const rawDt = (now - this._lastTime) / 1000;
    this._lastTime = now;
    const dt = Math.min(Math.max(rawDt, 0), 0.1); // clamp after tab switches
    this.elapsed += dt;

    if (this.settings.playing) this.simDays += dt * SIM_CONFIG.daysPerSecond * this.settings.speed;

    this._updateScaleBlend(dt);
    this._updateBodies(dt);
    this.stars.update(this.elapsed, dt);
    this.director.update(dt);
    this._updateViewShift(dt);
    this._updateReticles();
    this._updateMoonLabel();
    if (this._pointer.dirty && this._pointer.inside && !this.heroMode) {
      this._pointer.dirty = false;
      this._setHovered(this.pick(this._pointer.x, this._pointer.y));
    }

    this.renderer.render(this.scene, this.camera);
    if (this.settings.labels) this.labelRenderer.render(this.scene, this.camera);

    this._dateTimer += dt;
    if (this._dateTimer > 0.25) {
      this._dateTimer = 0;
      this._emit('datechange', { date: this.getSimDate() });
    }
    this._monitorPerformance(rawDt);
  };

  _updateScaleBlend(dt) {
    const target = this.settings.scaleMode === 'proportional' ? 1 : 0;
    if (this.scaleBlend === target) return;
    const step = this.director.cinematic ? dt / 1.6 : 1;
    this.scaleBlend = target > this.scaleBlend
      ? Math.min(target, this.scaleBlend + step)
      : Math.max(target, this.scaleBlend - step);
  }

  _updateBodies(dt) {
    const { playing, speed } = this.settings;
    // Spin is decoupled from orbital speed (capped) so high speeds don't strobe.
    const spinFactor = playing ? Math.min(speed, 3) : 0;
    const blend = this.scaleBlend * this.scaleBlend * (3 - 2 * this.scaleBlend);

    for (const planet of this.bodies.planets) {
      const angle = (planet.meanLongitude + (360 / planet.periodDays) * this.simDays) * DEG;
      const radius = lerp(planet.compactDistance, planet.proportionalDistance, blend);
      planet.anchor.position.set(radius * Math.cos(angle), 0, -radius * Math.sin(angle));
      planet.orbitLine.scale.setScalar(radius);
      planet.mesh.rotation.y += planet.spin * spinFactor * dt;
      if (planet.clouds) planet.clouds.rotation.y += 0.02 * spinFactor * dt;
    }

    const sun = this.bodies.sun;
    sun.mesh.rotation.y += sun.spin * spinFactor * dt;
    if (!this.settings.reducedEffects && !this.reducedMotion) {
      const pulse = 1 + Math.sin(this.elapsed * 0.8) * 0.03;
      sun.innerGlow.scale.setScalar(SUN_RADIUS * 5.2 * pulse);
    }

    const moonLongitude = SIM_CONFIG.moonLongitudeJ2000 + SIM_CONFIG.moonDegreesPerDay * this.simDays;
    this.bodies.moon.pivot.rotation.y = moonLongitude * DEG;
  }

  _updateViewShift(dt) {
    const current = this.viewShift;
    const target = this.viewShiftTarget;
    if (current.x === target.x && current.y === target.y) return;
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 3);
    for (const axis of ['x', 'y']) {
      current[axis] += (target[axis] - current[axis]) * k;
      if (Math.abs(current[axis] - target[axis]) < 0.0005) current[axis] = target[axis];
    }
    this._applyViewOffset();
  }

  _updateReticles() {
    const place = (sprite, id, scaleFactor) => {
      const body = id && this.bodies.byId.get(id);
      sprite.visible = Boolean(body);
      if (!body) return;
      body.mesh.getWorldPosition(sprite.position);
      const pulse = this.reducedMotion ? 1 : 1 + Math.sin(this.elapsed * 3) * 0.04;
      const ringScale = body.vis.ring ? body.vis.ring.outer * 0.8 : 1;
      sprite.scale.setScalar(this._worldRadius(body) * ringScale * scaleFactor * pulse);
    };
    place(this.bodies.reticle, this.selectedId, 3.2);
    place(this.bodies.hoverReticle, this.hoveredId !== this.selectedId ? this.hoveredId : null, 2.8);
  }

  /** The Moon label only appears when the camera is near Earth, to avoid clutter. */
  _updateMoonLabel() {
    const moon = this.bodies.moon;
    const earth = moon.parent;
    earth.anchor.getWorldPosition(this._tmp);
    const near = this.camera.position.distanceTo(this._tmp) < 30 * this.settings.planetScale;
    moon.label.el.classList.toggle('is-hidden', !near);
  }

  _monitorPerformance(rawDt) {
    const perf = this._perf;
    // Skip the first seconds: shader compilation and texture uploads are one-off costs.
    if (perf.reported || this.settings.reducedEffects || document.hidden || this.elapsed < 6) return;
    perf.frames += 1;
    perf.time += rawDt;
    if (perf.time < 2) return;
    const fps = perf.frames / perf.time;
    perf.slowWindows = fps < 28 ? perf.slowWindows + 1 : 0;
    perf.frames = 0;
    perf.time = 0;
    if (perf.slowWindows >= 3) {
      perf.reported = true;
      this._emit('lowperformance', { fps });
    }
  }

  // -------------------------------------------------------------------------
  // Picking & hover
  // -------------------------------------------------------------------------

  _worldRadius(body) {
    if (body.isSun) return SUN_RADIUS;
    return body.radius * this.settings.planetScale;
  }

  /**
   * Screen-space picking: a body is hit if the pointer is within its projected
   * disc (or a 16px minimum, so distant planets stay clickable). The nearest
   * hit to the camera wins.
   */
  pick(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const tanHalfFov = Math.tan((this.camera.fov * DEG) / 2);
    let best = null;
    let bestDistance = Infinity;
    for (const body of this.bodies.all) {
      if (body.id === 'moon' && !this.settings.moon) continue;
      const position = body.mesh.getWorldPosition(this._tmp);
      const distance = position.distanceTo(this.camera.position);
      position.project(this.camera);
      if (position.z > 1 || position.z < -1) continue;
      const sx = ((position.x + 1) / 2) * rect.width;
      const sy = ((1 - position.y) / 2) * rect.height;
      const screenRadius = (this._worldRadius(body) / (distance * tanHalfFov)) * (rect.height / 2);
      const hitRadius = Math.max(screenRadius, 16);
      if (Math.hypot(px - sx, py - sy) < hitRadius && distance < bestDistance) {
        best = body.id;
        bestDistance = distance;
      }
    }
    return best;
  }

  _setHovered(id) {
    if (id === this.hoveredId) return;
    if (this.hoveredId) this.bodies.byId.get(this.hoveredId)?.label.el.classList.remove('is-hover');
    this.hoveredId = id;
    if (id) this.bodies.byId.get(id)?.label.el.classList.add('is-hover');
    this.renderer.domElement.style.cursor = id ? 'pointer' : '';
  }

  // -------------------------------------------------------------------------
  // Camera
  // -------------------------------------------------------------------------

  _outerRadius() {
    return lerp(OUTER_COMPACT_RADIUS, OUTER_PROPORTIONAL_RADIUS, this.settings.scaleMode === 'proportional' ? 1 : 0) + 6;
  }

  /** Camera offset that frames the full system at the given elevation. */
  _overviewOffset({ elevation = 38, closeness = 1, azimuth } = {}) {
    const radius = this._outerRadius();
    const halfV = (this.camera.fov * DEG) / 2;
    const halfH = Math.atan(Math.tan(halfV) * this.camera.aspect);
    const el = elevation * DEG;
    const distance = Math.max(radius / Math.tan(halfH), (radius * Math.sin(el)) / Math.tan(halfV)) * 1.16 * closeness;
    const offset = this._tmp2.copy(this.camera.position).sub(this.director.controls.target);
    const az = azimuth ?? Math.atan2(offset.x, offset.z);
    return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(distance);
  }

  _updateSelectionVisuals() {
    for (const planet of this.bodies.planets) {
      const selected = planet.id === this.selectedId;
      planet.orbitLine.material.color.copy(selected ? new THREE.Color('#4de3ff') : planet.orbitLine.userData.baseColor);
      planet.orbitLine.material.opacity = selected ? 0.75 : 0.28;
      planet.label.el.classList.toggle('is-selected', selected);
    }
    this.bodies.sun.label.el.classList.toggle('is-selected', this.selectedId === 'sun');
    this.bodies.moon.label.el.classList.toggle('is-selected', this.selectedId === 'moon');
  }

  focusBody(id, { closeUp = false } = {}) {
    const body = this.bodies.byId.get(id);
    if (!body) return;
    this.selectedId = id;
    this._updateSelectionVisuals();
    this.director.controls.autoRotate = false;

    const radius = this._worldRadius(body);
    // Frame ringed planets by their ring span rather than the globe.
    const extent = body.vis.ring ? radius * body.vis.ring.outer * 0.62 : radius;
    // Narrow portrait screens have a small horizontal field of view; back off.
    const aspectFactor = this.camera.aspect < 1 ? Math.pow(1 / Math.max(this.camera.aspect, 0.45), 0.9) : 1;
    const distance = extent * aspectFactor * (body.isSun ? (closeUp ? 2.6 : 4.2) : closeUp ? 3.0 : 6.2);
    let direction;
    if (body.isSun) {
      direction = this._tmp.copy(this.camera.position).sub(this.director.controls.target).normalize().clone();
      if (direction.y < 0.2) direction.setY(0.3).normalize();
    } else {
      // Three-quarter view from the Sun-facing side so the lit hemisphere is visible.
      const position = body.mesh.getWorldPosition(new THREE.Vector3());
      direction = position.clone().negate().setY(0).normalize();
      if (direction.lengthSq() === 0) direction.set(0, 0, 1);
      direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), 40 * DEG);
      direction.y = 0.32;
      direction.normalize();
    }

    this.director.flyTo({
      getTarget: (out) => body.mesh.getWorldPosition(out),
      offset: direction.multiplyScalar(distance),
      duration: closeUp ? 1.4 : 1.9,
      follow: true,
      minDistance: radius * 1.25,
    });
  }

  clearSelection() {
    this.selectedId = null;
    this._updateSelectionVisuals();
  }

  showOverview({ duration = 1.9 } = {}) {
    this.clearSelection();
    this.director.controls.autoRotate = false;
    this.director.flyTo({
      getTarget: (out) => out.set(0, 0, 0),
      offset: this._overviewOffset({ elevation: 38 }),
      duration,
      minDistance: SUN_RADIUS * 1.4,
    });
  }

  /** Re-applies the default framing for the current focus. */
  resetCamera() {
    if (this.selectedId) this.focusBody(this.selectedId);
    else this.showOverview({ duration: 1.2 });
  }

  /**
   * Framing offset (fractions of the viewport) used to keep a focused body
   * clear of the info panel: negative x for the side panel, positive y for
   * the mobile bottom sheet.
   */
  setFrameShift(x = 0, y = 0) {
    this.frameShift = { x, y };
    if (!this.heroMode) this.viewShiftTarget = { x, y };
  }

  /** Hero mode: non-interactive, slowly auto-rotating cinematic framing. */
  setHeroMode(enabled, { intro = false } = {}) {
    this.heroMode = enabled;
    this.director.setInteractive(!enabled);
    // Landscape: scene to the right of the copy. Portrait: scene above it.
    const aspect = this.camera.aspect;
    this.viewShiftTarget = enabled
      ? { x: aspect > 1.1 ? 0.17 : 0, y: aspect < 1 ? 0.2 : 0 }
      : { ...this.frameShift };
    if (!enabled) {
      this.director.controls.autoRotate = false;
      return;
    }
    this.clearSelection();
    this._setHovered(null);
    const offset = this._overviewOffset({ elevation: 20, closeness: 0.55, azimuth: 35 * DEG });
    if (intro && this.director.cinematic) {
      // Start far away and sweep in.
      this.director.controls.target.set(0, 0, 0);
      this.camera.position.copy(offset).multiplyScalar(3.2).setY(offset.y * 6);
      this.viewShift = { ...this.viewShiftTarget };
      this._applyViewOffset();
    }
    this.director.flyTo({
      getTarget: (out) => out.set(0, 0, 0),
      offset,
      duration: intro ? 3.2 : 2,
      minDistance: SUN_RADIUS * 1.4,
      onComplete: () => {
        if (this.heroMode && !this.reducedMotion) this.director.controls.autoRotate = true;
      },
    });
  }

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------

  _applyAllSettings() {
    for (const key of Object.keys(this.settings)) this.set(key, this.settings[key]);
  }

  /** Applies a single setting. */
  set(key, value) {
    this.settings[key] = value;
    const b = this.bodies;
    switch (key) {
      case 'orbits':
        b.orbitGroup.visible = value;
        b.moon.orbitLine.visible = value;
        break;
      case 'labels':
        this.labelRenderer.domElement.style.display = value ? '' : 'none';
        break;
      case 'moon':
        b.moon.orbitPlane.visible = value;
        break;
      case 'starEffects':
      case 'reducedEffects':
        this._applyEffects();
        break;
      case 'cinematic':
        this.director.cinematic = value && !this.reducedMotion;
        break;
      case 'planetScale':
        for (const planet of b.planets) {
          planet.sizeGroup.scale.setScalar(value);
          planet.label.object.position.y = planet.labelOffset * value + 0.45;
        }
        break;
      case 'scaleMode':
        // Re-frame once the distance transition is under way if nothing is focused.
        if (!this.selectedId && !this.heroMode) this.showOverview({ duration: 1.6 });
        break;
      default:
        break;
    }
  }

  _applyEffects() {
    const reduced = this.settings.reducedEffects;
    const ratio = Math.min(window.devicePixelRatio || 1, reduced ? 1 : 2);
    this.renderer.setPixelRatio(ratio);
    this.stars.setPixelRatio(ratio);
    this.stars.setEffects(this.settings.starEffects && !reduced && !this.reducedMotion);
    this.sunLight.castShadow = !reduced;
    this.bodies.sun.outerGlow.visible = !reduced;
    this._resize();
  }

  resetDate() {
    this.simDays = (Date.now() - SIM_CONFIG.j2000) / SIM_CONFIG.msPerDay;
    this._emit('datechange', { date: this.getSimDate() });
  }

  getSimDate() {
    return new Date(SIM_CONFIG.j2000 + this.simDays * SIM_CONFIG.msPerDay);
  }

  // -------------------------------------------------------------------------
  // Teardown
  // -------------------------------------------------------------------------

  dispose() {
    this.stop();
    this._resizeObserver.disconnect();
    this._intersection.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this._onPointerDown);
    canvas.removeEventListener('pointerup', this._onPointerUp);
    canvas.removeEventListener('pointermove', this._onPointerMove);
    canvas.removeEventListener('pointerleave', this._onPointerLeave);
    canvas.removeEventListener('webglcontextlost', this._onContextLost);
    this.labelRenderer.domElement.removeEventListener('click', this._onLabelClick);

    this.scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      materials.forEach((material) => material.dispose());
    });
    this.bodies.disposables.forEach((resource) => resource.dispose());
    this.stars.dispose();
    this.director.dispose();
    this.renderer.dispose();
    canvas.remove();
    this.labelRenderer.domElement.remove();
  }
}

/**
 * CameraDirector wraps OrbitControls with cinematic fly-to transitions and
 * object following.
 *
 * Transitions interpolate the orbit target linearly while the camera offset is
 * slerped in direction and interpolated logarithmically in length, with a
 * gentle arc so long flights don't cut through the Sun. After arriving, the
 * camera can follow a moving body by applying that body's per-frame motion to
 * both the camera and the target, so the user can still orbit and zoom freely.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class CameraDirector {
  constructor(camera, domElement) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, domElement);
    Object.assign(this.controls, {
      enableDamping: true,
      dampingFactor: 0.07,
      rotateSpeed: 0.6,
      zoomSpeed: 0.9,
      panSpeed: 0.6,
      minDistance: 2,
      maxDistance: 2600,
      autoRotateSpeed: 0.35,
    });
    this.cinematic = true;
    this.interactive = true;
    this.transition = null;
    this.follow = null;

    // Scratch objects reused every frame to avoid allocations.
    this._target = new THREE.Vector3();
    this._followPrev = new THREE.Vector3();
    this._delta = new THREE.Vector3();
    this._dirA = new THREE.Vector3();
    this._dirB = new THREE.Vector3();
    this._offset = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._qStep = new THREE.Quaternion();
  }

  setInteractive(enabled) {
    this.interactive = enabled;
    if (!this.transition) this.controls.enabled = enabled;
  }

  get isTransitioning() {
    return this.transition !== null;
  }

  /**
   * @param {object} options
   * @param {(out: THREE.Vector3) => THREE.Vector3} options.getTarget  current target position
   * @param {THREE.Vector3} options.offset  desired camera offset from the target
   * @param {number} [options.duration]  seconds (ignored when cinematic is off)
   * @param {boolean} [options.follow]  keep tracking the target afterwards
   * @param {number} [options.minDistance]  zoom limit while at this target
   */
  flyTo({ getTarget, offset, duration = 1.8, follow = false, minDistance = 2, onComplete } = {}) {
    this.follow = null;
    this.controls.minDistance = minDistance;
    const end = getTarget(this._target);
    const seconds = this.cinematic ? duration : 0;

    if (seconds <= 0) {
      this.controls.target.copy(end);
      this.camera.position.copy(end).add(offset);
      this.camera.lookAt(end);
      this._finish(follow ? getTarget : null, onComplete);
      return;
    }

    const startTarget = this.controls.target.clone();
    this.transition = {
      t: 0,
      duration: seconds,
      getTarget,
      follow,
      onComplete,
      startTarget,
      startOffset: this.camera.position.clone().sub(startTarget),
      endOffset: offset.clone(),
      arc: Math.min(startTarget.distanceTo(end) * 0.25, 60),
    };
    this.controls.enabled = false;
  }

  cancelFollow() {
    this.follow = null;
  }

  _finish(followGetter, onComplete) {
    this.transition = null;
    this.controls.enabled = this.interactive;
    this.follow = followGetter;
    if (followGetter) this._followPrev.copy(followGetter(this._target));
    this.controls.update();
    onComplete?.();
  }

  update(dt) {
    const tr = this.transition;
    if (tr) {
      tr.t = Math.min(1, tr.t + dt / tr.duration);
      const e = easeInOutCubic(tr.t);
      const target = tr.getTarget(this._target);
      this.controls.target.lerpVectors(tr.startTarget, target, e);

      const startLength = Math.max(tr.startOffset.length(), 1e-3);
      const endLength = Math.max(tr.endOffset.length(), 1e-3);
      const length = Math.exp(Math.log(startLength) + (Math.log(endLength) - Math.log(startLength)) * e);
      this._dirA.copy(tr.startOffset).normalize();
      this._dirB.copy(tr.endOffset).normalize();
      this._q.setFromUnitVectors(this._dirA, this._dirB);
      this._qStep.identity().slerp(this._q, e);
      this._offset.copy(this._dirA).applyQuaternion(this._qStep).multiplyScalar(length);

      this.camera.position.copy(this.controls.target).add(this._offset);
      this.camera.position.y += Math.sin(Math.PI * e) * tr.arc;
      this.camera.lookAt(this.controls.target);
      if (tr.t >= 1) this._finish(tr.follow ? tr.getTarget : null, tr.onComplete);
      return;
    }

    if (this.follow) {
      const position = this.follow(this._target);
      this._delta.subVectors(position, this._followPrev);
      this.camera.position.add(this._delta);
      this.controls.target.add(this._delta);
      this._followPrev.copy(position);
    }
    this.controls.update(dt);
  }

  dispose() {
    this.controls.dispose();
  }
}

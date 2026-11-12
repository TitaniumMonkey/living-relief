import * as THREE from 'three';
import { createZoomMotion } from './navigation-motion';

/** Ease wheel and trackpad zoom toward the pointer without relying on wheel-event frequency. */
export function createPointerZoom(
  camera: THREE.PerspectiveCamera,
  controls: {
    target: THREE.Vector3;
    enabled: boolean;
    minDistance: number;
    maxDistance: number;
  },
  canvas: HTMLCanvasElement,
  onInteract: () => void,
  invalidate: () => void,
  reducedMotion: () => boolean,
) {
  const motion = createZoomMotion();
  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0));
  const anchor = new THREE.Vector3();
  const wheel = (event: WheelEvent) => {
    if (!controls.enabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const rect = canvas.getBoundingClientRect();
    mouse.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((event.clientY - rect.top) / rect.height) * 2,
    );
    ray.setFromCamera(mouse, camera);
    plane.constant = -controls.target.y;
    // Near the horizon the ray can miss the ground plane; keep the existing focus then.
    if (!ray.ray.intersectPlane(plane, anchor)) anchor.copy(controls.target);
    const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
    motion.add(event.deltaY * units * (event.ctrlKey ? 8 : 1) * 0.0008);
    onInteract();
    invalidate();
  };
  canvas.addEventListener('wheel', wheel, { passive: false, capture: true });
  return {
    reset: () => motion.reset(),
    tick(dt: number) {
      if (!controls.enabled) {
        motion.reset();
        return false;
      }
      const step = motion.tick(dt, reducedMotion());
      if (step.delta) {
        const distance = camera.position.distanceTo(controls.target);
        const next = THREE.MathUtils.clamp(
          distance * Math.exp(step.delta),
          controls.minDistance,
          controls.maxDistance,
        );
        const scale = next / distance;
        camera.position.sub(anchor).multiplyScalar(scale).add(anchor);
        controls.target.sub(anchor).multiplyScalar(scale).add(anchor);
        if (next === controls.minDistance || next === controls.maxDistance)
          motion.reset();
      }
      return step.active;
    },
    dispose() {
      canvas.removeEventListener('wheel', wheel, true);
      motion.reset();
    },
  };
}

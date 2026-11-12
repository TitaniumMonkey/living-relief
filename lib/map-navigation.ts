import * as THREE from 'three';

const directions: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};
const orbitOffset = new THREE.Vector3();
const orbitPosition = new THREE.Spherical();
const panRight = new THREE.Vector3();
const panOffset = new THREE.Vector3();

function navigate(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  x: number,
  forward: number,
  shift: boolean,
  viewportHeight: number,
) {
  if (shift) {
    orbitPosition.setFromVector3(orbitOffset.copy(camera.position).sub(target));
    orbitPosition.theta -= x * 0.06;
    orbitPosition.phi = THREE.MathUtils.clamp(
      orbitPosition.phi - forward * 0.045,
      0.01,
      Math.PI * 0.47,
    );
    camera.position
      .copy(target)
      .add(orbitOffset.setFromSpherical(orbitPosition));
  } else {
    const scale =
      (camera.position.distanceTo(target) *
        Math.tan((camera.fov * Math.PI) / 360) *
        56) /
      viewportHeight;
    panRight.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
    panOffset
      .set(panRight.z, 0, -panRight.x)
      .multiplyScalar(forward * scale)
      .addScaledVector(panRight, x * scale);
    camera.position.add(panOffset);
    target.add(panOffset);
  }
}

/** Moves the camera from integrated axes in seconds, preserving its current horizontal frame. */
export function navigateWithMotion(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  x: number,
  forward: number,
  orbit: boolean,
  viewportHeight: number,
) {
  // 420 screen pixels per second, or 0.9 radians per second when orbiting.
  navigate(camera, target, x * 15, forward * 15, orbit, viewportHeight);
}

/** Moves the map camera in its current horizontal frame; it never changes source elevations. */
export function navigateWithKey(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  code: string,
  shift: boolean,
  viewportHeight: number,
) {
  const direction = directions[code];
  if (!direction) return false;
  navigate(camera, target, direction[0], direction[1], shift, viewportHeight);
  return true;
}

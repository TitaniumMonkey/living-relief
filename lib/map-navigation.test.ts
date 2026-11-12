import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { navigateWithKey, navigateWithMotion } from './map-navigation.ts';
import { createNavigationMotion } from './navigation-motion.ts';
void test('WASD and arrows pan camera and focus together at the current zoom scale', () => {
  const run = (code: string) => {
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 10000);
    camera.position.set(0, 100, 100);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const target = new THREE.Vector3();
    const offset = camera.position.clone().sub(target);
    assert.equal(navigateWithKey(camera, target, code, false, 600), true);
    assert.ok(camera.position.clone().sub(target).distanceTo(offset) < 1e-8);
    return target;
  };
  assert.deepEqual(run('KeyW'), run('ArrowUp'));
  assert.deepEqual(run('KeyA'), run('ArrowLeft'));
  assert.deepEqual(run('KeyS'), run('ArrowDown'));
  assert.deepEqual(run('KeyD'), run('ArrowRight'));
  assert.ok(run('KeyW').z < 0);
  assert.ok(run('KeyD').x > 0);
});
void test('modified arrows orbit around the focus while unrecognized keys do nothing', () => {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(10, 100, 100);
  const target = new THREE.Vector3(10, 0, 0),
    before = target.clone(),
    distance = camera.position.distanceTo(target);
  assert.equal(navigateWithKey(camera, target, 'ArrowLeft', true, 600), true);
  assert.deepEqual(target, before);
  assert.ok(Math.abs(camera.position.distanceTo(target) - distance) < 1e-8);
  const after = camera.position.clone();
  assert.equal(navigateWithKey(camera, target, 'KeyQ', false, 600), false);
  assert.deepEqual(camera.position, after);
});

void test('continuous pan preserves the camera frame at 60 Hz and 144 Hz', () => {
  const run = (fps: number) => {
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 10000);
    camera.position.set(100, 100, 100);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const target = new THREE.Vector3();
    const offset = camera.position.clone();
    const motion = createNavigationMotion();
    motion.press('KeyW', false);
    motion.press('KeyD', false);
    for (let frame = 0; frame < fps; frame++) {
      const step = motion.tick(1 / fps, false);
      navigateWithMotion(camera, target, step.x, step.forward, step.orbit, 600);
    }
    assert.ok(camera.position.clone().sub(target).distanceTo(offset) < 1e-8);
    return target;
  };
  assert.ok(run(60).distanceTo(run(144)) < 1e-8);
  assert.ok(run(60).z < 0);
});

void test('continuous pan scales with zoom and viewport height', () => {
  const run = (distance: number, viewportHeight: number) => {
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 10000);
    camera.position.set(0, distance, distance);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const target = new THREE.Vector3();
    navigateWithMotion(camera, target, 1, 0, false, viewportHeight);
    return target.x;
  };
  assert.equal(run(200, 600), run(100, 600) * 2);
  assert.equal(run(100, 1200), run(100, 600) / 2);
});

void test('continuous orbit preserves its center and distance and limits pitch', () => {
  const camera = new THREE.PerspectiveCamera();
  const target = new THREE.Vector3(10, 0, 0);
  camera.position.set(10, 100, 100);
  const distance = camera.position.distanceTo(target);
  navigateWithMotion(camera, target, 0.25, 10, true, 600);
  const orbit = new THREE.Spherical().setFromVector3(
    camera.position.clone().sub(target),
  );
  assert.deepEqual(target, new THREE.Vector3(10, 0, 0));
  assert.ok(Math.abs(orbit.radius - distance) < 1e-8);
  assert.ok(Math.abs(orbit.phi - 0.01) < 1e-8);
});

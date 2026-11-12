import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createNavigationMotion,
  createZoomMotion,
} from './navigation-motion.ts';

void test('held movement accelerates smoothly instead of taking a full step immediately', () => {
  const motion = createNavigationMotion();
  motion.press('KeyW', false);
  const first = motion.tick(1 / 60, false);
  assert.ok(first.forward > 0 && first.forward < 1 / 120);
  for (let frame = 0; frame < 60; frame++) motion.tick(1 / 60, false);
  assert.ok(motion.tick(1 / 60, false).forward > 0.016);
});

void test('the same held movement covers the same distance at 60 Hz and 144 Hz', () => {
  const travel = (fps: number) => {
    const motion = createNavigationMotion();
    motion.press('KeyW', false);
    motion.press('KeyD', false);
    let x = 0;
    let forward = 0;
    for (let frame = 0; frame < fps * 2; frame++) {
      const step = motion.tick(1 / fps, false);
      x += step.x;
      forward += step.forward;
    }
    motion.release('KeyW');
    motion.release('KeyD');
    for (let frame = 0; frame < fps; frame++) {
      const step = motion.tick(1 / fps, false);
      x += step.x;
      forward += step.forward;
    }
    return [x, forward];
  };
  const slow = travel(60);
  const fast = travel(144);
  assert.ok(Math.abs(slow[0] - fast[0]) < 1e-10);
  assert.ok(Math.abs(slow[1] - fast[1]) < 1e-10);
});

void test('OS key repeat does not affect held movement speed', () => {
  const held = createNavigationMotion();
  const repeated = createNavigationMotion();
  held.press('KeyW', false);
  repeated.press('KeyW', false);
  for (let frame = 0; frame < 120; frame++) {
    if (frame % 3 === 0) repeated.press('KeyW', false);
    assert.deepEqual(repeated.tick(1 / 60, false), held.tick(1 / 60, false));
  }
});

void test('release eases to rest within a short bounded distance', () => {
  const motion = createNavigationMotion();
  motion.press('KeyW', false);
  for (let frame = 0; frame < 60; frame++) motion.tick(1 / 60, false);
  motion.release('KeyW');
  const first = motion.tick(1 / 60, false);
  assert.ok(first.forward > 0 && first.forward < 1 / 60);
  assert.equal(first.active, true);
  let drift = first.forward;
  let last = first;
  for (let frame = 0; frame < 30; frame++) {
    last = motion.tick(1 / 60, false);
    drift += last.forward;
  }
  assert.ok(drift < 0.06);
  assert.equal(last.active, false);
  assert.equal(last.forward, 0);
});

void test('diagonal and alias keys do not multiply movement speed', () => {
  const straight = createNavigationMotion();
  const diagonal = createNavigationMotion();
  const alias = createNavigationMotion();
  straight.press('KeyW', false);
  diagonal.press('KeyW', false);
  diagonal.press('KeyD', false);
  alias.press('KeyW', false);
  alias.press('ArrowUp', false);
  for (let frame = 0; frame < 60; frame++) {
    const axis = straight.tick(1 / 60, false);
    const angled = diagonal.tick(1 / 60, false);
    assert.ok(
      Math.abs(Math.hypot(angled.x, angled.forward) - axis.forward) < 1e-12,
    );
    assert.deepEqual(alias.tick(1 / 60, false), axis);
  }
  alias.release('KeyW');
  assert.ok(alias.tick(1 / 60, false).forward > 0);
});

void test('opposite held directions cancel on both axes', () => {
  const motion = createNavigationMotion();
  for (const code of ['KeyW', 'KeyS', 'KeyA', 'KeyD'])
    motion.press(code, false);
  assert.deepEqual(motion.tick(1 / 60, false), {
    x: 0,
    forward: 0,
    orbit: false,
    active: true,
  });
});

void test('Shift switches held keys between pan and orbit without carrying the old motion', () => {
  const motion = createNavigationMotion();
  motion.press('KeyW', false);
  motion.tick(1, false);
  assert.equal(motion.press('ShiftLeft', true), true);
  const orbit = motion.tick(1 / 60, false);
  assert.equal(orbit.orbit, true);
  assert.ok(orbit.forward < 1 / 120);
  motion.release('ShiftLeft');
  const pan = motion.tick(1 / 60, false);
  assert.equal(pan.orbit, false);
  assert.ok(pan.forward < 1 / 120);
});

void test('blur reset clears held keys, orbit state, and release momentum', () => {
  const motion = createNavigationMotion();
  motion.press('KeyW', true);
  motion.tick(1, false);
  motion.reset();
  assert.deepEqual(motion.tick(1 / 60, false), {
    x: 0,
    forward: 0,
    orbit: false,
    active: false,
  });
});

void test('reduced motion responds directly and stops on key release', () => {
  const motion = createNavigationMotion();
  motion.press('KeyW', false);
  assert.equal(motion.tick(1 / 60, true).forward, 1 / 60);
  motion.release('KeyW');
  assert.deepEqual(motion.tick(1 / 60, true), {
    x: 0,
    forward: 0,
    orbit: false,
    active: false,
  });
});

void test('unrelated keys and Shift alone do not keep the render loop active', () => {
  const motion = createNavigationMotion();
  assert.equal(motion.press('KeyQ', false), false);
  assert.equal(motion.release('KeyQ'), false);
  motion.press('ShiftLeft', true);
  assert.equal(motion.tick(1 / 60, false).active, false);
});

void test('a wheel impulse eases in over frames instead of snapping to the requested scale', () => {
  const zoom = createZoomMotion();
  zoom.add(0.3);
  const first = zoom.tick(1 / 60, false);
  const second = zoom.tick(1 / 60, false);
  assert.ok(first.delta > 0 && first.delta < 0.03);
  assert.ok(second.delta > first.delta);
  assert.equal(first.active, true);
});

void test('zoom settles at the complete requested logarithmic scale', () => {
  const zoom = createZoomMotion();
  zoom.add(0.3);
  let total = 0;
  for (let frame = 0; frame < 120; frame++)
    total += zoom.tick(1 / 60, false).delta;
  assert.ok(Math.abs(total - 0.3) < 1e-12);
  assert.deepEqual(zoom.tick(1 / 60, false), { delta: 0, active: false });
});

void test('wheel zoom follows the same path at 60 Hz and 144 Hz', () => {
  const run = (fps: number) => {
    const zoom = createZoomMotion();
    let total = 0;
    let midpoint = 0;
    for (let frame = 0; frame < fps * 2; frame++) {
      if (frame === 0) zoom.add(0.3);
      if (frame === fps / 2) zoom.add(0.15);
      if (frame === fps) zoom.add(-0.2);
      total += zoom.tick(1 / fps, false).delta;
      if (frame === fps / 4 - 1) midpoint = total;
    }
    return { total, midpoint };
  };
  const slow = run(60);
  const fast = run(144);
  assert.ok(Math.abs(slow.midpoint - fast.midpoint) < 1e-12);
  assert.ok(Math.abs(slow.total - fast.total) < 1e-12);
  assert.ok(Math.abs(slow.total - 0.25) < 1e-12);
});

void test('repeated wheel events accumulate without losing undelivered zoom', () => {
  const zoom = createZoomMotion();
  let total = 0;
  for (let frame = 0; frame < 12; frame++) {
    zoom.add(0.025);
    total += zoom.tick(1 / 60, false).delta;
  }
  for (let frame = 0; frame < 120; frame++)
    total += zoom.tick(1 / 60, false).delta;
  assert.ok(Math.abs(total - 0.3) < 1e-12);
});

void test('wheel reversal changes direction smoothly and preserves its signed total', () => {
  const zoom = createZoomMotion();
  zoom.add(0.3);
  let total = zoom.tick(0.025, false).delta;
  zoom.add(-0.35);
  const reversal = zoom.tick(0.000001, false);
  assert.ok(
    reversal.delta > 0,
    'the current velocity should not reverse instantly',
  );
  total += reversal.delta;
  let changedDirection = false;
  for (let frame = 0; frame < 120; frame++) {
    const step = zoom.tick(1 / 60, false);
    total += step.delta;
    changedDirection ||= step.delta < 0;
  }
  assert.equal(changedDirection, true);
  assert.ok(Math.abs(total + 0.05) < 1e-12);
});

void test('a large wheel burst buffers at most a factor-of-two zoom in either direction', () => {
  for (const direction of [-1, 1]) {
    const zoom = createZoomMotion();
    zoom.add(direction * 100);
    let total = 0;
    for (let frame = 0; frame < 120; frame++)
      total += zoom.tick(1 / 60, false).delta;
    assert.ok(Math.abs(total - direction * Math.log(2)) < 1e-12);
  }
});

void test('zoom reset cancels both pending scale and existing velocity', () => {
  const zoom = createZoomMotion();
  zoom.add(0.3);
  zoom.tick(1 / 60, false);
  zoom.reset();
  assert.deepEqual(zoom.tick(1 / 60, false), { delta: 0, active: false });
});

void test('reduced-motion zoom applies the pending scale once without a trailing animation', () => {
  const zoom = createZoomMotion();
  zoom.add(0.3);
  const first = zoom.tick(1 / 60, false).delta;
  zoom.add(-0.1);
  const immediate = zoom.tick(1 / 60, true);
  assert.ok(Math.abs(first + immediate.delta - 0.2) < 1e-12);
  assert.equal(immediate.active, true);
  assert.deepEqual(zoom.tick(1 / 60, true), { delta: 0, active: false });
});

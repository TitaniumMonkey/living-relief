export type NavigationStep = {
  x: number;
  forward: number;
  orbit: boolean;
  active: boolean;
};

const movementCodes = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowLeft',
  'ArrowDown',
  'ArrowRight',
]);
const shiftCodes = new Set(['ShiftLeft', 'ShiftRight']);
const acceleration = 14;
const braking = 18;
const stopSpeed = 0.002;

/** Produces frame-integrated axes in seconds; reset on blur or camera-mode changes. */
export function createNavigationMotion() {
  const held = new Set<string>();
  const heldShift = new Set<string>();
  let orbit = false;
  let velocityX = 0;
  let velocityForward = 0;
  const setOrbit = (next: boolean) => {
    if (next !== orbit) {
      velocityX = 0;
      velocityForward = 0;
      orbit = next;
    }
  };
  return {
    press(code: string, shift: boolean) {
      if (!movementCodes.has(code) && !shiftCodes.has(code)) return false;
      if (shiftCodes.has(code)) heldShift.add(code);
      else held.add(code);
      setOrbit(shift);
      return true;
    },
    release(code: string, shift?: boolean) {
      if (!movementCodes.has(code) && !shiftCodes.has(code)) return false;
      held.delete(code);
      heldShift.delete(code);
      if (shift !== undefined) setOrbit(shift);
      else if (shiftCodes.has(code)) setOrbit(heldShift.size > 0);
      return true;
    },
    reset() {
      held.clear();
      heldShift.clear();
      orbit = false;
      velocityX = 0;
      velocityForward = 0;
    },
    tick(dt: number, reducedMotion: boolean): NavigationStep {
      let targetX =
        Number(held.has('KeyD') || held.has('ArrowRight')) -
        Number(held.has('KeyA') || held.has('ArrowLeft'));
      let targetForward =
        Number(held.has('KeyW') || held.has('ArrowUp')) -
        Number(held.has('KeyS') || held.has('ArrowDown'));
      const length = Math.hypot(targetX, targetForward);
      if (length) {
        targetX /= length;
        targetForward /= length;
      }
      if (reducedMotion) {
        velocityX = targetX;
        velocityForward = targetForward;
        return {
          x: targetX * dt,
          forward: targetForward * dt,
          orbit,
          active: held.size > 0,
        };
      }

      const speed = Math.hypot(velocityX, velocityForward);
      const rate = length ? acceleration : braking;
      const stopTime =
        !length && speed ? Math.max(0, Math.log(speed / stopSpeed) / rate) : dt;
      const duration = Math.min(dt, stopTime);
      const decay = Math.exp(-rate * duration);
      const integral = -Math.expm1(-rate * duration) / rate;
      const x = targetX * duration + (velocityX - targetX) * integral;
      const forward =
        targetForward * duration + (velocityForward - targetForward) * integral;
      velocityX = targetX + (velocityX - targetX) * decay;
      velocityForward =
        targetForward + (velocityForward - targetForward) * decay;
      if (!length && stopTime <= dt) {
        velocityX = 0;
        velocityForward = 0;
      }
      return {
        x,
        forward,
        orbit,
        active: held.size > 0 || x !== 0 || forward !== 0,
      };
    },
  };
}

/** Smooths log-scale requests, capping new accumulation at a factor of two in either direction. */
export function createZoomMotion() {
  const response = 24;
  let remaining = 0;
  let velocity = 0;
  return {
    add(logScaleDelta: number) {
      remaining = Math.max(
        -Math.LN2,
        Math.min(Math.LN2, remaining + logScaleDelta),
      );
    },
    reset() {
      remaining = 0;
      velocity = 0;
    },
    tick(dt: number, reducedMotion: boolean) {
      if (reducedMotion) {
        const delta = remaining;
        remaining = 0;
        velocity = 0;
        return { delta, active: delta !== 0 };
      }

      // Exact critically damped motion preserves velocity when new wheel input arrives.
      const decay = Math.exp(-response * dt);
      const trend = response * remaining - velocity;
      const next = (remaining + trend * dt) * decay;
      let delta = remaining - next;
      velocity = (velocity + response * trend * dt) * decay;
      remaining = next;
      if (Math.abs(remaining) < 0.00001 && Math.abs(velocity) < 0.0001) {
        delta += remaining;
        remaining = 0;
        velocity = 0;
      }
      return {
        delta,
        active: delta !== 0 || remaining !== 0 || velocity !== 0,
      };
    },
  };
}

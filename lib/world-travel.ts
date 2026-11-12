import * as THREE from 'three';
import { createTrainModel } from './train-model.ts';
import { createPassengerCabin } from './train-cabin.ts';
import { createRailway } from './railway.ts';
import {
  advanceJourney,
  sampleLeg,
  type Journey,
  type TravelAPI,
  type TravelState,
} from './travel.ts';

/** A geographic ride, separate from world scenery time and source elevation measurements. */
export function createWorldTravel(
  scene: THREE.Scene,
  point: (lon: number, lat: number, lift?: number) => THREE.Vector3,
  invalidate: () => void,
) {
  const group = new THREE.Group();
  group.name = 'Travel preview';
  scene.add(group);
  const routeGroup = new THREE.Group();
  group.add(routeGroup);
  const train = new THREE.Group(),
    car = new THREE.Group(),
    walker = new THREE.Group();
  group.add(train, car, walker);
  const geometries: THREE.BufferGeometry[] = [],
    materials: THREE.Material[] = [];
  function box(
    parent: THREE.Group,
    color: string,
    size: [number, number, number],
    position: [number, number, number],
  ) {
    const geometry = new THREE.BoxGeometry(...size),
      material = new THREE.MeshStandardMaterial({ color, roughness: 0.65 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    parent.add(mesh);
    geometries.push(geometry);
    materials.push(material);
  }
  const model = createTrainModel();
  model.units.forEach((unit) => train.add(unit.group));
  const passengerCabin = createPassengerCabin();
  model.units[1].group.add(passengerCabin.group);
  const cab = new THREE.Group();
  cab.name = 'Onboard cab interior';
  model.units[0].group.add(cab);
  box(cab, '#263236', [2.4, 0.16, 0.68], [0, 2.62, 4.0]);
  box(cab, '#b5b7ae', [2.45, 0.12, 0.12], [0, 3.89, 4.4]);
  box(cab, '#b5b7ae', [0.08, 1.18, 0.08], [0, 3.3, 4.39]);
  for (const x of [-1.2, 1.2])
    box(cab, '#b5b7ae', [0.1, 1.3, 0.1], [x, 3.3, 4.39]);
  for (const x of [-0.75, -0.35, 0.35])
    box(cab, '#90b6a1', [0.21, 0.06, 0.21], [x, 2.73, 3.94]);
  box(cab, '#161f22', [0.1, 0.32, 0.12], [0.85, 2.84, 3.9]);
  const railway = createRailway(point);
  group.add(railway.group);
  box(car, '#ede5cf', [1.8, 0.8, 4], [0, 0.8, 0]);
  box(car, '#567d89', [1.5, 0.65, 2], [0, 1.5, -0.2]);
  box(walker, '#bd7954', [0.45, 0.8, 0.3], [0, 1.1, 0]);
  box(walker, '#bd9a74', [0.25, 0.3, 0.25], [0, 1.65, 0]);
  for (const x of [-0.13, 0.13])
    box(walker, '#293638', [0.16, 0.7, 0.2], [x, 0.4, 0]);
  let journey: Journey | undefined,
    distance = 0,
    speed = 10,
    stopped = true,
    view: TravelState['view'] = 'window',
    showRoute = true;
  let departureTime = 0;
  let inTunnel = false;
  let notify: ((state: TravelState) => void) | undefined,
    reportAfter = 0,
    reduced = false;
  function locate(d: number) {
    let offset = d;
    for (let i = 0; i < journey!.legs.length; i++) {
      const leg = journey!.legs[i];
      if (offset <= leg.distance || i === journey!.legs.length - 1)
        return { leg, offset: Math.min(offset, leg.distance) };
      offset -= leg.distance;
    }
    return { leg: journey!.legs[0], offset: 0 };
  }
  function report() {
    if (journey)
      notify?.({
        progress: distance / journey.distance,
        paused: stopped || worldStopped,
        speed,
        view,
        mode: locate(distance).leg.mode,
        complete: distance >= journey.distance,
        reducedMotion: reduced,
        phase:
          distance >= journey.distance
            ? 'arrived'
            : stopped || worldStopped
              ? distance === 0
                ? 'boarding'
                : 'paused'
              : departureTime < 2.4
                ? 'departing'
                : 'travelling',
        transitioning: transition !== null || changeView,
        inTunnel,
      });
  }
  function clearRoutes() {
    while (routeGroup.children.length) {
      const line = routeGroup.children[0] as THREE.Line;
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
      routeGroup.remove(line);
    }
  }
  const previousAnchor = new THREE.Vector3();
  let lookYaw = 0,
    lookPitch = 0;
  const inside = () => view === 'onboard' || view === 'window';
  const desiredCamera = new THREE.PerspectiveCamera();
  const desiredTarget = new THREE.Vector3();
  let changeView = false;
  let transition: {
    eye: THREE.Vector3;
    target: THREE.Vector3;
    rotation: THREE.Quaternion;
    elapsed: number;
  } | null = null;
  function pose(camera: THREE.Camera, target: THREE.Vector3, follow: boolean) {
    if (!journey) return;
    const location = locate(distance),
      leg = location.leg;
    // Keep the entire consist between the mapped station endpoints.
    const offset =
      leg.mode === 'train'
        ? 63 + (location.offset / leg.distance) * (leg.distance - 69.5)
        : location.offset;
    const sample = sampleLeg(leg, offset);
    inTunnel = sample.tunnel;
    const p = point(...sample.coordinate, 0.6),
      ahead = point(
        ...sampleLeg(leg, Math.min(leg.distance, offset + 20)).coordinate,
        0.6,
      );
    const behind = point(
      ...sampleLeg(leg, Math.max(0, offset - 5)).coordinate,
      0.6,
    );
    const heading = ahead
      .clone()
      .sub(offset >= leg.distance ? behind : p)
      .setY(0)
      .normalize();
    train.visible = leg.mode === 'train';
    railway.update(leg, offset);
    car.visible = leg.mode === 'drive' && !sample.tunnel;
    walker.visible = leg.mode === 'walk' && !sample.tunnel;
    const actor = leg.mode === 'drive' ? car : walker;
    actor.position.copy(p);
    actor.rotation.y = Math.atan2(heading.x, heading.z);
    model.units.forEach(({ group: coach, offset: spacing, wheelbase }) => {
      const d = Math.max(0, offset - spacing);
      const rear = sampleLeg(leg, Math.max(0, d - wheelbase / 2));
      const front = sampleLeg(leg, Math.min(leg.distance, d + wheelbase / 2));
      const a = point(...rear.coordinate, 0.32),
        b = point(...front.coordinate, 0.32);
      coach.position.copy(a).add(b).multiplyScalar(0.5);
      coach.lookAt(b);
      coach.visible = offset >= spacing && !sampleLeg(leg, d).tunnel;
    });
    cab.visible = view === 'onboard';
    passengerCabin.group.visible = view === 'window';
    // The exterior's opaque window and roof batches are replaced by open cabin framing.
    for (const child of model.units[1].group.children)
      if (child !== passengerCabin.group) child.visible = view !== 'window';
    if (inside()) {
      const carriage = model.units[view === 'window' ? 1 : 0].group;
      const eye =
        view === 'window'
          ? new THREE.Vector3(-0.65, 2.95, 4.2)
          : new THREE.Vector3(-0.65, 3.25, 2.6);
      const yaw = lookYaw + (view === 'window' ? 1.05 : 0);
      carriage.updateWorldMatrix(true, false);
      camera.position.copy(carriage.localToWorld(eye.clone()));
      const gaze = new THREE.Vector3(
        Math.sin(yaw) * Math.cos(lookPitch),
        Math.sin(lookPitch),
        Math.cos(yaw) * Math.cos(lookPitch),
      ).multiplyScalar(80);
      target.copy(carriage.localToWorld(gaze.add(eye)));
      camera.lookAt(target);
    } else if (follow) {
      target.copy(p).addScaledVector(heading, view === 'ride' ? -22 : 40);
      camera.position
        .copy(p)
        .addScaledVector(heading, view === 'ride' ? 28 : -420);
      if (view === 'ride')
        camera.position.add(
          new THREE.Vector3(heading.z, 0, -heading.x).multiplyScalar(34),
        );
      camera.position.y += view === 'ride' ? 34 : 550;
      camera.lookAt(target);
    } else {
      const movement = p.clone().sub(previousAnchor);
      camera.position.add(movement);
      target.add(movement);
    }
    previousAnchor.copy(p);
  }
  let seekCamera = false,
    followOnce = false,
    worldStopped = false;
  train.name = 'Travel train';
  const api: TravelAPI = {
    load(next, onState) {
      journey = next;
      followOnce = true;
      notify = onState;
      distance = 0;
      lookYaw = lookPitch = 0;
      departureTime = 0;
      view = 'window';
      transition = null;
      changeView = false;
      inTunnel = false;
      stopped = true;
      clearRoutes();
      for (const leg of next.legs) {
        const points: THREE.Vector3[] = [];
        for (let i = 1; i < leg.coordinates.length; i++) {
          if (leg.tunnels[i]) continue;
          points.push(
            point(...leg.coordinates[i - 1], 1.2),
            point(...leg.coordinates[i], 1.2),
          );
        }
        const line = new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({
            color: leg.mode === 'train' ? '#e8bc68' : '#a3d4d0',
            transparent: true,
            opacity: 0.85,
          }),
        );
        line.userData.coordinates = leg.coordinates
          .slice(1)
          .flatMap((p, i) =>
            leg.tunnels[i + 1] ? [] : [leg.coordinates[i], p],
          );
        routeGroup.add(line);
      }
      group.visible = true;
      report();
      invalidate();
    },
    configure(options) {
      if (options.speed !== undefined) speed = options.speed;
      if (options.view) {
        view = options.view;
        lookYaw = lookPitch = 0;
        seekCamera = true;
        changeView = !followOnce;
      }
      if (options.paused !== undefined) {
        if (stopped && !options.paused) departureTime = 0;
        stopped = options.paused || reduced;
      }
      if (options.showRoute !== undefined) showRoute = options.showRoute;
      report();
      invalidate();
    },
    seek(progress) {
      if (!journey) return;
      distance = Math.max(0, Math.min(1, progress)) * journey.distance;
      if (distance === journey.distance) stopped = true;
      if (distance === 0) {
        stopped = true;
        departureTime = 0;
      }
      transition = null;
      changeView = false;
      followOnce = true;
      seekCamera = true;
      report();
      invalidate();
    },
    stop() {
      journey = undefined;
      notify = undefined;
      stopped = true;
      transition = null;
      changeView = false;
      group.visible = false;
      clearRoutes();
      invalidate();
    },
    look(yaw, pitch) {
      lookYaw = Math.max(-1.45, Math.min(1.45, lookYaw + yaw));
      lookPitch = Math.max(-0.65, Math.min(0.65, lookPitch + pitch));
      invalidate();
    },
  };
  group.visible = false;
  return {
    api,
    isOnboard: () => !!journey && inside(),
    isActive: () => !!journey,
    isTransitioning: () => changeView || transition !== null,
    tick(
      dt: number,
      now: number,
      camera: THREE.Camera,
      target: THREE.Vector3,
      paused: boolean,
      motionReduced: boolean,
    ) {
      reduced = motionReduced;
      if (!journey) return false;
      if (worldStopped !== paused) {
        worldStopped = paused;
        report();
      }
      if (reduced && !stopped) {
        stopped = true;
        report();
      }
      const moving = !stopped && !paused && !reduced;
      if (moving) {
        departureTime += dt;
        const acceleration = THREE.MathUtils.smoothstep(departureTime, 0, 2.4);
        const remaining = journey.distance - distance;
        const braking = Math.min(
          1,
          Math.max(0.12, remaining / (speed * 10 * 1.6)),
        );
        distance = advanceJourney(
          journey,
          distance,
          dt,
          speed * acceleration * braking,
        );
        if (journey.distance - distance < 0.15) distance = journey.distance;
        if (distance >= journey.distance) {
          stopped = true;
          report();
        }
      }
      routeGroup.visible = showRoute;
      if (changeView && !motionReduced) {
        transition = {
          eye: camera.position.clone(),
          target: target.clone(),
          rotation: camera.quaternion.clone(),
          elapsed: 0,
        };
      }
      if (!transition || changeView) {
        desiredCamera.position.copy(camera.position);
        desiredCamera.quaternion.copy(camera.quaternion);
        desiredTarget.copy(target);
      }
      const lastAnchor = previousAnchor.clone();
      pose(desiredCamera, desiredTarget, seekCamera || followOnce);
      if (transition && !motionReduced) {
        const movement = previousAnchor.clone().sub(lastAnchor);
        transition.eye.add(movement);
        transition.target.add(movement);
        transition.elapsed += dt;
        const t = THREE.MathUtils.smootherstep(transition.elapsed, 0, 1.1);
        camera.position.lerpVectors(transition.eye, desiredCamera.position, t);
        target.lerpVectors(transition.target, desiredTarget, t);
        camera.quaternion.slerpQuaternions(
          transition.rotation,
          desiredCamera.quaternion,
          t,
        );
        if (t === 1) transition = null;
      } else {
        transition = null;
        camera.position.copy(desiredCamera.position);
        target.copy(desiredTarget);
        if (inside() && !followOnce && !motionReduced && dt > 0)
          camera.quaternion.slerp(
            desiredCamera.quaternion,
            1 - Math.exp(-14 * dt),
          );
        else camera.quaternion.copy(desiredCamera.quaternion);
      }
      changeView = false;
      seekCamera = false;
      followOnce = false;
      if (now > reportAfter) {
        report();
        reportAfter = now + 250;
      }
      return (
        moving ||
        transition !== null ||
        camera.quaternion.angleTo(desiredCamera.quaternion) > 0.001
      );
    },
    lookAround(yaw: number, pitch: number) {
      api.look(yaw, pitch);
    },
    useExternalCamera() {
      if (journey) {
        if (inside()) view = 'ride';
        transition = null;
        changeView = false;
        report();
      }
    },
    refresh() {
      if (journey) {
        const { leg, offset } = locate(distance);
        railway.update(leg, offset, true);
      }
      for (const child of routeGroup.children) {
        const line = child as THREE.LineSegments;
        const coords = line.userData.coordinates as [number, number][];
        const positions = line.geometry.getAttribute('position');
        coords.forEach((c, i) => {
          const p = point(...c, 1.2);
          positions.setXYZ(i, p.x, p.y, p.z);
        });
        positions.needsUpdate = true;
        line.geometry.computeBoundingSphere();
      }
    },
    dispose() {
      api.stop();
      group.removeFromParent();
      model.dispose();
      passengerCabin.dispose();
      railway.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}

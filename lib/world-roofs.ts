import * as THREE from 'three';

/** Fits an illustrative gable to a mapped footprint, preserving concavities and courtyards. */
export function pitchedRoof(
  rings: THREE.Vector3[][],
  eave: number,
  rise: number,
) {
  const contours = rings.map((ring) =>
    ring.slice(0, -1).map((p) => new THREE.Vector2(p.x, p.z)),
  );
  const outer = contours[0];
  let axis = new THREE.Vector2(),
    longest = 0;
  for (let i = 0; i < outer.length; i++) {
    const edge = outer[(i + 1) % outer.length].clone().sub(outer[i]);
    if (edge.lengthSq() > longest) {
      longest = edge.lengthSq();
      axis = edge.normalize();
    }
  }
  const across = new THREE.Vector2(-axis.y, axis.x);
  let low = Infinity,
    high = -Infinity;
  for (const p of outer) {
    const d = p.dot(across);
    low = Math.min(low, d);
    high = Math.max(high, d);
  }
  const middle = (low + high) / 2,
    half = (high - low) / 2;
  const side = (p: THREE.Vector2) => p.dot(across) - middle;
  const roofHeight = (p: THREE.Vector2) =>
    eave + rise * (1 - Math.abs(side(p)) / half);
  const vertices = contours.flat(),
    roof: number[] = [],
    gables: number[] = [];
  function clip(polygon: THREE.Vector2[], sign: number) {
    const result: THREE.Vector2[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      const da = side(a) * sign,
        db = side(b) * sign;
      if (da >= 0) result.push(a);
      if ((da > 0 && db < 0) || (da < 0 && db > 0))
        result.push(a.clone().lerp(b, da / (da - db)));
    }
    return result;
  }
  for (const face of THREE.ShapeUtils.triangulateShape(
    outer,
    contours.slice(1),
  )) {
    const triangle = face.map((i) => vertices[i]);
    for (const sign of [-1, 1]) {
      const polygon = clip(triangle, sign);
      for (let i = 1; i < polygon.length - 1; i++) {
        const points = [polygon[0], polygon[i], polygon[i + 1]];
        // Counterclockwise in x/z points downward in the y-up scene.
        const cross = points[1]
          .clone()
          .sub(points[0])
          .cross(points[2].clone().sub(points[0]));
        if (cross === 0) continue;
        if (cross > 0) points.reverse();
        for (const p of points) roof.push(p.x, roofHeight(p), p.y);
      }
    }
  }
  for (const contour of contours)
    for (let i = 0; i < contour.length; i++) {
      const a = contour[i],
        b = contour[(i + 1) % contour.length];
      const points = [a];
      if (side(a) * side(b) < 0)
        points.push(a.clone().lerp(b, side(a) / (side(a) - side(b))));
      points.push(b);
      for (let j = 1; j < points.length; j++) {
        const p = points[j - 1],
          q = points[j];
        gables.push(
          p.x,
          eave,
          p.y,
          q.x,
          eave,
          q.y,
          q.x,
          roofHeight(q),
          q.y,
          p.x,
          eave,
          p.y,
          q.x,
          roofHeight(q),
          q.y,
          p.x,
          roofHeight(p),
          p.y,
        );
      }
    }
  return { roof, gables };
}

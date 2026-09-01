import * as THREE from 'three';

const CURTAIN_COLOR = new THREE.Color(0x7a0f1c);
const HIGHLIGHT_COLOR = new THREE.Color(0xd0402a);
const WIDTH = 28; // covers the frame at CAMERA_FAR
const HEIGHT = 9;
const BOTTOM_Y = -1.5; // below the club floor so no edge shows
const DEPTH_Z = -3.5;

const PLEAT_COUNT = 42;
const PLEAT_DEPTH = 0.16;
const SEGMENTS_PER_PLEAT = 8;
const SEGMENTS_Y = 8; // enough rows for a smooth vertical gradient

const VALANCE_HEIGHT = 1.4;
const VALANCE_PLEAT_COUNT = 17;
const VALANCE_PLEAT_DEPTH = 0.3;
const VALANCE_OFFSET_Z = 0.25; // hangs just in front of the main drape

/** Footlight direction the baked shading assumes: from below and in front. */
const LIGHT_DIR = new THREE.Vector3(0, -0.5, 1).normalize();
const SHADE_FLOOR = 0.25; // darkest fold
const TOP_FALLOFF = 0.35; // brightness at the top edge relative to bottom
const SIDE_FALLOFF = 0.55; // brightness at the side edges relative to centre
const HIGHLIGHT_START = 0.85; // n·l above this tints toward HIGHLIGHT_COLOR

/**
 * Back-of-stage drapes. Shading is baked into vertex colours so the
 * screen-filling curtain costs no per-fragment lighting.
 *
 *        valance ┐  ▄▄▄▄▄
 *                └ ─┤     ├─   z = DEPTH_Z + VALANCE_OFFSET_Z
 *   main drape ────►│░░░░░│    z = DEPTH_Z, pleats ripple in z
 *                   │░░░░░│
 *          stage ═══╧═════╧═══
 */
export function buildCurtain(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ vertexColors: true });

  const drape = new THREE.Mesh(pleated(WIDTH, HEIGHT, PLEAT_COUNT, PLEAT_DEPTH), material);
  drape.position.set(0, BOTTOM_Y + HEIGHT / 2, DEPTH_Z);
  group.add(drape);

  const valance = new THREE.Mesh(
    pleated(WIDTH, VALANCE_HEIGHT, VALANCE_PLEAT_COUNT, VALANCE_PLEAT_DEPTH),
    material,
  );
  valance.position.set(0, BOTTOM_Y + HEIGHT - VALANCE_HEIGHT / 2, DEPTH_Z + VALANCE_OFFSET_Z);
  group.add(valance);

  return group;
}

/** Plane rippled along x, with lighting pre-computed into vertex colours. */
function pleated(width: number, height: number, pleats: number, depth: number): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(width, height, pleats * SEGMENTS_PER_PLEAT, SEGMENTS_Y);
  const position = geometry.attributes.position;

  for (let i = 0; i < position.count; i++) {
    const phase = (position.getX(i) / width) * pleats * Math.PI * 2;
    position.setZ(i, Math.sin(phase) * depth);
  }

  geometry.computeVertexNormals();
  geometry.setAttribute('color', bakeShading(geometry, width, height));
  return geometry;
}

function bakeShading(
  geometry: THREE.BufferGeometry,
  width: number,
  height: number,
): THREE.BufferAttribute {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const colors = new Float32Array(position.count * 3);
  const n = new THREE.Vector3();
  const c = new THREE.Color();

  for (let i = 0; i < position.count; i++) {
    n.fromBufferAttribute(normal, i);
    const facing = Math.max(0, n.dot(LIGHT_DIR));
    const vertical = (position.getY(i) + height / 2) / height; // 0 bottom, 1 top
    const lateral = Math.abs(position.getX(i)) / (width / 2); // 0 centre, 1 edge
    const falloff = (1 - vertical * (1 - TOP_FALLOFF)) * (1 - lateral * lateral * (1 - SIDE_FALLOFF));
    const shade = (SHADE_FLOOR + (1 - SHADE_FLOOR) * facing) * falloff;

    c.copy(CURTAIN_COLOR).multiplyScalar(shade);
    if (facing > HIGHLIGHT_START) {
      c.lerp(HIGHLIGHT_COLOR, (facing - HIGHLIGHT_START) / (1 - HIGHLIGHT_START));
    }

    colors.set([c.r, c.g, c.b], i * 3);
  }

  return new THREE.BufferAttribute(colors, 3);
}

import * as THREE from 'three';
import { Marquee } from './marquee';

const BACKGROUND = 0x06040c;
const CAMERA_FOV = 40;
const CAMERA_POSITION = new THREE.Vector3(0, 0, 5.4);
const STAR_COUNT = 400;
const STAR_RADIUS = 30;
const STAR_SIZE = 0.09;
const STAR_COLOR = 0x8a7a9a;
const STAR_DRIFT = 0.01; // rad/s
const BOB_AMPLITUDE = 0.06;
const BOB_HZ = 0.35;
const SWAY_AMPLITUDE = 0.1; // rad
const SWAY_HZ = 0.2;

/** Pre-show scene: the marquee floating in space while assets load. */
export class Lobby {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private marquee = new Marquee();
  private stars: THREE.Points;
  private elapsed = 0;

  constructor(aspect: number) {
    this.scene.background = new THREE.Color(BACKGROUND);
    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 0.1, 100);
    this.camera.position.copy(CAMERA_POSITION);

    this.stars = buildStars();
    this.scene.add(this.stars);

    const key = new THREE.PointLight(0xfff1c8, 30, 30);
    key.position.set(1.5, 2, 4);
    this.scene.add(key, new THREE.AmbientLight(0x302838, 0.6));
  }

  async load(): Promise<void> {
    await this.marquee.load();
    this.scene.add(this.marquee.root);
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.marquee.update(dt);

    const t = this.elapsed * Math.PI * 2;
    this.marquee.root.position.y = Math.sin(t * BOB_HZ) * BOB_AMPLITUDE;
    this.marquee.root.rotation.y = Math.sin(t * SWAY_HZ) * SWAY_AMPLITUDE;
    this.stars.rotation.z += dt * STAR_DRIFT;
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}

/** Points scattered on a sphere around the camera. */
function buildStars(): THREE.Points {
  const positions = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    const dir = new THREE.Vector3().randomDirection().multiplyScalar(STAR_RADIUS);
    positions.set([dir.x, dir.y, dir.z], i * 3);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ color: STAR_COLOR, size: STAR_SIZE }));
}

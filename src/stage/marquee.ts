import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const MARQUEE_URL = '/models/marquee.glb';
const BULB_MATERIALS = ['BulbA', 'BulbB', 'BulbC']; // chase phases, see tools/build-marquee.py
const LETTER_MATERIAL = 'Letters';
const BULB_COLOR = new THREE.Color(0xffd166);
const LETTER_COLOR = new THREE.Color(0xfff1c8);
const CHASE_STEPS_PER_SECOND = 5;
const BULB_ON = 2.5;
const BULB_OFF = 0.12;
const LETTER_GLOW = 1.4;

/** "OPEN MIC / TONIGHT ONLY" sign with chasing bulbs. One material per phase, not per bulb. */
export class Marquee {
  readonly root = new THREE.Group();
  private phases: THREE.MeshStandardMaterial[] = [];
  private elapsed = 0;

  async load(): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(MARQUEE_URL);
    const byName = new Map<string, THREE.MeshStandardMaterial>();

    gltf.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      const material = mesh.material as THREE.MeshStandardMaterial | undefined;
      if (material?.isMeshStandardMaterial) {
        byName.set(material.name, material);
      }
    });

    this.phases = BULB_MATERIALS.map((name) => byName.get(name)).filter(
      (m): m is THREE.MeshStandardMaterial => m !== undefined,
    );
    for (const material of this.phases) {
      material.emissive.copy(BULB_COLOR);
      material.emissiveIntensity = BULB_OFF;
    }

    const letters = byName.get(LETTER_MATERIAL);
    if (letters) {
      letters.emissive.copy(LETTER_COLOR);
      letters.emissiveIntensity = LETTER_GLOW;
    }

    this.root.add(gltf.scene);
  }

  update(dt: number): void {
    if (this.phases.length === 0) {
      return;
    }

    this.elapsed += dt;
    const lit = Math.floor(this.elapsed * CHASE_STEPS_PER_SECOND) % this.phases.length;
    this.phases.forEach((material, i) => {
      material.emissiveIntensity = i === lit ? BULB_ON : BULB_OFF;
    });
  }
}

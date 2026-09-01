import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const MIC_STAND_URL = '/models/micstand.glb';
const MIC_STAND_SCALE = 1.05; // capsule at mouth height on the 0.5-scaled robot

/** Stage left (+X) and a step toward the crowd, so it sits in front of the comic. */
export const MIC_STAND_POSITION = new THREE.Vector3(0.6, 0, 1.0);

/**
 * Static set dressing. Resolves to an empty group if the file is missing.
 * The mic is yawed to point at the comic, so from the house it reads side-on.
 *
 *          audience (+Z)
 *              ▲
 *        [mic]─┐ 0.6, 1.0   ← stand, capsule aimed back at ●
 *          ●   │ 0, 0       ← comic
 */
export async function loadMicStand(comicPosition: THREE.Vector3): Promise<THREE.Object3D> {
  try {
    const gltf = await new GLTFLoader().loadAsync(MIC_STAND_URL);
    gltf.scene.scale.setScalar(MIC_STAND_SCALE);
    gltf.scene.position.copy(MIC_STAND_POSITION);

    // Model tilts its mic toward local +Z; rotate that toward the comic.
    const dx = comicPosition.x - MIC_STAND_POSITION.x;
    const dz = comicPosition.z - MIC_STAND_POSITION.z;
    gltf.scene.rotation.y = Math.atan2(dx, dz);

    return gltf.scene;
  } catch (err) {
    console.warn('mic stand missing', err);
    return new THREE.Group();
  }
}

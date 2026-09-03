import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const MIC_STAND_URL = '/models/micstand.glb';
const MIC_STAND_SCALE = 1.05; // capsule at mouth height on the 0.5-scaled robot

const STOOL_URL = '/models/stool.glb';
const STOOL_SCALE = 0.25; // 3-unit model down to a 0.75 m bar stool
/** Opposite diagonal from the mic: stage right, upstage, behind the comic's shoulder. */
const STOOL_POSITION = new THREE.Vector3(-0.9, 0, -0.8);
const STOOL_YAW = 0.4; // a little off-square so it doesn't read as a prop on a grid

/** Stage left (+X) and a step toward the crowd, so it sits in front of the comic. */
const MIC_STAND_POSITION = new THREE.Vector3(0.6, 0, 1.0);

/**
 * Static set dressing. Resolves to an empty group if the file is missing.
 * The mic is yawed to point at the comic, so from the house it reads side-on.
 *
 *          audience (+Z)
 *              ▲
 *        [mic]─┐ 0.6, 1.0   ← stand, capsule aimed back at ●
 *          ●   │ 0, 0       ← comic
 */
export async function loadStool(): Promise<THREE.Object3D> {
  try {
    const gltf = await new GLTFLoader().loadAsync(STOOL_URL);
    gltf.scene.scale.setScalar(STOOL_SCALE);
    gltf.scene.position.copy(STOOL_POSITION);
    gltf.scene.rotation.y = STOOL_YAW;
    return gltf.scene;
  } catch (err) {
    console.warn('stool missing', err);
    return new THREE.Group();
  }
}

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

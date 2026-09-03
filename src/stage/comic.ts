import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const MODEL_URL = '/models/comic.glb';
const MODEL_SCALE = 0.5; // raw robot is ~3.8 units tall
const PLACEHOLDER_HEIGHT = 1.8;
const CROSSFADE_SECONDS = 0.3;
const HEAD_BONE = 'Head';
const NOD_RADIANS = 0.28; // ~16 degrees forward at voice level 1
const NOD_ATTACK = 0.18; // per-frame blend when the voice gets louder
const NOD_RELEASE = 0.06; // slower fall so syllables don't twitch the head
const BOB_HZ = 0.6; // slow rise and fall layered on the nod while talking

/** Clip names in comic.glb (Quaternius "Animated Robot", exported by tools/export-comic.py). */
export enum PlayMode {
  Loop = 'loop',
  Once = 'once',
}

export enum ComicClip {
  Idle = 'Robot_Idle',
  Walk = 'Robot_Walking',
  Talk = 'Robot_Talk', // baked into comic.glb: Robot_Idle with neck and head pinned to rest
  Bow = 'Robot_Wave',
  Cringe = 'Robot_No',
  Celebrate = 'Robot_Dance',
  ThumbsUp = 'Robot_ThumbsUp',
  Death = 'Robot_Death',
}

/** Wraps the comic's mesh + animation mixer. Stage asks for clips by name. */
export class Comic {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private clips = new Map<string, THREE.AnimationAction>();
  private active: THREE.AnimationAction | null = null;
  private onceDone: (() => void) | null = null;
  private nodPivot: THREE.Object3D | null = null;
  private nod = 0; // voice envelope, 0..1
  private talkTime = 0;

  async load(): Promise<void> {
    try {
      const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
      gltf.scene.scale.setScalar(MODEL_SCALE);
      this.root.add(gltf.scene);
      const head = findBone(gltf.scene, HEAD_BONE);
      if (head) {
        this.nodPivot = insertNodPivot(head);
      }

      this.mixer = new THREE.AnimationMixer(gltf.scene);
      for (const clip of gltf.animations) {
        this.clips.set(clip.name, this.mixer.clipAction(clip));
      }

      // One-shot clips hand back to Idle when they finish.
      this.mixer.addEventListener('finished', () => {
        this.settleOnce();
        this.play(ComicClip.Idle, PlayMode.Loop);
      });
    } catch {
      this.root.add(buildPlaceholder());
    }
  }

  /** Resolves when a one-shot finishes (or is interrupted); immediately for loops. */
  play(name: ComicClip, mode: PlayMode): Promise<void> {
    const next = this.clips.get(name);
    if (!next || next === this.active) {
      return Promise.resolve();
    }

    this.settleOnce(); // interrupting a one-shot must not leave its caller hanging

    if (mode === PlayMode.Once) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
    }

    this.active?.fadeOut(CROSSFADE_SECONDS);
    next.reset().fadeIn(CROSSFADE_SECONDS).play();
    this.active = next;

    if (mode === PlayMode.Loop) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.onceDone = resolve;
    });
  }

  private settleOnce(): void {
    const done = this.onceDone;
    this.onceDone = null;
    done?.();
  }

  /** Voice loudness 0..1 drives the head; call every frame. */
  setMouth(level: number): void {
    const ease = level > this.nod ? NOD_ATTACK : NOD_RELEASE;
    this.nod += (level - this.nod) * ease;
  }

  update(dt: number): void {
    this.mixer?.update(dt);
    if (!this.nodPivot) {
      return;
    }

    // Nod with the voice, plus a slow bob that only exists while he's talking.
    this.talkTime += dt;
    const bob = 0.75 + 0.25 * Math.sin(this.talkTime * Math.PI * 2 * BOB_HZ);
    this.nodPivot.rotation.x = this.nod * NOD_RADIANS * bob; // absolute: the clip never sees this node
  }
}

/** Two nodes carry the head's name: the bone and the mesh parented to it. */
function findBone(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let bone: THREE.Object3D | null = null;
  root.traverse((obj) => {
    if (!bone && obj.name === name && (obj as THREE.Bone).isBone) {
      bone = obj;
    }
  });
  return bone;
}

/**
 * Put a pivot between the head bone and the meshes hanging off it:
 *
 *   Head bone ─► nod pivot ─► head mesh (+ anything else parented to the bone)
 *
 * Clips animate the bone; the hold and nod live on the pivot, so neither
 * overwrites or accumulates into the other.
 */
function insertNodPivot(bone: THREE.Object3D): THREE.Object3D {
  const pivot = new THREE.Group();
  pivot.name = 'NodPivot';
  const riders = bone.children.filter((c) => !(c as THREE.Bone).isBone);
  riders.forEach((c) => pivot.add(c)); // add() re-parents, keeping local transforms
  bone.add(pivot);
  return pivot;
}

/** Box stand-in until comic.glb exists. */
function buildPlaceholder(): THREE.Mesh {
  const geometry = new THREE.CapsuleGeometry(0.3, PLACEHOLDER_HEIGHT - 0.6, 4, 8);
  const material = new THREE.MeshStandardMaterial({ color: 0xff9955 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = PLACEHOLDER_HEIGHT / 2;
  return mesh;
}

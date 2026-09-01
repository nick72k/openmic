import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const MODEL_URL = '/models/comic.glb';
const MODEL_SCALE = 0.5; // raw robot is ~3.8 units tall
const PLACEHOLDER_HEIGHT = 1.8;
const CROSSFADE_SECONDS = 0.3;

/** Clip names in comic.glb (Quaternius "Animated Robot", exported by tools/export-comic.py). */
export enum PlayMode {
  Loop = 'loop',
  Once = 'once',
}

export enum ComicClip {
  Idle = 'Robot_Idle',
  Walk = 'Robot_Walking',
  Talk = 'Robot_Idle', // no talk clip in the pack; Robot_Standing is a 0.4 s sit->stand transition
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

  async load(): Promise<void> {
    try {
      const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
      gltf.scene.scale.setScalar(MODEL_SCALE);
      this.root.add(gltf.scene);

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

  update(dt: number): void {
    this.mixer?.update(dt);
  }
}

/** Box stand-in until comic.glb exists. */
function buildPlaceholder(): THREE.Mesh {
  const geometry = new THREE.CapsuleGeometry(0.3, PLACEHOLDER_HEIGHT - 0.6, 4, 8);
  const material = new THREE.MeshStandardMaterial({ color: 0xff9955 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = PLACEHOLDER_HEIGHT / 2;
  return mesh;
}

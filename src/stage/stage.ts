import * as THREE from 'three';
import { Reaction } from '../show/types';
import { Comic, ComicClip, PlayMode } from './comic';
import { buildCurtain } from './curtain';
import { Lobby } from './lobby';
import { loadMicStand } from './props';
import { AdaptiveResolution, QualityTier, detectTier } from './quality';
import { Tweens, smoothstep } from './tween';

const CAMERA_FOV = 45;
const CAMERA_NEAR = new THREE.Vector3(0, 1.6, 5); // during the set
const CAMERA_FAR = new THREE.Vector3(0, 2.6, 10); // empty stage
const CAMERA_TARGET = new THREE.Vector3(0, 1, 0);
const STAGE_RADIUS = 3;
const CLUB_FLOOR_SIZE = 40;
const WINGS_X = -9; // off-screen even at CAMERA_FAR
const CENTRE_X = 0;
const WALK_SPEED = 2.5; // units/s; matches the Robot_Walking stride
const FILL_SKY = 0x8a6a5a;
const FILL_GROUND = 0x201010;
const FILL_INTENSITY = 0.5;
const FACE_TOWARD_CENTRE = Math.PI / 2; // +Z model forward rotated to +X
const FACE_TOWARD_WINGS = -Math.PI / 2;
const FACE_AUDIENCE = 0;

const CLIP_BY_REACTION: Readonly<Record<Reaction, ComicClip>> = {
  [Reaction.Boos]: ComicClip.Death,
  [Reaction.Silence]: ComicClip.Cringe,
  [Reaction.Chuckles]: ComicClip.Idle,
  [Reaction.Laughter]: ComicClip.ThumbsUp,
  [Reaction.Uproar]: ComicClip.Celebrate,
};

/**
 * Three.js presentation layer.
 *
 *   ┌─────────────── canvas ───────────────┐
 *   │            spotlight                 │
 *   │               ▼                      │
 *   │   wings ──► [comic] on round stage   │
 *   │                                      │
 *   │         ┌──── camera ────┐           │
 *   └──────────────────────────────────────┘
 */
export class Stage {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private comic = new Comic();
  private clock = new THREE.Clock();
  private tweens = new Tweens();
  private resolution: AdaptiveResolution;
  private lobby: Lobby | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const tier = detectTier();
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: tier === QualityTier.High, // MSAA is the first thing to go on weak GPUs
      powerPreference: 'high-performance',
    });
    this.resolution = new AdaptiveResolution(this.renderer, tier);
    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 100);
    this.camera.position.copy(CAMERA_FAR);
    this.camera.lookAt(CAMERA_TARGET);

    this.buildSet();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Show the marquee while the rest loads. Rendering swaps to the club in start(). */
  async openLobby(): Promise<void> {
    this.lobby = new Lobby(this.camera.aspect);
    await this.lobby.load();
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.lobbyFrame());
  }

  /** Load assets and compile shaders. The club is not drawn until start(). */
  async init(): Promise<void> {
    const spot = new THREE.Vector3(CENTRE_X, 0, 0);
    const [, micStand] = await Promise.all([this.comic.load(), loadMicStand(spot)]);
    this.comic.root.position.x = WINGS_X;
    this.scene.add(this.comic.root, micStand);
    await this.renderer.compileAsync(this.scene, this.camera);
  }

  start(): void {
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** Back to the marquee: comic to the wings, camera pulled out, lobby loop. */
  returnToLobby(): void {
    this.comic.root.position.x = WINGS_X;
    this.comic.root.rotation.y = FACE_AUDIENCE;
    this.comic.play(ComicClip.Idle, PlayMode.Loop);
    this.camera.position.copy(CAMERA_FAR);
    this.camera.lookAt(CAMERA_TARGET);
    if (this.lobby) {
      this.renderer.setAnimationLoop(() => this.lobbyFrame());
    }
  }

  /** Walk from the wings to centre while the camera pushes in. Resolves on arrival. */
  async walkOn(): Promise<void> {
    await this.walk(WINGS_X, CENTRE_X, FACE_TOWARD_CENTRE, CAMERA_FAR, CAMERA_NEAR);
    this.comic.root.rotation.y = FACE_AUDIENCE;
    this.comic.play(ComicClip.Idle, PlayMode.Loop);
  }

  /** Walk back to the wings while the camera pulls out. */
  async walkOff(): Promise<void> {
    await this.walk(CENTRE_X, WINGS_X, FACE_TOWARD_WINGS, CAMERA_NEAR, CAMERA_FAR);
    this.comic.play(ComicClip.Idle, PlayMode.Loop);
  }

  startTalking(): void {
    this.comic.play(ComicClip.Talk, PlayMode.Loop);
  }

  react(reaction: Reaction): void {
    this.comic.play(CLIP_BY_REACTION[reaction], PlayMode.Once);
  }

  /** Resolves when the wave finishes. */
  bow(): Promise<void> {
    return this.comic.play(ComicClip.Bow, PlayMode.Once);
  }

  private buildSet(): void {
    this.scene.background = new THREE.Color(0x0b0812);

    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(STAGE_RADIUS, STAGE_RADIUS, 0.2, 48),
      new THREE.MeshStandardMaterial({ color: 0x3a2a1e }),
    );
    floor.position.y = -0.1;
    this.scene.add(floor);

    const clubFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(CLUB_FLOOR_SIZE, CLUB_FLOOR_SIZE),
      new THREE.MeshStandardMaterial({ color: 0x120c10, roughness: 1 }),
    );
    clubFloor.rotation.x = -Math.PI / 2;
    clubFloor.position.y = -0.2;
    this.scene.add(clubFloor);

    this.scene.add(buildCurtain());

    const spot = new THREE.SpotLight(0xfff1d6, 60, 20, Math.PI / 8, 0.4);
    spot.position.set(0, 6, 2);
    this.scene.add(spot);
    this.scene.add(new THREE.AmbientLight(0x404060, 0.4));
    // Soft fill so the comic reads while walking outside the spot.
    this.scene.add(new THREE.HemisphereLight(FILL_SKY, FILL_GROUND, FILL_INTENSITY));
  }

  private frame(): void {
    const dt = this.clock.getDelta();
    this.resolution.sample(dt);
    this.tweens.step(dt);
    this.comic.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private lobbyFrame(): void {
    if (!this.lobby) {
      return;
    }
    const dt = this.clock.getDelta();
    this.resolution.sample(dt);
    this.lobby.update(dt);
    this.renderer.render(this.lobby.scene, this.lobby.camera);
  }

  /** Comic strides at constant speed; camera eases between the two framings. */
  private walk(
    fromX: number,
    toX: number,
    facing: number,
    cameraFrom: THREE.Vector3,
    cameraTo: THREE.Vector3,
  ): Promise<void> {
    this.comic.root.position.x = fromX;
    this.comic.root.rotation.y = facing;
    this.comic.play(ComicClip.Walk, PlayMode.Loop);
    const seconds = Math.abs(toX - fromX) / WALK_SPEED;

    const stride = this.tweens.run(seconds, (t) => {
      this.comic.root.position.x = THREE.MathUtils.lerp(fromX, toX, t);
    });

    const dolly = this.tweens.run(
      seconds,
      (t) => {
        this.camera.position.lerpVectors(cameraFrom, cameraTo, t);
        this.camera.lookAt(CAMERA_TARGET);
      },
      smoothstep,
    );

    return Promise.all([stride, dolly]).then(() => undefined);
  }

  private resize(): void {
    const { innerWidth: w, innerHeight: h } = window;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.lobby?.resize(w / h);
  }
}

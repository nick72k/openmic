import type * as THREE from 'three';

export enum QualityTier {
  Low = 'low',
  High = 'high',
}

const LOW_END_CORES = 4;
const LOW_END_MEMORY_GB = 4;

const MAX_PIXEL_RATIO_BY_TIER: Readonly<Record<QualityTier, number>> = {
  [QualityTier.Low]: 1,
  [QualityTier.High]: 2,
};
const MIN_PIXEL_RATIO = 0.6;
const PIXEL_RATIO_STEP = 0.2;

const TARGET_FRAME_MS = 1000 / 50; // step down if we can't hold ~50 fps
const RELAX_FRAME_MS = 1000 / 58; // step back up if we're comfortably fast
const SAMPLE_FRAMES = 90;

/** Cheap heuristic before the first frame; adaptive resolution corrects it afterwards. */
export function detectTier(): QualityTier {
  const cores = navigator.hardwareConcurrency ?? LOW_END_CORES;
  const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? LOW_END_MEMORY_GB;

  if (cores <= LOW_END_CORES || memory <= LOW_END_MEMORY_GB) {
    return QualityTier.Low;
  }

  return QualityTier.High;
}

/**
 * Scales render resolution to hold frame rate.
 *
 *   frame time ──► rolling mean over SAMPLE_FRAMES
 *                        │
 *        slow ◄──────────┼──────────► fast
 *   ratio -= STEP                 ratio += STEP
 *   (floor MIN)                   (ceil per tier)
 */
export class AdaptiveResolution {
  private ratio: number;
  private readonly maxRatio: number;
  private accumulatedMs = 0;
  private frames = 0;

  constructor(
    private renderer: THREE.WebGLRenderer,
    tier: QualityTier,
  ) {
    this.maxRatio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO_BY_TIER[tier]);
    this.ratio = this.maxRatio;
    this.renderer.setPixelRatio(this.ratio);
  }

  sample(dtSeconds: number): void {
    this.accumulatedMs += dtSeconds * 1000;
    this.frames++;

    if (this.frames < SAMPLE_FRAMES) {
      return;
    }

    const meanMs = this.accumulatedMs / this.frames;
    this.accumulatedMs = 0;
    this.frames = 0;

    if (meanMs > TARGET_FRAME_MS) {
      this.setRatio(this.ratio - PIXEL_RATIO_STEP);
      return;
    }

    if (meanMs < RELAX_FRAME_MS) {
      this.setRatio(this.ratio + PIXEL_RATIO_STEP);
    }
  }

  private setRatio(value: number): void {
    const clamped = Math.min(this.maxRatio, Math.max(MIN_PIXEL_RATIO, value));
    if (clamped === this.ratio) {
      return;
    }

    this.ratio = clamped;
    this.renderer.setPixelRatio(clamped);
  }
}

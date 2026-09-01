export type Easing = (t: number) => number;

export const linear: Easing = (t) => t;
export const smoothstep: Easing = (t) => t * t * (3 - 2 * t);

interface Active {
  elapsed: number;
  duration: number;
  easing: Easing;
  onUpdate: (t: number) => void;
  resolve: () => void;
}

/** Frame-stepped tweens. run() resolves when the tween completes. */
export class Tweens {
  private active: Active[] = [];

  run(duration: number, onUpdate: (t: number) => void, easing: Easing = linear): Promise<void> {
    return new Promise((resolve) => {
      this.active.push({ elapsed: 0, duration, easing, onUpdate, resolve });
    });
  }

  step(dt: number): void {
    const finished: Active[] = [];

    for (const tween of this.active) {
      tween.elapsed += dt;
      const t = Math.min(1, tween.elapsed / tween.duration);
      tween.onUpdate(tween.easing(t));

      if (t >= 1) {
        finished.push(tween);
      }
    }

    if (finished.length === 0) {
      return;
    }

    this.active = this.active.filter((t) => !finished.includes(t));
    finished.forEach((t) => t.resolve());
  }
}

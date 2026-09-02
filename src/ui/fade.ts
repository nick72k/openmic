export enum Blackout {
  In = 'in',
  Out = 'out',
}

const FADE_MS = 700; // keep in step with #fade's CSS transition
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');

/** Fade the blackout layer in or out; resolves when the transition is done. */
export function blackout(state: Blackout): Promise<void> {
  const layer = document.getElementById('fade');
  if (!layer) {
    return Promise.resolve();
  }
  layer.classList.toggle('on', state === Blackout.In);
  return new Promise((resolve) => setTimeout(resolve, REDUCED_MOTION.matches ? 0 : FADE_MS));
}

import type { Mutable } from './mutable';

const AMBIENT_URL = '/sfx/ambient-bar-chatter.mp3';
const FULL_GAIN = 0.6;
const DUCKED_GAIN = 0.04; // barely audible under the act
const RAMP_SECONDS = 3;
const FADE_IN_SECONDS = 2.5; // Enter click to full chatter
const SILENT_GAIN = 0.001; // exponential ramps cannot start at zero

/**
 * Looping bar chatter behind the show.
 *
 *   <audio> ──► GainNode ──► destination
 *                  ▲
 *          duck() / restore() ramp the gain
 */
export class Ambience implements Mutable {
  private audio = new Audio();
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private target = FULL_GAIN;

  constructor() {
    this.audio.loop = true;
  }

  /** Fetch the clip fully so playback starts without a stall. */
  async preload(): Promise<void> {
    const response = await fetch(AMBIENT_URL);
    if (!response.ok) {
      throw new Error(`Ambience missing: ${AMBIENT_URL}`);
    }
    this.audio.src = URL.createObjectURL(await response.blob());
  }

  /** Call from a user gesture (autoplay policy). Retries on the next one otherwise. */
  async start(): Promise<void> {
    try {
      await this.play();
    } catch {
      const retry = (): void => {
        this.play().catch(() => {});
      };
      window.addEventListener('pointerdown', retry, { once: true });
      window.addEventListener('keydown', retry, { once: true });
    }
  }

  duck(): void {
    this.rampTo(DUCKED_GAIN);
  }

  restore(): void {
    this.rampTo(FULL_GAIN);
  }

  mute(): void {
    this.audio.muted = true;
  }

  unmute(): void {
    this.audio.muted = false;
  }

  private async play(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = SILENT_GAIN;
      this.ctx.createMediaElementSource(this.audio).connect(this.gain).connect(this.ctx.destination);
    }

    await this.audio.play();
    await this.ctx.resume();

    // Ease the room in rather than slamming the chatter on.
    const gain = this.gain!.gain;
    const now = this.ctx.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(SILENT_GAIN, now);
    gain.exponentialRampToValueAtTime(this.target, now + FADE_IN_SECONDS);
  }

  private rampTo(value: number): void {
    this.target = value;
    if (!this.ctx || !this.gain) {
      return; // not playing yet; play() picks up target
    }

    const gain = this.gain.gain;
    const now = this.ctx.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.exponentialRampToValueAtTime(value, now + RAMP_SECONDS);
  }
}

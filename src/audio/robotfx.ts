const RING_HZ = 42; // carrier; 30-60 is the classic robot range
const DRY = 0.75; // untouched voice, keeps it intelligible
const WET = 0.4; // ring-modulated voice
const LOWPASS_HZ = 5000; // tames the metallic hiss ring-mod adds
const PITCH_RATE = 1.12; // ~+2 semitones; also speeds delivery by the same factor

const METER_FFT = 256;
const METER_SMOOTHING = 0.5;

/**
 * Ring modulator for the comic's voice.
 *
 *   <audio> ──┬──► dry gain ─────────────────► out
 *             └──► wet gain ──► lowpass ────► out
 *                     ▲
 *              LFO (RING_HZ) × depth   (gain swings ±WET: true ring mod)
 */
export class RobotFx {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private samples: Uint8Array<ArrayBuffer> | null = null;

  /** RMS of the raw voice, 0..1. Cheap enough to call every frame. */
  level(): number {
    if (!this.analyser || !this.samples) {
      return 0;
    }
    this.analyser.getByteTimeDomainData(this.samples);
    let sum = 0;
    for (const v of this.samples) {
      const centred = (v - 128) / 128;
      sum += centred * centred;
    }
    return Math.min(1, Math.sqrt(sum / this.samples.length) * 3);
  }

  private meter(ctx: AudioContext): AnalyserNode {
    if (!this.analyser) {
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = METER_FFT;
      this.analyser.smoothingTimeConstant = METER_SMOOTHING;
      this.samples = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
    }
    return this.analyser;
  }

  attach(audio: HTMLAudioElement): void {
    // Piper has no pitch control; resample instead (pitch and tempo move together).
    audio.preservesPitch = false;
    audio.playbackRate = PITCH_RATE;

    const ctx = (this.ctx ??= new AudioContext());
    const source = ctx.createMediaElementSource(audio);

    const dry = ctx.createGain();
    dry.gain.value = DRY;

    const wet = ctx.createGain();
    wet.gain.value = 0; // LFO drives it around zero

    const depth = ctx.createGain();
    depth.gain.value = WET;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = RING_HZ;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = LOWPASS_HZ;

    lfo.connect(depth).connect(wet.gain);
    source.connect(dry).connect(ctx.destination);
    source.connect(wet).connect(lowpass).connect(ctx.destination);
    source.connect(this.meter(ctx)); // taps the raw voice for the mouth
    lfo.start();

    const teardown = (): void => {
      lfo.stop();
      source.disconnect();
    };
    audio.addEventListener('ended', teardown, { once: true });
    audio.addEventListener('error', teardown, { once: true });
  }
}

export interface VoiceLevel {
  /** Current loudness of the voice, 0..1. Zero when nothing is playing. */
  level(): number;
}

// Loudness lives on the same class so the graph is built once per clip.
export interface RobotFx extends VoiceLevel {}

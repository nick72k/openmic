const RING_HZ = 42; // carrier; 30-60 is the classic robot range
const DRY = 0.75; // untouched voice, keeps it intelligible
const WET = 0.4; // ring-modulated voice
const LOWPASS_HZ = 5000; // tames the metallic hiss ring-mod adds
const PITCH_RATE = 1.12; // ~+2 semitones; also speeds delivery by the same factor

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
    lfo.start();

    const teardown = (): void => {
      lfo.stop();
      source.disconnect();
    };
    audio.addEventListener('ended', teardown, { once: true });
    audio.addEventListener('error', teardown, { once: true });
  }
}

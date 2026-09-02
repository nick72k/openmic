import type { WorkerRequest, WorkerResponse } from './piper.worker';
import type { RobotFx } from './robotfx';
import { sanitizeForTts, splitSentences } from './text';
import type { Speaker } from './tts';

/** ~63 MB, cached in OPFS after first download. Low tier sounds flatter, more synthetic. */
export const DEFAULT_VOICE_ID = 'en_US-kathleen-low';

const WAV_HEADER_BYTES = 44;
const WAV_BYTE_RATE_OFFSET = 28;
const PLAYBACK_GRACE_MS = 3_000; // beyond the clip's own duration before we give up on 'ended'
const SYNTH_TIMEOUT_MS = 20_000;

export type VoiceProgress = (fraction: number) => void;

interface Pending {
  resolve: (wav: ArrayBuffer) => void;
  reject: (err: Error) => void;
}

/**
 * Piper TTS in a worker. Sentences are synthesised one ahead of playback:
 *
 *   synth  s1 ──► s2 ──► s3
 *   play        s1 ───► s2 ───► s3
 */
export class PiperSpeaker implements Speaker {
  private worker: Worker;
  private pending = new Map<number, Pending>();
  private nextId = 0;
  private generation = 0; // bumped by stop(); stale pipelines bail out
  private current: HTMLAudioElement | null = null;
  private readyPromise: Promise<void> | null = null;
  private isReady = false;
  private muted = false;
  private speaking: Promise<void> = Promise.resolve();

  constructor(
    private voiceId = DEFAULT_VOICE_ID,
    private fx: RobotFx | null = null,
  ) {
    this.worker = new Worker(new URL('./piper.worker.ts', import.meta.url), { type: 'module' });
  }

  get ready(): boolean {
    return this.isReady;
  }

  /** Downloads the voice (first run) and builds the session. Safe to call once. */
  warmUp(onProgress?: VoiceProgress): Promise<void> {
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = new Promise((resolve, reject) => {
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const msg = event.data;

        if (msg.type === 'progress') {
          onProgress?.(msg.total > 0 ? msg.loaded / msg.total : 0);
          return;
        }

        if (msg.type === 'ready') {
          this.isReady = true;
          resolve();
          return;
        }

        this.settle(msg);
      };

      this.worker.onerror = (event) => reject(new Error(event.message));
      this.send({ type: 'init', voiceId: this.voiceId });
    });

    return this.readyPromise;
  }

  /**
   * Never rejects: a sentence that fails to synthesise or play is skipped, not fatal.
   * Speaks are serialised: a second call waits for the first, so lines can't overlap.
   */
  speak(text: string): Promise<void> {
    const turn = this.speaking.then(() => this.speakNow(text));
    this.speaking = turn;
    return turn;
  }

  private async speakNow(text: string): Promise<void> {
    const generation = this.generation;
    const sentences = splitSentences(sanitizeForTts(text));
    if (sentences.length === 0) {
      return;
    }

    let upcoming = this.synthSafe(sentences[0]);

    for (let i = 0; i < sentences.length; i++) {
      const wav = await upcoming;
      if (generation !== this.generation) {
        return;
      }

      if (i + 1 < sentences.length) {
        upcoming = this.synthSafe(sentences[i + 1]);
      }

      if (wav) {
        await this.play(wav);
      }
    }
  }

  stop(): void {
    this.generation++;
    this.current?.pause();
    this.current = null;
  }

  /** Keeps playing silently so caption pacing is unchanged. */
  mute(): void {
    this.muted = true;
    if (this.current) {
      this.current.muted = true;
    }
  }

  unmute(): void {
    this.muted = false;
    if (this.current) {
      this.current.muted = false;
    }
  }

  private async synthSafe(text: string): Promise<ArrayBuffer | null> {
    try {
      return await this.synth(text);
    } catch (err) {
      console.warn(`piper: skipping "${text}"`, err);
      return null;
    }
  }

  private synth(text: string): Promise<ArrayBuffer> {
    const id = this.nextId++;
    const started = performance.now();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`synth timed out after ${SYNTH_TIMEOUT_MS}ms`));
      }, SYNTH_TIMEOUT_MS);

      this.pending.set(id, {
        resolve: (wav) => {
          clearTimeout(timer);
          if (import.meta.env.DEV) {
            console.debug(`piper: synth ${Math.round(performance.now() - started)}ms "${text}"`);
          }
          resolve(wav);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      this.send({ type: 'synth', id, text });
    });
  }

  private settle(msg: WorkerResponse): void {
    if (msg.type === 'audio') {
      this.pending.get(msg.id)?.resolve(msg.wav);
      this.pending.delete(msg.id);
      return;
    }

    if (msg.type === 'error' && msg.id !== undefined) {
      this.pending.get(msg.id)?.reject(new Error(msg.message));
      this.pending.delete(msg.id);
    }
  }

  private play(wav: ArrayBuffer): Promise<void> {
    const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
    const audio = new Audio(url);
    audio.muted = this.muted;
    this.fx?.attach(audio);
    this.current = audio;

    return new Promise((resolve) => {
      // Watchdog: 'ended' can fail to fire on a bad clip; the header tells us how long to wait.
      const timer = setTimeout(done, wavDurationMs(wav) + PLAYBACK_GRACE_MS);

      function done(): void {
        clearTimeout(timer);
        audio.pause();
        URL.revokeObjectURL(url);
        resolve();
      }

      audio.onended = done;
      audio.onerror = done;
      audio.play().catch(done); // autoplay refused: skip rather than hang the show
    });
  }

  private send(msg: WorkerRequest): void {
    this.worker.postMessage(msg);
  }
}

/** PCM WAV: duration = data bytes / byte rate (header field at offset 28). */
function wavDurationMs(wav: ArrayBuffer): number {
  if (wav.byteLength <= WAV_HEADER_BYTES) {
    return 0;
  }
  const byteRate = new DataView(wav).getUint32(WAV_BYTE_RATE_OFFSET, true);
  if (byteRate === 0) {
    return 0;
  }
  return ((wav.byteLength - WAV_HEADER_BYTES) / byteRate) * 1000;
}

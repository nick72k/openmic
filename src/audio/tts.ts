import type { Mutable } from './mutable';
import { sanitizeForTts } from './text';

/** Voice abstraction. Swap implementations without touching callers. */
export interface Speaker extends Mutable {
  speak(text: string): Promise<void>;
  stop(): void;
}

const DEFAULT_RATE = 1.05;

export class WebSpeechSpeaker implements Speaker {
  private muted = false;

  speak(text: string): Promise<void> {
    if (!('speechSynthesis' in window) || this.muted) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(sanitizeForTts(text));
      utterance.rate = DEFAULT_RATE;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      speechSynthesis.speak(utterance);
    });
  }

  stop(): void {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
  }

  /** No live volume control on an utterance; cut the current one. */
  mute(): void {
    this.muted = true;
    this.stop();
  }

  unmute(): void {
    this.muted = false;
  }
}

/** Uses the primary voice once it reports ready; the fallback covers the model download. */
export class FallbackSpeaker implements Speaker {
  constructor(
    private primary: Speaker & { ready: boolean },
    private fallback: Speaker,
  ) {}

  speak(text: string): Promise<void> {
    return this.primary.ready ? this.primary.speak(text) : this.fallback.speak(text);
  }

  stop(): void {
    this.primary.stop();
    this.fallback.stop();
  }

  mute(): void {
    this.primary.mute();
    this.fallback.mute();
  }

  unmute(): void {
    this.primary.unmute();
    this.fallback.unmute();
  }
}


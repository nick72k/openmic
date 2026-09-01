import { Reaction } from '../show/types';
import type { Mutable } from './mutable';

const SFX_DIR = '/sfx';

/** One clip per reaction, produced by tools/encode-sfx.sh. Missing ones play nothing. */
const CLIP_BY_REACTION: Readonly<Record<Reaction, string>> = {
  [Reaction.Boos]: 'boos.mp3',
  [Reaction.Silence]: 'crickets.mp3',
  [Reaction.Chuckles]: 'chuckles.mp3',
  [Reaction.Laughter]: 'laughter.mp3',
  [Reaction.Uproar]: 'uproar.mp3',
};

export class Crowd implements Mutable {
  private current: HTMLAudioElement | null = null;
  private urls = new Map<Reaction, string>();
  private muted = false;

  /** Fetch every clip that exists. Resolves even if some are missing. */
  async preload(): Promise<void> {
    const entries = Object.entries(CLIP_BY_REACTION) as [Reaction, string][];

    await Promise.all(
      entries.map(async ([reaction, file]) => {
        const response = await fetch(`${SFX_DIR}/${file}`).catch(() => null);
        if (!response?.ok) {
          return;
        }
        this.urls.set(reaction, URL.createObjectURL(await response.blob()));
      }),
    );
  }

  play(reaction: Reaction): Promise<void> {
    this.stop();

    const url = this.urls.get(reaction);
    if (!url) {
      return Promise.resolve();
    }

    const audio = new Audio(url);
    audio.muted = this.muted;
    this.current = audio;

    return new Promise((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
  }

  stop(): void {
    this.current?.pause();
    this.current = null;
  }

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
}

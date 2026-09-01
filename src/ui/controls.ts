import type { Mutable } from '../audio/mutable';

export enum Channel {
  Voice = 'voice',
  Ambience = 'ambience',
  Crowd = 'crowd',
}

const LABEL_BY_CHANNEL: Readonly<Record<Channel, string>> = {
  [Channel.Voice]: 'Agent',
  [Channel.Ambience]: 'Ambient',
  [Channel.Crowd]: 'Crowd',
};

const LABEL_ALL = 'All';
const STORAGE_KEY = 'openmic.muted';

/** Mute toggles, one per channel plus All. Muted set persists per browser. */
export class MuteControls {
  private muted = new Set<Channel>();
  private buttons = new Map<Channel, HTMLButtonElement>();
  private allButton: HTMLButtonElement;

  constructor(
    root: HTMLElement,
    private channels: Readonly<Record<Channel, Mutable>>,
  ) {
    for (const channel of Object.values(Channel)) {
      const button = this.makeButton(LABEL_BY_CHANNEL[channel], () => this.toggle(channel));
      this.buttons.set(channel, button);
      root.appendChild(button);
    }

    this.allButton = this.makeButton(LABEL_ALL, () => this.toggleAll());
    root.appendChild(this.allButton);

    this.muted = load();
    this.apply();
  }

  private toggle(channel: Channel): void {
    if (this.muted.has(channel)) {
      this.muted.delete(channel);
    } else {
      this.muted.add(channel);
    }
    this.apply();
  }

  private toggleAll(): void {
    const everything = Object.values(Channel);
    const allMuted = everything.every((c) => this.muted.has(c));
    this.muted = allMuted ? new Set() : new Set(everything);
    this.apply();
  }

  private apply(): void {
    for (const channel of Object.values(Channel)) {
      const isMuted = this.muted.has(channel);
      if (isMuted) {
        this.channels[channel].mute();
      } else {
        this.channels[channel].unmute();
      }
      this.buttons.get(channel)?.setAttribute('aria-pressed', String(isMuted));
    }

    const allMuted = this.muted.size === Object.values(Channel).length;
    this.allButton.setAttribute('aria-pressed', String(allMuted));
    save(this.muted);
  }

  private makeButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = label;
    button.title = `Mute ${label.toLowerCase()}`;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', onClick);
    return button;
  }
}

function load(): Set<Channel> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as Channel[]) : []);
  } catch {
    return new Set();
  }
}

function save(muted: Set<Channel>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...muted]));
  } catch {
    // storage unavailable; controls still work for this session
  }
}

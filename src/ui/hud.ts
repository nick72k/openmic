import { MAX_HECKLE_LENGTH, MAX_SCORE, MIN_SCORE, Reaction } from '../show/types';

const RATING_LABELS: Readonly<Record<number, string>> = {
  1: 'Boo',
  2: '. . .',
  3: 'Heh',
  4: 'Ha!',
  5: 'HAHA',
};

/** What the room did, for people who can't hear it. */
const REACTION_LABELS: Readonly<Record<Reaction, string>> = {
  [Reaction.Boos]: 'Boos',
  [Reaction.Silence]: 'Crickets',
  [Reaction.Chuckles]: 'Scattered chuckles',
  [Reaction.Laughter]: 'Laughter and applause',
  [Reaction.Uproar]: 'The room erupts',
};
const REACTION_SHOWN_MS = 3500;

const CUE_COPIED = 'Copied';
const CUE_COPY = 'Copy';
const CUE_COPY_FAILED = 'Select it';
const CUE_FEEDBACK_MS = 1500;
const ARMED_HINT = 'Goes out with your reaction:';

/** Single-key shortcuts; digits map straight to scores. */
const KEY_HECKLE = 'h';
const KEY_ENCORE = 'e';
const KEY_DONE = 'd';

/**
 * Caption + reaction controls. Emits scores; owns no show logic.
 *
 *   [Boo 1] [. . . 2] [Heh 3] [Ha! 4] [HAHA 5]  |  [Heckle! H]
 *   ┌ type a shout, then pick a reaction ─┐        <- opened by Heckle!, sent with the score
 *
 * Keyboard: digits rate, H heckles, E encore, D done. Focus follows the show
 * so a keyboard user is always one Tab from the live control.
 */
export class Hud {
  private caption: HTMLElement;
  private reaction: HTMLElement;
  private reactions: HTMLElement;
  private rating: HTMLElement;
  private heckleRow: HTMLElement;
  private heckleInput: HTMLInputElement;
  private heckleHint: HTMLElement;
  private heckleButton: HTMLButtonElement;
  private curtainCall: HTMLElement;
  private encoreButton: HTMLButtonElement;
  private doneButton: HTMLButtonElement;
  private cue: HTMLElement;
  private scoreButtons: HTMLButtonElement[] = [];
  private reactionTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    root: HTMLElement,
    onScore: (score: number, heckle?: string) => void,
    onEncore: () => void,
    onDone: () => void,
  ) {
    this.caption = must(root.querySelector('#caption'));
    this.reaction = must(root.querySelector('#reaction'));
    this.reactions = must(root.querySelector('#reactions'));
    this.rating = must(root.querySelector('#rating'));
    this.heckleRow = must(root.querySelector('#heckle'));
    this.heckleInput = must(this.heckleRow.querySelector('input'));
    this.heckleHint = must(this.heckleRow.querySelector('.hint'));
    this.heckleInput.maxLength = MAX_HECKLE_LENGTH;
    this.heckleInput.addEventListener('input', () => this.showArmed());
    // Enter or Esc locks the shout in and hands the keyboard back to the score keys.
    this.heckleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        this.rating.focus();
      }
    });
    this.heckleButton = must(root.querySelector<HTMLButtonElement>('#heckle-toggle'));
    this.heckleButton.addEventListener('click', () => this.toggleHeckle());
    this.curtainCall = must(root.querySelector('#curtain-call'));
    this.encoreButton = must(root.querySelector<HTMLButtonElement>('#encore'));
    this.doneButton = must(root.querySelector<HTMLButtonElement>('#done'));
    this.encoreButton.addEventListener('click', onEncore);
    this.doneButton.addEventListener('click', onDone);
    this.cue = must(root.querySelector('#cue'));
    this.wireCueCopy();

    for (let s = MIN_SCORE; s <= MAX_SCORE; s++) {
      const button = document.createElement('button');
      button.append(RATING_LABELS[s], ' ', keycap(String(s)));
      button.dataset.score = String(s);
      button.addEventListener('click', () => onScore(s, this.heckleInput.value));
      this.rating.appendChild(button);
      this.scoreButtons.push(button);
    }

    window.addEventListener('keydown', (e) => this.onKey(e));

    this.hideRating();
    this.hideEncore();
    this.hideCue();
    this.setCaption('');
  }

  /** Prompt to hand the agent, shown on an empty stage until the show starts. */
  showCue(): void {
    this.cue.hidden = false;
    this.cue.querySelector<HTMLButtonElement>('#cue-copy')?.focus();
  }

  hideCue(): void {
    this.cue.hidden = true;
  }

  /** Empty text hides the dialog box. */
  setCaption(text: string): void {
    this.caption.textContent = text;
    this.caption.hidden = text === '';
  }

  showRating(): void {
    this.reactions.hidden = false;
    this.rating.focus();
  }

  hideRating(): void {
    this.reactions.hidden = true;
    this.heckleRow.hidden = true;
    this.heckleInput.value = '';
    this.showArmed();
  }

  /** Text stand-in for the crowd sound; clears itself. */
  showReaction(reaction: Reaction, heckle?: string): void {
    clearTimeout(this.reactionTimer);
    this.reaction.textContent = heckle
      ? `${REACTION_LABELS[reaction]}. Someone shouts: "${heckle}"`
      : REACTION_LABELS[reaction];
    this.reaction.hidden = false;
    this.reactionTimer = setTimeout(() => (this.reaction.hidden = true), REACTION_SHOWN_MS);
  }

  private openHeckle(): void {
    this.heckleRow.hidden = false;
    this.heckleButton.setAttribute('aria-expanded', 'true');
    this.heckleInput.focus();
    this.heckleInput.select();
  }

  private toggleHeckle(): void {
    this.heckleRow.hidden = !this.heckleRow.hidden;
    this.heckleButton.setAttribute('aria-expanded', String(!this.heckleRow.hidden));
    if (!this.heckleRow.hidden) {
      this.heckleInput.focus();
    } else {
      this.heckleButton.focus();
    }
  }

  showEncore(): void {
    this.curtainCall.hidden = false;
    this.encoreButton.focus();
  }

  hideEncore(): void {
    this.curtainCall.hidden = true;
  }

  private onKey(e: KeyboardEvent): void {
    if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) {
      return;
    }
    const key = e.key.toLowerCase();

    if (!this.reactions.hidden) {
      const score = Number(key);
      if (score >= MIN_SCORE && score <= MAX_SCORE) {
        this.scoreButtons[score - MIN_SCORE].click();
        e.preventDefault();
        return;
      }
      if (key === KEY_HECKLE) {
        this.openHeckle(); // from the keyboard, H always means "edit the shout"
        e.preventDefault();
        return;
      }
    }

    if (!this.curtainCall.hidden) {
      if (key === KEY_ENCORE) {
        this.encoreButton.click();
        e.preventDefault();
      } else if (key === KEY_DONE) {
        this.doneButton.click();
        e.preventDefault();
      }
    }
  }

  private wireCueCopy(): void {
    const button = must(this.cue.querySelector<HTMLButtonElement>('#cue-copy'));
    const quote = must(this.cue.querySelector('q'));
    const line = quote.textContent ?? '';
    button.addEventListener('click', async () => {
      const ok = await copyText(line);
      if (!ok) {
        selectContents(quote); // clipboard blocked: at least hand them the selection
        button.focus({ preventScroll: true }); // selecting text drops focus; keep the keyboard here
      }
      button.textContent = ok ? CUE_COPIED : CUE_COPY_FAILED;
      setTimeout(() => (button.textContent = CUE_COPY), CUE_FEEDBACK_MS);
    });
  }

  /** Armed indicator: hint under the box, pressed state on the button. */
  private showArmed(): void {
    const text = this.heckleInput.value.trim();
    this.heckleHint.hidden = text === '';
    this.heckleHint.textContent = text === '' ? '' : `${ARMED_HINT} "${text}"`;
    this.heckleButton.setAttribute('aria-pressed', String(text !== ''));
  }
}

/** Clipboard API first; execCommand for embedded browsers that block it. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const scratch = document.createElement('textarea');
    scratch.value = text;
    scratch.setAttribute('readonly', '');
    scratch.style.position = 'fixed';
    scratch.style.opacity = '0';
    document.body.appendChild(scratch);
    scratch.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    scratch.remove();
    return ok;
  }
}

function selectContents(el: Element): void {
  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** Small key label inside a button; screen readers get the hint from the title instead. */
function keycap(key: string): HTMLElement {
  const kbd = document.createElement('kbd');
  kbd.textContent = key;
  kbd.setAttribute('aria-hidden', 'true');
  return kbd;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

function must<T>(el: T | null): T {
  if (!el) {
    throw new Error('HUD element missing');
  }
  return el;
}

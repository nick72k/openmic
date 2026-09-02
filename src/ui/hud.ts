import { MAX_HECKLE_LENGTH, MAX_SCORE, MIN_SCORE } from '../show/types';

const RATING_LABELS: Readonly<Record<number, string>> = {
  1: 'Boo',
  2: '. . .',
  3: 'Heh',
  4: 'Ha!',
  5: 'HAHA',
};

const HECKLE_LABEL = 'Heckle!';
const ARMED_HINT = 'Goes out with your reaction:';

/**
 * Caption + rating row. Emits scores; owns no show logic.
 *
 *   [Boo] [. . .] [Heh] [Ha!] [HAHA] [Heckle!]
 *   ┌ type a shout, then pick a reaction ─┐   <- shown by Heckle!, sent with the score
 */
export class Hud {
  private caption: HTMLElement;
  private rating: HTMLElement;
  private heckleRow: HTMLElement;
  private heckleInput: HTMLInputElement;
  private heckleHint: HTMLElement;
  private heckleButton: HTMLButtonElement | null = null;
  private curtainCall: HTMLElement;

  constructor(
    root: HTMLElement,
    onScore: (score: number, heckle?: string) => void,
    onEncore: () => void,
    onDone: () => void,
  ) {
    this.caption = must(root.querySelector('#caption'));
    this.rating = must(root.querySelector('#rating'));
    this.heckleRow = must(root.querySelector('#heckle'));
    this.heckleInput = must(this.heckleRow.querySelector('input'));
    this.heckleHint = must(this.heckleRow.querySelector('.hint'));
    this.heckleInput.maxLength = MAX_HECKLE_LENGTH;
    this.heckleInput.addEventListener('input', () => this.showArmed());
    this.curtainCall = must(root.querySelector('#curtain-call'));
    must(root.querySelector<HTMLButtonElement>('#encore')).addEventListener('click', onEncore);
    must(root.querySelector<HTMLButtonElement>('#done')).addEventListener('click', onDone);

    for (let s = MIN_SCORE; s <= MAX_SCORE; s++) {
      const button = document.createElement('button');
      button.textContent = RATING_LABELS[s];
      button.dataset.score = String(s);
      button.addEventListener('click', () => onScore(s, this.heckleInput.value));
      this.rating.appendChild(button);
    }

    const heckle = document.createElement('button');
    heckle.textContent = HECKLE_LABEL;
    heckle.dataset.heckle = '';
    heckle.setAttribute('aria-pressed', 'false');
    heckle.addEventListener('click', () => this.toggleHeckle());
    this.rating.appendChild(heckle);
    this.heckleButton = heckle;

    this.hideRating();
    this.hideEncore();
    this.setCaption('');
  }

  /** Empty text hides the dialog box. */
  setCaption(text: string): void {
    this.caption.textContent = text;
    this.caption.hidden = text === '';
  }

  showRating(): void {
    this.rating.hidden = false;
  }

  hideRating(): void {
    this.rating.hidden = true;
    this.heckleRow.hidden = true;
    this.heckleInput.value = '';
    this.showArmed();
  }

  private toggleHeckle(): void {
    this.heckleRow.hidden = !this.heckleRow.hidden;
    if (!this.heckleRow.hidden) {
      this.heckleInput.focus();
    }
  }

  showEncore(): void {
    this.curtainCall.hidden = false;
  }

  hideEncore(): void {
    this.curtainCall.hidden = true;
  }

  /** Armed indicator: hint under the box, pressed state on the button. */
  private showArmed(): void {
    const text = this.heckleInput.value.trim();
    this.heckleHint.hidden = text === '';
    this.heckleHint.textContent = text === '' ? '' : `${ARMED_HINT} "${text}"`;
    this.heckleButton?.setAttribute('aria-pressed', String(text !== ''));
  }
}

function must<T>(el: T | null): T {
  if (!el) {
    throw new Error('HUD element missing');
  }
  return el;
}

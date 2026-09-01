import { MAX_HECKLE_LENGTH, MAX_SCORE, MIN_SCORE } from '../show/types';

const RATING_LABELS: Readonly<Record<number, string>> = {
  1: 'Boo',
  2: 'Meh',
  3: 'Heh',
  4: 'Ha!',
  5: 'HAHA',
};

const HECKLE_LABEL = 'Heckle!';

/**
 * Caption + rating row. Emits scores; owns no show logic.
 *
 *   [Boo] [Meh] [Heh] [Ha!] [HAHA] [Heckle!]
 *   ┌ type a shout, then pick a reaction ─┐   <- shown by Heckle!, sent with the score
 */
export class Hud {
  private caption: HTMLElement;
  private rating: HTMLElement;
  private heckleRow: HTMLElement;
  private heckleInput: HTMLInputElement;
  private encore: HTMLButtonElement;

  constructor(
    root: HTMLElement,
    onScore: (score: number, heckle?: string) => void,
    onEncore: () => void,
  ) {
    this.caption = must(root.querySelector('#caption'));
    this.rating = must(root.querySelector('#rating'));
    this.heckleRow = must(root.querySelector('#heckle'));
    this.heckleInput = must(this.heckleRow.querySelector('input'));
    this.heckleInput.maxLength = MAX_HECKLE_LENGTH;
    this.encore = must(root.querySelector<HTMLButtonElement>('#encore'));
    this.encore.addEventListener('click', onEncore);

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
    heckle.addEventListener('click', () => this.toggleHeckle());
    this.rating.appendChild(heckle);

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
  }

  private toggleHeckle(): void {
    this.heckleRow.hidden = !this.heckleRow.hidden;
    if (!this.heckleRow.hidden) {
      this.heckleInput.focus();
    }
  }

  showEncore(): void {
    this.encore.hidden = false;
  }

  hideEncore(): void {
    this.encore.hidden = true;
  }
}

function must<T>(el: T | null): T {
  if (!el) {
    throw new Error('HUD element missing');
  }
  return el;
}

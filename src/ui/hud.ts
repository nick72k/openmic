import { MAX_SCORE, MIN_SCORE } from '../show/types';

const RATING_LABELS: Readonly<Record<number, string>> = {
  1: 'Boo',
  2: 'Meh',
  3: 'Heh',
  4: 'Ha!',
  5: 'HAHA',
};

/** Caption + rating buttons. Emits scores; owns no show logic. */
export class Hud {
  private caption: HTMLElement;
  private rating: HTMLElement;
  private encore: HTMLButtonElement;

  constructor(root: HTMLElement, onScore: (score: number) => void, onEncore: () => void) {
    this.caption = must(root.querySelector('#caption'));
    this.rating = must(root.querySelector('#rating'));
    this.encore = must(root.querySelector<HTMLButtonElement>('#encore'));
    this.encore.addEventListener('click', onEncore);

    for (let s = MIN_SCORE; s <= MAX_SCORE; s++) {
      const button = document.createElement('button');
      button.textContent = RATING_LABELS[s];
      button.dataset.score = String(s);
      button.addEventListener('click', () => onScore(s));
      this.rating.appendChild(button);
    }

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

import type { SetResult } from '../show/types';

const TITLE_LATEST = "Tonight's set";
const SET_LABEL = 'Set';

/** Centered modal summarising the night, shown when the user presses Done. */
export class Scoreboard {
  private root: HTMLElement;
  private score: HTMLElement;
  private sets: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.score = must(root.querySelector('.big-score'));
    this.sets = must(root.querySelector('.sets'));
    must(root.querySelector<HTMLButtonElement>('#scoreboard-close')).addEventListener('click', () =>
      this.close(),
    );
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.close();
      }
    });
  }

  /** Latest set big, the whole night listed underneath. */
  open(history: readonly SetResult[]): void {
    const latest = history[history.length - 1];
    this.score.textContent = latest ? fmt(latest.average) : '-';

    this.sets.replaceChildren(
      ...history.map((set, i) => {
        const li = document.createElement('li');
        li.textContent = `${SET_LABEL} ${i + 1}: ${fmt(set.average)}`;
        return li;
      }),
    );

    this.root.hidden = false;
    this.root.querySelector<HTMLButtonElement>('#scoreboard-close')?.focus();
  }

  close(): void {
    this.root.hidden = true;
  }
}

function fmt(average: number): string {
  return `${(Math.round(average * 10) / 10).toFixed(1)} / 5`;
}

function must<T>(el: T | null): T {
  if (!el) {
    throw new Error(`Scoreboard element missing (${TITLE_LATEST})`);
  }
  return el;
}

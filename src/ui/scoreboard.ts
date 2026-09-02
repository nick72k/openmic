import type { SetResult } from '../show/types';

const TITLE_LATEST = "Tonight's set";
const SET_LABEL = 'Set';

/** Centered modal summarising the night, shown when the user presses Done. */
export class Scoreboard {
  private root: HTMLElement;
  private score: HTMLElement;
  private sets: HTMLElement;
  private onClose: (() => void) | null = null;

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

  /** Latest set big, the whole night listed underneath. Resolves when closed. */
  open(history: readonly SetResult[]): Promise<void> {
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

    return new Promise((resolve) => {
      this.onClose = resolve;
    });
  }

  close(): void {
    if (this.root.hidden) {
      return;
    }
    this.root.hidden = true;
    const done = this.onClose;
    this.onClose = null;
    done?.();
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

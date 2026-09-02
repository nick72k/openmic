export enum LoadStep {
  Stage = 'stage',
  Sound = 'sound',
  Voice = 'voice',
}

/** Share of the single bar each step owns; the voice download is the long pole. */
const WEIGHT_BY_STEP: Readonly<Record<LoadStep, number>> = {
  [LoadStep.Stage]: 0.25,
  [LoadStep.Sound]: 0.15,
  [LoadStep.Voice]: 0.6,
};

const LABEL_BY_STEP: Readonly<Record<LoadStep, string>> = {
  [LoadStep.Stage]: 'setting the stage',
  [LoadStep.Sound]: 'sound check',
  [LoadStep.Voice]: 'warming up the voice',
};

/**
 * One loading bar under the marquee, swapped for the Enter button when done.
 * The click doubles as the gesture browsers require before audio may play.
 */
export class LoadingScreen {
  private root: HTMLElement;
  private bar: HTMLElement;
  private fill: HTMLElement;
  private note: HTMLElement;
  private enter: HTMLButtonElement;
  private progress = new Map<LoadStep, number>();
  private failures: string[] = [];

  constructor(root: HTMLElement) {
    this.root = root;
    this.bar = must(root.querySelector('#load-bar'));
    this.fill = must(this.bar.querySelector('.fill'));
    this.note = must(root.querySelector('#load-note'));
    this.enter = must(root.querySelector<HTMLButtonElement>('#enter'));

    for (const step of Object.values(LoadStep)) {
      this.progress.set(step, 0);
    }
    this.render();
  }

  /** fraction 0..1. */
  setProgress(step: LoadStep, fraction: number): void {
    this.progress.set(step, Math.min(1, Math.max(0, fraction)));
    this.render();
  }

  /** Step could not complete but the show can go on. */
  fail(step: LoadStep, note: string): void {
    this.failures.push(note);
    this.setProgress(step, 1);
  }

  waitForEnter(): Promise<void> {
    this.bar.hidden = true;
    this.note.textContent = this.failures.join(' · ');
    this.note.hidden = this.failures.length === 0;
    this.enter.hidden = false;
    this.enter.focus();

    return new Promise((resolve) => {
      this.enter.addEventListener('click', () => resolve(), { once: true });
    });
  }

  hide(): void {
    this.root.hidden = true;
  }

  /** Back from the club: no loading to do, straight to the Enter button. */
  reopen(): Promise<void> {
    this.root.hidden = false;
    return this.waitForEnter();
  }

  private render(): void {
    let total = 0;
    let current: LoadStep | null = null;

    for (const step of Object.values(LoadStep)) {
      const fraction = this.progress.get(step) ?? 0;
      total += fraction * WEIGHT_BY_STEP[step];
      if (current === null && fraction < 1) {
        current = step;
      }
    }

    const percent = Math.round(total * 100);
    this.fill.style.width = `${percent}%`;
    this.note.textContent = current ? `Loading ${percent}% · ${LABEL_BY_STEP[current]}` : `Loading ${percent}%`;
  }
}

function must<T>(el: T | null): T {
  if (!el) {
    throw new Error('Loading element missing');
  }
  return el;
}

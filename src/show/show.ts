import { Latch } from './latch';
import {
  EncoreDecision,
  JOKES_PER_SET,
  MAX_HECKLE_LENGTH,
  MAX_SCORE,
  MIN_SCORE,
  REACTION_BY_SCORE,
  Reaction,
  ShowPhase,
  type Joke,
  type SetResult,
  type Verdict,
} from './types';

export interface ShowEvents {
  phase: (phase: ShowPhase) => void;
  joke: (joke: Joke) => void;
  verdict: (verdict: Verdict) => void;
  intro: (text: string) => void | Promise<void>;
  outro: (text: string) => void | Promise<void>;
  ended: (result: SetResult) => void;
}

type Listener<K extends keyof ShowEvents> = ShowEvents[K];

/**
 * Domain state machine. Knows nothing about MCP, Three.js or DOM.
 *
 *   Idle -> Intro -> [Telling -> AwaitingScore -> Reacting]*5 -> Outro -> Idle
 *
 * Presentation layers subscribe to events; the MCP layer drives transitions.
 */
export class Show {
  private phase = ShowPhase.Idle;
  private jokes: Joke[] = [];
  private scores: number[] = [];
  private verdict = new Latch<Verdict>();
  private ready = new Latch<true>(); // fires once the joke has been read out
  private encore = new Latch<EncoreDecision>();
  private listeners: { [K in keyof ShowEvents]: Listener<K>[] } = {
    phase: [],
    joke: [],
    verdict: [],
    intro: [],
    outro: [],
    ended: [],
  };

  on<K extends keyof ShowEvents>(event: K, fn: Listener<K>): void {
    this.listeners[event].push(fn);
  }

  getPhase(): ShowPhase {
    return this.phase;
  }

  jokesRemaining(): number {
    return JOKES_PER_SET - this.jokes.length;
  }

  /** Resolves once presentation layers have finished the walk-on and greeting. */
  begin(intro: string): Promise<void> {
    if (this.phase !== ShowPhase.Idle) {
      throw new Error(`Cannot begin during ${this.phase}`);
    }

    this.jokes = [];
    this.scores = [];
    this.encore.reset();
    this.setPhase(ShowPhase.Entering);
    return this.emit('intro', intro).then(() => this.setPhase(ShowPhase.Intro));
  }

  /** Delivers the joke. Returns immediately; poll with awaitVerdict. */
  tellJoke(text: string): void {
    if (this.phase !== ShowPhase.Intro && this.phase !== ShowPhase.Reacting) {
      throw new Error(`Cannot tell a joke during ${this.phase}`);
    }

    if (this.jokesRemaining() <= 0) {
      throw new Error('Set is over. Call end.');
    }

    const joke: Joke = { index: this.jokes.length, text };
    this.jokes.push(joke);
    this.verdict.reset();
    this.ready.reset();

    this.setPhase(ShowPhase.Telling);
    this.emit('joke', joke);
  }

  /**
   * Verdict for the current joke, or null if the audience is still deciding
   * after timeoutMs (or the caller aborted). Bounded so agent hosts don't
   * mistake a slow audience for a hung tool.
   */
  awaitVerdict(timeoutMs: number, signal?: AbortSignal): Promise<Verdict | null> {
    return this.verdict.wait(timeoutMs, signal);
  }

  /** Audience calls for more. Only meaningful between sets. */
  requestEncore(): void {
    this.decide(EncoreDecision.More);
  }

  /** The user closes the night; waiting agents are released. */
  endNight(): void {
    this.decide(EncoreDecision.Done);
  }

  /** The crowd's decision, or null after timeoutMs or abort. */
  awaitEncore(timeoutMs: number, signal?: AbortSignal): Promise<EncoreDecision | null> {
    return this.encore.wait(timeoutMs, signal);
  }

  private decide(decision: EncoreDecision): void {
    if (this.phase !== ShowPhase.Idle) {
      return;
    }
    this.encore.fire(decision);
  }

  /** Called by UI once the caption has been read out. */
  readyForScore(): void {
    if (this.phase === ShowPhase.Telling) {
      this.setPhase(ShowPhase.AwaitingScore);
      this.ready.fire(true);
    }
  }

  /**
   * True once the current joke has been read out and the crowd can react;
   * false after timeoutMs or abort. Lets a tool spend its wait on the
   * audience instead of on the comic's own delivery.
   */
  async awaitReady(timeoutMs: number, signal?: AbortSignal): Promise<boolean> {
    return (await this.ready.wait(timeoutMs, signal)) === true;
  }

  /** Called by UI when the audience presses a button, optionally shouting something. */
  score(value: number, heckle?: string): void {
    if (this.phase !== ShowPhase.AwaitingScore) {
      return;
    }

    const clamped = Math.min(MAX_SCORE, Math.max(MIN_SCORE, Math.round(value)));
    this.applyScore(clamped, cleanHeckle(heckle));
  }

  /** Resolves once presentation layers have finished the exit. */
  async end(outro: string): Promise<void> {
    if (this.phase !== ShowPhase.Reacting && this.phase !== ShowPhase.Intro) {
      throw new Error(`Cannot end during ${this.phase}`);
    }

    this.setPhase(ShowPhase.Outro);
    await this.emit('outro', outro);
    this.setPhase(ShowPhase.Idle);
    await this.emit('ended', this.setResult());
  }

  private setResult(): SetResult {
    const scores = [...this.scores];
    const total = scores.reduce((a, b) => a + b, 0);
    return { scores, average: scores.length === 0 ? 0 : total / scores.length };
  }

  private applyScore(score: number, heckle: string | undefined): Verdict {
    this.scores.push(score);
    const verdict: Verdict = {
      score,
      reaction: REACTION_BY_SCORE[score] ?? Reaction.Chuckles,
      ...(heckle ? { heckle } : {}),
      jokesTold: this.jokes.length,
      jokesRemaining: this.jokesRemaining(),
    };

    this.setPhase(ShowPhase.Reacting);
    this.emit('verdict', verdict);
    this.verdict.fire(verdict);

    return verdict;
  }

  private setPhase(phase: ShowPhase): void {
    this.phase = phase;
    this.emit('phase', phase);
  }

  private async emit<K extends keyof ShowEvents>(
    event: K,
    ...args: Parameters<ShowEvents[K]>
  ): Promise<void> {
    const results = this.listeners[event].map((fn) =>
      (fn as (...a: Parameters<ShowEvents[K]>) => void | Promise<void>)(...args),
    );
    await Promise.all(results);
  }
}

function cleanHeckle(raw: string | undefined): string | undefined {
  const heckle = raw?.replace(/\s+/g, ' ').trim().slice(0, MAX_HECKLE_LENGTH);
  return heckle ? heckle : undefined;
}

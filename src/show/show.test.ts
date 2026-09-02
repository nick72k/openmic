import { afterEach, describe, expect, it, vi } from 'vitest';
import { Show } from './show';
import { EncoreDecision, MAX_HECKLE_LENGTH, Reaction } from './types';

const WAIT_MS = 1000;

async function showMidSet(): Promise<Show> {
  const show = new Show();
  await show.begin('hi');
  show.tellJoke('a joke');
  show.readyForScore();
  return show;
}

afterEach(() => vi.useRealTimers());

describe('Show verdict wait', () => {
  it('tellJoke returns without waiting for the audience', async () => {
    const show = new Show();
    await show.begin('hi');

    expect(show.tellJoke('a joke')).toBeUndefined();
  });

  it('awaitVerdict gives up after the bound', async () => {
    vi.useFakeTimers();
    const show = await showMidSet();

    const pending = show.awaitVerdict(WAIT_MS);
    await vi.advanceTimersByTimeAsync(WAIT_MS);

    expect(await pending).toBeNull();
  });

  it('awaitVerdict resolves when scored in time', async () => {
    const show = await showMidSet();

    const pending = show.awaitVerdict(WAIT_MS);
    show.score(5);

    expect(await pending).toMatchObject({ score: 5, reaction: Reaction.Uproar });
  });

  it('awaitVerdict returns an already-given verdict', async () => {
    const show = await showMidSet();
    show.score(1);

    expect(await show.awaitVerdict(WAIT_MS)).toMatchObject({ score: 1 });
  });

  it('awaitVerdict stops on abort', async () => {
    const show = await showMidSet();
    const controller = new AbortController();

    const pending = show.awaitVerdict(WAIT_MS, controller.signal);
    controller.abort();

    expect(await pending).toBeNull();
  });
});

describe('Show entering', () => {
  it('rejects a joke while the walk-on and greeting are still running', async () => {
    const show = new Show();
    let finishIntro = (): void => {};
    show.on('intro', () => new Promise<void>((resolve) => (finishIntro = resolve)));

    const entering = show.begin('hi');
    expect(() => show.tellJoke('too soon')).toThrow();

    finishIntro();
    await entering;
    expect(() => show.tellJoke('on time')).not.toThrow();
  });
});

describe('Show encore', () => {
  async function endedShow(): Promise<Show> {
    const show = new Show();
    await show.begin('hi');
    await show.end('bye');
    return show;
  }

  it('fires ended after end', async () => {
    const show = new Show();
    let ended = false;
    show.on('ended', () => {
      ended = true;
    });
    await show.begin('hi');
    await show.end('bye');

    expect(ended).toBe(true);
  });

  it('awaitEncore gives up after the bound', async () => {
    vi.useFakeTimers();
    const show = await endedShow();

    const pending = show.awaitEncore(WAIT_MS);
    await vi.advanceTimersByTimeAsync(WAIT_MS);

    expect(await pending).toBeNull();
  });

  it('awaitEncore resolves when the crowd asks', async () => {
    const show = await endedShow();

    const pending = show.awaitEncore(WAIT_MS);
    show.requestEncore();

    expect(await pending).toBe(EncoreDecision.More);
  });

  it('endNight resolves the wait with done', async () => {
    const show = await endedShow();

    const pending = show.awaitEncore(WAIT_MS);
    show.endNight();

    expect(await pending).toBe(EncoreDecision.Done);
  });

  it('a new set clears the encore request', async () => {
    vi.useFakeTimers();
    const show = await endedShow();
    show.requestEncore();
    await show.begin('again');

    const pending = show.awaitEncore(WAIT_MS);
    await vi.advanceTimersByTimeAsync(WAIT_MS);

    expect(await pending).toBeNull();
  });

  it('ignores encore requests mid-set', async () => {
    vi.useFakeTimers();
    const show = new Show();
    await show.begin('hi');
    show.requestEncore();
    show.endNight();

    const pending = show.awaitEncore(WAIT_MS);
    await vi.advanceTimersByTimeAsync(WAIT_MS);

    expect(await pending).toBeNull();
  });
});

describe('Show heckle', () => {
  it('attaches a trimmed heckle to the verdict', async () => {
    const show = await showMidSet();

    const pending = show.awaitVerdict(WAIT_MS);
    show.score(2, '   Get off!  ');

    expect(await pending).toMatchObject({ score: 2, heckle: 'Get off!' });
  });

  it('caps heckle length and drops empty ones', async () => {
    const show = await showMidSet();
    const pending = show.awaitVerdict(WAIT_MS);
    show.score(3, 'x'.repeat(500));
    const verdict = await pending;

    expect(verdict?.heckle?.length).toBe(MAX_HECKLE_LENGTH);

    const quiet = await showMidSet();
    const pendingQuiet = quiet.awaitVerdict(WAIT_MS);
    quiet.score(3, '   ');

    expect((await pendingQuiet)?.heckle).toBeUndefined();
  });
});

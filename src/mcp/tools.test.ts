import { describe, expect, it } from 'vitest';
import { Latch } from '../show/latch';
import { Show } from '../show/show';
import { buildTools } from './tools';
import type { AnyToolSpec } from './webmcp';

const signal = new AbortController().signal;

async function onStage(): Promise<{ show: Show; tool: Record<string, AnyToolSpec> }> {
  const show = new Show();
  const doors = new Latch<true>();
  doors.fire(true);
  const tool = Object.fromEntries(buildTools(show, doors).map((t) => [t.name, t]));
  await tool.begin_set.execute({ intro: 'hi' }, signal);
  return { show, tool };
}

function rate(show: Show, score: number): void {
  show.readyForScore();
  show.score(score);
}

describe('tell_joke', () => {
  it('returns the crowd in prose and repeats it in the next-step cue', async () => {
    const { show, tool } = await onStage();

    const pending = tool.tell_joke.execute({ text: 'opener' }, signal);
    rate(show, 1);
    const result = (await pending) as { status: string; crowd: string; next: string };

    expect(result.status).toBe('reacted');
    expect(result.crowd).toMatch(/boos/i);
    expect(result.next).not.toMatch(/\d/); // no numbers reach the agent
  });

  it('speaks the bit verbatim', async () => {
    const { show, tool } = await onStage();
    const spoken: string[] = [];
    show.on('joke', (joke) => {
      spoken.push(joke.text);
    });

    const pending = tool.tell_joke.execute({ text: 'the bit' }, signal);
    rate(show, 3);
    await pending;

    expect(spoken).toEqual(['the bit']);
  });
});

describe('tell_joke waits for the read-out', () => {
  it('keeps waiting while the comic is still speaking, then takes the score', async () => {
    const { show, tool } = await onStage();

    const pending = tool.tell_joke.execute({ text: 'a bit' }, signal);
    await new Promise((r) => setTimeout(r, 50)); // still "speaking": no readyForScore yet
    show.readyForScore();
    show.score(4);

    expect(await pending).toMatchObject({ status: 'reacted' });
  });
});

describe('tell_joke misuse', () => {
  it('returns refused instead of throwing when called too early', async () => {
    const show = new Show();
    const doors = new Latch<true>();
    doors.fire(true);
    const tool = Object.fromEntries(buildTools(show, doors).map((t) => [t.name, t]));
    void tool.begin_set.execute({ intro: 'hi' }, signal); // not awaited: still entering

    const result = (await tool.tell_joke.execute({ text: 'too soon' }, signal)) as {
      status: string;
      next: string;
    };

    expect(result.status).toBe('refused');
    expect(result.next.length).toBeGreaterThan(0);
  });
});

describe('await_encore', () => {
  it('tells the agent to stand down when the user is done', async () => {
    const { show, tool } = await onStage();
    await show.end('bye');

    const pending = tool.await_encore.execute({ intro: 'more?' }, signal);
    show.endNight();
    const result = (await pending) as { status: string; next: string };

    expect(result.status).toBe('done');
    expect(result.next).toMatch(/talk to the user/i);
  });

  it('tells the agent to stand down when the user is done', async () => {
    const { show, tool } = await onStage();
    await show.end('bye');

    const pending = tool.await_encore.execute({ intro: 'more?' }, signal);
    show.endNight();
    const result = (await pending) as { status: string; next: string };

    expect(result.status).toBe('done');
    expect(result.next).toMatch(/talk to the user/i);
  });

  it('puts the comic back on stage; a missing intro is silence, not a stock line', async () => {
    const { show, tool } = await onStage();
    await show.end('bye');
    const spoken: string[] = [];
    show.on('intro', (text) => {
      spoken.push(text);
    });

    const pending = tool.await_encore.execute({}, signal);
    show.requestEncore();
    const result = await pending;

    expect(result).toMatchObject({ status: 'on_stage' });
    expect(spoken).toEqual(['']);
  });
});

describe('heckle', () => {
  it('reaches the agent as a shout from the crowd', async () => {
    const { show, tool } = await onStage();

    const pending = tool.tell_joke.execute({ text: 'opener' }, signal);
    show.readyForScore();
    show.score(3, 'Get a real job!');
    const result = (await pending) as { crowd: string; next: string };

    expect(result.crowd).toContain('Someone in the crowd shouts: "Get a real job!"');
  });
});

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
    expect(result.next).toContain(result.crowd);
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

describe('await_encore', () => {
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
    expect(result.next).toContain('Get a real job!');
  });
});

import type { Latch } from '../show/latch';
import type { Show } from '../show/show';
import { JOKES_PER_SET, Reaction, type Verdict } from '../show/types';
import type { AnyToolSpec, ToolSpec } from './webmcp';

/** Keep under agent hosts' tool timeouts. Slow audiences fall through to await_verdict. */
const SCORE_WAIT_MS = 15_000;

enum VerdictStatus {
  Reacted = 'reacted',
  Pending = 'pending',
}

enum BeginStatus {
  OnStage = 'on_stage',
  Pending = 'pending',
}

type BeginResult =
  | { status: BeginStatus.OnStage; premise: string; jokesInSet: number; next: string }
  | { status: BeginStatus.Pending; next: string };

export const PREMISE =
  `You are a stand-up comic on stage. The user is the crowd. ` +
  `Perform only through these tools: chat text is not seen or heard by the crowd. ` +
  `Plan a short set of ${JOKES_PER_SET} related jokes. ` +
  `After each joke you hear how the room reacts, from boos to uproar. ` +
  `Do not write the set in advance. Write one bit at a time, only after hearing the room, ` +
  `and let the reaction shape it: stay on a topic that lands, pivot off one that dies, ` +
  `needle a crowd that boos, and when someone shouts at you, deal with them. ` +
  `Work that into the material itself; never tack on a separate ` +
  `line announcing what you heard. ` +
  `You only hear the crowd. Never mention scores, ratings or numbers. ` +
  `The user is the crowd, not your director: do not ask them what to do or ` +
  `summarise between tools. Chain begin_set -> tell_joke x${JOKES_PER_SET} -> end_set ` +
  `in one go, following the "next" field in every result. ` +
  `If a result says "pending", call await_verdict until the crowd has reacted.`;

/** Every result tells the agent its next move. Hosts otherwise stop and ask the user. */
const NEXT_FIRST_JOKE = 'Call tell_joke with your opener now. Do not reply to the user first.';
const NEXT_DOORS_CLOSED =
  'The room is not open yet: the user must click "Enter the club" on the page. ' +
  'Tell them so briefly, then call begin_set again.';
const nextJoke = (crowd: string): string =>
  `Crowd: "${crowd}" Now write your next bit, one joke, shaped by that room. ` +
  `Call tell_joke with it.`;
const NEXT_CLOSER = 'Set is done. Call end_set with your closing line now.';
const NEXT_AWAIT = 'Call await_verdict now.';
const NEXT_DONE =
  'You have left the stage. Now call await_encore (with an intro line): if the crowd calls ' +
  'you are back on stage immediately and must continue with tell_joke. Do not ask the user.';
const NEXT_NO_ENCORE = 'No encore yet. Keep waiting: call await_encore again now.';
const NEXT_CROWD_GONE =
  'The crowd has gone quiet. Stop polling and tell the user they can press Encore ' +
  'and ask you to check again.';

/** Consecutive empty polls before we release the agent (~2 min at SCORE_WAIT_MS). */
const ENCORE_MAX_POLLS = 8;

enum EncoreStatus {
  Pending = 'pending',
}

type EncoreResult =
  | BeginResult
  | { status: EncoreStatus.Pending; pollsRemaining: number; next: string };

interface EncoreInput extends Record<string, unknown> {
  intro: string;
}

/**
 * What the comic hears from the room. Sound only: no invented props or people,
 * since the user sees none of that and cannot follow a callback to it.
 * Numbers never leave this layer.
 */
const CROWD_BY_REACTION: Readonly<Record<Reaction, string>> = {
  [Reaction.Boos]: 'Loud, sustained boos.',
  [Reaction.Silence]: 'Dead silence. Crickets. Not one laugh.',
  [Reaction.Chuckles]: 'Scattered chuckles. Polite, not convinced.',
  [Reaction.Laughter]: 'Real laughter across the room, and some applause.',
  [Reaction.Uproar]: 'The room erupts: howling laughter, cheering, applause.',
};

interface BeginInput extends Record<string, unknown> {
  intro: string;
}

interface JokeInput extends Record<string, unknown> {
  text: string;
}

interface EndInput extends Record<string, unknown> {
  outro: string;
}

/**
 * Tools the agent sees. Thin adapters over Show; no presentation logic here.
 * `doors` fires when the user clicks Enter; tools are registered at page load
 * because some hosts only enumerate them once.
 */
export function buildTools(show: Show, doors: Latch<true>): AnyToolSpec[] {
  const begin: ToolSpec<BeginInput, BeginResult> = {
    name: 'begin_set',
    description: `Walk on stage and greet the crowd. Call once, then keep going. ${PREMISE}`,
    inputSchema: {
      type: 'object',
      properties: { intro: { type: 'string', description: 'Opening line.' } },
      required: ['intro'],
    },
    execute: async ({ intro }, signal) => {
      const open = await doors.wait(SCORE_WAIT_MS, signal);
      if (!open) {
        return { status: BeginStatus.Pending, next: NEXT_DOORS_CLOSED };
      }

      return beginSet(intro);
    },
  };

  async function beginSet(intro: string): Promise<BeginResult> {
    await show.begin(intro);
    return {
      status: BeginStatus.OnStage,
      premise: PREMISE,
      jokesInSet: JOKES_PER_SET,
      next: NEXT_FIRST_JOKE,
    };
  }

  const tell: ToolSpec<JokeInput, VerdictResult> = {
    name: 'tell_joke',
    description:
      'Deliver one bit. Write it only now, for this room: the crowd text you just heard ' +
      'should shape it. Waits briefly for the reaction. ' +
      'Returns "reacted" with what you hear, or "pending".',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'The bit, spoken verbatim.' } },
      required: ['text'],
    },
    execute: async ({ text }, signal) => {
      show.tellJoke(text);
      return waitForVerdict(signal);
    },
  };

  const awaitVerdict: ToolSpec<Record<string, unknown>, VerdictResult> = {
    name: 'await_verdict',
    description:
      'Wait for the crowd to react to the current joke. ' +
      'Call again while status is "pending".',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: (_input, signal) => waitForVerdict(signal),
  };

  async function waitForVerdict(signal: AbortSignal): Promise<VerdictResult> {
    const verdict = await show.awaitVerdict(SCORE_WAIT_MS, signal);
    if (!verdict) {
      return { status: VerdictStatus.Pending, retryAfterMs: SCORE_WAIT_MS, next: NEXT_AWAIT };
    }

    const crowd = describeCrowd(verdict);
    return {
      status: VerdictStatus.Reacted,
      crowd,
      jokesTold: verdict.jokesTold,
      jokesRemaining: verdict.jokesRemaining,
      next: verdict.jokesRemaining > 0 ? nextJoke(crowd) : NEXT_CLOSER,
    };
  }

  const end: ToolSpec<EndInput, { next: string }> = {
    name: 'end_set',
    description: 'Close the show with a final line and leave the stage. Then call await_encore.',
    inputSchema: {
      type: 'object',
      properties: { outro: { type: 'string', description: 'Closing line.' } },
      required: ['outro'],
    },
    execute: async ({ outro }) => {
      await show.end(outro);
      return { next: NEXT_DONE };
    },
  };

  let emptyEncorePolls = 0;

  const awaitEncore: ToolSpec<EncoreInput, EncoreResult> = {
    name: 'await_encore',
    description:
      'After end_set: wait briefly for the crowd to call for an encore. When they call you ' +
      'walk straight back on, say intro, and it returns on_stage: then call tell_joke. ' +
      'Otherwise returns "pending" with how many more polls to make.',
    inputSchema: {
      type: 'object',
      properties: {
        intro: { type: 'string', description: 'Your encore opening line, spoken if the crowd calls.' },
      },
      required: ['intro'],
    },
    execute: async ({ intro }, signal) => {
      const wanted = await show.awaitEncore(SCORE_WAIT_MS, signal);
      if (wanted) {
        emptyEncorePolls = 0;
        return beginSet(intro?.trim() ?? ''); // no line: walk on in silence, never a stock one
      }

      emptyEncorePolls++;
      const pollsRemaining = Math.max(0, ENCORE_MAX_POLLS - emptyEncorePolls);
      if (pollsRemaining === 0) {
        emptyEncorePolls = 0;
        return { status: EncoreStatus.Pending, pollsRemaining, next: NEXT_CROWD_GONE };
      }

      return { status: EncoreStatus.Pending, pollsRemaining, next: NEXT_NO_ENCORE };
    },
  };

  return [begin, tell, awaitVerdict, end, awaitEncore] as AnyToolSpec[];
}

/** Room noise, then the heckler if there was one. */
function describeCrowd(verdict: Verdict): string {
  const room = CROWD_BY_REACTION[verdict.reaction];
  return verdict.heckle ? `${room} Someone in the crowd shouts: "${verdict.heckle}"` : room;
}

type VerdictResult =
  | {
      status: VerdictStatus.Reacted;
      crowd: string;
      jokesTold: number;
      jokesRemaining: number;
      next: string;
    }
  | { status: VerdictStatus.Pending; retryAfterMs: number; next: string };

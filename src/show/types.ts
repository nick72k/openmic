/** Number of jokes in one set. Mirrors the premise given to the agent. */
export const JOKES_PER_SET = 5;

export const MIN_SCORE = 1;
export const MAX_SCORE = 5;

/** A shout, not a speech. */
export const MAX_HECKLE_LENGTH = 120;

export enum ShowPhase {
  Idle = 'idle',
  Intro = 'intro',
  Telling = 'telling',
  AwaitingScore = 'awaiting-score',
  Reacting = 'reacting',
  Outro = 'outro',
}

/** Audience response, one per score value. */
export enum Reaction {
  Boos = 'boos',
  Silence = 'silence',
  Chuckles = 'chuckles',
  Laughter = 'laughter',
  Uproar = 'uproar',
}

export const REACTION_BY_SCORE: Readonly<Record<number, Reaction>> = {
  1: Reaction.Boos,
  2: Reaction.Silence,
  3: Reaction.Chuckles,
  4: Reaction.Laughter,
  5: Reaction.Uproar,
};

export interface Joke {
  index: number;
  text: string;
}

/** What the agent receives after the audience rates a joke. */
export interface Verdict {
  score: number;
  reaction: Reaction;
  heckle?: string;
  jokesTold: number;
  jokesRemaining: number;
}

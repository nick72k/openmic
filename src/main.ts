import { Ambience } from './audio/ambience';
import { Crowd } from './audio/crowd';
import { DEFAULT_VOICE_ID, PiperSpeaker } from './audio/piper';
import { RobotFx } from './audio/robotfx';
import { speechBudgetMs } from './audio/text';
import { FallbackSpeaker, WebSpeechSpeaker, type Speaker } from './audio/tts';
import { buildTools } from './mcp/tools';
import { isWebMcpAvailable, registerTools } from './mcp/webmcp';
import { Latch } from './show/latch';
import { Show } from './show/show';
import { Reaction } from './show/types';
import { Stage } from './stage/stage';
import { Channel, MuteControls } from './ui/controls';
import { mountDebugPanel } from './ui/debug';
import { Hud } from './ui/hud';
import { LoadStep, LoadingScreen } from './ui/loading';

/**
 * Wiring.
 *
 *   page load ──► register tools ──► preload stage / sound / voice ──► Enter opens the doors
 *                                        (begin_set waits on the doors latch)
 *
 *   agent ──WebMCP──► mcp/tools ──► show (state) ──events──► stage / audio / hud
 *                                      ▲                              │
 *                                      └──────── score button ────────┘
 */
async function main(): Promise<void> {
  const loading = new LoadingScreen(byId('loading'));
  const show = new Show();
  const stage = new Stage(byId<HTMLCanvasElement>('stage'));
  const hud = new Hud(
    byId('hud'),
    (score, heckle) => show.score(score, heckle),
    () => {
      hud.hideEncore();
      hud.setCaption('Encore! Encore!');
      crowd.play(Reaction.Uproar);
      show.requestEncore();
    },
  );
  const piper = new PiperSpeaker(...voiceOptions());
  const speaker = new FallbackSpeaker(piper, new WebSpeechSpeaker());
  const crowd = new Crowd();
  const ambience = new Ambience();

  new MuteControls(byId('controls'), {
    [Channel.Voice]: speaker,
    [Channel.Ambience]: ambience,
    [Channel.Crowd]: crowd,
  });

  wireShow(show, stage, hud, speaker, crowd, ambience);

  // Marquee first: it is what the audience looks at while everything else loads.
  await stage.openLobby().catch((err) => console.warn('lobby unavailable', err));

  // Register before loading: some hosts list tools once, at page load.
  const doors = new Latch<true>();
  const tools = buildTools(show, doors);
  if (isWebMcpAvailable()) {
    await registerTools(tools);
  } else {
    mountDebugPanel(byId('debug'), tools);
  }

  await Promise.all([
    track(loading, LoadStep.Stage, stage.init(), 'Stage failed to load'),
    track(loading, LoadStep.Sound, Promise.all([ambience.preload(), crowd.preload()]), 'Some sounds missing'),
    warmUpVoice(loading, piper),
  ]);

  await loading.waitForEnter();
  loading.hide();

  stage.start();
  ambience.start();
  doors.fire(true);
}

function wireShow(
  show: Show,
  stage: Stage,
  hud: Hud,
  speaker: Speaker,
  crowd: Crowd,
  ambience: Ambience,
): void {
  show.on('intro', async (text) => {
    hud.hideEncore();
    ambience.duck();
    await stage.walkOn();
    if (text === '') {
      return; // walked on without a line
    }
    hud.setCaption(text);
    await say(speaker, text);
  });

  show.on('joke', async (joke) => {
    hud.hideRating();
    hud.setCaption(joke.text);
    stage.startTalking();
    await say(speaker, joke.text);
    show.readyForScore();
    hud.showRating();
  });

  show.on('verdict', async (verdict) => {
    hud.hideRating();
    stage.react(verdict.reaction);
    await crowd.play(verdict.reaction);
  });

  show.on('outro', async (text) => {
    hud.setCaption(text);
    stage.startTalking();
    await say(speaker, text);
    await stage.bow();
    hud.setCaption('');
    ambience.restore();
    await stage.walkOff();
  });

  show.on('ended', () => hud.showEncore());
}

/** The show must go on: speech that fails or overruns its budget is cut, never awaited forever. */
async function say(speaker: Speaker, text: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      console.warn('speech overran its budget; moving on');
      speaker.stop();
      resolve();
    }, speechBudgetMs(text));
  });

  try {
    await Promise.race([speaker.speak(text), budget]);
  } catch (err) {
    console.warn('speech failed; moving on', err);
  } finally {
    clearTimeout(timer);
  }
}

/** Indeterminate step: bar jumps to full on completion; failure is noted, not fatal. */
async function track(loading: LoadingScreen, step: LoadStep, work: Promise<unknown>, failNote: string): Promise<void> {
  try {
    await work;
    loading.setProgress(step, 1);
  } catch (err) {
    console.warn(`${step}:`, err);
    loading.fail(step, failNote);
  }
}

/** Piper's first run downloads ~63 MB; Web Speech covers the gap if it fails. */
async function warmUpVoice(loading: LoadingScreen, piper: PiperSpeaker): Promise<void> {
  const started = performance.now();
  try {
    await piper.warmUp((fraction) => loading.setProgress(LoadStep.Voice, fraction));
    loading.setProgress(LoadStep.Voice, 1);
    console.info(`piper: ready in ${Math.round((performance.now() - started) / 1000)}s`);
  } catch (err) {
    console.warn('Piper unavailable, staying on Web Speech', err);
    loading.fail(LoadStep.Voice, 'Using browser voice');
  }
}

/** ?voice=<piper id> and ?fx=off let you audition voices without a rebuild. */
function voiceOptions(): [string, RobotFx | null] {
  const params = new URLSearchParams(location.search);
  const voiceId = params.get('voice') ?? DEFAULT_VOICE_ID;
  const fx = params.get('fx') === 'off' ? null : new RobotFx();
  return [voiceId, fx];
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`#${id} missing`);
  }
  return el as T;
}

main().catch(console.error);

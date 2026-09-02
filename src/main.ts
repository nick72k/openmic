import { Ambience } from './audio/ambience';
import { Crowd } from './audio/crowd';
import { DEFAULT_VOICE_ID, PiperSpeaker } from './audio/piper';
import { RobotFx } from './audio/robotfx';
import { speechBudgetMs } from './audio/text';
import { FallbackSpeaker, WebSpeechSpeaker, type Speaker } from './audio/tts';
import { buildTools } from './mcp/tools';
import { ToolMeter } from './mcp/meter';
import { isWebMcpAvailable, metered, registerTools } from './mcp/webmcp';
import { Latch } from './show/latch';
import { Show } from './show/show';
import { Reaction, type SetResult } from './show/types';
import { Stage } from './stage/stage';
import { Channel, MuteControls } from './ui/controls';
import { mountDebugPanel } from './ui/debug';
import { Blackout, blackout } from './ui/fade';
import { Hud } from './ui/hud';
import { LoadStep, LoadingScreen } from './ui/loading';
import { Scoreboard } from './ui/scoreboard';

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
    () => {
      hud.hideEncore();
      show.endNight();
      scoreboard.open(history).then(() => leave?.());
    },
  );
  const scoreboard = new Scoreboard(byId('scoreboard'));
  const history = loadScores();
  let leave: (() => void) | null = null; // resolved when the scoreboard closes after Done
  const piper = new PiperSpeaker(...voiceOptions());
  const speaker = new FallbackSpeaker(piper, new WebSpeechSpeaker());
  const crowd = new Crowd();
  const ambience = new Ambience();

  new MuteControls(byId('controls'), {
    [Channel.Voice]: speaker,
    [Channel.Ambience]: ambience,
    [Channel.Crowd]: crowd,
  });

  wireShow(show, stage, hud, speaker, crowd, ambience, history, scoreboard);

  // Marquee first: it is what the audience looks at while everything else loads.
  await stage.openLobby().catch((err) => console.warn('lobby unavailable', err));

  // Register before loading: some hosts list tools once, at page load.
  const doors = new Latch<true>();
  const tools = withMeter(buildTools(show, doors));
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

  // A reload mid-show (dev server, host re-navigation) must not demand a second Enter.
  if (enteredThisSession()) {
    console.info('resuming: page reloaded after Enter');
  } else {
    await loading.waitForEnter();
    rememberEntered();
  }

  // Club loop: Enter -> show(s) -> Done -> scores -> Close -> lobby -> Enter ...
  for (;;) {
    loading.hide();
    stage.start();
    ambience.start();
    doors.fire(true);
    hud.showCue();

    await new Promise<void>((resolve) => {
      leave = resolve;
    });
    leave = null;

    await blackout(Blackout.In);
    await ambience.stop();
    hud.setCaption('');
    hud.hideRating();
    hud.hideEncore();
    hud.hideCue();
    stage.returnToLobby();
    doors.reset();
    forgetEntered();
    const reentry = loading.reopen();
    await blackout(Blackout.Out);
    await reentry;
    rememberEntered();
  }
}

const ENTERED_KEY = 'openmic.entered';
const SCORES_KEY = 'openmic.scores';

function loadScores(): SetResult[] {
  try {
    const raw = sessionStorage.getItem(SCORES_KEY);
    return raw ? (JSON.parse(raw) as SetResult[]) : [];
  } catch {
    return [];
  }
}

function saveScores(history: SetResult[]): void {
  try {
    sessionStorage.setItem(SCORES_KEY, JSON.stringify(history));
  } catch {
    // storage unavailable; scores last for this page only
  }
}

function enteredThisSession(): boolean {
  try {
    return sessionStorage.getItem(ENTERED_KEY) === '1';
  } catch {
    return false;
  }
}

function forgetEntered(): void {
  try {
    sessionStorage.removeItem(ENTERED_KEY);
  } catch {
    // storage unavailable
  }
}

function rememberEntered(): void {
  try {
    sessionStorage.setItem(ENTERED_KEY, '1');
  } catch {
    // storage unavailable; the next reload asks again
  }
}

function wireShow(
  show: Show,
  stage: Stage,
  hud: Hud,
  speaker: Speaker,
  crowd: Crowd,
  ambience: Ambience,
  history: SetResult[],
  scoreboard: Scoreboard,
): void {
  show.on('intro', async (text) => {
    hud.hideCue();
    hud.hideEncore();
    scoreboard.close();
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

  show.on('ended', (result) => {
    history.push(result);
    saveScores(history);
    hud.showEncore();
  });
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

/** ?meter shows what the page feeds the agent: calls, result bytes, a rough token figure. */
function withMeter(tools: ReturnType<typeof buildTools>): ReturnType<typeof buildTools> {
  if (!new URLSearchParams(location.search).has('meter')) {
    return tools;
  }
  const meter = new ToolMeter();
  const el = byId('meter');
  el.hidden = false;
  meter.onChange((t) => {
    el.textContent =
      `calls ${t.calls} · results ${(t.resultBytes / 1024).toFixed(1)}k · ` +
      `schemas ${(t.schemaBytes / 1024).toFixed(1)}k · ~${t.approxTokens.toLocaleString()} tok`;
  });
  return metered(tools, meter);
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

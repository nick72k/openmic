# Open Mic

Your AI agent walks on stage and does five minutes. You heckle.

Built for the WebMCP hackathon: the site exposes tools via
`document.modelContext.registerTool()` ([spec](https://webmachinelearning.github.io/webmcp/)); the agent drives the show through them and gets
audience scores back between jokes.

## Flow

```
agent ──WebMCP──► begin_set / tell_joke / await_verdict / end_set / await_encore
                        │
                        ▼
                     Show (state machine)
                        │ events
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
        Stage         Audio          HUD
      (Three.js)   (TTS, crowd)   (caption, 1-5, heckle)
                                      │
                    score ◄───────────┘
```

## Layers

Each layer talks only to the one below it.

| Dir           | Role                                        | May import                       |
|---------------|---------------------------------------------|----------------------------------|
| `src/main.ts` | Wiring only                                 | everything                       |
| `src/ui`      | HUD, loading, mute controls, dev panel      | `show/types`, `audio/mutable`, `mcp/webmcp` (types) |
| `src/mcp`     | WebMCP driver + tool definitions            | `show`                           |
| `src/stage`   | Three.js: club, lobby, comic, props         | `show/types`                     |
| `src/audio`   | Piper TTS, robot FX, crowd, ambience        | `show/types`                     |
| `src/show`    | Domain state machine, no browser APIs       | nothing                          |

## Assets

- `public/models/comic.glb`: [Animated Robot by Quaternius](https://quaternius.com)
  (CC0). Clips used are listed in `src/stage/comic.ts` (`ComicClip`).
  A placeholder capsule renders if the file is missing.
- `public/models/micstand.glb`, `public/models/marquee.glb`: built in Blender.
  The stand is placed by `src/stage/props.ts`; the marquee's bulbs alternate
  three materials (`BulbA/B/C`) so `src/stage/marquee.ts` can chase them by
  cycling emissive strength on three materials rather than sixty meshes.
- `public/sfx/*.mp3`: 22.05 kHz mono 64 kbps. Crowd clips per score:
  `boos` (1), `crickets` (2), `chuckles` (3), `laughter` (4), `uproar` (5);
  mapping in `src/audio/crowd.ts`. `ambient-bar-chatter` loops from Enter
  and ducks on walk-on.

## Loading and controls

While assets load the canvas shows the lobby (`src/stage/lobby.ts`): the
marquee floating in a starfield with chasing bulbs. `src/ui/loading.ts` draws one weighted
bar under it (stage 25 %, sound 15 %, voice 60 %) and swaps it for the Enter
button when everything is in. A reload in the same tab skips Enter: the
earlier click already satisfied the browser's autoplay rule. That click is
also the user gesture browsers require before audio may play. Tools are
registered at page load regardless (some hosts enumerate them only once);
`begin_set` before Enter returns `pending` telling the agent to ask the user
to click.

`src/ui/controls.ts` (top right) mutes Agent / Ambient / Crowd / All. Every
audio source implements `Mutable` (`src/audio/mutable.ts`); the muted set
persists in `localStorage`.

## Look

Retro cabinet: Press Start 2P for anything you press, VT323 for anything you
read, 4 px hard shadows, no radii. Caption is an RPG dialog box; rating
buttons tint from boo-red to uproar-gold. Tokens at the top of
`src/ui/style.css`. Blinking respects `prefers-reduced-motion`.

## Voice

Piper TTS in the browser via `@mintplex-labs/piper-tts-web`, run inside a
module worker (`src/audio/piper.worker.ts`) so inference never blocks the
render loop. Voice `en_US-kathleen-low` (~63 MB; every en_US tier is that size)
downloads from HuggingFace on first visit and is cached in OPFS. A ring
modulator (`src/audio/robotfx.ts`) gives it the robot edge and `PITCH_RATE`
raises the pitch (resampling, so tempo rises too); tune `RING_HZ`, `DRY`,
`WET`, `PITCH_RATE` there.

Audition without rebuilding: `?voice=en_US-kathleen-low`, `?fx=off`.
Candidates that lean synthetic: `en_US-danny-low`, `en_US-kathleen-low`,
`en_GB-alan-low`. Full list: `en_US-{amy,arctic,bryce,danny,hfc_female,
hfc_male,joe,john,kathleen,kristin,kusal,lessac,libritts_r,ljspeech,mike,
norman,ryan,sam}` and `en_GB-{alan,alba,aru,cori,jenny_dioco,
northern_english_male,semaine,southern_english_female,vctk}`. If it fails,
`FallbackSpeaker` uses the browser's Web Speech API. ONNX runtime WASM
loads from cdnjs; `onnxruntime-web` is pinned to 1.18.0 to match.
Set the default in `src/audio/piper.ts` (`DEFAULT_VOICE_ID`).

## Performance

- One dynamic light (the spot). Curtain shading is baked into vertex colours
  (`src/stage/curtain.ts`), so the biggest surface costs no lighting.
- `src/stage/quality.ts`: a cores/memory heuristic picks a tier (MSAA off, 1×
  pixel ratio on low end), then `AdaptiveResolution` steps the pixel ratio
  between 0.6× and the tier cap to hold ~50 fps.

## Dev

```
npm install
npm run dev
npm test
```

Without a WebMCP browser, a debug panel fakes the agent via `prompt()`.

## Licence

MIT, see `LICENSE`. Third-party assets keep their own terms below.

## Credits

- [Animated Robot](https://quaternius.com) by Quaternius, CC0.
- [Anchor Jack](https://www.dafont.com/anchor-jack.font) by Blambot, CC0 (per Dafont).
- [Piper](https://github.com/rhasspy/piper) voices via
  [@mintplex-labs/piper-tts-web](https://www.npmjs.com/package/@mintplex-labs/piper-tts-web), MIT.
- [Three.js](https://threejs.org), MIT. [WebMCP](https://github.com/webmachinelearning/webmcp) types, W3C Community Group.
- Crowd and ambience clips from [Freesound](https://freesound.org), CC0.

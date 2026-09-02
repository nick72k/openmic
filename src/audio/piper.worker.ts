/**
 * Runs Piper inference off the main thread so synthesis never stalls the render loop.
 *
 *   main ──{init}──────────► worker: download voice, create session
 *        ◄──{progress}*──── 
 *        ◄──{ready}────────
 *   main ──{synth id,text}► worker: predict
 *        ◄──{audio id,wav}─  (ArrayBuffer transferred)
 */
import { HF_BASE, TtsSession, type Progress } from '@mintplex-labs/piper-tts-web';

/**
 * Everything the voice needs is served from our own origin under /vendor
 * (see README, "Voice"): the ONNX runtime, the phonemizer, and the voice
 * model. The library only exposes the WASM paths, so voice downloads are
 * redirected by wrapping fetch: the HuggingFace base becomes /vendor/voices.
 */
const VENDOR = `${self.location.origin}/vendor`;
const WASM_PATHS = {
  onnxWasm: `${VENDOR}/ort/`,
  piperData: `${VENDOR}/piper/piper_phonemize.data`,
  piperWasm: `${VENDOR}/piper/piper_phonemize.wasm`,
};
const VOICE_BASE = `${VENDOR}/voices`;

const upstreamFetch = self.fetch.bind(self);
self.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith(HF_BASE)) {
    return upstreamFetch(VOICE_BASE + url.slice(HF_BASE.length), init);
  }
  return upstreamFetch(input, init);
};

export type WorkerRequest =
  | { type: 'init'; voiceId: string }
  | { type: 'synth'; id: number; text: string };

export type WorkerResponse =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready' }
  | { type: 'error'; id?: number; message: string }
  | { type: 'audio'; id: number; wav: ArrayBuffer };

const port = self as unknown as Worker;
let session: TtsSession | null = null;

function post(msg: WorkerResponse, transfer: Transferable[] = []): void {
  port.postMessage(msg, transfer);
}

function onProgress(progress: Progress): void {
  if (!progress.url.endsWith('.onnx')) {
    return; // the JSON config is tiny; only the model is worth reporting
  }
  post({ type: 'progress', loaded: progress.loaded, total: progress.total });
}

async function init(voiceId: string): Promise<void> {
  session = await TtsSession.create({ voiceId, progress: onProgress, wasmPaths: WASM_PATHS });
  post({ type: 'ready' });
}

async function synth(id: number, text: string): Promise<void> {
  if (!session) {
    post({ type: 'error', id, message: 'Session not ready' });
    return;
  }

  const wav = await (await session.predict(text)).arrayBuffer();
  post({ type: 'audio', id, wav }, [wav]);
}

port.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;

  try {
    if (msg.type === 'init') {
      await init(msg.voiceId);
      return;
    }
    await synth(msg.id, msg.text);
  } catch (err) {
    const id = msg.type === 'synth' ? msg.id : undefined;
    post({ type: 'error', id, message: err instanceof Error ? err.message : String(err) });
  }
};

/**
 * Runs Piper inference off the main thread so synthesis never stalls the render loop.
 *
 *   main ──{init}──────────► worker: download voice, create session
 *        ◄──{progress}*──── 
 *        ◄──{ready}────────
 *   main ──{synth id,text}► worker: predict
 *        ◄──{audio id,wav}─  (ArrayBuffer transferred)
 */
import { TtsSession, type Progress } from '@mintplex-labs/piper-tts-web';

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
  session = await TtsSession.create({ voiceId, progress: onProgress });
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

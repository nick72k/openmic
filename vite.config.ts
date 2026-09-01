import { defineConfig } from 'vite';

export default defineConfig({
  // Module worker (src/audio/piper.worker.ts) needs ES output; Vite defaults to IIFE.
  worker: { format: 'es' },
});

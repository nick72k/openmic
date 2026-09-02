/**
 * Driver for the WebMCP API (document.modelContext).
 * Types come from webmcp-types, which tracks the spec at
 * https://github.com/webmachinelearning/webmcp. Only this file touches the raw API.
 */

import type { ToolMeter } from './meter';

export interface ToolSpec<TInput extends Record<string, unknown>, TOutput> {
  name: string;
  description: string;
  inputSchema: object;
  annotations?: WebMCP.ToolAnnotations;
  execute: (input: TInput, signal: AbortSignal) => Promise<TOutput>;
}

export type AnyToolSpec = ToolSpec<Record<string, unknown>, unknown>;

export function isWebMcpAvailable(): boolean {
  return typeof document !== 'undefined' && document.modelContext !== undefined;
}

export async function registerTools(tools: AnyToolSpec[]): Promise<void> {
  const ctx = document.modelContext;
  if (!ctx) {
    throw new Error('WebMCP unavailable');
  }

  await Promise.all(tools.map((t) => ctx.registerTool(toModelContextTool(t))));
}

/** Wrap each tool so every call's result size is counted. */
export function metered(tools: AnyToolSpec[], meter: ToolMeter): AnyToolSpec[] {
  return tools.map((t) => {
    meter.recordSchema({ name: t.name, description: t.description, inputSchema: t.inputSchema });
    return {
      ...t,
      execute: async (input, signal) => {
        const result = await t.execute(input, signal);
        meter.recordCall(result);
        return result;
      },
    };
  });
}

function toModelContextTool(spec: AnyToolSpec): WebMCP.ModelContextTool {
  return {
    name: spec.name,
    description: spec.description,
    inputSchema: spec.inputSchema,
    annotations: spec.annotations,
    execute: (input, { signal }) => spec.execute(input, signal),
  };
}

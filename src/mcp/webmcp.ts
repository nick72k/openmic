/**
 * Driver for the WebMCP API (document.modelContext).
 * Types come from webmcp-types, which tracks the spec at
 * https://github.com/webmachinelearning/webmcp. Only this file touches the raw API.
 */

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

function toModelContextTool(spec: AnyToolSpec): WebMCP.ModelContextTool {
  return {
    name: spec.name,
    description: spec.description,
    inputSchema: spec.inputSchema,
    annotations: spec.annotations,
    execute: (input, { signal }) => spec.execute(input, signal),
  };
}

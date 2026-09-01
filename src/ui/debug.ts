import type { AnyToolSpec } from '../mcp/webmcp';

/**
 * Fake agent for browsers without WebMCP. One button per tool, prompt() for input.
 * Dev only. Never touch Show directly; go through the same tools the agent uses.
 */
export function mountDebugPanel(root: HTMLElement, tools: AnyToolSpec[]): void {
  root.hidden = false;

  const title = document.createElement('strong');
  title.textContent = 'No WebMCP — manual agent';
  root.appendChild(title);

  for (const tool of tools) {
    const button = document.createElement('button');
    button.textContent = tool.name;
    button.addEventListener('click', () => invoke(tool));
    root.appendChild(button);
  }
}

async function invoke(tool: AnyToolSpec): Promise<void> {
  const props = (tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
  const input: Record<string, string> = {};

  for (const key of Object.keys(props)) {
    input[key] = window.prompt(`${tool.name}.${key}`) ?? '';
  }

  try {
    const result = await tool.execute(input, new AbortController().signal);
    console.info(`[${tool.name}]`, JSON.stringify(result));
  } catch (err) {
    console.warn(`[${tool.name}]`, err);
  }
}

/** Rough context cost of what the page hands the agent. ~4 bytes per token for English JSON. */
const BYTES_PER_TOKEN = 4;

export interface MeterTotals {
  calls: number;
  resultBytes: number;
  schemaBytes: number;
  approxTokens: number;
}

export class ToolMeter {
  private calls = 0;
  private resultBytes = 0;
  private schemaBytes = 0;
  private listeners: ((t: MeterTotals) => void)[] = [];

  onChange(fn: (t: MeterTotals) => void): void {
    this.listeners.push(fn);
  }

  /** Tool descriptions and schemas ride along with every model turn. */
  recordSchema(spec: { name: string; description: string; inputSchema: object }): void {
    this.schemaBytes += JSON.stringify(spec).length;
    this.emit();
  }

  recordCall(result: unknown): void {
    this.calls++;
    this.resultBytes += JSON.stringify(result ?? null).length;
    this.emit();
  }

  totals(): MeterTotals {
    // Each turn re-reads the schemas plus everything said so far; results are
    // read once per later turn, so the true figure grows with call count.
    const perTurn = this.schemaBytes;
    const history = this.resultBytes;
    const approxBytes = this.calls * perTurn + history * Math.max(1, this.calls / 2);
    return {
      calls: this.calls,
      resultBytes: this.resultBytes,
      schemaBytes: this.schemaBytes,
      approxTokens: Math.round(approxBytes / BYTES_PER_TOKEN),
    };
  }

  private emit(): void {
    const t = this.totals();
    this.listeners.forEach((fn) => fn(t));
  }
}

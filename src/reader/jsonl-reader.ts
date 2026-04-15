import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { RawJMessage } from '../types.js';

export interface JsonlReadResult {
  messages: RawJMessage[];
  errorCount: number;
}

// Async generator that yields RawJMessage objects from a JSONL file.
// Skips empty lines. Malformed JSON lines increment the provided counter
// and are skipped with a stderr warning.
export async function* readJsonlFile(
  filePath: string,
  errors?: { count: number }
): AsyncGenerator<RawJMessage> {
  const fileStream = createReadStream(filePath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as RawJMessage;
      yield parsed;
    } catch {
      if (errors) errors.count++;
    }
  }
}

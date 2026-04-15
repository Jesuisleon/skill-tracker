import { describe, it, expect } from 'vitest';
import { readJsonlFile } from './jsonl-reader.js';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '../../fixtures');

describe('readJsonlFile', () => {
  it('yields valid JSON lines as objects', async () => {
    const messages: unknown[] = [];
    for await (const msg of readJsonlFile(join(FIXTURES, 'sample.jsonl'))) {
      messages.push(msg);
    }
    // sample.jsonl has 6 non-empty lines: 1 snapshot, 1 user, 1 assistant, 1 MALFORMED, 1 user, 1 assistant
    // MALFORMED is skipped → 5 valid objects
    expect(messages.length).toBe(5);
  });

  it('yields objects with expected types', async () => {
    const messages: Array<{ type: string }> = [];
    for await (const msg of readJsonlFile(join(FIXTURES, 'sample.jsonl'))) {
      messages.push(msg as { type: string });
    }
    const types = messages.map(m => m.type);
    expect(types).toContain('user');
    expect(types).toContain('assistant');
    expect(types).toContain('file-history-snapshot');
  });

  it('skips empty lines without error', async () => {
    const messages: unknown[] = [];
    for await (const msg of readJsonlFile(join(FIXTURES, 'sample.jsonl'))) {
      messages.push(msg);
    }
    expect(messages.length).toBeGreaterThan(0);
  });

  it('counts parse errors via the errors counter', async () => {
    const errors = { count: 0 };
    const messages: unknown[] = [];
    for await (const msg of readJsonlFile(join(FIXTURES, 'sample.jsonl'), errors)) {
      messages.push(msg);
    }
    expect(messages.length).toBe(5);
    // The MALFORMED line should count as 1 error
    expect(errors.count).toBe(1);
  });

  it('first user message has correct structure', async () => {
    const messages: unknown[] = [];
    for await (const msg of readJsonlFile(join(FIXTURES, 'sample.jsonl'))) {
      messages.push(msg);
    }
    const userMsg = messages.find((m: unknown) => (m as { type: string }).type === 'user');
    expect(userMsg).toBeDefined();
    expect((userMsg as { sessionId: string }).sessionId).toBe('sess-1');
  });
});

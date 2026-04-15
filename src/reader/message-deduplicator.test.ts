import { describe, it, expect } from 'vitest';
import { deduplicateMessages } from './message-deduplicator.js';
import type { RawJMessage } from '../types.js';

async function collect(msgs: RawJMessage[]): Promise<RawJMessage[]> {
  const results: RawJMessage[] = [];
  async function* gen() {
    for (const m of msgs) yield m;
  }
  for await (const m of deduplicateMessages(gen())) {
    results.push(m);
  }
  return results;
}

function makeAssistant(id: string, outputTokens: number, stopReason: string | null = 'end_turn'): RawJMessage {
  return {
    type: 'assistant',
    message: {
      id,
      role: 'assistant',
      content: [{ type: 'text', text: 'hello' }],
      usage: {
        input_tokens: 100,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: outputTokens,
      },
      stop_reason: stopReason,
    },
    uuid: `uuid-${id}-${outputTokens}`,
    timestamp: '2026-04-01T10:00:00.000Z',
    sessionId: 'sess-1',
  };
}

function makeUser(id: string): RawJMessage {
  return {
    type: 'user',
    message: { role: 'user', content: 'hello' },
    uuid: id,
    timestamp: '2026-04-01T10:00:00.000Z',
    sessionId: 'sess-1',
  };
}

describe('deduplicateMessages', () => {
  it('passes through unique messages without modification', async () => {
    const input = [
      makeUser('u1'),
      makeAssistant('msg-1', 50),
      makeUser('u2'),
      makeAssistant('msg-2', 75),
    ];
    const output = await collect(input);
    expect(output.length).toBe(4);
  });

  it('collapses duplicate assistant message.ids, keeping last', async () => {
    const input = [
      makeAssistant('msg-1', 10, null),   // fragment 1
      makeAssistant('msg-1', 20, null),   // fragment 2
      makeAssistant('msg-1', 50, 'end_turn'), // final
    ];
    const output = await collect(input);
    expect(output.length).toBe(1);
    expect(output[0].message?.usage?.output_tokens).toBe(50);
  });

  it('flushes buffered assistant when user message arrives', async () => {
    const input = [
      makeAssistant('msg-1', 10, null),
      makeAssistant('msg-1', 50, 'end_turn'),
      makeUser('u2'),
    ];
    const output = await collect(input);
    expect(output.length).toBe(2);
    expect(output[0].type).toBe('assistant');
    expect(output[0].message?.usage?.output_tokens).toBe(50);
    expect(output[1].type).toBe('user');
  });

  it('flushes buffered message at end of stream', async () => {
    const input = [
      makeAssistant('msg-1', 10, null),
      makeAssistant('msg-1', 50, null), // interrupted, no final
    ];
    const output = await collect(input);
    expect(output.length).toBe(1);
    expect(output[0].message?.usage?.output_tokens).toBe(50);
  });

  it('handles multiple distinct assistant messages in sequence', async () => {
    const input = [
      makeAssistant('msg-1', 10, null),
      makeAssistant('msg-1', 50, 'end_turn'),
      makeAssistant('msg-2', 20, null),
      makeAssistant('msg-2', 80, 'end_turn'),
    ];
    const output = await collect(input);
    expect(output.length).toBe(2);
    expect(output[0].message?.usage?.output_tokens).toBe(50);
    expect(output[1].message?.usage?.output_tokens).toBe(80);
  });

  it('passes non-assistant/user messages through immediately', async () => {
    const snapshot: RawJMessage = { type: 'file-history-snapshot' };
    const input = [
      snapshot,
      makeUser('u1'),
      makeAssistant('msg-1', 50),
    ];
    const output = await collect(input);
    expect(output.length).toBe(3);
    expect(output[0].type).toBe('file-history-snapshot');
  });
});

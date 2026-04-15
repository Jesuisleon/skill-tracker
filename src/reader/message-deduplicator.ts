import type { RawJMessage } from '../types.js';

// Async generator that deduplicates assistant messages by message.id.
// Claude Code sometimes emits multiple fragments for the same message.id
// (intermediate streaming chunks with stop_reason: null).
// Last-wins strategy: the last fragment with a given message.id is kept.
//
// Flushing rules:
// - User messages and non-assistant messages pass through immediately (after flushing buffer)
// - When a NEW assistant message.id arrives, flush the buffered one first
// - At end of stream, flush any remaining buffered assistant message
export async function* deduplicateMessages(
  source: AsyncIterable<RawJMessage>
): AsyncGenerator<RawJMessage> {
  let buffered: RawJMessage | null = null;
  let bufferedId: string | null = null;

  for await (const msg of source) {
    const isAssistant = msg.type === 'assistant';
    const msgId = isAssistant ? msg.message?.id ?? null : null;

    if (isAssistant && msgId !== null) {
      if (bufferedId === msgId) {
        // Same message.id: overwrite with latest (last-wins)
        buffered = msg;
      } else {
        // New message.id: flush the previously buffered one first
        if (buffered !== null) {
          yield buffered;
        }
        buffered = msg;
        bufferedId = msgId;
      }
    } else {
      // Non-assistant or assistant without id: flush buffer first, then pass through
      if (buffered !== null) {
        yield buffered;
        buffered = null;
        bufferedId = null;
      }
      yield msg;
    }
  }

  // Flush remaining buffered message at end of stream
  if (buffered !== null) {
    yield buffered;
  }
}

import { basename, dirname } from 'node:path';
import { readJsonlFile } from '../reader/jsonl-reader.js';
import { deduplicateMessages } from '../reader/message-deduplicator.js';
import { detectSkill } from './skill-detector.js';
import { detectAgents } from './agent-detector.js';
import { extractText, totalInput } from '../types.js';
import type { AttributedSession, TurnUsage, AgentSpawn, ContentBlock } from '../types.js';

export interface AttributionResult {
  session: AttributedSession;
  parseErrors: number;
}

// Process a single JSONL session file and return attributed token data.
export async function attributeSession(filePath: string): Promise<AttributionResult> {
  const skillTurns = new Map<string, TurnUsage[]>();
  const agentSpawns: AgentSpawn[] = [];
  const skillsSet = new Set<string>();
  const contextAtSkillStart = new Map<string, number>();
  const errors = { count: 0 };

  let currentSkill = 'no-skill';
  let sessionId: string | null = null;
  let project: string | null = null;
  let date: string | null = null;
  // P1: track the last seen context size (totalInput of last assistant turn)
  let lastContextSize = 0;

  const stream = deduplicateMessages(readJsonlFile(filePath, errors));

  for await (const msg of stream) {
    // Only process user and assistant types
    if (msg.type !== 'user' && msg.type !== 'assistant') continue;

    // Extract session metadata from first message with cwd
    if (msg.cwd && project === null) {
      project = basename(msg.cwd);
    }
    if (msg.sessionId && sessionId === null) {
      sessionId = msg.sessionId;
    }
    if (msg.timestamp && date === null && /^\d{4}-\d{2}-\d{2}/.test(msg.timestamp)) {
      date = msg.timestamp.slice(0, 10); // YYYY-MM-DD
    }

    if (msg.type === 'user') {
      const content = msg.message?.content;
      const text = extractText(content);
      const detected = detectSkill(text);
      if (detected !== null) {
        currentSkill = detected;
        skillsSet.add(currentSkill);
        // P1: record context size at skill start (only first time per skill)
        if (!contextAtSkillStart.has(currentSkill)) {
          contextAtSkillStart.set(currentSkill, lastContextSize);
        }
      }
    } else if (msg.type === 'assistant') {
      const usage = msg.message?.usage;
      if (usage) {
        // NaN guard: default to 0 for non-numeric values from untrusted JSONL
        const turn: TurnUsage = {
          input_tokens: Number(usage.input_tokens) || 0,
          cache_creation_input_tokens: Number(usage.cache_creation_input_tokens) || 0,
          cache_read_input_tokens: Number(usage.cache_read_input_tokens) || 0,
          output_tokens: Number(usage.output_tokens) || 0,
          timestamp: msg.timestamp,
        };
        let existing = skillTurns.get(currentSkill);
        if (!existing) {
          existing = [];
          skillTurns.set(currentSkill, existing);
        }
        existing.push(turn);

        // P1: update last context size (totalInput = full context window for this turn)
        lastContextSize = totalInput(turn);
      }

      // Detect agent spawns
      const content = msg.message?.content;
      if (Array.isArray(content)) {
        const spawns = detectAgents(content as ContentBlock[], currentSkill, msg.timestamp);
        agentSpawns.push(...spawns);
      }
    }
  }

  // Fallback: derive sessionId from file path
  if (sessionId === null) {
    const fileName = basename(filePath);
    sessionId = fileName.replace('.jsonl', '');
  }
  if (project === null) {
    const parentDir = basename(dirname(filePath));
    const parts = parentDir.split('-').filter(Boolean);
    project = parts.length >= 2
      ? parts.slice(-2).join('-')
      : parts[0] ?? parentDir;
  }
  if (date === null) {
    date = 'unknown';
  }

  return {
    session: {
      sessionId,
      project,
      date,
      skillTurns,
      agentSpawns,
      skillsInvoked: [...skillsSet],
      contextAtSkillStart,
    },
    parseErrors: errors.count,
  };
}

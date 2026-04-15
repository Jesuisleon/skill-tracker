import type {
  AttributedSession,
  SkillMetrics,
  AgentMetrics,
  SessionMetrics,
} from '../types.js';
import { totalInput, estimateCostUsd } from '../types.js';

// Aggregate skill metrics across all sessions.
export function aggregateSkillMetrics(
  sessions: AttributedSession[],
  sort: 'tokens' | 'count' | 'cost' = 'tokens'
): SkillMetrics[] {
  const map = new Map<string, {
    invocationCount: number;
    turnCount: number;
    totalInput: number;
    totalOutput: number;
    maxInput: number;
    maxOutput: number;
    sessionIds: Set<string>;
    lastUsed: string;
    costUsd: number;
    // P1: delta tracking
    deltaInput: number;
    // P2: breakdown
    cacheRead: number;
    cacheCreation: number;
    rawInput: number;
  }>();

  for (const session of sessions) {
    const invokedSet = new Set(session.skillsInvoked);

    for (const [skillName, turns] of session.skillTurns) {
      let entry = map.get(skillName);
      if (!entry) {
        entry = {
          invocationCount: 0,
          turnCount: 0,
          totalInput: 0,
          totalOutput: 0,
          maxInput: 0,
          maxOutput: 0,
          sessionIds: new Set(),
          lastUsed: session.date,
          costUsd: 0,
          deltaInput: 0,
          cacheRead: 0,
          cacheCreation: 0,
          rawInput: 0,
        };
        map.set(skillName, entry);
      }

      if (skillName !== 'no-skill' && invokedSet.has(skillName)) {
        entry.invocationCount++;
      } else if (skillName === 'no-skill') {
        entry.invocationCount += turns.length;
      }

      entry.sessionIds.add(session.sessionId);
      if (session.date > entry.lastUsed) entry.lastUsed = session.date;

      // P1: compute delta for this skill in this session
      const ctxStart = session.contextAtSkillStart.get(skillName) ?? 0;
      const lastTurn = turns[turns.length - 1];
      const ctxEnd = lastTurn ? totalInput(lastTurn) : ctxStart;
      entry.deltaInput += Math.max(0, ctxEnd - ctxStart);

      for (const turn of turns) {
        entry.turnCount++;
        const inp = totalInput(turn);
        const out = turn.output_tokens;
        entry.totalInput += inp;
        entry.totalOutput += out;
        if (inp > entry.maxInput) entry.maxInput = inp;
        if (out > entry.maxOutput) entry.maxOutput = out;
        // P0: cost
        entry.costUsd += estimateCostUsd(turn);
        // P2: breakdown
        entry.cacheRead += turn.cache_read_input_tokens;
        entry.cacheCreation += turn.cache_creation_input_tokens;
        entry.rawInput += turn.input_tokens;
      }
    }
  }

  const results: SkillMetrics[] = [];
  for (const [name, entry] of map) {
    results.push({
      name,
      invocationCount: entry.invocationCount,
      totalInputTokens: entry.totalInput,
      totalOutputTokens: entry.totalOutput,
      avgInputTokens: entry.turnCount > 0 ? Math.round(entry.totalInput / entry.turnCount) : 0,
      avgOutputTokens: entry.turnCount > 0 ? Math.round(entry.totalOutput / entry.turnCount) : 0,
      maxInputTokens: entry.maxInput,
      maxOutputTokens: entry.maxOutput,
      sessionsUsedIn: entry.sessionIds.size,
      lastUsed: entry.lastUsed,
      estimatedCostUsd: entry.costUsd,
      deltaInputTokens: entry.deltaInput,
      cacheReadTokens: entry.cacheRead,
      cacheCreationTokens: entry.cacheCreation,
      rawInputTokens: entry.rawInput,
    });
  }

  if (sort === 'tokens') {
    results.sort((a, b) => (b.totalInputTokens + b.totalOutputTokens) - (a.totalInputTokens + a.totalOutputTokens));
  } else if (sort === 'cost') {
    results.sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);
  } else {
    results.sort((a, b) => b.invocationCount - a.invocationCount);
  }

  return results;
}

// Aggregate agent metrics across all sessions.
export function aggregateAgentMetrics(sessions: AttributedSession[]): AgentMetrics[] {
  const map = new Map<string, {
    spawnCount: number;
    sessionIds: Set<string>;
    lastUsed: string;
  }>();

  for (const session of sessions) {
    for (const spawn of session.agentSpawns) {
      let entry = map.get(spawn.name);
      if (!entry) {
        entry = {
          spawnCount: 0,
          sessionIds: new Set(),
          lastUsed: session.date,
        };
        map.set(spawn.name, entry);
      }
      entry.spawnCount++;
      entry.sessionIds.add(session.sessionId);
      if (session.date > entry.lastUsed) entry.lastUsed = session.date;
    }
  }

  const results: AgentMetrics[] = [];
  for (const [name, entry] of map) {
    results.push({
      name,
      spawnCount: entry.spawnCount,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      avgInputTokens: 0,
      avgOutputTokens: 0,
      sessionsUsedIn: entry.sessionIds.size,
      lastUsed: entry.lastUsed,
    });
  }

  results.sort((a, b) => b.spawnCount - a.spawnCount);
  return results;
}

// Aggregate per-session metrics.
export function aggregateSessionMetrics(sessions: AttributedSession[]): SessionMetrics[] {
  const results: SessionMetrics[] = [];

  for (const session of sessions) {
    let sessionTotalInput = 0;
    let sessionTotalOutput = 0;
    let turnCount = 0;
    let sessionCost = 0;

    for (const turns of session.skillTurns.values()) {
      for (const turn of turns) {
        sessionTotalInput += totalInput(turn);
        sessionTotalOutput += turn.output_tokens;
        turnCount++;
        sessionCost += estimateCostUsd(turn);
      }
    }

    const agentNames = [...new Set(session.agentSpawns.map(s => s.name))];

    results.push({
      sessionId: session.sessionId,
      project: session.project,
      date: session.date,
      skills: session.skillsInvoked,
      agents: agentNames,
      totalInputTokens: sessionTotalInput,
      totalOutputTokens: sessionTotalOutput,
      turnCount,
      estimatedCostUsd: sessionCost,
    });
  }

  results.sort((a, b) => b.date.localeCompare(a.date));
  return results;
}

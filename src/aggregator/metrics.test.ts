import { describe, it, expect } from 'vitest';
import { aggregateSkillMetrics, aggregateAgentMetrics, aggregateSessionMetrics } from './metrics.js';
import type { AttributedSession, TurnUsage, AgentSpawn } from '../types.js';

function makeTurn(input: number, cacheCreate: number, cacheRead: number, output: number): TurnUsage {
  return {
    input_tokens: input,
    cache_creation_input_tokens: cacheCreate,
    cache_read_input_tokens: cacheRead,
    output_tokens: output,
  };
}

function makeSession(
  sessionId: string,
  date: string,
  skills: Map<string, TurnUsage[]>,
  agents: AgentSpawn[] = [],
  skillsInvoked: string[] = []
): AttributedSession {
  return {
    sessionId,
    project: 'test-project',
    date,
    skillTurns: skills,
    agentSpawns: agents,
    skillsInvoked: skillsInvoked.length > 0 ? skillsInvoked : [...skills.keys()].filter(k => k !== 'no-skill'),
    contextAtSkillStart: new Map(),
  };
}

describe('aggregateSkillMetrics', () => {
  it('returns empty array for empty sessions', () => {
    expect(aggregateSkillMetrics([])).toEqual([]);
  });

  it('correctly computes total tokens', () => {
    const sessions = [
      makeSession('s1', '2026-04-01', new Map([
        ['dev-features', [makeTurn(100, 50, 200, 80)]],
      ]), [], ['dev-features']),
    ];
    const metrics = aggregateSkillMetrics(sessions);
    const df = metrics.find(m => m.name === 'dev-features')!;
    expect(df.totalInputTokens).toBe(100 + 50 + 200); // 350
    expect(df.totalOutputTokens).toBe(80);
  });

  it('correctly computes avg tokens', () => {
    const sessions = [
      makeSession('s1', '2026-04-01', new Map([
        ['dev-features', [
          makeTurn(100, 0, 0, 50),
          makeTurn(200, 0, 0, 100),
        ]],
      ]), [], ['dev-features']),
    ];
    const metrics = aggregateSkillMetrics(sessions);
    const df = metrics.find(m => m.name === 'dev-features')!;
    expect(df.avgInputTokens).toBe(150); // (100+200)/2
    expect(df.avgOutputTokens).toBe(75);  // (50+100)/2
  });

  it('correctly computes max tokens (single-turn max)', () => {
    const sessions = [
      makeSession('s1', '2026-04-01', new Map([
        ['dev-features', [
          makeTurn(100, 0, 0, 50),
          makeTurn(500, 0, 0, 200),
          makeTurn(200, 0, 0, 80),
        ]],
      ]), [], ['dev-features']),
    ];
    const metrics = aggregateSkillMetrics(sessions);
    const df = metrics.find(m => m.name === 'dev-features')!;
    expect(df.maxInputTokens).toBe(500);
    expect(df.maxOutputTokens).toBe(200);
  });

  it('counts sessions used in correctly', () => {
    const sessions = [
      makeSession('s1', '2026-04-01', new Map([['dev-features', [makeTurn(100, 0, 0, 50)]]]), [], ['dev-features']),
      makeSession('s2', '2026-04-02', new Map([['dev-features', [makeTurn(200, 0, 0, 100)]]]), [], ['dev-features']),
      makeSession('s3', '2026-04-03', new Map([['plan-and-tasks', [makeTurn(50, 0, 0, 25)]]]), [], ['plan-and-tasks']),
    ];
    const metrics = aggregateSkillMetrics(sessions);
    const df = metrics.find(m => m.name === 'dev-features')!;
    expect(df.sessionsUsedIn).toBe(2);
  });

  it('tracks lastUsed as most recent date', () => {
    const sessions = [
      makeSession('s1', '2026-04-01', new Map([['dev-features', [makeTurn(100, 0, 0, 50)]]]), [], ['dev-features']),
      makeSession('s2', '2026-04-05', new Map([['dev-features', [makeTurn(200, 0, 0, 100)]]]), [], ['dev-features']),
    ];
    const metrics = aggregateSkillMetrics(sessions);
    const df = metrics.find(m => m.name === 'dev-features')!;
    expect(df.lastUsed).toBe('2026-04-05');
  });

  it('sorts by total tokens descending by default', () => {
    const sessions = [
      makeSession('s1', '2026-04-01', new Map([
        ['cheap-skill', [makeTurn(100, 0, 0, 50)]],
        ['expensive-skill', [makeTurn(1000, 0, 0, 500)]],
      ]), [], ['cheap-skill', 'expensive-skill']),
    ];
    const metrics = aggregateSkillMetrics(sessions);
    expect(metrics[0].name).toBe('expensive-skill');
  });

  it('sorts by count when requested', () => {
    const sessions = [
      makeSession('s1', '2026-04-01', new Map([
        ['dev-features', [makeTurn(1000, 0, 0, 500)]],
      ]), [], ['dev-features']),
      makeSession('s2', '2026-04-02', new Map([
        ['plan-and-tasks', [makeTurn(100, 0, 0, 50)]],
      ]), [], ['plan-and-tasks']),
      makeSession('s3', '2026-04-03', new Map([
        ['plan-and-tasks', [makeTurn(100, 0, 0, 50)]],
      ]), [], ['plan-and-tasks']),
    ];
    const metrics = aggregateSkillMetrics(sessions, 'count');
    expect(metrics[0].name).toBe('plan-and-tasks');
    expect(metrics[0].invocationCount).toBe(2);
  });
});

describe('aggregateAgentMetrics', () => {
  it('returns empty array for sessions without agents', () => {
    const sessions = [makeSession('s1', '2026-04-01', new Map())];
    expect(aggregateAgentMetrics(sessions)).toEqual([]);
  });

  it('counts spawns correctly', () => {
    const agents: AgentSpawn[] = [
      { name: 'Explore', skill: 'dev-features' },
      { name: 'Explore', skill: 'dev-features' },
      { name: 'code-reviewer', skill: 'dev-features' },
    ];
    const sessions = [makeSession('s1', '2026-04-01', new Map(), agents)];
    const metrics = aggregateAgentMetrics(sessions);
    const explore = metrics.find(m => m.name === 'Explore')!;
    expect(explore.spawnCount).toBe(2);
    const reviewer = metrics.find(m => m.name === 'code-reviewer')!;
    expect(reviewer.spawnCount).toBe(1);
  });

  it('sorts by spawn count descending by default', () => {
    const agents: AgentSpawn[] = [
      { name: 'rare-agent', skill: 'dev-features' },
      { name: 'common-agent', skill: 'dev-features' },
      { name: 'common-agent', skill: 'dev-features' },
      { name: 'common-agent', skill: 'dev-features' },
    ];
    const sessions = [makeSession('s1', '2026-04-01', new Map(), agents)];
    const metrics = aggregateAgentMetrics(sessions);
    expect(metrics[0].name).toBe('common-agent');
    expect(metrics[0].spawnCount).toBe(3);
  });
});

describe('aggregateSessionMetrics', () => {
  it('returns empty array for empty sessions', () => {
    expect(aggregateSessionMetrics([])).toEqual([]);
  });

  it('computes correct totals per session', () => {
    const sessions = [
      makeSession('s1', '2026-04-01', new Map([
        ['dev-features', [makeTurn(100, 200, 50, 80)]],
        ['no-skill', [makeTurn(50, 0, 0, 25)]],
      ])),
    ];
    const metrics = aggregateSessionMetrics(sessions);
    expect(metrics).toHaveLength(1);
    // Input: (100+200+50) + (50) = 400
    expect(metrics[0].totalInputTokens).toBe(400);
    // Output: 80 + 25 = 105
    expect(metrics[0].totalOutputTokens).toBe(105);
    expect(metrics[0].turnCount).toBe(2);
  });

  it('sorts by date descending (most recent first)', () => {
    const sessions = [
      makeSession('s1', '2026-04-01', new Map()),
      makeSession('s2', '2026-04-05', new Map()),
      makeSession('s3', '2026-04-03', new Map()),
    ];
    const metrics = aggregateSessionMetrics(sessions);
    expect(metrics[0].date).toBe('2026-04-05');
    expect(metrics[1].date).toBe('2026-04-03');
    expect(metrics[2].date).toBe('2026-04-01');
  });

  it('includes agents in session metrics', () => {
    const agents: AgentSpawn[] = [
      { name: 'Explore', skill: 'dev-features' },
      { name: 'Explore', skill: 'dev-features' },
    ];
    const sessions = [makeSession('s1', '2026-04-01', new Map(), agents)];
    const metrics = aggregateSessionMetrics(sessions);
    expect(metrics[0].agents).toEqual(['Explore']); // deduplicated
  });
});

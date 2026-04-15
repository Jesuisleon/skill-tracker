import { describe, it, expect } from 'vitest';
import { parseLast, filterSessionsByDate, aggregateTrends, getDefaultTrends } from './trends.js';
import type { AttributedSession, TurnUsage, AgentSpawn } from '../types.js';

function makeTurn(input: number, output: number): TurnUsage {
  return { input_tokens: input, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: output };
}

function makeSession(id: string, date: string, skillsInvoked: string[] = [], agents: AgentSpawn[] = []): AttributedSession {
  const skillTurns = new Map<string, TurnUsage[]>();
  for (const skill of skillsInvoked) {
    skillTurns.set(skill, [makeTurn(100, 50)]);
  }
  if (skillsInvoked.length === 0) {
    skillTurns.set('no-skill', [makeTurn(50, 25)]);
  }
  return { sessionId: id, project: 'test', date, skillTurns, agentSpawns: agents, skillsInvoked, contextAtSkillStart: new Map() };
}

describe('parseLast', () => {
  it('parses "14d" correctly', () => {
    const today = '2026-04-09';
    expect(parseLast('14d', today)).toBe('2026-03-26');
  });

  it('parses "7d" correctly', () => {
    const today = '2026-04-09';
    expect(parseLast('7d', today)).toBe('2026-04-02');
  });

  it('parses "30d" correctly', () => {
    const today = '2026-04-09';
    expect(parseLast('30d', today)).toBe('2026-03-10');
  });

  it('throws on invalid format', () => {
    expect(() => parseLast('2w')).toThrow();
    expect(() => parseLast('invalid')).toThrow();
  });
});

describe('filterSessionsByDate', () => {
  const sessions = [
    makeSession('s1', '2026-03-01'),
    makeSession('s2', '2026-03-15'),
    makeSession('s3', '2026-04-01'),
    makeSession('s4', '2026-04-09'),
  ];

  it('returns all sessions when no filter', () => {
    expect(filterSessionsByDate(sessions)).toHaveLength(4);
  });

  it('filters by since date (inclusive)', () => {
    const result = filterSessionsByDate(sessions, '2026-04-01');
    expect(result).toHaveLength(2);
    expect(result.map(s => s.sessionId)).toContain('s3');
    expect(result.map(s => s.sessionId)).toContain('s4');
  });

  it('filters by last N days', () => {
    const result = filterSessionsByDate(sessions, undefined, '14d', '2026-04-09');
    // 14 days ago from 2026-04-09 is 2026-03-26
    // s3 (04-01) and s4 (04-09) should be included
    expect(result).toHaveLength(2);
    expect(result.map(s => s.date)).toContain('2026-04-01');
    expect(result.map(s => s.date)).toContain('2026-04-09');
  });

  it('last overrides since when both provided', () => {
    // last should take precedence
    const result = filterSessionsByDate(sessions, '2026-03-01', '7d', '2026-04-09');
    // 7d ago = 2026-04-02, so only s4 (04-09)
    expect(result).toHaveLength(1);
    expect(result[0].sessionId).toBe('s4');
  });
});

describe('aggregateTrends', () => {
  const sessions = [
    makeSession('s1', '2026-04-01', ['dev-features']),
    makeSession('s2', '2026-04-01', ['plan-and-tasks'], [{ name: 'Explore', skill: 'plan-and-tasks' }]),
    makeSession('s3', '2026-04-05', ['dev-features', 'ideate'], [{ name: 'Explore', skill: 'dev-features' }, { name: 'Explore', skill: 'dev-features' }]),
  ];

  it('groups sessions by date', () => {
    const trends = aggregateTrends(sessions);
    expect(trends).toHaveLength(2); // 2026-04-01 and 2026-04-05
  });

  it('counts sessions per day correctly', () => {
    const trends = aggregateTrends(sessions);
    const day1 = trends.find(t => t.date === '2026-04-01')!;
    expect(day1.sessionCount).toBe(2);
    const day5 = trends.find(t => t.date === '2026-04-05')!;
    expect(day5.sessionCount).toBe(1);
  });

  it('counts skill invocations per day', () => {
    const trends = aggregateTrends(sessions);
    const day1 = trends.find(t => t.date === '2026-04-01')!;
    // s1: 1 skill + s2: 1 skill = 2
    expect(day1.skillInvocations).toBe(2);
    const day5 = trends.find(t => t.date === '2026-04-05')!;
    // s3: 2 skills
    expect(day5.skillInvocations).toBe(2);
  });

  it('counts agent spawns per day', () => {
    const trends = aggregateTrends(sessions);
    const day1 = trends.find(t => t.date === '2026-04-01')!;
    expect(day1.agentSpawns).toBe(1); // s2 has 1 spawn
    const day5 = trends.find(t => t.date === '2026-04-05')!;
    expect(day5.agentSpawns).toBe(2); // s3 has 2 spawns
  });

  it('sorts by date ascending', () => {
    const trends = aggregateTrends(sessions);
    expect(trends[0].date).toBe('2026-04-01');
    expect(trends[1].date).toBe('2026-04-05');
  });

  it('sums tokens correctly', () => {
    const trends = aggregateTrends(sessions);
    const day1 = trends.find(t => t.date === '2026-04-01')!;
    // Each session with 1 skill has 1 turn: input=100, output=50
    // day1 has 2 sessions, 1 turn each
    expect(day1.totalInputTokens).toBe(200);
    expect(day1.totalOutputTokens).toBe(100);
  });
});

describe('getDefaultTrends', () => {
  it('returns last 14 days by default', () => {
    const today = '2026-04-09';
    const sessions = [
      makeSession('old', '2026-03-01'),   // too old
      makeSession('recent', '2026-04-01'), // within 14 days
      makeSession('today', '2026-04-09'),
    ];
    const trends = getDefaultTrends(sessions, today);
    const dates = trends.map(t => t.date);
    expect(dates).not.toContain('2026-03-01');
    expect(dates).toContain('2026-04-01');
    expect(dates).toContain('2026-04-09');
  });
});

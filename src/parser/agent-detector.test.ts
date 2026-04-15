import { describe, it, expect } from 'vitest';
import { detectAgents } from './agent-detector.js';
import type { ContentBlock } from '../types.js';

describe('detectAgents', () => {
  it('returns empty array for no content blocks', () => {
    expect(detectAgents([], 'no-skill')).toEqual([]);
  });

  it('returns empty array when no Agent tool_use blocks', () => {
    const content: ContentBlock[] = [
      { type: 'text', text: 'Hello' },
      { type: 'tool_use', name: 'Read', input: { path: '/foo' } },
    ];
    expect(detectAgents(content, 'no-skill')).toEqual([]);
  });

  it('extracts subagent_type as name (preferred)', () => {
    const content: ContentBlock[] = [
      {
        type: 'tool_use',
        name: 'Agent',
        input: {
          subagent_type: 'Explore',
          name: 'explorer-1',
          description: 'Explore the project',
          prompt: 'Do something...',
        },
      },
    ];
    const result = detectAgents(content, 'dev-features', '2026-04-01T10:00:00.000Z');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Explore');
    expect(result[0].skill).toBe('dev-features');
    expect(result[0].timestamp).toBe('2026-04-01T10:00:00.000Z');
  });

  it('falls back to input.name when subagent_type absent', () => {
    const content: ContentBlock[] = [
      {
        type: 'tool_use',
        name: 'Agent',
        input: {
          name: 'review-quality',
          description: 'Review code quality for the PR',
          prompt: '...',
        },
      },
    ];
    const result = detectAgents(content, 'no-skill');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('review-quality');
  });

  it('uses "ad-hoc" when no subagent_type or name', () => {
    const content: ContentBlock[] = [
      {
        type: 'tool_use',
        name: 'Agent',
        input: {
          description: 'Verify config MongoDB WiredTiger',
          prompt: '...',
        },
      },
    ];
    const result = detectAgents(content, 'no-skill');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('ad-hoc');
  });

  it('uses "ad-hoc" when only prompt is provided', () => {
    const content: ContentBlock[] = [
      {
        type: 'tool_use',
        name: 'Agent',
        input: { prompt: 'Do something' },
      },
    ];
    const result = detectAgents(content, 'no-skill');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('ad-hoc');
  });

  it('detects multiple agent spawns in same turn', () => {
    const content: ContentBlock[] = [
      { type: 'text', text: 'Starting parallel agents...' },
      {
        type: 'tool_use',
        name: 'Agent',
        input: { subagent_type: 'Explore', description: 'Explore codebase' },
      },
      {
        type: 'tool_use',
        name: 'Agent',
        input: { subagent_type: 'personal-workflow:code-reviewer', description: 'Review code' },
      },
    ];
    const result = detectAgents(content, 'dev-features');
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Explore');
    expect(result[1].name).toBe('personal-workflow:code-reviewer');
  });

  it('real-world: agent with name but no subagent_type', () => {
    const content: ContentBlock[] = [
      {
        type: 'tool_use',
        id: 'toolu_01AoX4ZBhgmir7iDCt1p2HSK',
        name: 'Agent',
        input: {
          name: 'explorer-1',
          description: 'Analyze all devops-master scripts',
          prompt: 'Lis et analyse TOUS les fichiers...',
        },
      },
    ];
    const result = detectAgents(content, 'no-skill');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('explorer-1');
  });
});

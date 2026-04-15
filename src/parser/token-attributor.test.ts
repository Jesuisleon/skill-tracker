import { describe, it, expect } from 'vitest';
import { attributeSession } from './token-attributor.js';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '../../fixtures');

describe('attributeSession', () => {
  describe('multi-skill session', () => {
    it('correctly identifies session metadata', async () => {
      const { session } = await attributeSession(join(FIXTURES, 'multi-skill-session.jsonl'));
      expect(session.sessionId).toBe('session-abc');
      expect(session.project).toBe('my-project');
      expect(session.date).toBe('2026-04-01');
    });

    it('attributes no-skill tokens to the "no-skill" bucket', async () => {
      const { session } = await attributeSession(join(FIXTURES, 'multi-skill-session.jsonl'));
      const noSkill = session.skillTurns.get('no-skill');
      expect(noSkill).toBeDefined();
      expect(noSkill!.length).toBe(1);
      expect(noSkill![0].input_tokens).toBe(100);
      expect(noSkill![0].output_tokens).toBe(50);
    });

    it('attributes tokens after skill switch to new skill', async () => {
      const { session } = await attributeSession(join(FIXTURES, 'multi-skill-session.jsonl'));
      const devFeatures = session.skillTurns.get('dev-features');
      expect(devFeatures).toBeDefined();
      expect(devFeatures!.length).toBe(1);
      expect(devFeatures![0].input_tokens).toBe(200);
      expect(devFeatures![0].cache_creation_input_tokens).toBe(500);
      expect(devFeatures![0].cache_read_input_tokens).toBe(300);
      expect(devFeatures![0].output_tokens).toBe(100);
    });

    it('tracks second skill separately', async () => {
      const { session } = await attributeSession(join(FIXTURES, 'multi-skill-session.jsonl'));
      const planAndTasks = session.skillTurns.get('plan-and-tasks');
      expect(planAndTasks).toBeDefined();
      expect(planAndTasks!.length).toBe(1);
      expect(planAndTasks![0].input_tokens).toBe(300);
      expect(planAndTasks![0].output_tokens).toBe(75);
    });

    it('records agent spawns with correct skill context', async () => {
      const { session } = await attributeSession(join(FIXTURES, 'multi-skill-session.jsonl'));
      expect(session.agentSpawns).toHaveLength(1);
      expect(session.agentSpawns[0].name).toBe('Explore');
      expect(session.agentSpawns[0].skill).toBe('dev-features');
    });

    it('tracks skills invoked in order', async () => {
      const { session } = await attributeSession(join(FIXTURES, 'multi-skill-session.jsonl'));
      expect(session.skillsInvoked).toContain('dev-features');
      expect(session.skillsInvoked).toContain('plan-and-tasks');
    });
  });

  describe('skill injection via Base directory', () => {
    it('detects skill from tool_result content with Base directory', async () => {
      const { session } = await attributeSession(join(FIXTURES, 'skill-injection-session.jsonl'));
      const agentBrowser = session.skillTurns.get('agent-browser');
      expect(agentBrowser).toBeDefined();
      expect(agentBrowser!.length).toBe(1);
      expect(agentBrowser![0].input_tokens).toBe(500);
    });

    it('correctly identifies project from cwd', async () => {
      const { session } = await attributeSession(join(FIXTURES, 'skill-injection-session.jsonl'));
      expect(session.project).toBe('other-project');
    });
  });

  describe('sample fixture', () => {
    it('processes sample.jsonl without errors', async () => {
      const { session } = await attributeSession(join(FIXTURES, 'sample.jsonl'));
      expect(session.skillTurns.size).toBeGreaterThan(0);
    });

    it('attributes dev-features tokens correctly', async () => {
      const { session } = await attributeSession(join(FIXTURES, 'sample.jsonl'));
      const devFeatures = session.skillTurns.get('dev-features');
      expect(devFeatures).toBeDefined();
      expect(devFeatures![0].input_tokens).toBe(200);
    });

    it('returns parseErrors count', async () => {
      const { parseErrors } = await attributeSession(join(FIXTURES, 'sample.jsonl'));
      // sample.jsonl has 1 MALFORMED line
      expect(parseErrors).toBe(1);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { detectSkill } from './skill-detector.js';

describe('detectSkill', () => {
  describe('Pattern 1: Base directory injection', () => {
    it('detects skill from Base directory injection', () => {
      const text = 'USER: Base directory for this skill: /Users/leon/.claude/skills/dev-features\n\n# Dev Features...';
      expect(detectSkill(text)).toBe('dev-features');
    });

    it('handles skill names with hyphens', () => {
      const text = 'Base directory for this skill: /Users/leon/.claude/skills/spec-driven-development\n\nContent...';
      expect(detectSkill(text)).toBe('spec-driven-development');
    });

    it('returns last match when multiple skill paths present', () => {
      const text = 'skills/first-skill and also skills/second-skill\nBase directory for this skill: /path';
      // Both paths match, last wins
      const result = detectSkill(text);
      expect(result).toBe('second-skill');
    });
  });

  describe('Pattern 2: command-message tag', () => {
    it('detects skill from command-message tag', () => {
      const text = '<command-name>/personal-workflow:dev-features</command-name>\n            <command-message>personal-workflow:dev-features</command-message>\n            <command-args></command-args>';
      expect(detectSkill(text)).toBe('dev-features');
    });

    it('strips plugin prefix', () => {
      const text = '<command-message>personal-workflow:plan-and-tasks</command-message>';
      expect(detectSkill(text)).toBe('plan-and-tasks');
    });

    it('handles command without plugin prefix', () => {
      const text = '<command-message>ideate</command-message>';
      expect(detectSkill(text)).toBe('ideate');
    });

    it('filters out builtins: clear', () => {
      const text = '<command-message>clear</command-message>';
      expect(detectSkill(text)).toBeNull();
    });

    it('filters out builtins: compact', () => {
      const text = '<command-message>compact</command-message>';
      expect(detectSkill(text)).toBeNull();
    });

    it('filters out builtins: plugin', () => {
      const text = '<command-message>plugin</command-message>';
      expect(detectSkill(text)).toBeNull();
    });

    it('filters out builtins: mcp', () => {
      const text = '<command-message>mcp</command-message>';
      expect(detectSkill(text)).toBeNull();
    });

    it('filters out builtins: help', () => {
      const text = '<command-message>help</command-message>';
      expect(detectSkill(text)).toBeNull();
    });

    it('filters out builtins: init', () => {
      const text = '<command-message>init</command-message>';
      expect(detectSkill(text)).toBeNull();
    });
  });

  describe('No skill detected', () => {
    it('returns null for plain user message', () => {
      expect(detectSkill('Hello, how are you?')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(detectSkill('')).toBeNull();
    });

    it('returns null for tool_result content without skill markers', () => {
      const text = 'Some tool result output without any skill markers';
      expect(detectSkill(text)).toBeNull();
    });
  });

  describe('Pattern priority: Base directory wins over command-message', () => {
    it('Base directory wins when both patterns present', () => {
      const text = '<command-message>personal-workflow:ideate</command-message>\nBase directory for this skill: /Users/leon/.claude/skills/spec-driven-development\n\nContent...';
      // Base directory is more specific, should win
      expect(detectSkill(text)).toBe('spec-driven-development');
    });
  });

  describe('Real-world fixtures', () => {
    it('handles real command-message format with whitespace', () => {
      const text = `<command-name>/personal-workflow:dev-features</command-name>
            <command-message>personal-workflow:dev-features</command-message>
            <command-args></command-args>`;
      expect(detectSkill(text)).toBe('dev-features');
    });

    it('handles Base directory in tool_result content', () => {
      const text = `USER: Base directory for this skill: /Users/leon/.claude/skills/agent-browser

# Browser Automation with agent-browser

The CLI uses Chrome/Chromium via CDP directly.`;
      expect(detectSkill(text)).toBe('agent-browser');
    });
  });
});

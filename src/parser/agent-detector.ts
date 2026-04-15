import type { ContentBlock, AgentSpawn } from '../types.js';

// Scans assistant message content blocks for Agent tool_use blocks.
// Returns an array of AgentSpawn objects (empty array if none found).
export function detectAgents(content: ContentBlock[], skill: string, timestamp?: string): AgentSpawn[] {
  const spawns: AgentSpawn[] = [];

  for (const block of content) {
    if (block.type !== 'tool_use' || block.name !== 'Agent') continue;

    const input = block.input as Record<string, unknown> | undefined;
    if (!input) continue;

    let name: string;
    if (typeof input['subagent_type'] === 'string' && input['subagent_type']) {
      // Preferred: use subagent_type (reusable identifier)
      name = input['subagent_type'];
    } else if (typeof input['name'] === 'string' && input['name']) {
      // Second: use instance name (e.g. "explorer-1", "review-quality")
      name = input['name'];
    } else {
      // Fallback: group description-only agents under "ad-hoc"
      // Descriptions are too unique for meaningful aggregation
      name = 'ad-hoc';
    }

    spawns.push({ name, skill, timestamp });
  }

  return spawns;
}

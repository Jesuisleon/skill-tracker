// Raw JSONL message from Claude Code conversation files
export type RawJMessage = {
  type: string;
  uuid?: string;
  parentUuid?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  isMeta?: boolean;
  message?: {
    role?: string;
    content?: string | ContentBlock[];
    id?: string;        // message.id for dedup
    model?: string;
    usage?: Usage;
    stop_reason?: string | null;
  };
  toolUseResult?: unknown;
};

export interface Usage {
  input_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens: number;
}

export interface ContentBlock {
  type: string;       // 'text' | 'tool_use' | 'tool_result'
  text?: string;
  name?: string;      // tool name for tool_use
  input?: unknown;    // tool input for tool_use
  content?: string | ContentBlock[];  // for tool_result (recursive)
  id?: string;        // tool_use id
}

// Normalize string | ContentBlock[] to a single string
export function extractText(content: string | ContentBlock[] | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;

  const parts: string[] = [];
  for (const block of content) {
    if (block.type === 'text' && block.text) {
      parts.push(block.text);
    } else if (block.type === 'tool_result' && block.content) {
      parts.push(extractText(block.content));
    }
  }
  return parts.join('\n');
}

export interface AgentSpawn {
  name: string;
  skill: string;    // skill context when agent was spawned
  timestamp?: string;
}

export interface TurnUsage extends Usage {
  timestamp?: string;
}

// Total input tokens (raw count, all types summed).
export function totalInput(turn: TurnUsage): number {
  return turn.input_tokens + turn.cache_creation_input_tokens + turn.cache_read_input_tokens;
}

// --- Pricing (Anthropic API, per 1M tokens) ---
// Source: https://docs.anthropic.com/en/docs/about-claude/models
export interface ModelPricing {
  input: number;          // $/1M uncached input tokens
  cacheCreation: number;  // $/1M cache write tokens
  cacheRead: number;      // $/1M cache read tokens
  output: number;         // $/1M output tokens
}

export const PRICING: Record<string, ModelPricing> = {
  opus:    { input: 15.00, cacheCreation: 18.75, cacheRead: 1.50,  output: 75.00 },
  sonnet:  { input: 3.00,  cacheCreation: 3.75,  cacheRead: 0.30,  output: 15.00 },
  haiku:   { input: 0.80,  cacheCreation: 1.00,  cacheRead: 0.08,  output: 4.00  },
};

// Default to sonnet pricing (most common model in Claude Code)
export const DEFAULT_PRICING = PRICING.sonnet;

// Estimated USD cost for a single turn, using real Anthropic rates.
export function estimateCostUsd(turn: TurnUsage, pricing: ModelPricing = DEFAULT_PRICING): number {
  return (
    turn.input_tokens * pricing.input +
    turn.cache_creation_input_tokens * pricing.cacheCreation +
    turn.cache_read_input_tokens * pricing.cacheRead +
    turn.output_tokens * pricing.output
  ) / 1_000_000;
}

export const DEFAULT_TREND_WINDOW = '14d';

export interface AttributedSession {
  sessionId: string;
  project: string;
  date: string;
  // skill name -> usage turns
  skillTurns: Map<string, TurnUsage[]>;
  agentSpawns: AgentSpawn[];
  // ordered list of skills invoked (for display)
  skillsInvoked: string[];
  // P1: context size when each skill started (for delta computation)
  // key = skill name, value = totalInput of the last turn BEFORE this skill started
  contextAtSkillStart: Map<string, number>;
}

export interface SkillMetrics {
  name: string;
  invocationCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  maxInputTokens: number;   // single-turn max
  maxOutputTokens: number;
  sessionsUsedIn: number;
  lastUsed: string;         // ISO date
  // P0: Real USD cost
  estimatedCostUsd: number;
  // P1: Delta tokens (incremental context added by this skill, not cumulative)
  deltaInputTokens: number;
  // P2: Token type breakdown
  cacheReadTokens: number;
  cacheCreationTokens: number;
  rawInputTokens: number;
}

export interface AgentMetrics {
  name: string;
  spawnCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  sessionsUsedIn: number;
  lastUsed: string;
}

export interface SessionMetrics {
  sessionId: string;
  project: string;
  date: string;
  skills: string[];
  agents: string[];
  totalInputTokens: number;
  totalOutputTokens: number;
  turnCount: number;
  estimatedCostUsd: number;
}

export interface DailyTrend {
  date: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  sessionCount: number;
  skillInvocations: number;
  agentSpawns: number;
  estimatedCostUsd: number;
}

export interface PipelineOptions {
  since?: string;   // YYYY-MM-DD
  last?: string;    // e.g. "14d"
  top?: number;
  sort?: 'tokens' | 'count';
}

export interface PipelineResult {
  sessions: AttributedSession[];
  fileCount: number;
  errorCount: number;
  durationMs: number;
}

# Spec: skill-tracker

## Objective

CLI tool that analyzes Claude Code local JSONL conversation files to produce a dashboard of skill and agent usage. Answers the question: "Which skills and agents do I use most, and how much do they cost in tokens?"

**User:** Solo developer using Claude Code with the personal-workflow plugin (skills + agents).

**Success criteria:**
- Parse all `~/.claude/projects/**/*.jsonl` files
- Identify skill invocations via `Base directory for this skill:` and `<command-message>` tags
- Identify agent spawns via `Agent` tool_use blocks in assistant messages
- Attribute tokens to skills using turn-based heuristic
- Display a rich terminal dashboard with tables, rankings, and sparklines
- Run in < 5 seconds for a typical history (~300 JSONL files)

## Tech Stack

- **Runtime:** Node.js >= 18
- **Language:** TypeScript (ESM)
- **CLI framework:** commander
- **Terminal rendering:** cli-table3 + chalk
- **JSONL parsing:** readline (built-in, streaming)
- **No external database** — pure file analysis, results computed on the fly

## Commands

```bash
# Full dashboard (default)
skill-tracker

# Filter by date range
skill-tracker --since 2026-01-01
skill-tracker --last 30d

# Specific views
skill-tracker skills        # Skills-only breakdown
skill-tracker agents        # Agents-only breakdown
skill-tracker sessions      # Per-session breakdown
skill-tracker trends        # Daily/weekly usage trends

# Options
skill-tracker --sort tokens  # Sort by token cost (default)
skill-tracker --sort count   # Sort by invocation count
skill-tracker --top 10       # Limit to top N entries
skill-tracker --json         # JSON output for piping
```

## Project Structure

```
skill-tracker/
  src/
    index.ts              → CLI entry point (commander setup)
    parser/
      jsonl-reader.ts     → Streaming JSONL file reader
      skill-detector.ts   → Detect skill invocations from user messages
      agent-detector.ts   → Detect agent spawns from assistant tool_use
      token-attributor.ts → Turn-based token attribution logic
    aggregator/
      metrics.ts          → Aggregate raw data into metrics (count, avg, max, total)
      trends.ts           → Time-series aggregation (daily/weekly)
    display/
      dashboard.ts        → Full dashboard renderer
      tables.ts           → Table formatters (skills, agents, sessions)
      sparklines.ts       → Inline sparkline generation for trends
    types.ts              → Shared TypeScript types
  package.json
  tsconfig.json
  SPEC.md
```

## Code Style

```typescript
// Named exports, no default exports
export function detectSkillInvocation(message: UserMessage): SkillInvocation | null {
  const content = extractTextContent(message.content);

  // "Base directory for this skill:" injection
  const skillPathMatch = content.match(/skills\/([^/\n]+)/);
  if (content.includes('Base directory for this skill:') && skillPathMatch) {
    return { name: skillPathMatch[1], type: 'injection', timestamp: message.timestamp };
  }

  // <command-message> invocation
  const cmdMatch = content.match(/<command-message>(.*?)<\/command-message>/);
  if (cmdMatch) {
    const name = cmdMatch[1].split(':').pop()!; // strip plugin prefix
    return { name, type: 'command', timestamp: message.timestamp };
  }

  return null;
}
```

**Conventions:**
- Functions return `null` not `undefined` for "not found"
- No classes — plain functions + types
- Streaming over loading-all-in-memory for JSONL parsing
- camelCase for variables/functions, PascalCase for types

## Data Model

### JSONL Message Types (input)

```typescript
type JMessage =
  | { type: 'user'; message: { content: string | ContentBlock[] }; uuid: string; timestamp: string; slug?: string }
  | { type: 'assistant'; message: { usage: Usage; content: ContentBlock[]; model: string }; uuid: string; parentUuid: string; timestamp: string }
  | { type: 'permission-mode' | 'queue-operation' | 'file-history-snapshot' | 'attachment' };

interface Usage {
  input_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens: number;
}

interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  name?: string;     // tool name for tool_use
  input?: unknown;   // tool input for tool_use
}
```

### Aggregated Metrics (output)

```typescript
interface SkillMetrics {
  name: string;
  invocationCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  maxInputTokens: number;  // single-turn max
  maxOutputTokens: number;
  sessionsUsedIn: number;
  lastUsed: string;        // ISO date
}

interface AgentMetrics {
  name: string;            // subagent_type or description
  spawnCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  sessionsUsedIn: number;
  lastUsed: string;
}

interface SessionMetrics {
  sessionId: string;
  project: string;
  date: string;
  skills: string[];
  agents: string[];
  totalInputTokens: number;
  totalOutputTokens: number;
  turnCount: number;
}

interface DailyTrend {
  date: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  sessionCount: number;
  skillInvocations: number;
  agentSpawns: number;
}
```

## Token Attribution Logic (Turn-Based)

```
For each session (JSONL file):
  1. Read messages in order
  2. Track currentSkill = null
  3. For each message:
     - If user message contains skill marker → currentSkill = detected skill name
     - If assistant message with usage:
       - Attribute usage.input_tokens + cache tokens to currentSkill (or "no-skill")
       - Attribute usage.output_tokens to currentSkill (or "no-skill")
     - If assistant message contains Agent tool_use:
       - Record agent spawn (name from subagent_type or description)
       - Note: agent's own token cost is embedded in its parent turn's usage
```

**Edge cases:**
- Multiple skills loaded in same turn → attribute to the last one (most specific)
- Skill loaded but no assistant response follows → count invocation but 0 tokens
- Agent spawned without subagent_type → use description field, truncated to 40 chars

## Agent Detection

Agents are detected from assistant messages containing `tool_use` blocks where `name === 'Agent'`:

```typescript
// In assistant.message.content, look for:
{
  type: 'tool_use',
  name: 'Agent',
  input: {
    subagent_type: 'personal-workflow:code-reviewer',  // or undefined
    description: 'Review migration safety',
    model: 'sonnet',
    prompt: '...'
  }
}
```

Extract: `subagent_type` (preferred) or `description` as the agent identifier.

## Dashboard Output

```
╔══════════════════════════════════════════════════════════════╗
║  SKILL TRACKER — Claude Code Usage Analytics                ║
║  Analyzed: 312 sessions · 847 JSONL files · Since 2025-06-01║
╚══════════════════════════════════════════════════════════════╝

┌─ TOP SKILLS BY TOKENS ──────────────────────────────────────┐
│ Skill                  │ Calls │ Avg Input │ Max Input │ Total │
│ dev-features           │    12 │    4.2M   │   12.8M   │ 50.4M │
│ spec-driven-development│     8 │    1.8M   │    4.2M   │ 14.4M │
│ ideate                 │     5 │    2.1M   │    3.6M   │ 10.5M │
│ plan-and-tasks         │     7 │    1.2M   │    2.8M   │  8.4M │
│ incremental-impl.      │    15 │    0.4M   │    1.1M   │  6.0M │
│ (no skill)             │   180 │    0.1M   │    0.8M   │ 18.0M │
└─────────────────────────────────────────────────────────────┘

┌─ TOP AGENTS BY SPAWNS ──────────────────────────────────────┐
│ Agent                  │ Spawns │ Avg Output │ Sessions │
│ Explore                │     42 │     2.1K   │       18 │
│ code-reviewer          │     12 │     3.4K   │        6 │
│ security-auditor       │      8 │     2.8K   │        5 │
│ general-purpose        │     34 │     1.5K   │       22 │
└─────────────────────────────────────────────────────────────┘

┌─ DAILY TREND (last 14 days) ────────────────────────────────┐
│ Date       │ Sessions │ Input Tokens │ Skills │ Agents │    │
│ 2026-04-08 │     3    │    8.2M      │   5    │   12   │ ▇▇ │
│ 2026-04-07 │     5    │   12.1M      │   8    │   18   │ ▇▇▇│
│ 2026-04-06 │     2    │    4.5M      │   3    │    6   │ ▇  │
│ ...        │          │              │        │        │    │
└─────────────────────────────────────────────────────────────┘

┌─ RECENT SESSIONS ───────────────────────────────────────────┐
│ Session    │ Date       │ Project       │ Skills           │ Tokens │
│ bae82612.. │ 2026-04-08 │ giplia-UI     │ dev-feat,spec    │  53.3M │
│ 6344937b.. │ 2026-04-07 │ giplia-UI     │ debug,test       │   7.9M │
│ 36dae264.. │ 2026-04-07 │ personal-wf   │ (none)           │   0.9M │
└─────────────────────────────────────────────────────────────┘
```

## Testing Strategy

- **Framework:** vitest
- **Test location:** `src/**/*.test.ts` (co-located)
- **Key test areas:**
  - `skill-detector.test.ts` — Test all detection patterns against real JSONL excerpts
  - `agent-detector.test.ts` — Test agent extraction from tool_use blocks
  - `token-attributor.test.ts` — Test turn-based attribution logic with multi-skill sessions
  - `metrics.test.ts` — Test aggregation math (avg, max, total)
- **Coverage:** Focus on parser correctness, not display formatting
- **Test data:** Extract 3-4 real JSONL excerpts (sanitized) as fixtures

```
Run tests: npx vitest
Run with coverage: npx vitest --coverage
```

## Boundaries

- **Always:**
  - Stream JSONL files (never load entire file in memory)
  - Handle malformed JSONL lines gracefully (skip + warn)
  - Show human-readable token counts (e.g., "4.2M" not "4200000")

- **Ask first:**
  - Adding new detection patterns (JSONL format may evolve)
  - Changing attribution heuristic

- **Never:**
  - Write to JSONL files (read-only tool)
  - Send data to any external service
  - Access file contents beyond ~/.claude/projects/

## Success Criteria

- [ ] `skill-tracker` shows a complete dashboard with skills, agents, sessions, and trends
- [ ] Skills are correctly detected via both `Base directory` and `<command-message>` patterns
- [ ] Agents are correctly detected from `Agent` tool_use blocks
- [ ] Turn-based attribution assigns tokens to the correct skill
- [ ] Performance: < 5s for 300 JSONL files
- [ ] JSON output mode works for piping to other tools
- [ ] `--since` and `--last` date filters work correctly

## Open Questions

None — all clarified during Phase 1.

---

## Implementation Plan (Phase 2)

### Component Dependency Graph

```
  types.ts                     ← No dependencies (foundation)
    │
    ├── parser/
    │     jsonl-reader.ts      ← types.ts
    │     skill-detector.ts    ← types.ts
    │     agent-detector.ts    ← types.ts
    │     token-attributor.ts  ← all 3 parsers above
    │
    ├── aggregator/
    │     metrics.ts           ← types.ts + token-attributor output
    │     trends.ts            ← types.ts + metrics output
    │
    ├── display/
    │     sparklines.ts        ← none (pure formatting)
    │     tables.ts            ← types.ts + chalk + cli-table3
    │     dashboard.ts         ← tables + sparklines + all metrics
    │
    └── index.ts               ← commander + dashboard + all modules
```

### Implementation Order

```
Phase 1: Foundation
  ┌─────────────┐   ┌──────────────────┐
  │ types.ts    │   │ package.json +   │
  │ (all types) │   │ tsconfig.json    │
  └──────┬──────┘   └────────┬─────────┘
         │                   │
Phase 2: Parsers (parallelizable)
  ┌──────▼──────┐  ┌────────▼────────┐  ┌────────────────┐
  │ jsonl-reader│  │ skill-detector  │  │ agent-detector │
  └──────┬──────┘  └────────┬────────┘  └────────┬───────┘
         │                  │                     │
Phase 3: Attribution
  ┌──────▼──────────────────▼─────────────────────▼──────┐
  │              token-attributor.ts                      │
  │  (combines reader + skill + agent into attributed     │
  │   per-turn data)                                      │
  └──────────────────────┬───────────────────────────────┘
                         │
Phase 4: Aggregation
  ┌──────────────────────▼──────┐  ┌─────────────────────┐
  │        metrics.ts           │──▶     trends.ts        │
  │  (count, avg, max, total)   │  │  (daily/weekly)      │
  └──────────────────────┬──────┘  └──────────┬──────────┘
                         │                    │
Phase 5: Display
  ┌──────────┐  ┌────────▼────────────────────▼──────────┐
  │sparklines│──▶          dashboard.ts                   │
  └──────────┘  │   tables.ts (skill, agent, session)     │
                └──────────────────────┬─────────────────┘
                                       │
Phase 6: CLI
  ┌────────────────────────────────────▼─────────────────┐
  │                    index.ts                           │
  │  commander setup, subcommands, flags, entry point     │
  └──────────────────────────────────────────────────────┘
```

### Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| JSONL format changes across Claude Code versions | Medium | Defensive parsing: skip unknown message types, warn on parse errors |
| Large JSONL files (>50MB) cause memory issues | Medium | Streaming readline — never load full file. Already specified. |
| Skill detection misses new injection patterns | Low | All patterns centralized in skill-detector.ts — single file to update |
| Agent tool_use structure changes | Low | Agent detection isolated in agent-detector.ts |
| Performance >5s for large histories | Low | Streaming + no disk writes. Profile if needed. |

### Verification Checkpoints

| After Phase | Verification |
|-------------|-------------|
| Phase 2 | Unit tests pass for all 3 detectors against real JSONL fixtures |
| Phase 3 | Attribution test: multi-skill session correctly splits tokens |
| Phase 4 | Metrics math verified: avg = total / count, max is correct |
| Phase 5 | Dashboard renders without errors against real data |
| Phase 6 | `skill-tracker --json` produces valid JSON, all flags work |

---

## Tasks (Phase 3)

### Phase 1: Foundation

- [ ] **T1. Project scaffolding + types**
  - Acceptance: `npm install` works, `npx tsc --noEmit` passes, all shared types defined in `types.ts`
  - Verify: `npx tsc --noEmit`
  - Files:
    - `package.json` — NEW (dependencies: commander, chalk, cli-table3, devDeps: typescript, vitest)
    - `tsconfig.json` — NEW (ESM, strict, NodeNext)
    - `src/types.ts` — NEW (JMessage, Usage, ContentBlock, SkillInvocation, AgentSpawn, SkillMetrics, AgentMetrics, SessionMetrics, DailyTrend)
  - Scope: S

### Phase 2: Parsers

- [ ] **T2a. JSONL streaming reader**
  - Acceptance: reads a JSONL file line-by-line via async generator, skips malformed lines with warning, yields typed `JMessage` objects
  - Verify: `npx vitest src/parser/jsonl-reader.test.ts`
  - Files:
    - `src/parser/jsonl-reader.ts` — NEW
    - `src/parser/jsonl-reader.test.ts` — NEW (test with real JSONL excerpt fixture)
  - Scope: S

- [ ] **T2b. Skill detector**
  - Acceptance: detects both `Base directory for this skill:` and `<command-message>` patterns, extracts clean skill name (strips plugin prefix), returns null for non-skill messages
  - Verify: `npx vitest src/parser/skill-detector.test.ts`
  - Files:
    - `src/parser/skill-detector.ts` — NEW
    - `src/parser/skill-detector.test.ts` — NEW (test both patterns + edge cases)
  - Scope: S

- [ ] **T2c. Agent detector**
  - Acceptance: detects `Agent` tool_use in assistant content blocks, extracts `subagent_type` (preferred) or `description` (fallback, truncated 40 chars), returns list of agent spawns per turn
  - Verify: `npx vitest src/parser/agent-detector.test.ts`
  - Files:
    - `src/parser/agent-detector.ts` — NEW
    - `src/parser/agent-detector.test.ts` — NEW
  - Scope: S

### Checkpoint: Phase 2
- [ ] All 3 detector tests pass
- [ ] `npx tsc --noEmit` passes
- [ ] Detectors work against a real JSONL file excerpt

### Phase 3: Attribution

- [ ] **T3. Turn-based token attributor**
  - Acceptance:
    - Processes a full session (JSONL file) and returns per-turn attributed data
    - Tracks `currentSkill` state machine: null → skill A → skill B → ...
    - Each assistant turn's usage is attributed to `currentSkill` or `"no-skill"`
    - Agent spawns are recorded with their parent skill context
    - Returns `{ skillTurns: Map<string, TurnUsage[]>, agentSpawns: AgentSpawn[], sessionInfo: SessionInfo }`
  - Verify: `npx vitest src/parser/token-attributor.test.ts`
  - Files:
    - `src/parser/token-attributor.ts` — NEW
    - `src/parser/token-attributor.test.ts` — NEW (multi-skill session, no-skill session, agents-within-skill)
  - Scope: M
  - Dependencies: T2a, T2b, T2c

### Phase 4: Aggregation

- [ ] **T4a. Metrics aggregator**
  - Acceptance:
    - Takes attributed data from all sessions → produces `SkillMetrics[]`, `AgentMetrics[]`, `SessionMetrics[]`
    - Correctly computes: count, total, avg (total/count), max (single-turn max), sessionsUsedIn, lastUsed
    - Sorts by total tokens descending by default
  - Verify: `npx vitest src/aggregator/metrics.test.ts`
  - Files:
    - `src/aggregator/metrics.ts` — NEW
    - `src/aggregator/metrics.test.ts` — NEW
  - Scope: S
  - Dependencies: T3

- [ ] **T4b. Trends aggregator**
  - Acceptance:
    - Groups session data by day → produces `DailyTrend[]`
    - Supports `--since` and `--last` date filtering
    - Returns last 14 days by default for dashboard view
  - Verify: `npx vitest src/aggregator/trends.test.ts`
  - Files:
    - `src/aggregator/trends.ts` — NEW
    - `src/aggregator/trends.test.ts` — NEW
  - Scope: S
  - Dependencies: T4a

### Checkpoint: Phase 4
- [ ] All tests pass
- [ ] Run against real `~/.claude/projects/` data → produces valid metrics objects
- [ ] Performance check: < 5s for full history

### Phase 5: Display

- [ ] **T5a. Sparklines + table formatters**
  - Acceptance:
    - `sparklines.ts`: converts number array to inline bar chart (▁▂▃▄▅▆▇█)
    - `tables.ts`: formats SkillMetrics[], AgentMetrics[], SessionMetrics[] into cli-table3 tables with human-readable token counts (4.2M, 22K)
  - Verify: visual inspection + snapshot test
  - Files:
    - `src/display/sparklines.ts` — NEW
    - `src/display/tables.ts` — NEW
  - Scope: S
  - Dependencies: T4a

- [ ] **T5b. Dashboard renderer**
  - Acceptance:
    - Composes all tables + sparklines into the full dashboard layout (as specified in SPEC mockup)
    - Header with session count, file count, date range
    - 4 sections: Top Skills, Top Agents, Daily Trend, Recent Sessions
  - Verify: `skill-tracker` against real data produces readable output
  - Files:
    - `src/display/dashboard.ts` — NEW
  - Scope: M
  - Dependencies: T5a, T4b

### Phase 6: CLI

- [ ] **T6. CLI entry point + subcommands**
  - Acceptance:
    - `skill-tracker` shows full dashboard (default)
    - `skill-tracker skills` shows skills-only table
    - `skill-tracker agents` shows agents-only table
    - `skill-tracker sessions` shows session breakdown
    - `skill-tracker trends` shows daily trends with sparklines
    - `--sort tokens|count` works
    - `--top N` limits entries
    - `--since YYYY-MM-DD` and `--last Nd` filter by date
    - `--json` outputs valid JSON
    - `bin` field in package.json enables `npx skill-tracker`
  - Verify: manual test of all subcommands + `skill-tracker --json | python3 -m json.tool`
  - Files:
    - `src/index.ts` — NEW
    - `package.json` — UPDATE (add bin field)
  - Scope: M
  - Dependencies: T5b

### Task Summary

| Task | Depends On | Files | Scope |
|------|-----------|-------|-------|
| T1. Scaffolding + types | — | 3 | S |
| T2a. JSONL reader | T1 | 2 | S |
| T2b. Skill detector | T1 | 2 | S |
| T2c. Agent detector | T1 | 2 | S |
| T3. Token attributor | T2a,b,c | 2 | M |
| T4a. Metrics aggregator | T3 | 2 | S |
| T4b. Trends aggregator | T4a | 2 | S |
| T5a. Sparklines + tables | T4a | 2 | S |
| T5b. Dashboard renderer | T5a, T4b | 1 | M |
| T6. CLI entry point | T5b | 2 | M |

**Total: 10 tasks, 20 files, 7×S + 3×M**
**Parallelizable: T2a, T2b, T2c (all 3 parsers)**

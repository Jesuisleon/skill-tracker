---
id: skill-tracker
title: Skill Tracker — Claude Code Usage Analytics CLI
status: done
priority: high
created: 2026-04-09
started: 2026-04-09
completed: 2026-04-09
estimated-phases: 6
completed-phases: 6
tags: [cli, analytics, tokens, skills, agents]
---

# Skill Tracker — Claude Code Usage Analytics CLI

## Goal

Build a standalone CLI tool that analyzes Claude Code local JSONL conversation files to produce a terminal dashboard of skill and agent usage. Answers: "Which skills and agents do I use most, and how much do they cost in tokens?" Uses turn-based attribution to assign tokens to the active skill at each turn.

## Acceptance Criteria

- [ ] `skill-tracker` shows a complete dashboard with skills, agents, sessions, and trends
- [ ] Skills are correctly detected via both `Base directory for this skill:` and `<command-message>` patterns
- [ ] Agents are correctly detected from `Agent` tool_use blocks in assistant messages
- [ ] Turn-based attribution assigns tokens to the correct skill
- [ ] Performance: < 5s for ~300 JSONL files
- [ ] JSON output mode works for piping to other tools
- [ ] `--since` and `--last` date filters work correctly
- [ ] `npx skill-tracker` works after `npm link`

## Architecture Decisions

- **Turn-based attribution over session-level**: More accurate cost tracking per skill. Each skill injection (user message) sets the `currentSkill` state, and all following assistant turns are attributed to it until the next skill injection.
- **Streaming JSONL over load-all**: Performance and memory safety — some JSONL files exceed 50MB.
- **No external DB**: Pure file analysis, computed on the fly. Keeps the tool simple and dependency-free.
- **CLI-only (no web dashboard)**: Terminal tables + sparklines. Fast to run, no browser needed.
- **Node.js/TypeScript**: Consistent with the user's ecosystem.

## Dependency Graph

```
types.ts ──────────────┐
  │                    │
  ├── jsonl-reader ────┤
  ├── skill-detector ──┼──► token-attributor ──► metrics ──► trends
  ├── agent-detector ──┘                            │           │
  │                                                 │           │
  │                                        sparklines + tables ─┤
  │                                                 │           │
  │                                            dashboard ───────┘
  │                                                 │
  └─────────────────────────────────────────── index.ts (CLI)
```

## Task List

### Phase 1: Foundation

#### Task 1: Project scaffolding + types
**Description:** Initialize the project with package.json, tsconfig.json, and all shared TypeScript types. Types cover JSONL message formats (input), detection results (intermediate), and aggregated metrics (output).
**Scope:** S
**Acceptance criteria:**
- [ ] `npm install` succeeds
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] All types from SPEC.md are defined in `src/types.ts`
**Verification:**
- [ ] Build succeeds: `npx tsc --noEmit`
**Dependencies:** None
**Files likely touched:**
- `package.json` — NEW
- `tsconfig.json` — NEW
- `src/types.ts` — NEW

### Phase 2: Parsers

#### Task 2: JSONL streaming reader
**Description:** Async generator that reads a JSONL file line-by-line, parses each line as JSON, skips malformed lines with a warning, and yields typed `JMessage` objects.
**Scope:** S
**Acceptance criteria:**
- [ ] Reads JSONL files via async generator (no full-file load)
- [ ] Skips malformed lines and logs a warning (does not throw)
- [ ] Yields correctly typed `JMessage` objects
**Verification:**
- [ ] Tests pass: `npx vitest src/parser/jsonl-reader.test.ts`
**Dependencies:** T1
**Files likely touched:**
- `src/parser/jsonl-reader.ts` — NEW
- `src/parser/jsonl-reader.test.ts` — NEW

#### Task 3: Skill detector
**Description:** Detects skill invocations from user messages. Two patterns: `Base directory for this skill:` (skill injection) and `<command-message>` tags (slash command). Extracts clean skill name, stripping plugin prefix.
**Scope:** S
**Acceptance criteria:**
- [ ] Detects `Base directory for this skill:` pattern and extracts skill name from path
- [ ] Detects `<command-message>plugin:skill-name</command-message>` and strips prefix
- [ ] Returns `null` for non-skill messages
- [ ] Handles edge cases: multiple patterns in one message → last one wins
**Verification:**
- [ ] Tests pass: `npx vitest src/parser/skill-detector.test.ts`
**Dependencies:** T1
**Files likely touched:**
- `src/parser/skill-detector.ts` — NEW
- `src/parser/skill-detector.test.ts` — NEW

#### Task 4: Agent detector
**Description:** Detects agent spawns from assistant messages. Looks for `tool_use` blocks with `name === 'Agent'` in content array. Extracts `subagent_type` (preferred) or `description` (fallback, truncated to 40 chars).
**Scope:** S
**Acceptance criteria:**
- [ ] Detects `Agent` tool_use in assistant message content blocks
- [ ] Extracts `subagent_type` when available
- [ ] Falls back to `description` (truncated 40 chars) when no subagent_type
- [ ] Returns empty array for messages with no agent spawns
**Verification:**
- [ ] Tests pass: `npx vitest src/parser/agent-detector.test.ts`
**Dependencies:** T1
**Files likely touched:**
- `src/parser/agent-detector.ts` — NEW
- `src/parser/agent-detector.test.ts` — NEW

### Checkpoint: Phase 2
- [ ] All 3 parser tests pass
- [ ] `npx tsc --noEmit` passes
- [ ] Parsers correctly handle a real JSONL file excerpt

### Phase 3: Attribution

#### Task 5: Turn-based token attributor
**Description:** Core attribution engine. Processes a full JSONL session file and produces per-turn attributed data. Maintains a `currentSkill` state machine: each skill injection sets the active skill, each assistant turn's token usage is attributed to that skill. Agent spawns are recorded with their parent skill context.
**Scope:** M
**Acceptance criteria:**
- [ ] Processes a session and returns `{ skillTurns, agentSpawns, sessionInfo }`
- [ ] `currentSkill` state transitions correctly on skill injection messages
- [ ] Tokens before any skill → attributed to `"no-skill"`
- [ ] Multiple skills in one session → tokens split at transition boundaries
- [ ] Agent spawns include parent skill context
**Verification:**
- [ ] Tests pass: `npx vitest src/parser/token-attributor.test.ts`
- [ ] Test covers: multi-skill session, no-skill session, agents-within-skill
**Dependencies:** T2, T3, T4
**Files likely touched:**
- `src/parser/token-attributor.ts` — NEW
- `src/parser/token-attributor.test.ts` — NEW

### Phase 4: Aggregation

#### Task 6: Metrics aggregator
**Description:** Takes attributed data from all sessions and produces aggregated `SkillMetrics[]`, `AgentMetrics[]`, and `SessionMetrics[]`. Computes count, total, avg, max, sessionsUsedIn, lastUsed.
**Scope:** S
**Acceptance criteria:**
- [ ] Produces correct SkillMetrics: count, total, avg (total/count), max (single-turn), sessionsUsedIn, lastUsed
- [ ] Produces correct AgentMetrics: spawnCount, totals, sessionsUsedIn
- [ ] Produces correct SessionMetrics: per-session summary with skills list
- [ ] Default sort: total tokens descending
**Verification:**
- [ ] Tests pass: `npx vitest src/aggregator/metrics.test.ts`
**Dependencies:** T5
**Files likely touched:**
- `src/aggregator/metrics.ts` — NEW
- `src/aggregator/metrics.test.ts` — NEW

#### Task 7: Trends aggregator
**Description:** Groups session data by day to produce `DailyTrend[]`. Supports date filtering via `--since` and `--last`. Returns last 14 days by default for dashboard view.
**Scope:** S
**Acceptance criteria:**
- [ ] Groups sessions by date → `DailyTrend[]`
- [ ] `since` filter excludes sessions before the date
- [ ] `last` filter (e.g., "30d") computes cutoff from today
- [ ] Default: last 14 days
**Verification:**
- [ ] Tests pass: `npx vitest src/aggregator/trends.test.ts`
**Dependencies:** T6
**Files likely touched:**
- `src/aggregator/trends.ts` — NEW
- `src/aggregator/trends.test.ts` — NEW

### Checkpoint: Phase 4
- [ ] All tests pass
- [ ] Run against real `~/.claude/projects/` data produces valid metrics
- [ ] Performance: < 5s for full history

### Phase 5: Display

#### Task 8: Sparklines + table formatters
**Description:** Display utilities. Sparklines convert number arrays to inline bar charts (▁▂▃▄▅▆▇█). Tables format metrics arrays into cli-table3 tables with human-readable token counts (4.2M, 22K).
**Scope:** S
**Acceptance criteria:**
- [ ] `sparkline([1,5,3,8,2])` → inline bar chart string
- [ ] `formatTokens(4200000)` → `"4.2M"`
- [ ] Skill table renders with: name, calls, avg input, max input, total
- [ ] Agent table renders with: name, spawns, avg output, sessions
- [ ] Session table renders with: id (truncated), date, project, skills, tokens
**Verification:**
- [ ] Visual inspection against SPEC mockup
**Dependencies:** T6
**Files likely touched:**
- `src/display/sparklines.ts` — NEW
- `src/display/tables.ts` — NEW

#### Task 9: Dashboard renderer
**Description:** Composes all tables and sparklines into the full dashboard layout. Header with stats, 4 sections: Top Skills, Top Agents, Daily Trend, Recent Sessions.
**Scope:** M
**Acceptance criteria:**
- [ ] Dashboard header shows: session count, file count, date range
- [ ] 4 sections render correctly with real data
- [ ] Layout matches SPEC mockup
- [ ] Handles empty data gracefully (no sessions, no skills)
**Verification:**
- [ ] `skill-tracker` against real `~/.claude/projects/` data produces readable output
**Dependencies:** T7, T8
**Files likely touched:**
- `src/display/dashboard.ts` — NEW

### Phase 6: CLI

#### Task 10: CLI entry point + subcommands
**Description:** Commander-based CLI with subcommands (skills, agents, sessions, trends) and flags (--sort, --top, --since, --last, --json). Default command shows full dashboard.
**Scope:** M
**Acceptance criteria:**
- [ ] `skill-tracker` → full dashboard
- [ ] `skill-tracker skills` → skills-only table
- [ ] `skill-tracker agents` → agents-only table
- [ ] `skill-tracker sessions` → session breakdown
- [ ] `skill-tracker trends` → daily trends with sparklines
- [ ] `--sort tokens|count` sorts output
- [ ] `--top N` limits entries
- [ ] `--since YYYY-MM-DD` and `--last Nd` filter by date
- [ ] `--json` outputs valid JSON
- [ ] `bin` field in package.json, `npx skill-tracker` works after `npm link`
**Verification:**
- [ ] All subcommands produce output
- [ ] `skill-tracker --json | python3 -m json.tool` validates JSON
**Dependencies:** T9
**Files likely touched:**
- `src/index.ts` — NEW
- `package.json` — UPDATE (bin field)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| JSONL format changes across Claude Code versions | Medium | Defensive parsing: skip unknown types, warn on errors |
| Large JSONL files (>50MB) cause memory issues | Medium | Streaming readline — never load full file |
| Skill detection misses new injection patterns | Low | All patterns centralized in skill-detector.ts |
| Agent tool_use structure changes | Low | Agent detection isolated in agent-detector.ts |
| Performance >5s for large histories | Low | Streaming + no disk writes. Profile if needed. |

## Open Questions

None — all clarified during spec Phase 1.

## Notes

- Spec located at: `/Users/leon/Desktop/IA/skill-tracker/SPEC.md`
- Project directory: `~/Desktop/IA/skill-tracker/`
- Data source: `~/.claude/projects/**/*.jsonl`

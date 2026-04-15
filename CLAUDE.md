# skill-tracker

CLI tool that analyzes Claude Code JSONL conversation files to produce usage analytics by skill and agent.

## Tech Stack

- **Runtime:** Node.js >= 18
- **Language:** TypeScript (ESM, strict mode, NodeNext resolution)
- **CLI:** commander
- **Display:** cli-table3 + chalk
- **Tests:** vitest
- **CI/CD:** GitHub Actions → npm publish on tag

## Commands

```bash
npm run build          # Compile TypeScript → dist/
npm test               # Run all tests (vitest --run)
npm run test:watch     # Watch mode
npm run dev            # TypeScript watch (tsc --watch)
npx tsc --noEmit       # Type check only
```

## Project Structure

```
src/
  types.ts                    ← Shared types, totalInput(), estimateCostUsd(), PRICING
  pipeline.ts                 ← File discovery + parallel batch processing (32 concurrent)
  index.ts                    ← CLI entry point (commander)
  reader/
    jsonl-reader.ts           ← Streaming JSONL reader (async generator)
    message-deduplicator.ts   ← Fragment dedup by message.id (last-wins)
  parser/
    skill-detector.ts         ← Skill detection (2 patterns + validation)
    agent-detector.ts         ← Agent tool_use extraction
    token-attributor.ts       ← Turn-based attribution state machine
  aggregator/
    metrics.ts                ← SkillMetrics, AgentMetrics, SessionMetrics
    trends.ts                 ← DailyTrend + date filters (--since, --last)
  display/
    sparklines.ts             ← Inline bar charts
    tables.ts                 ← cli-table3 renderers + formatTokens() + formatCost()
    dashboard.ts              ← Full layout composer
fixtures/                     ← Test JSONL fixtures
_specs/                       ← Spec documents
_plans/                       ← Plan lifecycle (backlog/in-progress/done)
```

## Code Conventions

- Named exports only, no default exports
- Functions return `null` not `undefined` for "not found"
- No classes — plain functions + types
- camelCase for variables/functions, PascalCase for types
- ESM with `.js` extensions in imports
- Tests co-located: `foo.test.ts` next to `foo.ts`

## Data Source

Reads `~/.claude/projects/**/*.jsonl` (excludes `subagents/` subdirs).

Only `user` and `assistant` message types are processed. All others (progress, system, attachment, file-history-snapshot, queue-operation, permission-mode) are skipped.

## Key Architecture Decisions

- **Turn-based attribution:** Each skill injection sets `currentSkill`, subsequent assistant turns attributed to it
- **Message deduplication:** Assistant messages fragmented across JSONL lines (same message.id) — last-wins strategy
- **Cost estimation:** Real Anthropic pricing (cache_read at $0.30/M vs input at $3.00/M for Sonnet)
- **Delta tokens:** Tracks context size at skill start to compute incremental tokens added (not cumulative context)
- **Skill name validation:** Regex `^[a-z][a-z0-9-]+$` rejects garbage from spec/doc examples

## Token Attribution Model

```
totalInput = input_tokens + cache_creation + cache_read    (raw count)
costUsd    = input × $3.00 + creation × $3.75 + read × $0.30 + output × $15.00  (per 1M, Sonnet)
delta      = context_at_last_turn - context_at_skill_start  (incremental)
```

Cache represents 92-98% of input tokens in practice. Delta is the honest metric for "what a skill actually added."

## Pricing

Defined in `src/types.ts` → `PRICING` object. Default is Sonnet. Rates per 1M tokens:

| Model  | Input  | Cache Create | Cache Read | Output |
|--------|--------|-------------|------------|--------|
| Opus   | $15.00 | $18.75      | $1.50      | $75.00 |
| Sonnet | $3.00  | $3.75       | $0.30      | $15.00 |
| Haiku  | $0.80  | $1.00       | $0.08      | $4.00  |

## Release Workflow

```bash
# 1. Make changes, commit
git add <files> && git commit -m "fix: description"

# 2. Bump version
npm version patch    # or minor / major

# 3. Push — GitHub Actions publishes to npm automatically
git push && git push --tags
```

CI runs on every push (test + typecheck). Publish runs on `v*` tags only.

## Boundaries

- **Always:** Run tests before committing, validate with `npx tsc --noEmit`
- **Ask first:** Adding dependencies, changing the attribution model, modifying pricing
- **Never:** Write to JSONL files, send data externally, commit node_modules or dist/

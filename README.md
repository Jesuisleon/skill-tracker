---
title: "Skill Tracker — Claude Code Usage Analytics CLI"
type: documentation
version: "1.0"
created: 2026-04-09
updated: 2026-04-09
domain: cli
tags: [claude-code, analytics, skills, agents, tokens, jsonl]
summary: >
  CLI tool that analyzes Claude Code local JSONL conversation files to produce
  a terminal dashboard of skill and agent usage with turn-based token attribution.
---

# Skill Tracker

CLI tool that analyzes Claude Code JSONL conversation files to answer: **"Which skills and agents do I use most, and how much do they cost in tokens?"**

```
╔══════════════════════════════════════════════════════════════╗
║  SKILL TRACKER — Claude Code Usage Analytics                ║
║  Analyzed: 459 sessions · 1528 JSONL files · Last 7d         ║
╚══════════════════════════════════════════════════════════════╝

┌─ TOP SKILLS BY TOKENS ─────────────────────────────────────┐
│ Skill                  │ Calls │ Avg Input │ Max Input │ Total    │
│ no-skill               │ 5024  │ 71.9K     │ 251.9K    │ 362.8M   │
│ dev-features           │    12 │ 149.6K    │ 348.3K    │ 177.3M   │
│ agent-browser          │    10 │ 112.5K    │ 257.4K    │ 114.7M   │
│ commit                 │    41 │ 103.7K    │ 236.2K    │  92.0M   │
└─────────────────────────────────────────────────────────────┘
```

## Installation

```bash
# Clone the repository
git clone <repo-url> skill-tracker
cd skill-tracker

# Install dependencies
npm install

# Build
npm run build

# Link globally (makes `skill-tracker` available in PATH)
npm link
```

**Requirements:** Node.js >= 18

## Quick Start

```bash
# Full dashboard (default)
skill-tracker

# Last 7 days only
skill-tracker --last 7d

# Top 5 skills, sorted by invocation count
skill-tracker skills --sort count --top 5

# JSON output for piping
skill-tracker --json --last 30d | jq '.skills[:3]'
```

## Commands

### Default Dashboard

```bash
skill-tracker [options]
```

Shows the full dashboard with four sections: Top Skills, Top Agents, Daily Trend, and Recent Sessions.

### Subcommands

| Command | Description |
|---------|-------------|
| `skill-tracker skills` | Skills-only breakdown table |
| `skill-tracker agents` | Agents-only breakdown table |
| `skill-tracker sessions` | Per-session breakdown |
| `skill-tracker trends` | Daily usage trends with sparklines |

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--sort <field>` | Sort by `tokens` or `count` | `tokens` |
| `--top <n>` | Limit to top N entries | all |
| `--since <date>` | Filter from date (YYYY-MM-DD) | none |
| `--last <period>` | Filter last N days (e.g. `30d`) | none |
| `--json` | Output valid JSON for piping | off |

### Examples

```bash
# Skills sorted by invocation count
skill-tracker skills --sort count

# Top 10 agents since January
skill-tracker agents --top 10 --since 2026-01-01

# Sessions from last 3 days as JSON
skill-tracker sessions --last 3d --json

# Trends for the past month
skill-tracker trends --last 30d
```

## How It Works

### Data Source

Skill Tracker reads Claude Code conversation files stored locally at:

```
~/.claude/projects/
  <project-dir>/
    <session-uuid>.jsonl
    <session-uuid>.jsonl
    ...
```

Each `.jsonl` file represents one Claude Code session. Files inside `subagents/` subdirectories are excluded (they contain internal agent conversations, not top-level sessions).

### Detection Patterns

**Skills** are detected from two patterns in user messages:

1. **Skill injection** — `Base directory for this skill: .../skills/<skill-name>` (when Claude loads a skill)
2. **Slash command** — `<command-message>plugin:skill-name</command-message>` (when user invokes `/skill-name`)

Built-in commands (`/clear`, `/compact`, `/help`, `/init`, `/mcp`, `/plugin`) are filtered out.

**Agents** are detected from assistant messages containing `Agent` tool_use blocks:

```json
{ "type": "tool_use", "name": "Agent", "input": { "subagent_type": "Explore" } }
```

The agent name is `subagent_type` (preferred) or `description` truncated to 40 chars (fallback).

### Token Attribution

```
  For each session (JSONL file):
    currentSkill = "no-skill"

    for each message in order:
      [user message]
        |
        +---> skill detected? ---> currentSkill = skill name
        |
      [assistant message]
        |
        +---> attribute usage.input_tokens to currentSkill
        +---> attribute usage.output_tokens to currentSkill
        +---> detect Agent tool_use blocks (record spawn)
```

Turn-based attribution assigns each assistant turn's token usage to the currently active skill. Tokens before any skill invocation go to `"no-skill"`. When a new skill is invoked, all subsequent turns are attributed to it until the next skill switch.

**Total input tokens** = `input_tokens` + `cache_creation_input_tokens` + `cache_read_input_tokens`

### Message Deduplication

Claude Code streams assistant messages as multiple JSONL fragments with the same `message.id`. The deduplicator buffers fragments and only keeps the last one per ID (which carries the complete token usage).

## Architecture

```
  ~/.claude/projects/**/*.jsonl (excluding subagents/)
           |
           v
  [jsonl-reader]  ------>  AsyncGenerator<RawJMessage>
           |                   (streaming readline, no full-file load)
           v
  [message-deduplicator]  ->  Collapse fragments by message.id
           |                   (last-wins strategy)
           v
  [token-attributor]  ----->  AttributedSession per file
       |       |                 |
       |       |                 +--- calls [skill-detector]
       |       |                 +--- calls [agent-detector]
       |       |
       v       v
  [pipeline]  ---------> AttributedSession[]
       |                   (32-file parallel batches)
       v
  [metrics]  +  [trends]  ->  SkillMetrics[], AgentMetrics[],
       |                       SessionMetrics[], DailyTrend[]
       v
  [dashboard]  ---------->  Terminal output (cli-table3 + chalk)
       |
       +--- [tables]       Table renderers with formatTokens()
       +--- [sparklines]   Inline bar charts (▁▂▃▄▅▆▇█)
```

### Project Structure

```
skill-tracker/
  src/
    types.ts                ← Shared types, totalInput(), extractText()
    pipeline.ts             ← File discovery + parallel batch processing
    index.ts                ← CLI entry point (commander)
    reader/
      jsonl-reader.ts       ← Streaming JSONL file reader
      message-deduplicator.ts ← Fragment dedup by message.id
    parser/
      skill-detector.ts     ← Skill pattern matching (2 patterns)
      agent-detector.ts     ← Agent tool_use extraction
      token-attributor.ts   ← Turn-based attribution state machine
    aggregator/
      metrics.ts            ← Aggregate into SkillMetrics, AgentMetrics, SessionMetrics
      trends.ts             ← Daily grouping + date filters (--since, --last)
    display/
      sparklines.ts         ← Number array → inline bar chart
      tables.ts             ← cli-table3 renderers + formatTokens()
      dashboard.ts          ← Full layout composer (4 sections + header/footer)
  package.json
  tsconfig.json
  SPEC.md
```

### Dependency Graph

```
  types.ts ──────────────────────┐
    |                            |
    +── reader/                  |
    |     jsonl-reader.ts        |
    |     message-deduplicator.ts|
    |                            |
    +── parser/                  |
    |     skill-detector.ts ─────+──> token-attributor.ts
    |     agent-detector.ts ─────+         |
    |                                      v
    +── pipeline.ts <──────────────── (orchestrates)
    |         |
    |         v
    +── aggregator/
    |     metrics.ts ──────────> trends.ts
    |                               |
    +── display/                    |
    |     sparklines.ts             |
    |     tables.ts ────────> dashboard.ts
    |                               |
    +── index.ts <──────────────────+
```

## Performance

- **Streaming**: JSONL files are read line-by-line via `node:readline` — never loaded fully into memory
- **Parallel I/O**: Files processed in batches of 32 concurrent streams
- **Subagent exclusion**: Skips ~69% of JSONL files (subagent conversations)
- **Efficient aggregation**: O(N) metrics computation, no redundant iterations

Typical performance: ~1,500 JSONL files (~1.9 GB) processed in ~6 seconds.

## JSON Output

Use `--json` for machine-readable output:

```bash
skill-tracker --json --last 7d
```

Output structure:

```json
{
  "meta": {
    "fileCount": 1528,
    "sessionCount": 459,
    "errorCount": 0,
    "durationMs": 6056
  },
  "skills": [
    {
      "name": "dev-features",
      "invocationCount": 12,
      "totalInputTokens": 176865678,
      "totalOutputTokens": 464184,
      "avgInputTokens": 149633,
      "avgOutputTokens": 393,
      "maxInputTokens": 348307,
      "maxOutputTokens": 7366,
      "sessionsUsedIn": 12,
      "lastUsed": "2026-04-09"
    }
  ],
  "agents": [...],
  "sessions": [...],
  "trends": [...]
}
```

## Development

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Build
npm run build

# Type check only
npx tsc --noEmit

# Watch mode (rebuild on save)
npm run dev
```

### Test Coverage

Tests are co-located with source files (`*.test.ts`):

| Module | Tests | Focus |
|--------|-------|-------|
| `jsonl-reader` | 5 | Streaming, malformed line handling, error counting |
| `message-deduplicator` | 8 | Fragment collapse, flush timing, edge cases |
| `skill-detector` | 12 | Both detection patterns, denylist, edge cases |
| `agent-detector` | 6 | subagent_type, description fallback, empty content |
| `token-attributor` | 11 | Multi-skill sessions, no-skill, agents-in-skill |
| `metrics` | 16 | Avg/max/total math, sorting, sessions count |
| `trends` | 20 | Date grouping, filters, default window |

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Turn-based attribution** over session-level | More accurate — tracks which skill consumed which tokens |
| **Streaming readline** over load-all | Memory safety — some JSONL files exceed 50 MB |
| **No external DB** | Pure file analysis, computed on the fly. Zero config. |
| **Separate message-deduplicator** | Isolates the subtle streaming-fragment bug for independent testing |
| **`no-skill` bucket** | Tokens before any skill invocation still need to be tracked |
| **NaN guards on usage fields** | JSONL content is untrusted — defensive parsing prevents silent corruption |

## Boundaries

- **Read-only**: Never writes to JSONL files or sends data externally
- **Local only**: Reads only from `~/.claude/projects/`
- **No caching**: Results computed fresh on each run
- **Symlink-safe**: Symbolic links in project directories are excluded from scan

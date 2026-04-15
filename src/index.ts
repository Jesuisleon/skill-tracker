#!/usr/bin/env node
import { Command, InvalidArgumentError } from 'commander';
import { runPipeline } from './pipeline.js';
import {
  renderDashboard,
  renderSkillsSection,
  renderAgentsSection,
  renderSessionsSection,
  renderTrendsSection,
} from './display/dashboard.js';
import { aggregateSkillMetrics, aggregateAgentMetrics, aggregateSessionMetrics } from './aggregator/metrics.js';
import { aggregateTrends, filterSessionsByDate } from './aggregator/trends.js';
import { DEFAULT_TREND_WINDOW } from './types.js';
import type { DashboardOptions } from './display/dashboard.js';

interface CommandOpts {
  sort?: 'tokens' | 'count';
  top?: number;
  since?: string;
  last?: string;
  json?: boolean;
}

async function runCommand(view: string, opts: CommandOpts): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  const dashOpts: DashboardOptions = {
    top: opts.top,
    sort: opts.sort ?? 'tokens',
    since: opts.since,
    last: opts.last,
    today,
  };

  try {
    const result = await runPipeline();

    if (opts.json) {
      const filtered = filterSessionsByDate(result.sessions, opts.since, opts.last, today);
      const trendLast = opts.last ?? (opts.since ? undefined : DEFAULT_TREND_WINDOW);
      const trendSessions = trendLast
        ? filterSessionsByDate(filtered, undefined, trendLast, today)
        : filtered;

      const jsonOutput = {
        meta: {
          fileCount: result.fileCount,
          sessionCount: filtered.length,
          errorCount: result.errorCount,
          durationMs: result.durationMs,
        },
        skills: aggregateSkillMetrics(filtered, opts.sort ?? 'tokens'),
        agents: aggregateAgentMetrics(filtered),
        sessions: aggregateSessionMetrics(filtered).slice(0, opts.top),
        trends: aggregateTrends(trendSessions),
      };
      console.log(JSON.stringify(jsonOutput, null, 2));
      return;
    }

    switch (view) {
      case 'skills':
        console.log(renderSkillsSection(result, dashOpts));
        break;
      case 'agents':
        console.log(renderAgentsSection(result, dashOpts));
        break;
      case 'sessions':
        console.log(renderSessionsSection(result, dashOpts));
        break;
      case 'trends':
        console.log(renderTrendsSection(result, dashOpts));
        break;
      default:
        console.log(renderDashboard(result, dashOpts));
    }
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function parsePositiveInt(value: string): number {
  const n = parseInt(value, 10);
  if (!Number.isInteger(n) || n < 1) {
    throw new InvalidArgumentError('Must be a positive integer.');
  }
  return n;
}

function parseDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InvalidArgumentError('Must be YYYY-MM-DD format.');
  }
  return value;
}

function addCommonOptions(cmd: Command): Command {
  return cmd
    .option('--sort <field>', 'Sort by: tokens | count', 'tokens')
    .option('--top <n>', 'Limit to top N entries', parsePositiveInt)
    .option('--since <date>', 'Filter by date (YYYY-MM-DD)', parseDate)
    .option('--last <period>', 'Filter last N days (e.g. 30d)')
    .option('--json', 'Output as JSON');
}

const program = new Command();

program
  .name('skill-tracker')
  .description('Analyze Claude Code skill and agent usage from JSONL conversation files')
  .version('1.0.0');

// Default command (no subcommand -> full dashboard)
addCommonOptions(
  program.command('dashboard', { isDefault: true })
    .description('Show full dashboard (default)')
).action(async (opts: CommandOpts) => {
  await runCommand('dashboard', opts);
});

// Subcommands
addCommonOptions(program.command('skills').description('Show skills breakdown'))
  .action(async (opts: CommandOpts) => { await runCommand('skills', opts); });

addCommonOptions(program.command('agents').description('Show agents breakdown'))
  .action(async (opts: CommandOpts) => { await runCommand('agents', opts); });

addCommonOptions(program.command('sessions').description('Show per-session breakdown'))
  .action(async (opts: CommandOpts) => { await runCommand('sessions', opts); });

addCommonOptions(program.command('trends').description('Show daily usage trends'))
  .action(async (opts: CommandOpts) => { await runCommand('trends', opts); });

program.parse(process.argv);

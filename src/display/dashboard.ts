import chalk from 'chalk';
import type { AttributedSession, PipelineResult } from '../types.js';
import { DEFAULT_TREND_WINDOW } from '../types.js';
import { aggregateSkillMetrics, aggregateAgentMetrics, aggregateSessionMetrics } from '../aggregator/metrics.js';
import { aggregateTrends, filterSessionsByDate } from '../aggregator/trends.js';
import { renderSkillsTable, renderAgentsTable, renderSessionsTable, renderTrendsTable, formatTokens, formatCost } from './tables.js';

export interface DashboardOptions {
  top?: number;
  sort?: 'tokens' | 'count';
  since?: string;
  last?: string;
  today?: string;
}

export function renderDashboard(result: PipelineResult, opts: DashboardOptions = {}): string {
  const { sessions, fileCount } = result;
  const { top, sort = 'tokens', since, last, today } = opts;

  // Filter sessions by date once — all downstream uses receive pre-filtered data
  const filtered = filterSessionsByDate(sessions, since, last, today);

  const lines: string[] = [];

  // Header
  const dateRange = since
    ? `Since ${since}`
    : last
    ? `Last ${last}`
    : 'All time';

  const infoLine = `  Analyzed: ${filtered.length} sessions · ${fileCount} JSONL files · ${dateRange}`;
  const padded = infoLine.length < 62
    ? infoLine + ' '.repeat(62 - infoLine.length)
    : infoLine.slice(0, 62);

  lines.push('');
  lines.push(chalk.bold.blue('╔══════════════════════════════════════════════════════════════╗'));
  lines.push(chalk.bold.blue('║') + chalk.bold.white('  SKILL TRACKER — Claude Code Usage Analytics                ') + chalk.bold.blue('║'));
  lines.push(chalk.bold.blue('║') + chalk.gray(padded) + chalk.bold.blue('║'));
  lines.push(chalk.bold.blue('╚══════════════════════════════════════════════════════════════╝'));
  lines.push('');

  // Top Skills
  lines.push(chalk.bold(sectionHeader('TOP SKILLS BY ' + (sort === 'count' ? 'COUNT' : 'TOKENS'))));
  const skillMetrics = aggregateSkillMetrics(filtered, sort);
  if (skillMetrics.length === 0) {
    lines.push(chalk.dim('  No skill data found.\n'));
  } else {
    lines.push(renderSkillsTable(skillMetrics, top));
  }
  lines.push('');

  // Top Agents
  lines.push(chalk.bold(sectionHeader('TOP AGENTS BY SPAWNS')));
  const agentMetrics = aggregateAgentMetrics(filtered);
  if (agentMetrics.length === 0) {
    lines.push(chalk.dim('  No agent data found.\n'));
  } else {
    lines.push(renderAgentsTable(agentMetrics, top ?? 15));
  }
  lines.push('');

  // Daily Trends — apply default window if no date filter was given
  const trendLabel = last ? `last ${last}` : since ? `since ${since}` : `last ${DEFAULT_TREND_WINDOW}`;
  lines.push(chalk.bold(sectionHeader(`DAILY TREND (${trendLabel})`)));
  const trendSessions = (!since && !last)
    ? filterSessionsByDate(filtered, undefined, DEFAULT_TREND_WINDOW, today)
    : filtered;
  const trends = aggregateTrends(trendSessions);
  lines.push(renderTrendsTable(trends));
  lines.push('');

  // Recent Sessions
  lines.push(chalk.bold(sectionHeader('RECENT SESSIONS')));
  const sessionMetrics = aggregateSessionMetrics(filtered);
  if (sessionMetrics.length === 0) {
    lines.push(chalk.dim('  No session data found.\n'));
  } else {
    lines.push(renderSessionsTable(sessionMetrics, top ?? 10));
  }
  lines.push('');

  // Footer — use pre-computed sessionMetrics
  const totalTokens = sessionMetrics.reduce(
    (sum, m) => sum + m.totalInputTokens + m.totalOutputTokens, 0
  );
  const totalCost = sessionMetrics.reduce(
    (sum, m) => sum + m.estimatedCostUsd, 0
  );
  lines.push(chalk.dim(`  Tokens: ${formatTokens(totalTokens)} · Est. cost: ${formatCost(totalCost)} · Processed in ${result.durationMs}ms`));
  lines.push('');

  return lines.join('\n');
}

function sectionHeader(title: string, width = 62): string {
  const prefix = `┌─ ${title} `;
  const remaining = Math.max(0, width - prefix.length - 1);
  return prefix + '─'.repeat(remaining) + '┐';
}

// Render a specific section only
export function renderSkillsSection(result: PipelineResult, opts: DashboardOptions = {}): string {
  const filtered = filterSessionsByDate(result.sessions, opts.since, opts.last, opts.today);
  return renderSkillsTable(aggregateSkillMetrics(filtered, opts.sort ?? 'tokens'), opts.top);
}

export function renderAgentsSection(result: PipelineResult, opts: DashboardOptions = {}): string {
  const filtered = filterSessionsByDate(result.sessions, opts.since, opts.last, opts.today);
  return renderAgentsTable(aggregateAgentMetrics(filtered), opts.top);
}

export function renderSessionsSection(result: PipelineResult, opts: DashboardOptions = {}): string {
  const filtered = filterSessionsByDate(result.sessions, opts.since, opts.last, opts.today);
  return renderSessionsTable(aggregateSessionMetrics(filtered), opts.top);
}

export function renderTrendsSection(result: PipelineResult, opts: DashboardOptions = {}): string {
  const filtered = filterSessionsByDate(result.sessions, opts.since, opts.last, opts.today);
  const trendSessions = (!opts.since && !opts.last)
    ? filterSessionsByDate(filtered, undefined, DEFAULT_TREND_WINDOW, opts.today)
    : filtered;
  return renderTrendsTable(aggregateTrends(trendSessions));
}

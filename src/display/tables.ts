import Table from 'cli-table3';
import chalk from 'chalk';
import type { SkillMetrics, AgentMetrics, SessionMetrics, DailyTrend } from '../types.js';
import { sparkline } from './sparklines.js';

// Format token count into human-readable string
export function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K`;
  }
  return String(n);
}

// Format USD cost
export function formatCost(usd: number): string {
  if (usd >= 100) return `$${usd.toFixed(0)}`;
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(3)}`;
}

// Truncate string to maxLen, adding "…" if truncated
function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + '…';
}

// Render skills table with cost and delta
export function renderSkillsTable(metrics: SkillMetrics[], top?: number): string {
  const data = top ? metrics.slice(0, top) : metrics;

  const table = new Table({
    head: [
      chalk.cyan('Skill'),
      chalk.cyan('Calls'),
      chalk.cyan('Delta'),
      chalk.cyan('Cost'),
      chalk.cyan('Cache%'),
      chalk.cyan('Sessions'),
    ],
    colWidths: [22, 7, 10, 9, 8, 10],
    style: { head: [], border: [] },
  });

  for (const m of data) {
    const totalTokens = m.cacheReadTokens + m.cacheCreationTokens + m.rawInputTokens;
    const cachePct = totalTokens > 0
      ? Math.round((m.cacheReadTokens / totalTokens) * 100)
      : 0;
    table.push([
      truncate(m.name, 20),
      String(m.invocationCount),
      chalk.green(formatTokens(m.deltaInputTokens)),
      chalk.yellow(formatCost(m.estimatedCostUsd)),
      `${cachePct}%`,
      String(m.sessionsUsedIn),
    ]);
  }

  return table.toString();
}

// Render agents table
export function renderAgentsTable(metrics: AgentMetrics[], top?: number): string {
  const data = top ? metrics.slice(0, top) : metrics;

  const table = new Table({
    head: [
      chalk.cyan('Agent'),
      chalk.cyan('Spawns'),
      chalk.cyan('Sessions'),
      chalk.cyan('Last Used'),
    ],
    colWidths: [30, 8, 10, 12],
    style: { head: [], border: [] },
  });

  for (const m of data) {
    table.push([
      truncate(m.name, 28),
      String(m.spawnCount),
      String(m.sessionsUsedIn),
      m.lastUsed,
    ]);
  }

  return table.toString();
}

// Render sessions table with cost
export function renderSessionsTable(metrics: SessionMetrics[], top?: number): string {
  const data = top ? metrics.slice(0, top) : metrics;

  const table = new Table({
    head: [
      chalk.cyan('Session'),
      chalk.cyan('Date'),
      chalk.cyan('Project'),
      chalk.cyan('Skills'),
      chalk.cyan('Cost'),
    ],
    colWidths: [12, 12, 16, 22, 9],
    style: { head: [], border: [] },
  });

  for (const m of data) {
    const skillList = m.skills.length > 0
      ? truncate(m.skills.join(','), 20)
      : chalk.dim('(none)');
    table.push([
      truncate(m.sessionId, 12),
      m.date,
      truncate(m.project, 14),
      skillList,
      chalk.yellow(formatCost(m.estimatedCostUsd)),
    ]);
  }

  return table.toString();
}

// Render trends table with sparkline and cost
export function renderTrendsTable(trends: DailyTrend[]): string {
  if (trends.length === 0) {
    return chalk.dim('  No data for selected date range.\n');
  }

  const table = new Table({
    head: [
      chalk.cyan('Date'),
      chalk.cyan('Sessions'),
      chalk.cyan('Cost'),
      chalk.cyan('Skills'),
      chalk.cyan('Agents'),
      chalk.cyan('Trend'),
    ],
    colWidths: [12, 10, 10, 8, 8, 10],
    style: { head: [], border: [] },
  });

  const costValues = trends.map(t => t.estimatedCostUsd);
  const sparks = sparkline(costValues);

  for (let i = 0; i < trends.length; i++) {
    const t = trends[i];
    table.push([
      t.date,
      String(t.sessionCount),
      chalk.yellow(formatCost(t.estimatedCostUsd)),
      String(t.skillInvocations),
      String(t.agentSpawns),
      sparks[i] ?? '',
    ]);
  }

  return table.toString();
}

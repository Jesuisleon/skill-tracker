import type { AttributedSession, DailyTrend } from '../types.js';
import { totalInput, estimateCostUsd, DEFAULT_TREND_WINDOW } from '../types.js';

// Parse a "--last Nd" value to a cutoff date string (YYYY-MM-DD).
// e.g. "14d" -> date 14 days ago from today
export function parseLast(last: string, today: string = new Date().toISOString().slice(0, 10)): string {
  const match = last.match(/^(\d+)d$/);
  if (!match) throw new Error(`Invalid --last format: "${last}". Expected format: Nd (e.g. "14d")`);
  const days = parseInt(match[1], 10);
  const date = new Date(today + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

// Filter sessions by date range.
// since: inclusive lower bound (YYYY-MM-DD)
// Returns sessions on or after since date.
export function filterSessionsByDate(
  sessions: AttributedSession[],
  since?: string,
  last?: string,
  today?: string
): AttributedSession[] {
  let cutoff: string | null = null;

  if (last) {
    cutoff = parseLast(last, today);
  } else if (since) {
    cutoff = since;
  }

  if (!cutoff) return sessions;

  return sessions.filter(s => s.date >= cutoff!);
}

// Group sessions by ISO date and produce DailyTrend[].
// Accepts already-filtered sessions — does NOT re-filter internally.
// Returns sorted by date ascending.
export function aggregateTrends(sessions: AttributedSession[]): DailyTrend[] {
  const map = new Map<string, DailyTrend>();

  for (const session of sessions) {
    let trend = map.get(session.date);
    if (!trend) {
      trend = {
        date: session.date,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        sessionCount: 0,
        skillInvocations: 0,
        agentSpawns: 0,
        estimatedCostUsd: 0,
      };
      map.set(session.date, trend);
    }

    trend.sessionCount++;
    trend.skillInvocations += session.skillsInvoked.length;
    trend.agentSpawns += session.agentSpawns.length;

    for (const turns of session.skillTurns.values()) {
      for (const turn of turns) {
        trend.totalInputTokens += totalInput(turn);
        trend.totalOutputTokens += turn.output_tokens;
        trend.estimatedCostUsd += estimateCostUsd(turn);
      }
    }
  }

  // Sort by date ascending
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// Get the default trend window.
export function getDefaultTrends(
  sessions: AttributedSession[],
  today?: string
): DailyTrend[] {
  const filtered = filterSessionsByDate(sessions, undefined, DEFAULT_TREND_WINDOW, today);
  return aggregateTrends(filtered);
}

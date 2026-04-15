import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { attributeSession } from './parser/token-attributor.js';
import type { AttributedSession, PipelineResult } from './types.js';

const BATCH_SIZE = 32;

// Find all top-level JSONL files in ~/.claude/projects/
// Excludes files inside subagents/ subdirectories.
async function findSessionFiles(): Promise<{ files: string[]; scanErrors: number }> {
  const projectsDir = join(homedir(), '.claude', 'projects');
  const files: string[] = [];
  let scanErrors = 0;

  let projectDirs: string[];
  try {
    const entries = await readdir(projectsDir, { withFileTypes: true });
    projectDirs = entries
      .filter(e => e.isDirectory() && !e.isSymbolicLink())
      .map(e => join(projectsDir, e.name));
  } catch {
    // Projects directory doesn't exist
    return { files: [], scanErrors: 0 };
  }

  // Parallel readdir for all project directories
  const dirResults = await Promise.allSettled(
    projectDirs.map(async (projectDir) => {
      const entries = await readdir(projectDir, { withFileTypes: true });
      return entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.jsonl'))
        .map(entry => join(projectDir, entry.name));
    })
  );

  for (const result of dirResults) {
    if (result.status === 'fulfilled') {
      files.push(...result.value);
    } else {
      scanErrors++;
    }
  }

  return { files, scanErrors };
}

// Process files in batches of BATCH_SIZE concurrent.
async function processInBatches(
  files: string[],
  batchSize: number
): Promise<{ sessions: AttributedSession[]; errorCount: number; parseErrors: number }> {
  const sessions: AttributedSession[] = [];
  let errorCount = 0;
  let parseErrors = 0;

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(f => attributeSession(f))
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === 'fulfilled') {
        sessions.push(result.value.session);
        parseErrors += result.value.parseErrors;
      } else {
        errorCount++;
        const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
        process.stderr.write(`Warning: ${batch[j]}: ${reason}\n`);
      }
    }
  }

  return { sessions, errorCount, parseErrors };
}

export async function runPipeline(): Promise<PipelineResult> {
  const start = Date.now();

  const { files, scanErrors } = await findSessionFiles();
  const { sessions, errorCount, parseErrors } = await processInBatches(files, BATCH_SIZE);

  const durationMs = Date.now() - start;

  return {
    sessions,
    fileCount: files.length,
    errorCount: errorCount + scanErrors + parseErrors,
    durationMs,
  };
}

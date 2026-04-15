// BUILTIN commands that should not be treated as skills
const BUILTIN_DENYLIST = new Set(['clear', 'compact', 'plugin', 'mcp', 'help', 'init']);

// Valid skill name: lowercase letters/digits/hyphens, 2+ chars, starts with a letter.
// Rejects garbage from spec/doc examples like "([^", "SKILLNAME", "dev-features\\\\n"
const VALID_SKILL_NAME = /^[a-z][a-z0-9-]+$/;

function isValidSkillName(name: string): boolean {
  return VALID_SKILL_NAME.test(name);
}

// Detects a skill invocation from the text content of a user message.
// Returns the skill name (stripped of plugin prefix), or null if not a skill message.
//
// Pattern 1: "Base directory for this skill:" injection
//   - looks for skills/([^/\s]+) in the text
//   - wins over Pattern 2 if both match (more specific)
//
// Pattern 2: <command-message>...</command-message>
//   - strips plugin prefix (split(':').pop())
//   - filtered against BUILTIN_DENYLIST
//
// Both patterns validate the extracted name against VALID_SKILL_NAME.
// Last match wins within message (if text has multiple matches).
export function detectSkill(text: string): string | null {
  let result: string | null = null;

  // Pattern 1: Base directory injection
  // Can appear multiple times - last match wins
  if (text.includes('Base directory for this skill:')) {
    const skillPathRegex = /skills\/([^/\s]+)/g;
    let match: RegExpExecArray | null;
    while ((match = skillPathRegex.exec(text)) !== null) {
      const candidate = match[1];
      if (isValidSkillName(candidate)) {
        result = candidate;
      }
    }
    // If we found a valid skill via pattern 1, return it (more specific, wins)
    if (result !== null) {
      return result;
    }
  }

  // Pattern 2: <command-message> tag
  const cmdRegex = /<command-message>(.*?)<\/command-message>/gs;
  let cmdMatch: RegExpExecArray | null;
  while ((cmdMatch = cmdRegex.exec(text)) !== null) {
    const raw = cmdMatch[1].trim();
    // Strip plugin prefix (e.g. "personal-workflow:dev-features" -> "dev-features")
    const name = raw.split(':').pop() ?? raw;
    if (!BUILTIN_DENYLIST.has(name) && isValidSkillName(name)) {
      result = name;
    }
  }

  return result;
}

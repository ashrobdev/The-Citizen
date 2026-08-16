import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The attempt log is the source of truth for all scheduling state, and
 * `reduceQuestionState` assumes it is append-only. A single stray UPDATE would
 * break replay silently — states would drift from history with nothing to
 * indicate it.
 *
 * The AttemptRepository interface exposes no mutation methods, but nothing stops
 * someone reaching past it with raw SQL, so this asserts it at the source level.
 */

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry) && !entry.endsWith('.test.ts')) acc.push(full);
  }
  return acc;
}

describe('the attempt log is append-only', () => {
  const files = sourceFiles(join(__dirname, '..'));

  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('contains no UPDATE or DELETE against the attempts table', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      // Matches "UPDATE attempts", "DELETE FROM attempts", any casing/whitespace.
      if (/\bupdate\s+attempts\b/i.test(text) || /\bdelete\s+from\s+attempts\b/i.test(text)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('exposes no mutation methods on AttemptRepository', () => {
    const contract = readFileSync(join(__dirname, 'repositories.ts'), 'utf8');
    const block = /export interface AttemptRepository \{([\s\S]*?)\n\}/.exec(contract)?.[1] ?? '';
    expect(block.length).toBeGreaterThan(0);
    for (const forbidden of ['update', 'delete', 'remove', 'clear']) {
      expect(block.toLowerCase()).not.toContain(`${forbidden}(`);
    }
  });
});

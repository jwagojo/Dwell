import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Copy guard (tasks.md 10.1, 22.2; voltlot-rules.md §1). Scans every page and component for wording the product must
 * never use, and checks the pages keep the phrases they must show.
 */
const SRC = path.dirname(new URL(import.meta.url).pathname);

function tsxFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return tsxFiles(p);
    return e.name.endsWith('.tsx') && !e.name.endsWith('.test.tsx') ? [p] : [];
  });
}

const FORBIDDEN: { rule: string; pattern: RegExp }[] = [
  { rule: 'never promise a full charge (say "Estimated miles added")', pattern: /full charge/i },
  { rule: 'exported solar is never "wasted" (net metering)', pattern: /\bwasted\b/i },
  { rule: 'never ask the driver about adapters (hosts provide them)', pattern: /do you (own|have) an adapter|bring your (own )?adapter/i },
];

const REQUIRED: Record<string, RegExp[]> = {
  'pages/Landing.tsx': [/Estimated miles added/i, /No key handoff/i, /car never moves/i, /host never touches/i, /Become a host/i],
  'pages/ListingPage.tsx': [/local solar self-consumption/i],
};

const files = tsxFiles(SRC);

describe('copy guard', () => {
  it('scans the pages and components', () => {
    expect(files.some((f) => f.endsWith('pages/Landing.tsx'))).toBe(true);
    expect(files.some((f) => f.includes(`${path.sep}components${path.sep}`))).toBe(true);
  });

  it.each(FORBIDDEN)('nowhere: $rule', ({ pattern }) => {
    const hits = files.filter((f) => pattern.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(SRC, f));
    expect(hits).toEqual([]);
  });

  it.each(Object.entries(REQUIRED))('%s keeps its required wording', (file, patterns) => {
    const text = fs.readFileSync(path.join(SRC, file), 'utf8');
    for (const p of patterns) expect(text, `missing ${p}`).toMatch(p);
  });
});

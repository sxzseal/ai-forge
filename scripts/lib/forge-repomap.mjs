#!/usr/bin/env node
// ai-forge repo map CLI — lightweight symbol map for subagent context injection.
//
// Extracts top-level exports from .ts/.tsx files, ranks by directory priority
// (features > shared > components > lib > app), and truncates to a token budget.
//
// Usage:
//   forge-repomap build [--max-tokens N] [--include glob] [--exclude glob] [--out path]
//   forge-repomap show [--path .loop/dev/repo-map.txt]
//
// Default output: .loop/dev/repo-map.txt

import { readFileSync, readdirSync, lstatSync, realpathSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { parseArgs, die, findRepoRoot, findLoopDir, ensureDir } from './_common.mjs';

const PREFIX = 'forge-repomap';
const fail = (m, c = 1) => die(PREFIX, m, c);

const DEFAULT_EXCLUDE_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.loop',
  '.storybook',
  'tests',
  'test',
  'e2e',
  '.turbo',
  '.vercel',
]);

const DIR_PRIORITY = [
  { pattern: /^src\/features\/[^/]+\//, weight: 100 },
  { pattern: /^src\/features\/_shared\//, weight: 90 },
  { pattern: /^src\/stories\//, weight: 40 },
  { pattern: /^src\/app\//, weight: 60 },
  { pattern: /^src\/lib\//, weight: 70 },
  { pattern: /^src\/components\/ui\//, weight: 20 },
  { pattern: /^src\/components\//, weight: 50 },
  { pattern: /^src\//, weight: 30 },
  { pattern: /^mocks\//, weight: 40 },
  { pattern: /^app\//, weight: 60 },
  { pattern: /^lib\//, weight: 70 },
];

function walkDir(dir, out, exts, visited = new Set()) {
  let realDir;
  try {
    realDir = realpathSync(dir);
  } catch {
    return;
  }
  if (visited.has(realDir)) return;
  visited.add(realDir);

  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    // Skip dotfiles/dotdirs. .storybook is intentionally kept out of the map;
    // it is also listed in DEFAULT_EXCLUDE_DIRS so a stray un-dotted variant
    // would still be filtered on the next line.
    if (name.startsWith('.')) continue;
    if (DEFAULT_EXCLUDE_DIRS.has(name)) continue;
    const full = join(dir, name);
    let lstat;
    try {
      lstat = lstatSync(full);
    } catch {
      continue;
    }
    if (lstat.isSymbolicLink()) continue; // skip symlinks to avoid loops
    if (lstat.isDirectory()) walkDir(full, out, exts, visited);
    else if (lstat.isFile()) {
      const dot = name.lastIndexOf('.');
      const ext = dot >= 0 ? name.slice(dot) : '';
      if (exts.includes(ext)) out.push(full);
    }
  }
}

function priorityOf(relPath) {
  for (const { pattern, weight } of DIR_PRIORITY) {
    if (pattern.test(relPath)) return weight;
  }
  return 10;
}

// Regex-extract top-level exports. Not AST-accurate but good enough for context injection.
const EXPORT_RE = /^export\s+(?:default\s+)?(?:async\s+)?(function|class|interface|type|const|let|enum)\s+(\w+)[^\n{=]*/gm;
const RE_EXPORT_RE = /^export\s*\{[^}]*\}(?:\s*from\s*['"][^'"]+['"])?/gm;
// Catch `export default` forms that EXPORT_RE misses — anonymous function/class,
// arrow expressions, object/array literals, plain identifiers.
// The negative lookahead avoids double-counting the named forms already matched above.
const EXPORT_DEFAULT_ANON_RE =
  /^export\s+default\s+(?!(?:async\s+)?(?:function|class|interface|type|const|let|enum)\s+\w+)(.+)$/gm;

function extractSymbols(content) {
  const out = [];
  // Named / default exports of declarations
  let m;
  while ((m = EXPORT_RE.exec(content)) !== null) {
    const line = m[0].trim().replace(/\s+/g, ' ').slice(0, 120);
    out.push(line);
  }
  // Re-exports
  while ((m = RE_EXPORT_RE.exec(content)) !== null) {
    out.push(m[0].trim().replace(/\s+/g, ' ').slice(0, 120));
  }
  // Anonymous default exports (React components, arrow fns, plain expressions)
  while ((m = EXPORT_DEFAULT_ANON_RE.exec(content)) !== null) {
    out.push(m[0].trim().replace(/\s+/g, ' ').slice(0, 120));
  }
  return out;
}

function approxTokens(text) {
  // Crude 4-chars-per-token approximation
  return Math.ceil(text.length / 4);
}

function cmdBuild(flags) {
  const repoRoot = findRepoRoot();
  const maxTokens = Number(flags['max-tokens'] || 2000);
  const outPath = flags.out || join(findLoopDir(), 'dev', 'repo-map.txt');

  // Collect files
  const files = [];
  walkDir(repoRoot, files, ['.ts', '.tsx']);

  // NOTE: substring match, not real glob. `*` is stripped then a plain
  // `String.includes` is used — good for `--include tsx` or `--include features/`,
  // but `--include "src/**/foo"` collapses to substring `src/foo` and won't
  // match nested paths. Swap in `picomatch` if real glob semantics are needed.
  const include = flags.include;
  const exclude = flags.exclude;
  const rel = files
    .map((f) => relative(repoRoot, f))
    .filter((r) => !include || r.includes(include.replace(/\*/g, '')))
    .filter((r) => !exclude || !r.includes(exclude.replace(/\*/g, '')));

  // Score + sort
  const scored = rel
    .map((r) => {
      const abs = join(repoRoot, r);
      let content = '';
      try {
        content = readFileSync(abs, 'utf8');
      } catch {
        return null;
      }
      const symbols = extractSymbols(content);
      const lines = content.split('\n').length;
      const priority = priorityOf(r);
      const score = priority + Math.min(20, Math.round(Math.log2(lines + 1)));
      return { file: r, symbols, lines, priority, score };
    })
    .filter(Boolean)
    .filter((e) => e.symbols.length > 0)
    .sort((a, b) => b.score - a.score);

  // Truncate to budget
  const chunks = [];
  let tokenBudget = maxTokens;
  const header = `# Repo map (generated ${new Date().toISOString()})\n# Total files scanned: ${rel.length}\n# max-tokens: ${maxTokens}\n\n`;
  chunks.push(header);
  tokenBudget -= approxTokens(header);

  let filesIncluded = 0;
  let filesSkipped = 0;
  // Small floor so we don't spend the last handful of tokens on nothing useful.
  const MIN_BUDGET_STOP = 32;
  for (const e of scored) {
    if (tokenBudget < MIN_BUDGET_STOP) break;
    const block = [
      `=== ${e.file} (${e.lines} lines, priority ${e.priority})`,
      ...e.symbols.map((s) => `  ${s}`),
      '',
    ].join('\n');
    const cost = approxTokens(block);
    if (cost > tokenBudget) {
      // Oversized file — keep scanning; a smaller lower-priority file may still fit.
      filesSkipped++;
      continue;
    }
    chunks.push(block);
    tokenBudget -= cost;
    filesIncluded++;
  }

  const output = chunks.join('\n');
  ensureDir(dirname(outPath));
  writeFileSync(outPath, output);
  process.stdout.write(
    JSON.stringify(
      {
        outPath,
        scannedFiles: rel.length,
        includedFiles: filesIncluded,
        skippedOversized: filesSkipped,
        approxTokens: maxTokens - tokenBudget,
        maxTokens,
      },
      null,
      2,
    ) + '\n',
  );
}

function cmdShow(flags) {
  const p = flags.path || join(findLoopDir(), 'dev', 'repo-map.txt');
  if (!existsSync(p)) fail(`repo-map not found: ${p}. Run 'forge-repomap build' first.`);
  process.stdout.write(readFileSync(p, 'utf8'));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const [cmd] = args._;
  if (!cmd) {
    process.stderr.write('usage: forge-repomap <build|show> [flags]\n');
    process.exit(1);
  }
  switch (cmd) {
    case 'build':
      return cmdBuild(args.flags);
    case 'show':
      return cmdShow(args.flags);
    default:
      fail(`unknown command: ${cmd}`);
  }
}

main();

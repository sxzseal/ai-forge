#!/usr/bin/env node
// ai-forge patch CLI — Aider-style SEARCH-REPLACE edit format.
//
// Patch file format (multiple blocks allowed, one file path header per block):
//
//   src/features/auth/queries.ts
//   <<<<<<< SEARCH
//   export const authQueries = {
//     // OLD
//   }
//   =======
//   export const authQueries = {
//     // NEW
//     login: () => ...,
//   }
//   >>>>>>> REPLACE
//
// Usage:
//   forge-patch validate <patch-file>          # parse + dry-run match; exit 0 or non-zero
//   forge-patch apply <patch-file>             # validate then rewrite files
//   forge-patch reject <patch-file>            # move to .loop/dev/rejected-patches/
//   forge-patch parse <patch-file>             # print parsed blocks as JSON

import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join, dirname, resolve, isAbsolute, relative, sep } from 'node:path';
import { parseArgs, die, findRepoRoot, findLoopDir, ensureDir, nowIso, appendLine, readLoopId } from './_common.mjs';

const PREFIX = 'forge-patch';
const fail = (m, c = 1) => die(PREFIX, m, c);

// Paths that must never be modifiable via a patch, even from a "create" block.
// Order matters: prefix match on posix-normalized relative path.
const FORBIDDEN_PATH_PREFIXES = [
  '.git/',
  '.claude/settings.json',
  '.claude/settings.local.json',
  'node_modules/',
];

function assertSafePath(repoRoot, filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error(`invalid file path: ${JSON.stringify(filePath)}`);
  }
  if (isAbsolute(filePath)) {
    throw new Error(`absolute path forbidden: ${filePath}`);
  }
  const abs = resolve(repoRoot, filePath);
  const rel = relative(repoRoot, abs);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`path traversal forbidden: ${filePath}`);
  }
  const norm = rel.split(sep).join('/');
  for (const bad of FORBIDDEN_PATH_PREFIXES) {
    if (norm === bad || norm.startsWith(bad)) {
      throw new Error(`path in forbidden zone (${bad}): ${filePath}`);
    }
  }
  return abs;
}

const HEAD = '<<<<<<< SEARCH';
const DIV = '=======';
const TAIL = '>>>>>>> REPLACE';

function parsePatch(text) {
  const lines = text.split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    // Skip blank lines and comment-like "# ..." lines
    while (i < lines.length && (lines[i].trim() === '' || lines[i].startsWith('# '))) i++;
    if (i >= lines.length) break;
    const filePath = lines[i].trim();
    i++;
    if (i >= lines.length || lines[i] !== HEAD) {
      throw new Error(`expected '${HEAD}' at line ${i + 1}, got: ${JSON.stringify(lines[i])}`);
    }
    i++;
    const search = [];
    while (i < lines.length && lines[i] !== DIV) {
      search.push(lines[i]);
      i++;
    }
    if (i >= lines.length) throw new Error(`unterminated SEARCH block for ${filePath}`);
    i++; // skip =======
    const replace = [];
    while (i < lines.length && lines[i] !== TAIL) {
      replace.push(lines[i]);
      i++;
    }
    if (i >= lines.length) throw new Error(`unterminated REPLACE block for ${filePath}`);
    i++; // skip >>>>>>> REPLACE
    blocks.push({
      file: filePath,
      search: search.join('\n'),
      replace: replace.join('\n'),
    });
  }
  if (blocks.length === 0) throw new Error('no patch blocks found');
  return blocks;
}

function validateBlock(block, repoRoot) {
  let abs;
  try {
    abs = assertSafePath(repoRoot, block.file);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  if (!existsSync(abs)) {
    // If SEARCH is empty and file doesn't exist, that's a "create file" operation
    if (block.search === '') return { ok: true, kind: 'create', abs };
    return { ok: false, error: `file not found: ${block.file}` };
  }
  const content = readFileSync(abs, 'utf8');
  if (block.search === '') {
    return { ok: false, error: `empty SEARCH on existing file (would overwrite): ${block.file}` };
  }
  const idx = content.indexOf(block.search);
  if (idx < 0) {
    // Try to identify nearest match for diagnostics
    const firstLine = block.search.split('\n')[0];
    const hint =
      firstLine && content.includes(firstLine)
        ? `first SEARCH line found but full block not; content may have drifted`
        : `SEARCH text not found in file`;
    return { ok: false, error: `${hint}: ${block.file}` };
  }
  // Check for ambiguity: multiple matches
  const nextIdx = content.indexOf(block.search, idx + 1);
  if (nextIdx >= 0) {
    return { ok: false, error: `ambiguous SEARCH (matches ${content.split(block.search).length - 1}x) in ${block.file}` };
  }
  return { ok: true, kind: 'edit', abs, matchIndex: idx };
}

function applyBlock(block, validation) {
  if (validation.kind === 'create') {
    ensureDir(dirname(validation.abs));
    const payload = block.replace + (block.replace.endsWith('\n') ? '' : '\n');
    try {
      writeFileSync(validation.abs, payload, { flag: 'wx' });
      return;
    } catch (e) {
      if (e && e.code !== 'EEXIST') throw e;
      // Lost the create race: someone materialised the file between
      // validate() and apply(). Fall through to edit semantics — but only if
      // the SEARCH is empty, we still refuse to blindly overwrite.
      throw new Error(`create-race on ${block.file}: file appeared after validation; re-run patch validate/apply`);
    }
  }
  const content = readFileSync(validation.abs, 'utf8');
  const next = content.slice(0, validation.matchIndex) + block.replace + content.slice(validation.matchIndex + block.search.length);
  writeFileSync(validation.abs, next);
}

function emitEvent(kind, payload) {
  try {
    const eventsPath = join(findLoopDir(), 'events.jsonl');
    const loopId = readLoopId();
    const ev = { ts: nowIso(), phase: 'dev', kind, payload };
    if (loopId) ev.loopId = loopId;
    appendLine(eventsPath, JSON.stringify(ev));
  } catch {
    /* best-effort */
  }
}

function cmdParse(patchPath) {
  if (!patchPath) fail('patch file path required');
  const text = readFileSync(patchPath, 'utf8');
  const blocks = parsePatch(text);
  process.stdout.write(JSON.stringify(blocks, null, 2) + '\n');
}

function cmdValidate(patchPath) {
  if (!patchPath) fail('patch file path required');
  const text = readFileSync(patchPath, 'utf8');
  let blocks;
  try {
    blocks = parsePatch(text);
  } catch (e) {
    fail(`parse error: ${e.message}`);
  }
  const repoRoot = findRepoRoot();
  const results = blocks.map((b) => ({ file: b.file, ...validateBlock(b, repoRoot) }));
  const errors = results.filter((r) => !r.ok);
  const output = { patch: patchPath, blocks: blocks.length, ok: errors.length === 0, results };
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  if (errors.length > 0) {
    emitEvent('patch.rejected', { patch: patchPath, errors: errors.map((e) => e.error) });
    process.exit(1);
  }
}

function cmdApply(patchPath) {
  if (!patchPath) fail('patch file path required');
  const text = readFileSync(patchPath, 'utf8');
  let blocks;
  try {
    blocks = parsePatch(text);
  } catch (e) {
    fail(`parse error: ${e.message}`);
  }
  const repoRoot = findRepoRoot();
  // Validate ALL blocks first — atomic apply semantics
  const validations = blocks.map((b) => ({ block: b, validation: validateBlock(b, repoRoot) }));
  const failures = validations.filter(({ validation }) => !validation.ok);
  if (failures.length > 0) {
    const errs = failures.map((f) => f.validation.error).join('; ');
    emitEvent('patch.rejected', { patch: patchPath, errors: failures.map((f) => f.validation.error) });
    fail(`apply aborted — validation failed: ${errs}`);
  }
  // All good — apply in order
  for (const { block, validation } of validations) {
    applyBlock(block, validation);
  }
  emitEvent('patch.applied', {
    patch: patchPath,
    files: blocks.map((b) => b.file),
    blocks: blocks.length,
  });
  process.stdout.write(
    JSON.stringify({ patch: patchPath, applied: blocks.length, files: [...new Set(blocks.map((b) => b.file))] }, null, 2) +
      '\n',
  );
}

function cmdReject(patchPath) {
  if (!patchPath) fail('patch file path required');
  const rejectDir = join(findLoopDir(), 'dev', 'rejected-patches');
  ensureDir(rejectDir);
  const base = patchPath.split('/').pop();
  const target = join(rejectDir, `${Date.now()}-${base}`);
  renameSync(patchPath, target);
  emitEvent('patch.rejected', { patch: patchPath, movedTo: target });
  process.stderr.write(`${PREFIX}: moved ${patchPath} → ${target}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const [cmd, path] = args._;
  if (!cmd) {
    process.stderr.write('usage: forge-patch <parse|validate|apply|reject> <patch-file>\n');
    process.exit(1);
  }
  switch (cmd) {
    case 'parse':
      return cmdParse(path);
    case 'validate':
      return cmdValidate(path);
    case 'apply':
      return cmdApply(path);
    case 'reject':
      return cmdReject(path);
    default:
      fail(`unknown command: ${cmd}`);
  }
}

main();

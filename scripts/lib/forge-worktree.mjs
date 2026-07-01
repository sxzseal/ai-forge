#!/usr/bin/env node
// ai-forge worktree CLI — isolate subagent work in git worktrees.
//
// Usage:
//   forge-worktree create --subagent <id> [--from <ref>]
//   forge-worktree list
//   forge-worktree merge --subagent <id> [--no-squash] [--message <msg>]
//   forge-worktree drop --subagent <id> [--force]
//   forge-worktree path --subagent <id>              # print worktree path
//
// worktrees live under .loop/.worktrees/<id>/ on branch `forge/<loop-id>/sa-<id>`.
// merge is always executed in the MAIN worktree, regardless of the caller's cwd.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, die, findRepoRoot, findLoopDir, ensureDir, nowIso, appendLine, readLoopId } from './_common.mjs';

const PREFIX = 'forge-worktree';
const fail = (m, c = 1) => die(PREFIX, m, c);

const SUBAGENT_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function requireSubagentId(id) {
  if (!id || typeof id !== 'string') fail('--subagent <id> required');
  if (!SUBAGENT_ID_RE.test(id)) {
    fail(`invalid --subagent id: ${JSON.stringify(id)} (allowed: [a-zA-Z0-9_-]{1,64})`);
  }
  return id;
}

function git(args, opts = {}) {
  const repoRoot = opts.cwd || findRepoRoot();
  const r = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', ...opts });
  if (r.status !== 0 && !opts.allowFail) {
    fail(`git ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
  }
  return r;
}

// Resolve the MAIN worktree path by parsing `git worktree list --porcelain`.
// The main worktree is always the first entry in the output. Falls back to
// findRepoRoot() if parsing yields nothing (e.g. on a bare/no-git checkout).
function findMainWorktree() {
  const r = spawnSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: findRepoRoot(),
    encoding: 'utf8',
  });
  if (r.status !== 0) return findRepoRoot();
  for (const line of r.stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      return line.slice('worktree '.length).trim();
    }
  }
  return findRepoRoot();
}

function branchName(subagent) {
  const loopId = readLoopId() || 'noloop';
  return `forge/${loopId}/sa-${subagent}`;
}

function worktreePath(subagent) {
  return join(findLoopDir(), '.worktrees', subagent);
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

function cmdCreate(flags) {
  const id = requireSubagentId(flags.subagent);
  const wt = worktreePath(id);
  if (existsSync(wt)) fail(`worktree already exists: ${wt}`);
  const br = branchName(id);
  const from = flags.from || 'HEAD';
  ensureDir(join(findLoopDir(), '.worktrees'));
  git(['worktree', 'add', '-b', br, wt, from], { cwd: findMainWorktree() });
  emitEvent('worktree.created', { subagent: id, path: wt, branch: br });
  process.stdout.write(JSON.stringify({ subagent: id, path: wt, branch: br }, null, 2) + '\n');
}

function cmdList() {
  const r = git(['worktree', 'list', '--porcelain'], { cwd: findMainWorktree() });
  process.stdout.write(r.stdout);
}

function cmdPath(flags) {
  const id = requireSubagentId(flags.subagent);
  process.stdout.write(worktreePath(id) + '\n');
}

function cmdMerge(flags) {
  const id = requireSubagentId(flags.subagent);
  const wt = worktreePath(id);
  if (!existsSync(wt)) fail(`worktree not found: ${wt}`);
  const br = branchName(id);
  // Merge must happen in the MAIN worktree — if the caller ran from inside a
  // subagent worktree, findRepoRoot() would resolve there and the merge would
  // no-op on the subagent's own branch. Always resolve main explicitly.
  const mainWt = findMainWorktree();
  // Default: squash (history hygiene). --no-squash preserves the branch history
  // via a --no-ff merge commit. Explicit --squash also works (idempotent).
  const squash = flags['no-squash'] ? false : true;
  const msg = flags.message || `feat: merge subagent ${id} work`;

  if (squash) {
    git(['merge', '--squash', br], { cwd: mainWt });
    // Squash leaves changes staged but uncommitted — commit them
    const commit = git(['commit', '-m', msg], { cwd: mainWt, allowFail: true });
    if (commit.status !== 0) {
      // Nothing to commit (empty subagent work) — that's fine
      process.stderr.write(`${PREFIX}: nothing to commit for ${id}\n`);
    }
  } else {
    git(['merge', '--no-ff', '-m', msg, br], { cwd: mainWt });
  }
  emitEvent('worktree.merged', { subagent: id, squash, branch: br });
  process.stdout.write(JSON.stringify({ subagent: id, merged: true, branch: br, squash }, null, 2) + '\n');
}

function cmdDrop(flags) {
  const id = requireSubagentId(flags.subagent);
  const wt = worktreePath(id);
  const br = branchName(id);
  const mainWt = findMainWorktree();
  if (existsSync(wt)) {
    const args = ['worktree', 'remove'];
    if (flags.force) args.push('--force');
    args.push(wt);
    git(args, { cwd: mainWt, allowFail: true });
  }
  git(['branch', '-D', br], { cwd: mainWt, allowFail: true });
  emitEvent('worktree.dropped', { subagent: id, branch: br });
  process.stdout.write(JSON.stringify({ subagent: id, dropped: true }, null, 2) + '\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const [cmd] = args._;
  if (!cmd) {
    process.stderr.write('usage: forge-worktree <create|list|path|merge|drop> [flags]\n');
    process.exit(1);
  }
  switch (cmd) {
    case 'create':
      return cmdCreate(args.flags);
    case 'list':
      return cmdList();
    case 'path':
      return cmdPath(args.flags);
    case 'merge':
      return cmdMerge(args.flags);
    case 'drop':
      return cmdDrop(args.flags);
    default:
      fail(`unknown command: ${cmd}`);
  }
}

main();

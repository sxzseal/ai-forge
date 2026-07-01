#!/usr/bin/env node
// ai-forge worktree CLI — isolate subagent work in git worktrees.
//
// Usage:
//   forge-worktree create --subagent <id> [--from <ref>]
//   forge-worktree list
//   forge-worktree merge --subagent <id> [--squash] [--message <msg>]
//   forge-worktree drop --subagent <id> [--force]
//   forge-worktree path --subagent <id>              # print worktree path
//
// worktrees live under .loop/.worktrees/<id>/ on branch `forge/<loop-id>/sa-<id>`.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, die, findRepoRoot, findLoopDir, ensureDir, nowIso, appendLine, readLoopId } from './_common.mjs';

const PREFIX = 'forge-worktree';
const fail = (m, c = 1) => die(PREFIX, m, c);

function git(args, opts = {}) {
  const repoRoot = findRepoRoot();
  const r = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', ...opts });
  if (r.status !== 0 && !opts.allowFail) {
    fail(`git ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
  }
  return r;
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
  const id = flags.subagent;
  if (!id) fail('--subagent <id> required');
  const wt = worktreePath(id);
  if (existsSync(wt)) fail(`worktree already exists: ${wt}`);
  const br = branchName(id);
  const from = flags.from || 'HEAD';
  ensureDir(join(findLoopDir(), '.worktrees'));
  git(['worktree', 'add', '-b', br, wt, from]);
  emitEvent('tool.result', {
    tool: 'forge-worktree.create',
    subagent: id,
    path: wt,
    branch: br,
  });
  process.stdout.write(JSON.stringify({ subagent: id, path: wt, branch: br }, null, 2) + '\n');
}

function cmdList() {
  const r = git(['worktree', 'list', '--porcelain']);
  process.stdout.write(r.stdout);
}

function cmdPath(flags) {
  const id = flags.subagent;
  if (!id) fail('--subagent <id> required');
  process.stdout.write(worktreePath(id) + '\n');
}

function cmdMerge(flags) {
  const id = flags.subagent;
  if (!id) fail('--subagent <id> required');
  const wt = worktreePath(id);
  if (!existsSync(wt)) fail(`worktree not found: ${wt}`);
  const br = branchName(id);
  // Prefer squash merge to keep history clean; fall back to merge commit
  const squash = !!flags.squash || flags.squash === undefined;
  const msg = flags.message || `feat: merge subagent ${id} work`;

  if (squash) {
    git(['merge', '--squash', br]);
    // Squash leaves changes staged but uncommitted — commit them
    const commit = git(['commit', '-m', msg], { allowFail: true });
    if (commit.status !== 0) {
      // Nothing to commit (empty subagent work) — that's fine
      process.stderr.write(`${PREFIX}: nothing to commit for ${id}\n`);
    }
  } else {
    git(['merge', '--no-ff', '-m', msg, br]);
  }
  emitEvent('tool.result', { tool: 'forge-worktree.merge', subagent: id, squash });
  process.stdout.write(JSON.stringify({ subagent: id, merged: true, branch: br }, null, 2) + '\n');
}

function cmdDrop(flags) {
  const id = flags.subagent;
  if (!id) fail('--subagent <id> required');
  const wt = worktreePath(id);
  const br = branchName(id);
  if (existsSync(wt)) {
    const args = ['worktree', 'remove'];
    if (flags.force) args.push('--force');
    args.push(wt);
    git(args, { allowFail: true });
  }
  git(['branch', '-D', br], { allowFail: true });
  emitEvent('tool.result', { tool: 'forge-worktree.drop', subagent: id });
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

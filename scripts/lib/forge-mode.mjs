#!/usr/bin/env node
// ai-forge mode CLI — three-tier approval gate.
//
// Modes stored in .loop/session.json.mode: "suggest" | "auto-edit" | "full-auto"
// Default: "auto-edit"
//
// Usage:
//   forge-mode get                                   # print current mode
//   forge-mode set <mode>                            # write to session.json
//   forge-mode gate --tool <T> [--command <C>] [--path <P>]
//       # Exit 0 = allow, 1 = deny, 2 = ask (require AskUserQuestion)
//   forge-mode classify --tool <T> [--command <C>]
//       # Print { category: normal|edit|danger|deploy } without gating

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  parseArgs,
  die,
  findLoopDir,
  readJsonOrNull,
  HERE,
  nowIso,
  appendLine,
  readLoopId,
} from './_common.mjs';

const PREFIX = 'forge-mode';
const fail = (m, c = 1) => die(PREFIX, m, c);

const MODES = ['suggest', 'auto-edit', 'full-auto'];
const DEFAULT_MODE = 'auto-edit';
const FORGE_STATE = join(HERE, 'forge-state.mjs');

const DANGER_PATTERNS = [
  /\bgit\s+push\b/,
  /\bgit\s+reset\s+--hard\b/,
  /\bnpm\s+publish\b/,
  /\bpnpm\s+publish\b/,
  /\brm\s+-rf\b/,
  /--no-verify\b/,
];

const DEPLOY_PROD_PATTERNS = [
  /\bvercel\s+.*--prod\b/,
  /\brailway\s+up\s+.*production\b/,
  /\bwrangler\s+deploy\s+--env\s+production\b/,
];

// Best-effort recovery of the *effective* command from a wrapper like
// `bash -c "..."`, `sh -c '...'`, `/usr/bin/env bash -c $'...'`, etc. Keeps the
// outer command too, so patterns can still match if wrapping is absent.
// Not a shell parser — just widens the surface classify() checks so a
// `bash -c "vercel --prod"` isn't a silent free pass.
function unwrapCommand(cmd) {
  if (typeof cmd !== 'string' || !cmd) return '';
  const parts = [cmd];
  // Match: (bash|sh|zsh|env ... bash|sh) -c "..."  |  '...'  |  $'...'
  const re = /\b(?:bash|sh|zsh|dash|ksh)\s+(?:-l\s+|-i\s+)*-c\s+(\$?'([^']*)'|"((?:[^"\\]|\\.)*)")/g;
  let m;
  while ((m = re.exec(cmd)) !== null) {
    const inner = m[2] ?? m[3] ?? '';
    if (inner) parts.push(inner);
  }
  return parts.join(' ; ');
}

function sessionPath() {
  return join(findLoopDir(), 'session.json');
}

function currentMode() {
  const s = readJsonOrNull(sessionPath()) || {};
  return MODES.includes(s.mode) ? s.mode : DEFAULT_MODE;
}

function classify(tool, command) {
  if (tool === 'Write' || tool === 'Edit' || tool === 'NotebookEdit') {
    return 'edit';
  }
  if (tool === 'Bash') {
    const cmd = unwrapCommand(command || '');
    if (DEPLOY_PROD_PATTERNS.some((r) => r.test(cmd))) return 'deploy';
    if (DANGER_PATTERNS.some((r) => r.test(cmd))) return 'danger';
    return 'normal';
  }
  return 'normal';
}

function decide(mode, category) {
  // Returns 'allow' | 'deny' | 'ask'
  if (category === 'deploy') return 'ask'; // Always confirm prod deploys
  if (category === 'danger') {
    if (mode === 'suggest') return 'deny';
    if (mode === 'auto-edit') return 'ask';
    if (mode === 'full-auto') return 'ask'; // Even full-auto asks for danger
  }
  if (category === 'edit') {
    if (mode === 'suggest') return 'ask';
    return 'allow';
  }
  // normal
  if (mode === 'suggest') return 'ask';
  return 'allow';
}

function emitEvent(kind, payload) {
  try {
    const eventsPath = join(findLoopDir(), 'events.jsonl');
    const loopId = readLoopId();
    const ev = { ts: nowIso(), phase: 'meta', kind, payload };
    if (loopId) ev.loopId = loopId;
    appendLine(eventsPath, JSON.stringify(ev));
  } catch {
    /* best-effort */
  }
}

function cmdGet() {
  process.stdout.write(JSON.stringify({ mode: currentMode() }, null, 2) + '\n');
}

function cmdSet(mode) {
  if (!MODES.includes(mode)) fail(`invalid mode: ${mode}. Must be one of ${MODES.join(', ')}`);
  const r = spawnSync(
    'node',
    [FORGE_STATE, 'set', sessionPath(), '--schema', 'session', '--key', 'mode', '--value', JSON.stringify(mode)],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  if (r.status !== 0) fail('failed to write mode to session.json');
  emitEvent('mode.changed', { mode });
  process.stdout.write(JSON.stringify({ mode }, null, 2) + '\n');
}

function cmdGate(flags) {
  const tool = flags.tool;
  if (!tool) fail('--tool <name> required');
  const mode = currentMode();
  const category = classify(tool, flags.command);
  const decision = decide(mode, category);
  const out = {
    tool,
    command: flags.command,
    path: flags.path,
    mode,
    category,
    decision,
  };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  // Exit code contract (consumed by the PreToolUse hook wrapper):
  //   0 = allow, 2 = ask/block (Claude Code's hard-block signal), 3 = deny
  // 3 is a distinct code so the hook wrapper can surface deny with a specific
  // message instead of collapsing it into a generic "asking user" prompt.
  if (decision === 'deny') {
    emitEvent('tool.blocked', out);
    process.stderr.write(`forge-mode: DENY ${tool} (${category}) under mode=${mode}\n`);
    process.exit(3);
  }
  if (decision === 'ask') {
    process.stderr.write(`forge-mode: ASK ${tool} (${category}) under mode=${mode}\n`);
    process.exit(2);
  }
  process.exit(0);
}

function cmdClassify(flags) {
  const tool = flags.tool;
  if (!tool) fail('--tool <name> required');
  const category = classify(tool, flags.command);
  process.stdout.write(JSON.stringify({ tool, command: flags.command, category }, null, 2) + '\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const [cmd, arg1] = args._;
  if (!cmd) {
    process.stderr.write('usage: forge-mode <get|set|gate|classify> [flags]\n');
    process.exit(1);
  }
  switch (cmd) {
    case 'get':
      return cmdGet();
    case 'set':
      return cmdSet(arg1);
    case 'gate':
      return cmdGate(args.flags);
    case 'classify':
      return cmdClassify(args.flags);
    default:
      fail(`unknown command: ${cmd}`);
  }
}

main();

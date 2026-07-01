#!/usr/bin/env node
// ai-forge budget CLI — track step / subagent / retry consumption per phase.
//
// Enforced by main skills before every step / subagent spawn / self-check retry.
// Backed by session.json.phases.<phase>.budget (validated by session schema).
//
// Usage:
//   forge-budget check <phase>                                # print status; exit 2 if over
//   forge-budget consume <phase> --kind step|subagent|retry [--by N] [--checkpoint cpN]
//   forge-budget set <phase> --max-steps N --max-subagents N --max-retries N
//   forge-budget reset <phase>                                # zero out counters
//
// Prints JSON to stdout. Exit codes:
//   0 = OK (headroom > 20%)
//   1 = generic error
//   2 = over budget (100% or more) — caller should AskUserQuestion
//   3 = warn (>= 80% consumed) — caller should surface warning

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { parseArgs, die, findLoopDir, readJsonOrNull, HERE, ensureDir, appendLine, nowIso, readLoopId } from './_common.mjs';

const PREFIX = 'forge-budget';
const fail = (m, c = 1) => die(PREFIX, m, c);

const DEFAULTS = {
  prototype: { maxSteps: 50, maxSubagents: 5, maxSelfCheckRetries: 0 },
  dev: { maxSteps: 100, maxSubagents: 30, maxSelfCheckRetries: 3 },
  deploy: { maxSteps: 30, maxSubagents: 5, maxSelfCheckRetries: 2 },
};

const FORGE_STATE = join(HERE, 'forge-state.mjs');

function sessionPath() {
  return join(findLoopDir(), 'session.json');
}

function readBudget(phase) {
  const s = readJsonOrNull(sessionPath()) || {};
  const p = (s.phases && s.phases[phase]) || {};
  const b = p.budget || {};
  const d = DEFAULTS[phase] || DEFAULTS.dev;
  return {
    maxSteps: b.maxSteps ?? d.maxSteps,
    stepsUsed: b.stepsUsed ?? 0,
    maxSubagents: b.maxSubagents ?? d.maxSubagents,
    subagentsUsed: b.subagentsUsed ?? 0,
    maxSelfCheckRetries: b.maxSelfCheckRetries ?? d.maxSelfCheckRetries,
    checkpointRetries: b.checkpointRetries ?? {},
  };
}

function writeBudget(phase, budget) {
  const key = `phases.${phase}.budget`;
  const r = spawnSync(
    'node',
    [FORGE_STATE, 'set', sessionPath(), '--schema', 'session', '--key', key, '--value', JSON.stringify(budget)],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  if (r.status !== 0) fail(`forge-state set failed for ${key}`);
}

function ratioStatus(used, max) {
  if (max <= 0) return { code: 0, level: 'ok' };
  const r = used / max;
  if (r >= 1) return { code: 2, level: 'exceeded' };
  if (r >= 0.8) return { code: 3, level: 'warn' };
  return { code: 0, level: 'ok' };
}

function overallStatus(b) {
  const rs = [
    ratioStatus(b.stepsUsed, b.maxSteps),
    ratioStatus(b.subagentsUsed, b.maxSubagents),
  ];
  // Retry status is per-checkpoint — evaluate max across checkpoints
  let retryStatus = { code: 0, level: 'ok' };
  for (const [cp, n] of Object.entries(b.checkpointRetries)) {
    const rs2 = ratioStatus(n, b.maxSelfCheckRetries);
    if (rs2.code > retryStatus.code) retryStatus = { ...rs2, checkpoint: cp };
  }
  rs.push(retryStatus);
  // Return the worst
  return rs.reduce((worst, cur) => (cur.code > worst.code ? cur : worst));
}

function emitBudgetEvent(phase, kind, payload) {
  try {
    const eventsPath = join(findLoopDir(), 'events.jsonl');
    const loopId = readLoopId();
    const ev = { ts: nowIso(), phase, kind, payload };
    if (loopId) ev.loopId = loopId;
    ensureDir(join(findLoopDir()));
    appendLine(eventsPath, JSON.stringify(ev));
  } catch {
    // Best-effort — never fail the budget check because of event write
  }
}

function cmdCheck(phase) {
  if (!phase) fail('phase required');
  const b = readBudget(phase);
  const s = overallStatus(b);
  const out = {
    phase,
    status: s.level,
    budget: b,
    ratios: {
      steps: b.maxSteps ? +(b.stepsUsed / b.maxSteps).toFixed(2) : 0,
      subagents: b.maxSubagents ? +(b.subagentsUsed / b.maxSubagents).toFixed(2) : 0,
    },
  };
  if (s.level === 'warn') emitBudgetEvent(phase, 'budget.warn', out);
  if (s.level === 'exceeded') emitBudgetEvent(phase, 'budget.exceeded', out);
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  process.exit(s.code);
}

function cmdConsume(phase, flags) {
  if (!phase) fail('phase required');
  const kind = flags.kind;
  if (!kind) fail('--kind step|subagent|retry required');
  const by = Number(flags.by || 1);
  const b = readBudget(phase);
  if (kind === 'step') b.stepsUsed = (b.stepsUsed || 0) + by;
  else if (kind === 'subagent') b.subagentsUsed = (b.subagentsUsed || 0) + by;
  else if (kind === 'retry') {
    const cp = flags.checkpoint || 'default';
    b.checkpointRetries[cp] = (b.checkpointRetries[cp] || 0) + by;
  } else fail(`unknown kind: ${kind}`);
  writeBudget(phase, b);
  // NOTE: cmdCheck calls process.exit(status.code). That means `consume`
  // inherits the check's exit code (0/2/3) — callers should treat non-zero
  // as "budget signal, action required", NOT as "consume failed".
  cmdCheck(phase);
}

function cmdSet(phase, flags) {
  if (!phase) fail('phase required');
  const b = readBudget(phase);
  if (flags['max-steps']) b.maxSteps = Number(flags['max-steps']);
  if (flags['max-subagents']) b.maxSubagents = Number(flags['max-subagents']);
  if (flags['max-retries']) b.maxSelfCheckRetries = Number(flags['max-retries']);
  writeBudget(phase, b);
  process.stdout.write(JSON.stringify(b, null, 2) + '\n');
}

function cmdReset(phase) {
  if (!phase) fail('phase required');
  const d = DEFAULTS[phase] || DEFAULTS.dev;
  const b = {
    maxSteps: d.maxSteps,
    stepsUsed: 0,
    maxSubagents: d.maxSubagents,
    subagentsUsed: 0,
    maxSelfCheckRetries: d.maxSelfCheckRetries,
    checkpointRetries: {},
  };
  writeBudget(phase, b);
  process.stdout.write(JSON.stringify(b, null, 2) + '\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const [cmd, phase] = args._;
  if (!cmd) {
    process.stderr.write('usage: forge-budget <check|consume|set|reset> <phase> [flags]\n');
    process.exit(1);
  }
  switch (cmd) {
    case 'check':
      return cmdCheck(phase);
    case 'consume':
      return cmdConsume(phase, args.flags);
    case 'set':
      return cmdSet(phase, args.flags);
    case 'reset':
      return cmdReset(phase);
    default:
      fail(`unknown command: ${cmd}`);
  }
}

main();

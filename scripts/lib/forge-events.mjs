#!/usr/bin/env node
// ai-forge event log CLI — append-only .loop/events.jsonl
//
// Usage:
//   forge-events append [<path>] < event.json          # stdin -> validate -> append
//   forge-events append [<path>] --kind K --phase P --step S --payload '{...}'
//   forge-events tail [<path>] [--count N]             # last N events
//   forge-events query [<path>] [--phase P] [--kind K] [--since ISO] [--limit N]
//   forge-events rollup [<path>]                       # summary by kind
//   forge-events rollback [<path>] --to <ts>           # move events after <ts> to archive
//   forge-events resume-hint [<path>]                  # print last step without matching step.exit
//
// If <path> is omitted it defaults to <loop-dir>/events.jsonl.

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  parseArgs,
  die,
  readStdin,
  findLoopDir,
  readLinesOrEmpty,
  appendLine,
  validateData,
  nowIso,
  readLoopId,
  ensureDir,
} from './_common.mjs';

const PREFIX = 'forge-events';
const fail = (msg, code = 1) => die(PREFIX, msg, code);

function defaultPath(explicit) {
  if (explicit) return explicit;
  return join(findLoopDir(), 'events.jsonl');
}

function parseLines(lines) {
  const out = [];
  for (const l of lines) {
    try {
      out.push(JSON.parse(l));
    } catch {
      /* skip malformed */
    }
  }
  return out;
}

function readEvents(path) {
  return parseLines(readLinesOrEmpty(path));
}

async function cmdAppend(target, flags) {
  let event;
  const kind = flags.kind;
  const stdinAvailable = !process.stdin.isTTY;

  if (kind) {
    // Build event from flags
    event = {
      ts: nowIso(),
      phase: flags.phase || 'meta',
      kind,
    };
    if (flags.step) event.step = flags.step;
    if (flags.payload) {
      try {
        event.payload = JSON.parse(flags.payload);
      } catch (e) {
        fail(`invalid --payload JSON: ${e.message}`);
      }
    }
  } else if (stdinAvailable) {
    const raw = await readStdin();
    try {
      event = JSON.parse(raw);
    } catch (e) {
      fail(`invalid JSON on stdin: ${e.message}`);
    }
    if (!event.ts) event.ts = nowIso();
  } else {
    fail('provide either --kind (and optional --phase/--step/--payload) or JSON on stdin');
  }

  // Fill loopId if missing
  if (!event.loopId) {
    const loopId = readLoopId();
    if (loopId) event.loopId = loopId;
  }

  // Tie-break within the same millisecond. seq is optional but writing it here
  // means metrics that sort by (ts, seq) stay stable when a burst of events
  // shares a wallclock timestamp (typical for tight subagent-return loops).
  if (event.seq === undefined) {
    const priorLines = readLinesOrEmpty(target);
    let seq = 0;
    for (let i = priorLines.length - 1; i >= 0; i--) {
      try {
        const prev = JSON.parse(priorLines[i]);
        if (prev.ts === event.ts) {
          seq = (prev.seq ?? 0) + 1;
          break;
        }
        break;
      } catch {
        continue;
      }
    }
    event.seq = seq;
  }

  try {
    await validateData(event, 'event');
  } catch (e) {
    if (e.isValidationError) fail(e.message);
    throw e;
  }

  appendLine(target, JSON.stringify(event));
  process.stderr.write(`${PREFIX}: appended ${event.kind} to ${target}\n`);
}

function cmdTail(target, flags) {
  const count = Number(flags.count || 20);
  const events = readEvents(target);
  const tail = events.slice(Math.max(0, events.length - count));
  process.stdout.write(JSON.stringify(tail, null, 2) + '\n');
}

function cmdQuery(target, flags) {
  const events = readEvents(target);
  const phase = flags.phase;
  const kind = flags.kind;
  const since = flags.since;
  const limit = flags.limit ? Number(flags.limit) : Infinity;
  const filtered = [];
  for (const e of events) {
    if (phase && e.phase !== phase) continue;
    if (kind && e.kind !== kind) continue;
    if (since && e.ts < since) continue;
    filtered.push(e);
    if (filtered.length >= limit) break;
  }
  process.stdout.write(JSON.stringify(filtered, null, 2) + '\n');
}

function cmdRollup(target) {
  const events = readEvents(target);
  const byKind = {};
  const byPhase = {};
  let firstTs = null;
  let lastTs = null;
  for (const e of events) {
    byKind[e.kind] = (byKind[e.kind] || 0) + 1;
    byPhase[e.phase] = (byPhase[e.phase] || 0) + 1;
    if (!firstTs || e.ts < firstTs) firstTs = e.ts;
    if (!lastTs || e.ts > lastTs) lastTs = e.ts;
  }
  const durationMs =
    firstTs && lastTs ? new Date(lastTs).getTime() - new Date(firstTs).getTime() : 0;
  const summary = {
    total: events.length,
    firstTs,
    lastTs,
    durationMs,
    byKind,
    byPhase,
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

function cmdRollback(target, flags) {
  if (!flags.to) fail('--to <ISO ts> required');
  const events = readEvents(target);
  const keep = events.filter((e) => e.ts <= flags.to);
  const archive = events.filter((e) => e.ts > flags.to);
  if (archive.length === 0) {
    process.stderr.write(`${PREFIX}: nothing after ${flags.to}\n`);
    return;
  }
  const archiveDir = join(dirname(target), 'events-archive');
  ensureDir(archiveDir);
  const archivePath = join(archiveDir, `rollback-${Date.now()}.jsonl`);
  writeFileSync(archivePath, archive.map((e) => JSON.stringify(e)).join('\n') + '\n');
  writeFileSync(target, keep.map((e) => JSON.stringify(e)).join('\n') + (keep.length ? '\n' : ''));
  process.stderr.write(
    `${PREFIX}: rolled back ${archive.length} events to ${archivePath}; ${keep.length} events retained\n`,
  );
}

function cmdResumeHint(target) {
  // Find last step.enter with no matching step.exit; return that step id + phase + ts.
  const events = readEvents(target);
  const stack = new Map(); // phase → last step.enter without exit
  for (const e of events) {
    if (e.kind === 'step.enter') stack.set(e.phase, e);
    else if (e.kind === 'step.exit') stack.delete(e.phase);
  }
  if (stack.size === 0) {
    process.stdout.write(JSON.stringify({ resumable: false, reason: 'no in-flight step' }) + '\n');
    return;
  }
  // Prefer the phase with the latest step.enter
  let latest = null;
  for (const v of stack.values()) {
    if (!latest || v.ts > latest.ts) latest = v;
  }
  process.stdout.write(
    JSON.stringify(
      {
        resumable: true,
        phase: latest.phase,
        step: latest.step,
        enteredAt: latest.ts,
        loopId: latest.loopId,
      },
      null,
      2,
    ) + '\n',
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [cmd, maybePath] = args._;
  if (!cmd) {
    process.stderr.write(
      'usage: forge-events <append|tail|query|rollup|rollback|resume-hint> [<path>] [flags]\n',
    );
    process.exit(1);
  }
  const target = defaultPath(maybePath);
  switch (cmd) {
    case 'append':
      return cmdAppend(target, args.flags);
    case 'tail':
      return cmdTail(target, args.flags);
    case 'query':
      return cmdQuery(target, args.flags);
    case 'rollup':
      return cmdRollup(target);
    case 'rollback':
      return cmdRollback(target, args.flags);
    case 'resume-hint':
      return cmdResumeHint(target);
    default:
      fail(`unknown command: ${cmd}`);
  }
}

main().catch((e) => {
  if (e && e.isValidationError) {
    process.stderr.write(`${PREFIX}: ${e.message}\n`);
    process.exit(1);
  }
  process.stderr.write(`${PREFIX}: ${e.stack || e.message}\n`);
  process.exit(1);
});

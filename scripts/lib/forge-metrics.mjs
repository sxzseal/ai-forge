#!/usr/bin/env node
// ai-forge metrics CLI — compute phase / loop metrics by walking .loop/events.jsonl.
//
// Usage:
//   forge-metrics compute --phase <p>              # writes .loop/phases/<p>/metrics.json
//   forge-metrics rollup                           # aggregate all phases → .loop/loop-summary.json
//   forge-metrics show --phase <p>                 # print without writing

import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseArgs,
  die,
  findLoopDir,
  readLinesOrEmpty,
  ensureDir,
  readJsonOrNull,
  atomicWriteJson,
} from './_common.mjs';

const PREFIX = 'forge-metrics';
const fail = (m, c = 1) => die(PREFIX, m, c);

function readEvents() {
  const p = join(findLoopDir(), 'events.jsonl');
  return readLinesOrEmpty(p)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function computePhaseMetrics(phase) {
  const events = readEvents();
  const phaseEvents = events.filter((e) => e.phase === phase);
  if (phaseEvents.length === 0) return null;

  const enter = phaseEvents.find((e) => e.kind === 'phase.enter');
  const exit = phaseEvents.find((e) => e.kind === 'phase.exit');
  const startedAt = enter ? enter.ts : phaseEvents[0].ts;
  const completedAt = exit ? exit.ts : phaseEvents[phaseEvents.length - 1].ts;
  const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();

  const byKind = {};
  const selfCheckRetries = [];
  const askUsers = [];
  const enhancers = new Set();
  const filesChangedSet = new Set();
  const subagentReturns = phaseEvents.filter((e) => e.kind === 'subagent.return');
  const subagentSpawns = phaseEvents.filter((e) => e.kind === 'subagent.spawn');
  const checkpoints = phaseEvents.filter((e) => e.kind === 'checkpoint.created');
  const patches = phaseEvents.filter((e) => e.kind === 'patch.applied');

  for (const e of phaseEvents) {
    byKind[e.kind] = (byKind[e.kind] || 0) + 1;
    if (e.kind === 'selfcheck.fail') selfCheckRetries.push(e.payload || {});
    if (e.kind === 'askuser.prompt') askUsers.push(e.payload || {});
    if (e.kind === 'enhancer.applied' && e.payload && e.payload.name) {
      enhancers.add(e.payload.name);
    }
    if (e.kind === 'patch.applied' && e.payload && Array.isArray(e.payload.files)) {
      for (const f of e.payload.files) filesChangedSet.add(f);
    }
  }

  const subagentSuccess = subagentReturns.filter(
    (e) => e.payload && e.payload.status === 'success',
  ).length;
  const subagentTotal = subagentSpawns.length;

  // Steps: count step.enter events
  const stepsCount = phaseEvents.filter((e) => e.kind === 'step.enter').length;

  return {
    phase,
    startedAt,
    completedAt,
    durationMs,
    stepsCount,
    subagentsSpawned: subagentTotal,
    subagentsSucceeded: subagentSuccess,
    subagentSuccessRate: subagentTotal > 0 ? +(subagentSuccess / subagentTotal).toFixed(2) : null,
    filesChanged: filesChangedSet.size,
    patchesApplied: patches.length,
    selfCheckRetries: selfCheckRetries.length,
    checkpointsCreated: checkpoints.length,
    askUserCount: askUsers.length,
    enhancersApplied: [...enhancers],
    eventCount: phaseEvents.length,
    byKind,
  };
}

function cmdCompute(flags) {
  const phase = flags.phase;
  if (!phase) fail('--phase required');
  const metrics = computePhaseMetrics(phase);
  if (!metrics) fail(`no events found for phase: ${phase}`);
  const phaseDir = join(findLoopDir(), 'phases', phase);
  ensureDir(phaseDir);
  const outPath = join(phaseDir, 'metrics.json');
  atomicWriteJson(outPath, metrics);
  process.stdout.write(JSON.stringify(metrics, null, 2) + '\n');
  process.stderr.write(`${PREFIX}: wrote ${outPath}\n`);
}

function cmdShow(flags) {
  const phase = flags.phase;
  if (!phase) fail('--phase required');
  const metrics = computePhaseMetrics(phase);
  if (!metrics) fail(`no events found for phase: ${phase}`);
  process.stdout.write(JSON.stringify(metrics, null, 2) + '\n');
}

function cmdRollup() {
  const phases = ['prototype', 'dev', 'deploy'];
  const perPhase = {};
  let totalDuration = 0;
  let totalSteps = 0;
  let totalSubagents = 0;
  let totalFilesChanged = 0;
  let totalPatches = 0;
  let totalAskUser = 0;
  let totalCheckpoints = 0;
  for (const p of phases) {
    const m = computePhaseMetrics(p);
    if (m) {
      perPhase[p] = m;
      totalDuration += m.durationMs || 0;
      totalSteps += m.stepsCount || 0;
      totalSubagents += m.subagentsSpawned || 0;
      totalFilesChanged += m.filesChanged || 0;
      totalPatches += m.patchesApplied || 0;
      totalAskUser += m.askUserCount || 0;
      totalCheckpoints += m.checkpointsCreated || 0;
    }
  }
  const session = readJsonOrNull(join(findLoopDir(), 'session.json'));
  const summary = {
    loopId: session ? session.loopId : null,
    generatedAt: new Date().toISOString(),
    totalDurationMs: totalDuration,
    totalSteps,
    totalSubagents,
    totalFilesChanged,
    totalPatches,
    totalAskUser,
    totalCheckpoints,
    perPhase,
  };
  const outPath = join(findLoopDir(), 'loop-summary.json');
  atomicWriteJson(outPath, summary);
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  process.stderr.write(`${PREFIX}: wrote ${outPath}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const [cmd] = args._;
  if (!cmd) {
    process.stderr.write('usage: forge-metrics <compute|rollup|show> [flags]\n');
    process.exit(1);
  }
  switch (cmd) {
    case 'compute':
      return cmdCompute(args.flags);
    case 'show':
      return cmdShow(args.flags);
    case 'rollup':
      return cmdRollup();
    default:
      fail(`unknown command: ${cmd}`);
  }
}

main();

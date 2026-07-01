#!/usr/bin/env node
// ai-forge state CLI — atomic JSON writes + JSON Schema validation
//
// Usage:
//   forge-state read <path>
//   forge-state write <path> --schema <name>          # stdin -> validate -> atomic write
//   forge-state update <path> --schema <name>         # stdin patch -> merge -> validate -> atomic write
//   forge-state set <path> --schema <name> --key <dotpath> --value <json>
//   forge-state validate <path> --schema <name>
//   forge-state migrate <path>                        # v0 → v1 session shape upgrade
//   forge-state lock <path>   /   forge-state unlock <path>
//   forge-state --install-deps                        # bootstrap ajv into scripts/lib/node_modules

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  parseArgs,
  die,
  readStdin,
  HERE,
  acquireLock,
  releaseLock,
  atomicWriteJson,
  readJsonOrNull,
  validateData,
} from './_common.mjs';

const PREFIX = 'forge-state';
const fail = (m, c = 1) => die(PREFIX, m, c);

function ensureDeps() {
  const ajvDir = join(HERE, 'node_modules', 'ajv');
  if (existsSync(ajvDir)) return;
  process.stderr.write(`${PREFIX}: installing ajv (one-time setup)...\n`);
  if (!existsSync(HERE)) mkdirSync(HERE, { recursive: true });
  const result = spawnSync('npm', ['install', '--silent', '--no-audit', '--no-fund', '--prefix', HERE], {
    stdio: 'inherit',
  });
  if (result.status !== 0) fail('failed to install ajv. Run: npm install --prefix scripts/lib');
}

// v0 → v1 session migration. Keep here (not in _common) since it is
// session-specific and only forge-state.cmdUpdate/cmdSet/cmdMigrate need it.
function migrateSession(data) {
  if (!data || data.schemaVersion === 1) return data;
  const migrated = { ...data, schemaVersion: 1 };
  if (data.id && !data.loopId) migrated.loopId = data.id;
  if (!migrated.loopId) {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    migrated.loopId = `loop-${today}-001`;
  }
  if (!migrated.currentPhase) migrated.currentPhase = 'prototype';
  if (!migrated.phases) {
    migrated.phases = {
      prototype: { status: 'pending' },
      dev: { status: 'pending' },
      deploy: { status: 'pending' },
    };
  }
  for (const k of ['prototype', 'dev', 'deploy']) {
    if (!migrated.phases[k]) migrated.phases[k] = { status: 'pending' };
  }
  if (!migrated.artifacts) migrated.artifacts = {};
  delete migrated.id;
  return migrated;
}

function deepMerge(base, patch) {
  if (base === null || typeof base !== 'object' || Array.isArray(base)) return patch;
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = k in base ? deepMerge(base[k], v) : v;
  }
  return out;
}

function setByPath(obj, dotPath, value) {
  const parts = dotPath.split('.');
  const out = JSON.parse(JSON.stringify(obj || {}));
  let cursor = out;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cursor[p] == null || typeof cursor[p] !== 'object') cursor[p] = {};
    cursor = cursor[p];
  }
  cursor[parts[parts.length - 1]] = value;
  return out;
}

async function cmdRead({ target }) {
  const data = readJsonOrNull(target);
  if (data === null) fail(`file not found: ${target}`);
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

async function cmdWrite({ target, schema }) {
  ensureDeps();
  const raw = await readStdin();
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { fail(`invalid JSON on stdin: ${e.message}`); }
  if (schema) await validateData(parsed, schema);
  acquireLock(target);
  try { atomicWriteJson(target, parsed); } finally { releaseLock(target); }
  process.stderr.write(`${PREFIX}: wrote ${target}\n`);
}

async function cmdUpdate({ target, schema }) {
  ensureDeps();
  const raw = await readStdin();
  let patch;
  try { patch = JSON.parse(raw); } catch (e) { fail(`invalid JSON on stdin: ${e.message}`); }
  acquireLock(target);
  try {
    let current = readJsonOrNull(target) || {};
    if (schema === 'session') current = migrateSession(current);
    const merged = deepMerge(current, patch);
    if (schema) await validateData(merged, schema);
    atomicWriteJson(target, merged);
  } finally { releaseLock(target); }
  process.stderr.write(`${PREFIX}: updated ${target}\n`);
}

// Parse --value: prefer JSON, fall back to raw string with a warning so users
// notice when they meant to pass a JSON string but forgot to quote it.
function parseCliValue(raw) {
  try {
    return { value: JSON.parse(raw), fallback: false };
  } catch {
    return { value: raw, fallback: true };
  }
}

async function cmdSet({ target, schema, key, value }) {
  ensureDeps();
  if (!key) fail('--key <dotpath> required');
  if (value === undefined) fail('--value <json> required');
  const { value: parsedValue, fallback } = parseCliValue(value);
  if (fallback && typeof parsedValue === 'string' && !/^[a-zA-Z_][\w-]*$/.test(parsedValue)) {
    process.stderr.write(
      `${PREFIX}: warning: --value "${value}" is not valid JSON; treated as raw string. ` +
        `To pass a JSON string wrap it in quotes, e.g. --value '"my text"'.\n`,
    );
  }
  acquireLock(target);
  try {
    let current = readJsonOrNull(target) || {};
    if (schema === 'session') current = migrateSession(current);
    const next = setByPath(current, key, parsedValue);
    if (schema) await validateData(next, schema);
    atomicWriteJson(target, next);
  } finally { releaseLock(target); }
  process.stderr.write(`${PREFIX}: set ${key} in ${target}\n`);
}

async function cmdValidate({ target, schema }) {
  ensureDeps();
  if (!schema) fail('--schema <name> required');
  const data = readJsonOrNull(target);
  if (data === null) fail(`file not found: ${target}`);
  await validateData(data, schema);
  process.stderr.write(`${PREFIX}: ${target} matches schema ${schema}\n`);
}

async function cmdMigrate({ target }) {
  // Currently only session.json has a documented migration path.
  const data = readJsonOrNull(target);
  if (data === null) fail(`file not found: ${target}`);
  const migrated = migrateSession(data);
  if (migrated === data) {
    process.stderr.write(`${PREFIX}: ${target} already at latest schema; no change\n`);
    return;
  }
  acquireLock(target);
  try { atomicWriteJson(target, migrated); } finally { releaseLock(target); }
  process.stderr.write(`${PREFIX}: migrated ${target} → schemaVersion=${migrated.schemaVersion}\n`);
  process.stdout.write(JSON.stringify(migrated, null, 2) + '\n');
}

function cmdLock({ target }) {
  acquireLock(target);
  process.stderr.write(`${PREFIX}: locked ${target}\n`);
}
function cmdUnlock({ target }) {
  releaseLock(target);
  process.stderr.write(`${PREFIX}: unlocked ${target}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.flags['install-deps']) {
    ensureDeps();
    process.stderr.write(`${PREFIX}: deps OK\n`);
    return;
  }
  const [cmd, target] = args._;
  if (!cmd) {
    process.stderr.write(
      'usage: forge-state <read|write|update|set|validate|migrate|lock|unlock> <path> [flags]\n',
    );
    process.exit(1);
  }
  if (!target) fail('target path required');
  const opts = { target, schema: args.flags.schema, key: args.flags.key, value: args.flags.value };
  switch (cmd) {
    case 'read': return cmdRead(opts);
    case 'write': return cmdWrite(opts);
    case 'update': return cmdUpdate(opts);
    case 'set': return cmdSet(opts);
    case 'validate': return cmdValidate(opts);
    case 'migrate': return cmdMigrate(opts);
    case 'lock': return cmdLock(opts);
    case 'unlock': return cmdUnlock(opts);
    default: fail(`unknown command: ${cmd}`);
  }
}

main().catch((e) => {
  if (e && e.isValidationError) fail(e.message);
  fail(e.stack || e.message);
});

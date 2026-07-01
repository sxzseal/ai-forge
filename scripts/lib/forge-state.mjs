#!/usr/bin/env node
// ai-forge state CLI — atomic JSON writes + JSON Schema validation
//
// Usage:
//   forge-state read <path>
//   forge-state write <path> --schema <name>          # stdin -> validate -> atomic write
//   forge-state update <path> --schema <name>         # stdin patch -> merge -> validate -> atomic write
//   forge-state set <path> --schema <name> --key <dotpath> --value <json>
//   forge-state validate <path> --schema <name>
//   forge-state lock <path>   /   forge-state unlock <path>
//   forge-state --install-deps                        # bootstrap ajv into scripts/lib/node_modules

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { argv, exit, stdin, cwd } from 'node:process';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCK_STALE_MS = 30_000;

function findSchemaDir() {
  if (process.env.FORGE_SCHEMA_DIR && existsSync(process.env.FORGE_SCHEMA_DIR)) {
    return process.env.FORGE_SCHEMA_DIR;
  }
  let dir = cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, '.claude', 'schemas');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const fallback = resolve(HERE, '..', '..', '.claude', 'schemas');
  return fallback;
}

function parseArgs(args) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        out.flags[key] = next;
        i++;
      } else {
        out.flags[key] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function die(msg, code = 1) {
  process.stderr.write(`forge-state: ${msg}\n`);
  exit(code);
}

function readStdin() {
  return new Promise((resolveStdin) => {
    let data = '';
    stdin.setEncoding('utf8');
    stdin.on('data', (c) => (data += c));
    stdin.on('end', () => resolveStdin(data));
  });
}

function ensureDeps() {
  const ajvDir = join(HERE, 'node_modules', 'ajv');
  if (existsSync(ajvDir)) return;
  process.stderr.write('forge-state: installing ajv (one-time setup)...\n');
  const result = spawnSync('npm', ['install', '--silent', '--no-audit', '--no-fund', '--prefix', HERE], {
    stdio: 'inherit',
  });
  if (result.status !== 0) die('failed to install ajv. Run: npm install --prefix scripts/lib');
}

async function loadAjv() {
  ensureDeps();
  const ajvMod = await import(join(HERE, 'node_modules', 'ajv', 'dist', '2020.js'));
  const addFormatsMod = await import(join(HERE, 'node_modules', 'ajv-formats', 'dist', 'index.js'));
  const Ajv2020 = ajvMod.default || ajvMod;
  const addFormats = addFormatsMod.default || addFormatsMod;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

function loadSchema(name) {
  const dir = findSchemaDir();
  const p = join(dir, `${name}.schema.json`);
  if (!existsSync(p)) die(`schema not found: ${p}`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

async function validateData(data, schemaName) {
  const ajv = await loadAjv();
  const schema = loadSchema(schemaName);
  const validate = ajv.compile(schema);
  if (!validate(data)) {
    const errs = validate.errors.map((e) => `  - ${e.instancePath || '<root>'} ${e.message}`).join('\n');
    const err = new Error(`schema validation failed (${schemaName}):\n${errs}`);
    err.isValidationError = true;
    throw err;
  }
}

function lockPath(targetPath) { return targetPath + '.lock'; }

function acquireLock(targetPath) {
  const lp = lockPath(targetPath);
  for (let i = 0; i < 50; i++) {
    if (!existsSync(lp)) {
      try {
        if (!existsSync(dirname(lp))) mkdirSync(dirname(lp), { recursive: true });
        writeFileSync(lp, JSON.stringify({ pid: process.pid, ts: Date.now() }));
        return true;
      } catch { continue; }
    }
    try {
      const raw = JSON.parse(readFileSync(lp, 'utf8'));
      if (Date.now() - raw.ts > LOCK_STALE_MS) { unlinkSync(lp); continue; }
    } catch {
      try { unlinkSync(lp); } catch {}
      continue;
    }
    const end = Date.now() + 100;
    while (Date.now() < end) { /* spin */ }
  }
  die(`could not acquire lock on ${targetPath} (held by another process)`);
}

function releaseLock(targetPath) {
  const lp = lockPath(targetPath);
  if (existsSync(lp)) { try { unlinkSync(lp); } catch {} }
}

function atomicWriteJson(targetPath, data) {
  const dir = dirname(targetPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = targetPath + '.tmp.' + process.pid;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  renameSync(tmp, targetPath);
}

function readJsonOrNull(targetPath) {
  if (!existsSync(targetPath)) return null;
  return JSON.parse(readFileSync(targetPath, 'utf8'));
}

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
  if (data === null) die(`file not found: ${target}`);
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

async function cmdWrite({ target, schema }) {
  const raw = await readStdin();
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { die(`invalid JSON on stdin: ${e.message}`); }
  if (schema) await validateData(parsed, schema);
  acquireLock(target);
  try { atomicWriteJson(target, parsed); } finally { releaseLock(target); }
  process.stderr.write(`forge-state: wrote ${target}\n`);
}

async function cmdUpdate({ target, schema }) {
  const raw = await readStdin();
  let patch;
  try { patch = JSON.parse(raw); } catch (e) { die(`invalid JSON on stdin: ${e.message}`); }
  acquireLock(target);
  try {
    let current = readJsonOrNull(target) || {};
    if (schema === 'session') current = migrateSession(current);
    const merged = deepMerge(current, patch);
    if (schema) await validateData(merged, schema);
    atomicWriteJson(target, merged);
  } finally { releaseLock(target); }
  process.stderr.write(`forge-state: updated ${target}\n`);
}

async function cmdSet({ target, schema, key, value }) {
  if (!key) die('--key <dotpath> required');
  if (value === undefined) die('--value <json> required');
  let parsedValue;
  try { parsedValue = JSON.parse(value); } catch { parsedValue = value; }
  acquireLock(target);
  try {
    let current = readJsonOrNull(target) || {};
    if (schema === 'session') current = migrateSession(current);
    const next = setByPath(current, key, parsedValue);
    if (schema) await validateData(next, schema);
    atomicWriteJson(target, next);
  } finally { releaseLock(target); }
  process.stderr.write(`forge-state: set ${key} in ${target}\n`);
}

async function cmdValidate({ target, schema }) {
  if (!schema) die('--schema <name> required');
  const data = readJsonOrNull(target);
  if (data === null) die(`file not found: ${target}`);
  await validateData(data, schema);
  process.stderr.write(`forge-state: ${target} matches schema ${schema}\n`);
}

function cmdLock({ target }) { acquireLock(target); process.stderr.write(`forge-state: locked ${target}\n`); }
function cmdUnlock({ target }) { releaseLock(target); process.stderr.write(`forge-state: unlocked ${target}\n`); }

async function main() {
  const args = parseArgs(argv.slice(2));
  if (args.flags['install-deps']) {
    ensureDeps();
    process.stderr.write('forge-state: deps OK\n');
    return;
  }
  const [cmd, target] = args._;
  if (!cmd) {
    process.stderr.write('usage: forge-state <read|write|update|set|validate|lock|unlock> <path> [flags]\n');
    exit(1);
  }
  if (!target) die('target path required');
  const opts = { target, schema: args.flags.schema, key: args.flags.key, value: args.flags.value };
  switch (cmd) {
    case 'read': return cmdRead(opts);
    case 'write': return cmdWrite(opts);
    case 'update': return cmdUpdate(opts);
    case 'set': return cmdSet(opts);
    case 'validate': return cmdValidate(opts);
    case 'lock': return cmdLock(opts);
    case 'unlock': return cmdUnlock(opts);
    default: die(`unknown command: ${cmd}`);
  }
}

main().catch((e) => {
  if (e && e.isValidationError) die(e.message);
  die(e.stack || e.message);
});

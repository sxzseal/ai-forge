// ai-forge shared utilities — no npm deps beyond what forge-state installs (ajv).
// Kept intentionally small: only helpers reused across 2+ CLIs live here.
//
// forge-state.mjs still has its own inlined copies of some of these helpers to
// avoid a risky refactor; new CLIs (events, budget, patch, metrics, mode, ...)
// import from this module.

import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  renameSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  statSync,
} from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { argv, exit, stdin, cwd } from 'node:process';

export const LOCK_STALE_MS = 30_000;
export const HERE = dirname(fileURLToPath(import.meta.url));

export function die(prefix, msg, code = 1) {
  process.stderr.write(`${prefix}: ${msg}\n`);
  exit(code);
}

export function parseArgs(args) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
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

export function readStdin() {
  return new Promise((resolveStdin) => {
    let data = '';
    stdin.setEncoding('utf8');
    stdin.on('data', (c) => (data += c));
    stdin.on('end', () => resolveStdin(data));
  });
}

// Walk upward from cwd() looking for a marker directory; returns absolute path
// or null. Reused for finding `.loop/`, `.claude/schemas/`, `.claude/enhancers/`.
export function findAncestor(marker, opts = {}) {
  const { fromEnv } = opts;
  if (fromEnv && process.env[fromEnv] && existsSync(process.env[fromEnv])) {
    return process.env[fromEnv];
  }
  let dir = cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, marker);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function findRepoRoot() {
  // Prefer nearest .git; fall back to nearest .claude/
  const gitDir = findAncestor('.git');
  if (gitDir) return dirname(gitDir);
  const claudeDir = findAncestor('.claude');
  if (claudeDir) return dirname(claudeDir);
  return cwd();
}

export function findSchemaDir() {
  return (
    findAncestor(join('.claude', 'schemas'), { fromEnv: 'FORGE_SCHEMA_DIR' }) ||
    resolve(HERE, '..', '..', '.claude', 'schemas')
  );
}

export function findLoopDir() {
  // Prefer explicit env, else nearest `.loop`, else cwd()/.loop (create-on-write)
  if (process.env.FORGE_LOOP_DIR && existsSync(process.env.FORGE_LOOP_DIR)) {
    return process.env.FORGE_LOOP_DIR;
  }
  const found = findAncestor('.loop');
  if (found) return found;
  return join(findRepoRoot(), '.loop');
}

// ─── Filesystem primitives ────────────────────────────────────────────

export function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function readJsonOrNull(path) {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8');
  if (!raw.trim()) return null;
  return JSON.parse(raw);
}

export function readLinesOrEmpty(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter((l) => l.length > 0);
}

export function atomicWriteJson(targetPath, data) {
  ensureDir(dirname(targetPath));
  const tmp = `${targetPath}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  renameSync(tmp, targetPath);
}

// Append one line atomically. POSIX guarantees O_APPEND writes < PIPE_BUF are atomic;
// we additionally take a short-lived lock to serialize across processes.
export function appendLine(targetPath, line) {
  ensureDir(dirname(targetPath));
  const withNL = line.endsWith('\n') ? line : line + '\n';
  acquireLock(targetPath);
  try {
    appendFileSync(targetPath, withNL, { encoding: 'utf8' });
  } finally {
    releaseLock(targetPath);
  }
}

// ─── Locking ──────────────────────────────────────────────────────────

function lockPath(targetPath) {
  return targetPath + '.lock';
}

export function acquireLock(targetPath) {
  const lp = lockPath(targetPath);
  for (let i = 0; i < 100; i++) {
    if (!existsSync(lp)) {
      try {
        ensureDir(dirname(lp));
        writeFileSync(lp, JSON.stringify({ pid: process.pid, ts: Date.now() }));
        return true;
      } catch {
        // race — retry
        continue;
      }
    }
    try {
      const raw = JSON.parse(readFileSync(lp, 'utf8'));
      if (Date.now() - raw.ts > LOCK_STALE_MS) {
        unlinkSync(lp);
        continue;
      }
    } catch {
      try {
        unlinkSync(lp);
      } catch {}
      continue;
    }
    const end = Date.now() + 50;
    while (Date.now() < end) {
      /* short spin */
    }
  }
  throw new Error(`could not acquire lock on ${targetPath} (held > ${LOCK_STALE_MS}ms)`);
}

export function releaseLock(targetPath) {
  const lp = lockPath(targetPath);
  if (existsSync(lp)) {
    try {
      unlinkSync(lp);
    } catch {}
  }
}

// ─── AJV loader (deferred, shares node_modules with forge-state) ──────

export async function loadAjv() {
  const ajvDir = join(HERE, 'node_modules', 'ajv');
  if (!existsSync(ajvDir)) {
    // Delegate install to forge-state which owns the package.json here
    process.stderr.write('common: installing ajv via forge-state --install-deps...\n');
    const result = spawnSync('node', [join(HERE, 'forge-state.mjs'), '--install-deps'], {
      stdio: 'inherit',
    });
    if (result.status !== 0) {
      throw new Error('failed to install ajv. Run: node scripts/lib/forge-state.mjs --install-deps');
    }
  }
  const ajvMod = await import(join(HERE, 'node_modules', 'ajv', 'dist', '2020.js'));
  const addFormatsMod = await import(join(HERE, 'node_modules', 'ajv-formats', 'dist', 'index.js'));
  const Ajv2020 = ajvMod.default || ajvMod;
  const addFormats = addFormatsMod.default || addFormatsMod;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

export function loadSchema(name) {
  const dir = findSchemaDir();
  const p = join(dir, `${name}.schema.json`);
  if (!existsSync(p)) throw new Error(`schema not found: ${p}`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

export async function validateData(data, schemaName) {
  const ajv = await loadAjv();
  const schema = loadSchema(schemaName);
  const validate = ajv.compile(schema);
  if (!validate(data)) {
    const errs = validate.errors
      .map((e) => `  - ${e.instancePath || '<root>'} ${e.message}`)
      .join('\n');
    const err = new Error(`schema validation failed (${schemaName}):\n${errs}`);
    err.isValidationError = true;
    throw err;
  }
}

// ─── Loop id + timestamps ─────────────────────────────────────────────

export function nowIso() {
  // Explicit millisecond precision; avoids issues with Date.now() reordering
  // when many events are written in the same millisecond.
  const d = new Date();
  return d.toISOString();
}

// Best-effort loopId lookup from session.json; caller should fall back gracefully.
export function readLoopId() {
  const loopDir = findLoopDir();
  const sessionPath = join(loopDir, 'session.json');
  const session = readJsonOrNull(sessionPath);
  return session && session.loopId ? session.loopId : null;
}

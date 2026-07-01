#!/usr/bin/env node
// ai-forge enhancers CLI — frontmatter-only scan + keyword-based selection.
// Lets main skills load only relevant enhancer files instead of all of them.
//
// Usage:
//   enhancers list <phase>                        # JSON manifest from frontmatter only (cheap)
//   enhancers select <phase> --keywords k1,k2     # filter by appliesTo intersection
//   enhancers manifest --phase <p> --selected <names> --skipped <names>
//                                                 # write .loop/<phase>/enhancers-manifest.md

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argv, exit, cwd } from 'node:process';

const HERE = dirname(fileURLToPath(import.meta.url));

function die(msg, code = 1) { process.stderr.write(`enhancers: ${msg}\n`); exit(code); }

function parseArgs(args) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) { out.flags[key] = next; i++; }
      else { out.flags[key] = true; }
    } else { out._.push(a); }
  }
  return out;
}

function findEnhancersDir() {
  if (process.env.FORGE_ENHANCERS_DIR && existsSync(process.env.FORGE_ENHANCERS_DIR)) {
    return process.env.FORGE_ENHANCERS_DIR;
  }
  let dir = cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, '.claude', 'enhancers');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(HERE, '..', '..', '.claude', 'enhancers');
}

function parseFrontmatter(content) {
  if (!content.startsWith('---')) return null;
  const end = content.indexOf('\n---', 3);
  if (end < 0) return null;
  const block = content.slice(3, end).trim();
  const fm = {};
  let key = null;
  let arrayMode = false;
  for (const rawLine of block.split('\n')) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line) continue;
    const arrItem = line.match(/^\s+-\s+(.+)$/);
    if (arrayMode && arrItem && key) {
      fm[key].push(stripQuotes(arrItem[1]));
      continue;
    }
    arrayMode = false;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!m) continue;
    key = m[1];
    const val = m[2].trim();
    if (val === '') { fm[key] = []; arrayMode = true; continue; }
    if (val.startsWith('[') && val.endsWith(']')) {
      fm[key] = val.slice(1, -1).split(',').map(s => stripQuotes(s.trim())).filter(Boolean);
    } else {
      fm[key] = stripQuotes(val);
    }
  }
  return fm;
}

function stripQuotes(s) {
  if (!s) return s;
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function listEnhancers(phase) {
  const dir = join(findEnhancersDir(), phase);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md')
    .map(f => {
      const path = join(dir, f);
      // Read at most first 60 lines to keep frontmatter scan cheap
      const head = readFileSync(path, 'utf8').split('\n').slice(0, 60).join('\n');
      const fm = parseFrontmatter(head) || {};
      return {
        name: fm.name || basename(f, '.md'),
        description: fm.description || '',
        enhances: fm.enhances || phase,
        priority: fm.priority || 'medium',
        appliesTo: Array.isArray(fm.appliesTo) ? fm.appliesTo : [],
        path,
        file: f,
      };
    })
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      const pa = order[a.priority] ?? 1;
      const pb = order[b.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      return a.file.localeCompare(b.file);
    });
}

function cmdList(phase) {
  if (!phase) die('phase required (proto | dev | deploy)');
  const items = listEnhancers(phase);
  process.stdout.write(JSON.stringify(items, null, 2) + '\n');
}

function cmdSelect(phase, keywordsCsv) {
  if (!phase) die('phase required');
  const keywords = (keywordsCsv || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const items = listEnhancers(phase);
  const selected = [];
  const skipped = [];
  for (const it of items) {
    if (it.appliesTo.length === 0) { selected.push({ ...it, reason: 'no appliesTo (default-on)' }); continue; }
    const at = it.appliesTo.map(s => s.toLowerCase());
    const hit = keywords.some(k => at.some(a => a === k || a.includes(k) || k.includes(a)));
    if (hit || keywords.length === 0) selected.push({ ...it, reason: keywords.length === 0 ? 'no keywords given' : 'matched keywords' });
    else skipped.push({ ...it, reason: `no keyword match (needs: ${it.appliesTo.join(', ')})` });
  }
  process.stdout.write(JSON.stringify({ selected, skipped }, null, 2) + '\n');
}

function cmdManifest(phase, selectedCsv, skippedCsv, loopDir) {
  if (!phase) die('--phase required');
  const selected = (selectedCsv || '').split(',').map(s => s.trim()).filter(Boolean);
  const skipped = (skippedCsv || '').split(',').map(s => s.trim()).filter(Boolean);
  const all = listEnhancers(phase);
  const byName = Object.fromEntries(all.map(x => [x.name, x]));
  const lines = [
    `# Enhancers Manifest — ${phase}`,
    '',
    `> Generated: ${new Date().toISOString()}`,
    '',
    `## Enabled (${selected.length})`,
    '',
  ];
  if (selected.length === 0) lines.push('_(none)_', '');
  for (const name of selected) {
    const it = byName[name];
    if (!it) { lines.push(`- **${name}** _(unknown — not found in enhancers dir)_`); continue; }
    lines.push(`- **${name}** (priority: ${it.priority})`);
    if (it.description) lines.push(`  - ${it.description}`);
    if (it.appliesTo.length) lines.push(`  - appliesTo: ${it.appliesTo.join(', ')}`);
  }
  lines.push('', `## Skipped (${skipped.length})`, '');
  if (skipped.length === 0) lines.push('_(none)_', '');
  for (const name of skipped) {
    const it = byName[name];
    if (!it) { lines.push(`- ${name} _(unknown)_`); continue; }
    lines.push(`- ${name} — appliesTo: ${it.appliesTo.join(', ') || '(none)'}`);
  }
  const baseDir = loopDir || join(cwd(), '.loop', phase === 'proto' ? 'prototype' : phase);
  if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true });
  const outPath = join(baseDir, 'enhancers-manifest.md');
  writeFileSync(outPath, lines.join('\n') + '\n');
  process.stderr.write(`enhancers: wrote ${outPath}\n`);
}

function main() {
  const args = parseArgs(argv.slice(2));
  const [cmd, phase] = args._;
  if (!cmd) {
    process.stderr.write('usage: enhancers <list|select|manifest> <phase> [flags]\n');
    exit(1);
  }
  switch (cmd) {
    case 'list': return cmdList(phase);
    case 'select': return cmdSelect(phase, args.flags.keywords || '');
    case 'manifest': return cmdManifest(args.flags.phase, args.flags.selected || '', args.flags.skipped || '', args.flags['loop-dir']);
    default: die(`unknown command: ${cmd}`);
  }
}

main();

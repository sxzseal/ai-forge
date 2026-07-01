#!/usr/bin/env bash
set -euo pipefail

# ai-forge — Project Upgrade Script
# Syncs framework-level assets (.claude/{skills,commands,enhancers,schemas},
# scripts/lib, .claude/PHASE_CONTRACT.md) into an existing project.
# Does NOT touch user code, .loop/, package.json, or the project template.
#
# Usage: ./scripts/upgrade.sh <project-path> [--include-template] [--force]

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}→${NC} $1"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; exit 1; }

PROJECT_DIR=""
INCLUDE_TEMPLATE=0
FORCE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --include-template) INCLUDE_TEMPLATE=1; shift ;;
    --force) FORCE=1; shift ;;
    --help|-h)
      cat <<'EOF'
  ai-forge upgrade — sync framework assets into an existing project

  Usage: ./scripts/upgrade.sh <project-path> [--include-template] [--force]

  Syncs (always):
    .claude/skills/             Dev Loop skill definitions
    .claude/commands/           Slash command entry points
    .claude/enhancers/          Phase enhancer knowledge packs
    .claude/schemas/            JSON Schemas for forge-state / events / receipts / plan / role / metrics
    .claude/roles/              Subagent role manifests (feature-impl / api-route / plan-analyst / ...)
    .claude/PHASE_CONTRACT.md   Cross-phase state contract
    .claude/settings.json       Hooks (PostToolUse schema validate + PreToolUse mode gate) — MERGED not replaced
    scripts/lib/                All forge-* CLIs (state/events/budget/patch/worktree/repomap/metrics/mode) + enhancers
    tests/smoke/                Deploy smoke test template (only if project doesn't already have it)

  Does NOT touch:
    .loop/                      Session state
    src/, public/, tests/       User code
    package.json, components.json
    .storybook/                 (unless --include-template)

  Flags:
    --include-template          Also sync .storybook/, .github/, configs
    --force                     Skip the git-clean check (dangerous)
EOF
      exit 0
      ;;
    -*) error "未知选项：$1" ;;
    *)
      if [[ -z "$PROJECT_DIR" ]]; then PROJECT_DIR="$1"
      else error "多余参数：$1"
      fi
      shift
      ;;
  esac
done

[[ -z "$PROJECT_DIR" ]] && error "用法：$0 <project-path> [--include-template] [--force]"
[[ ! -d "$PROJECT_DIR" ]] && error "目录不存在：$PROJECT_DIR"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGE_DIR="$(dirname "$SCRIPT_DIR")"

[[ ! -d "$FORGE_DIR/.claude/skills" ]] && error "framework dir not detected at $FORGE_DIR"

echo ""
echo "  🔄 ai-forge upgrade — $PROJECT_DIR"
echo "  ─────────────────────────────────────────"
echo ""

# Pinned version check
if [[ -f "$PROJECT_DIR/.claude/version.txt" ]]; then
  ok "Project was scaffolded from forge SHA $(grep '^forge_sha=' "$PROJECT_DIR/.claude/version.txt" | cut -d= -f2 || echo unknown)"
else
  warn "No .claude/version.txt — this project was created with an older ai-forge"
  warn "Upgrade will proceed; review the diff after this script completes"
fi

# Safety: require clean git tree (skip with --force)
if [[ "$FORCE" -ne 1 ]]; then
  if ! (cd "$PROJECT_DIR" && git diff-index --quiet HEAD -- 2>/dev/null); then
    error "工作区有未提交改动。先 commit / stash，或加 --force 跳过检查"
  fi
fi

# Auto-stash as safety net
STASH_REF=""
if (cd "$PROJECT_DIR" && git status --porcelain 2>/dev/null | grep -q .); then
  info "Untracked / modified files detected — stashing as safety net..."
  STASH_OUTPUT="$(cd "$PROJECT_DIR" && git stash push -u -m "ai-forge-upgrade-$(date +%Y%m%d-%H%M%S)" 2>&1)" || true
  STASH_REF="ai-forge-upgrade"
fi

# ── Sync .claude/skills ────────────────────────────────────────
info "Syncing .claude/skills/..."
mkdir -p "$PROJECT_DIR/.claude/skills"
for skill_dir in "$FORGE_DIR/.claude/skills"/dev-*; do
  [[ -d "$skill_dir" ]] || continue
  rm -rf "$PROJECT_DIR/.claude/skills/$(basename "$skill_dir")"
  cp -R "$skill_dir" "$PROJECT_DIR/.claude/skills/"
done
ok "skills synced"

# ── Sync .claude/commands ──────────────────────────────────────
info "Syncing .claude/commands/..."
mkdir -p "$PROJECT_DIR/.claude/commands"
for cmd in "$FORGE_DIR/.claude/commands"/dev-*.md; do
  [[ -f "$cmd" ]] || continue
  cp "$cmd" "$PROJECT_DIR/.claude/commands/"
done
ok "commands synced"

# ── Sync .claude/enhancers ─────────────────────────────────────
info "Syncing .claude/enhancers/..."
rm -rf "$PROJECT_DIR/.claude/enhancers"
cp -R "$FORGE_DIR/.claude/enhancers" "$PROJECT_DIR/.claude/"
ok "enhancers synced"

# ── Sync .claude/schemas ───────────────────────────────────────
info "Syncing .claude/schemas/..."
rm -rf "$PROJECT_DIR/.claude/schemas"
cp -R "$FORGE_DIR/.claude/schemas" "$PROJECT_DIR/.claude/"
ok "schemas synced"

# ── Sync .claude/roles ─────────────────────────────────────────
info "Syncing .claude/roles/..."
rm -rf "$PROJECT_DIR/.claude/roles"
cp -R "$FORGE_DIR/.claude/roles" "$PROJECT_DIR/.claude/"
ok "roles synced"

# ── Merge .claude/settings.json (hooks) ────────────────────────
# Existing user permissions are preserved; framework hooks are set (and overwrite any prior forge hooks).
if [[ -f "$FORGE_DIR/.claude/settings.json" ]]; then
  info "Merging .claude/settings.json (preserving user permissions.allow, replacing hooks)..."
  node - "$PROJECT_DIR/.claude/settings.json" "$FORGE_DIR/.claude/settings.json" <<'JS'
    const fs = require('fs');
    const [projectPath, forgePath] = process.argv.slice(2);
    const forge = JSON.parse(fs.readFileSync(forgePath, 'utf8'));
    let project = {};
    try { project = JSON.parse(fs.readFileSync(projectPath, 'utf8')); } catch { /* first run */ }
    // Preserve user's allow list; union with forge's suggested allow list
    const projectAllow = (project.permissions && project.permissions.allow) || [];
    const forgeAllow = (forge.permissions && forge.permissions.allow) || [];
    const merged = {
      ...project,
      permissions: {
        ...(project.permissions || {}),
        allow: Array.from(new Set([...projectAllow, ...forgeAllow])),
      },
      hooks: forge.hooks || project.hooks || {},
    };
    fs.mkdirSync(require('path').dirname(projectPath), { recursive: true });
    fs.writeFileSync(projectPath, JSON.stringify(merged, null, 2) + '\n');
JS
  ok "settings.json merged"
fi

# ── Sync tests/smoke/ (only if missing) ────────────────────────
if [[ ! -d "$PROJECT_DIR/tests/smoke" && -d "$FORGE_DIR/template/tests/smoke" ]]; then
  info "Installing tests/smoke/ template..."
  mkdir -p "$PROJECT_DIR/tests/smoke"
  cp -R "$FORGE_DIR/template/tests/smoke/." "$PROJECT_DIR/tests/smoke/"
  ok "tests/smoke/ installed"
fi

# ── Sync PHASE_CONTRACT ────────────────────────────────────────
cp "$FORGE_DIR/.claude/PHASE_CONTRACT.md" "$PROJECT_DIR/.claude/PHASE_CONTRACT.md"
ok "PHASE_CONTRACT.md synced"

# ── Sync scripts/lib ───────────────────────────────────────────
info "Syncing scripts/lib/..."
mkdir -p "$PROJECT_DIR/scripts/lib"
# Copy every forge-*.mjs + _common.mjs + enhancers.mjs + package.json
for f in "$FORGE_DIR/scripts/lib"/forge-*.mjs "$FORGE_DIR/scripts/lib"/_common.mjs "$FORGE_DIR/scripts/lib"/enhancers.mjs; do
  [[ -f "$f" ]] && cp "$f" "$PROJECT_DIR/scripts/lib/"
done
cp "$FORGE_DIR/scripts/lib/package.json"    "$PROJECT_DIR/scripts/lib/"
# Make CLIs executable
chmod +x "$PROJECT_DIR/scripts/lib"/*.mjs 2>/dev/null || true
ok "scripts/lib synced ($(ls "$PROJECT_DIR/scripts/lib"/*.mjs 2>/dev/null | wc -l | tr -d ' ') CLIs)"

# ── Optional: template assets ──────────────────────────────────
if [[ "$INCLUDE_TEMPLATE" -eq 1 ]]; then
  info "Syncing .storybook/, .github/, root configs..."
  if [[ -d "$FORGE_DIR/template/_storybook" ]]; then
    rm -rf "$PROJECT_DIR/.storybook"
    cp -R "$FORGE_DIR/template/_storybook" "$PROJECT_DIR/.storybook"
  fi
  if [[ -d "$FORGE_DIR/template/_github" ]]; then
    rm -rf "$PROJECT_DIR/.github"
    cp -R "$FORGE_DIR/template/_github" "$PROJECT_DIR/.github"
  fi
  for f in eslint.config.mjs vitest.config.ts playwright.config.ts; do
    [[ -f "$FORGE_DIR/template/$f" ]] && cp "$FORGE_DIR/template/$f" "$PROJECT_DIR/$f"
  done
  ok "template assets synced"
fi

# ── Refresh version.txt ────────────────────────────────────────
FORGE_SHA="$(git -C "$FORGE_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
UPGRADE_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$PROJECT_DIR/.claude/version.txt" <<EOF
# ai-forge version pin
forge_sha=$FORGE_SHA
upgraded_at=$UPGRADE_AT
EOF
ok "version.txt → $FORGE_SHA"

# ── Reinstall forge-state deps if needed ───────────────────────
if [[ ! -d "$PROJECT_DIR/scripts/lib/node_modules/ajv" ]]; then
  info "Installing forge-state runtime deps (ajv)..."
  (cd "$PROJECT_DIR" && node scripts/lib/forge-state.mjs --install-deps) || warn "ajv install failed — run manually: cd $PROJECT_DIR && node scripts/lib/forge-state.mjs --install-deps"
fi

echo ""
echo "  ✅ Upgrade complete"
echo "  ─────────────────────────────────────────"
echo ""
echo "  Review changes: cd $PROJECT_DIR && git diff"
if [[ -n "$STASH_REF" ]]; then
  echo "  Pre-upgrade work was stashed; restore with: git stash pop"
fi
echo ""

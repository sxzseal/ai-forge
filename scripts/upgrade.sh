#!/usr/bin/env bash
set -euo pipefail

# ai-forge — Project Upgrade Script
# Syncs framework-level assets (.claude/{skills,commands,enhancers,schemas,roles},
# scripts/lib, .claude/PHASE_CONTRACT.md) into an existing project. Also installs
# i18n/theme scaffolding when missing (never overwrites user code) and adds
# next-intl / next-themes to dependencies if they're absent — see --help for the
# full list of what's touched and what's preserved.
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
    i18n/theme scaffolding      src/i18n/, src/middleware.ts, src/app/[locale]/, messages/,
                                src/components/{theme-provider,theme-toggle,locale-switcher}.tsx
                                (ONLY if missing — never overwrites user code)
    package.json dependencies   Adds next-intl / next-themes if missing (deps block only, no other fields touched)

  Does NOT touch:
    .loop/                      Session state
    src/, public/, tests/       User code (except the i18n scaffolding above when it doesn't exist yet)
    components.json
    package.json                (except adding missing next-intl / next-themes to dependencies)
    .storybook/                 (unless --include-template)
    next.config.ts              (unless --include-template — user config; warns if next-intl plugin missing)

  Flags:
    --include-template          Also sync .storybook/, .github/, configs (eslint/vitest/playwright/next.config)
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

# Auto-stash as safety net. Only set STASH_REF if the push actually stashed
# something — a failed / no-op stash must not tell the user to `git stash pop`.
STASH_REF=""
if (cd "$PROJECT_DIR" && git status --porcelain 2>/dev/null | grep -q .); then
  info "Untracked / modified files detected — stashing as safety net..."
  STASH_MSG="ai-forge-upgrade-$(date +%Y%m%d-%H%M%S)"
  if (cd "$PROJECT_DIR" && git stash push -u -m "$STASH_MSG" >/dev/null 2>&1); then
    # `git stash push` prints "No local changes to save" AND exits 0 when nothing
    # was actually stashed, so verify the stash landed on top of the ref stack.
    if (cd "$PROJECT_DIR" && git stash list 2>/dev/null | head -1 | grep -q "$STASH_MSG"); then
      STASH_REF="$STASH_MSG"
      ok "Stashed as $STASH_MSG"
    else
      warn "git stash push exited 0 but no stash was created (nothing to stash)"
    fi
  else
    warn "git stash push failed — proceeding without stash safety net"
  fi
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
# User permissions.allow and user-authored hooks are preserved; framework hooks are
# unioned in. Duplicate framework hooks (identified by matcher + command signature)
# are refreshed rather than duplicated.
if [[ -f "$FORGE_DIR/.claude/settings.json" ]]; then
  info "Merging .claude/settings.json (preserving user permissions.allow and user hooks)..."
  node - "$PROJECT_DIR/.claude/settings.json" "$FORGE_DIR/.claude/settings.json" <<'JS'
    const fs = require('fs');
    const path = require('path');
    const [projectPath, forgePath] = process.argv.slice(2);
    const forge = JSON.parse(fs.readFileSync(forgePath, 'utf8'));
    let project = {};
    try { project = JSON.parse(fs.readFileSync(projectPath, 'utf8')); } catch { /* first run */ }

    // Preserve user's allow list; union with forge's suggested allow list
    const projectAllow = (project.permissions && project.permissions.allow) || [];
    const forgeAllow = (forge.permissions && forge.permissions.allow) || [];
    // Same for deny — union so hardened rules ship on upgrade
    const projectDeny = (project.permissions && project.permissions.deny) || [];
    const forgeDeny = (forge.permissions && forge.permissions.deny) || [];

    // Merge hooks per event kind (PostToolUse, PreToolUse, Stop, ...). For each
    // matcher, union project's own hooks with forge's, deduping by command string.
    // This means a user's prettier PostToolUse survives an upgrade, while the
    // framework's forge-* hooks are (re-)installed alongside.
    const projectHooks = project.hooks || {};
    const forgeHooks = forge.hooks || {};
    const hookKinds = new Set([...Object.keys(projectHooks), ...Object.keys(forgeHooks)]);
    const mergedHooks = {};
    for (const kind of hookKinds) {
      const projectEntries = Array.isArray(projectHooks[kind]) ? projectHooks[kind] : [];
      const forgeEntries = Array.isArray(forgeHooks[kind]) ? forgeHooks[kind] : [];
      // Index project entries by matcher for merge; forge entries always refresh.
      const byMatcher = new Map();
      for (const e of projectEntries) byMatcher.set(e.matcher || '', { matcher: e.matcher, hooks: [...(e.hooks || [])] });
      for (const e of forgeEntries) {
        const key = e.matcher || '';
        const slot = byMatcher.get(key) || { matcher: e.matcher, hooks: [] };
        const seen = new Set(slot.hooks.map((h) => `${h.type}::${h.command}`));
        for (const h of (e.hooks || [])) {
          const sig = `${h.type}::${h.command}`;
          if (!seen.has(sig)) { slot.hooks.push(h); seen.add(sig); }
        }
        byMatcher.set(key, slot);
      }
      mergedHooks[kind] = [...byMatcher.values()];
    }

    const merged = {
      ...project,
      permissions: {
        ...(project.permissions || {}),
        allow: Array.from(new Set([...projectAllow, ...forgeAllow])),
        ...(projectDeny.length + forgeDeny.length > 0
          ? { deny: Array.from(new Set([...projectDeny, ...forgeDeny])) }
          : {}),
      },
      hooks: mergedHooks,
    };
    fs.mkdirSync(path.dirname(projectPath), { recursive: true });
    fs.writeFileSync(projectPath, JSON.stringify(merged, null, 2) + '\n');
JS
  ok "settings.json merged (user hooks preserved)"
fi

# ── Sync tests/smoke/ (only if missing) ────────────────────────
if [[ ! -d "$PROJECT_DIR/tests/smoke" && -d "$FORGE_DIR/template/tests/smoke" ]]; then
  info "Installing tests/smoke/ template..."
  mkdir -p "$PROJECT_DIR/tests/smoke"
  cp -R "$FORGE_DIR/template/tests/smoke/." "$PROJECT_DIR/tests/smoke/"
  ok "tests/smoke/ installed"
fi

# ── Sync i18n/theme scaffolding (only if missing) ──────────────
# The dev enhancer (theme-and-i18n) assumes these files exist. For pre-i18n
# projects (upgraded from a forge SHA before this feature) we install them; for
# projects that already have them we skip to preserve user changes.
I18N_INSTALLED=()
maybe_install_dir() {
  local src="$1" dst="$2"
  if [[ ! -e "$PROJECT_DIR/$dst" && -e "$FORGE_DIR/template/$src" ]]; then
    mkdir -p "$(dirname "$PROJECT_DIR/$dst")"
    cp -R "$FORGE_DIR/template/$src" "$PROJECT_DIR/$dst"
    I18N_INSTALLED+=("$dst")
  fi
}
info "Checking i18n/theme scaffolding..."
maybe_install_dir "src/i18n"                              "src/i18n"
maybe_install_dir "src/middleware.ts"                     "src/middleware.ts"
maybe_install_dir "src/app/[locale]"                      "src/app/[locale]"
maybe_install_dir "messages"                              "messages"
maybe_install_dir "src/components/theme-provider.tsx"     "src/components/theme-provider.tsx"
maybe_install_dir "src/components/theme-toggle.tsx"       "src/components/theme-toggle.tsx"
maybe_install_dir "src/components/locale-switcher.tsx"    "src/components/locale-switcher.tsx"
if (( ${#I18N_INSTALLED[@]} > 0 )); then
  ok "i18n/theme scaffolding installed (${#I18N_INSTALLED[@]} paths): ${I18N_INSTALLED[*]}"
else
  ok "i18n/theme scaffolding already present — skipped"
fi

# Warn if next.config.ts is missing the next-intl plugin wrap (user config we
# won't overwrite outside --include-template, but a hard requirement for the
# scaffolding to compile). Actionable message — don't silently break their build.
if [[ -f "$PROJECT_DIR/next.config.ts" ]] && ! grep -q "createNextIntlPlugin\|next-intl/plugin" "$PROJECT_DIR/next.config.ts"; then
  warn "next.config.ts is not wrapped with createNextIntlPlugin('./src/i18n/request.ts')"
  warn "  → i18n messages will not load. Compare to template/next.config.ts, or re-run with --include-template."
fi

# ── Merge next-intl / next-themes into package.json (deps only) ─
# Contained deps-block merge — nothing else in package.json is touched. Skips
# any dep that's already present at any version (won't downgrade user pins).
if [[ -f "$PROJECT_DIR/package.json" ]]; then
  node - "$PROJECT_DIR/package.json" "$FORGE_DIR/template/package.json" <<'JS'
    const fs = require('fs');
    const [projectPath, templatePath] = process.argv.slice(2);
    const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
    const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const REQUIRED = ['next-intl', 'next-themes'];
    const projectDeps = project.dependencies || {};
    const templateDeps = template.dependencies || {};
    const added = [];
    for (const name of REQUIRED) {
      if (!projectDeps[name] && templateDeps[name]) {
        projectDeps[name] = templateDeps[name];
        added.push(`${name}@${templateDeps[name]}`);
      }
    }
    if (added.length > 0) {
      project.dependencies = projectDeps;
      fs.writeFileSync(projectPath, JSON.stringify(project, null, 2) + '\n');
      console.log(`ADDED:${added.join(',')}`);
    }
JS
  # Read what got added (if anything) for user-facing summary
  # Node script prints ADDED:foo@1,bar@2 on success — capture last such line.
  # (Kept simple: rerun the same check via grep since node already wrote the file.)
  if grep -q '"next-intl"' "$PROJECT_DIR/package.json" 2>/dev/null && grep -q '"next-themes"' "$PROJECT_DIR/package.json" 2>/dev/null; then
    ok "package.json deps verified (next-intl, next-themes)"
  fi
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
  for f in eslint.config.mjs vitest.config.ts playwright.config.ts next.config.ts; do
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
  echo "  Pre-upgrade work was stashed as '$STASH_REF'."
  echo "  Restore with: cd $PROJECT_DIR && git stash list | grep '$STASH_REF' # then: git stash apply <ref>"
fi
echo ""

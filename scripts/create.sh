#!/usr/bin/env bash
set -euo pipefail

# ai-forge — Project Scaffold Script
# Usage: ./scripts/create.sh <project-name> [target-directory]

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}→${NC} $1"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; exit 1; }

# ── Arguments ──────────────────────────────────────────────────

PROJECT_NAME=""
TARGET_DIR="."
NO_VISUAL_FEEDBACK=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-visual-feedback)
      NO_VISUAL_FEEDBACK=1
      shift
      ;;
    --help|-h)
      PROJECT_NAME=""
      break
      ;;
    -*)
      error "未知选项：$1"
      ;;
    *)
      if [[ -z "$PROJECT_NAME" ]]; then
        PROJECT_NAME="$1"
      elif [[ "$TARGET_DIR" == "." ]]; then
        TARGET_DIR="$1"
      else
        error "多余参数：$1"
      fi
      shift
      ;;
  esac
done

if [[ -z "$PROJECT_NAME" ]]; then
  echo ""
  echo "  ai-forge — AI-driven development framework"
  echo ""
  echo "  Usage: $0 <project-name> [target-directory] [--no-visual-feedback]"
  echo ""
  echo "  Options:"
  echo "    --no-visual-feedback   Skip Storybook annotation tool (smaller install)"
  echo ""
  echo "  Examples:"
  echo "    $0 my-app"
  echo "    $0 my-app ~/Projects"
  echo "    $0 my-app --no-visual-feedback"
  echo ""
  exit 1
fi

# Reject flags passed as project name
if [[ "$PROJECT_NAME" == -* ]]; then
  error "项目名不能以连字符开头（当前值：$PROJECT_NAME）"
fi

# Validate project name: lowercase letters, digits, hyphens only; no leading/trailing hyphen
if [[ ! "$PROJECT_NAME" =~ ^[a-z0-9][a-z0-9-]*[a-z0-9]$ ]] && [[ ! "$PROJECT_NAME" =~ ^[a-z0-9]$ ]]; then
  error "项目名格式无效：只能包含小写字母、数字和连字符，且不能以连字符开头或结尾（当前值：$PROJECT_NAME）"
fi

# Check Node.js version
if ! command -v node &>/dev/null; then
  error "未找到 Node.js，请安装 Node.js 18+ → https://nodejs.org"
fi
NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  error "Node.js 版本过低（当前 v$(node -v)），需要 >= 18"
fi

# Locate template directory (relative to this script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGE_DIR="$(dirname "$SCRIPT_DIR")"
TEMPLATE_DIR="$FORGE_DIR/template"

if [[ ! -d "$TEMPLATE_DIR" ]]; then
  error "Template directory not found: $TEMPLATE_DIR"
fi

PROJECT_DIR="$TARGET_DIR/$PROJECT_NAME"

if [[ -d "$PROJECT_DIR" ]]; then
  error "Directory already exists: $PROJECT_DIR"
fi

echo ""
echo "  🔨 ai-forge — Creating project: $PROJECT_NAME"
echo "  ─────────────────────────────────────────"
echo ""

# ── Step 1: Copy template ──────────────────────────────────────

info "Copying template..."
mkdir -p "$PROJECT_DIR"
cp -R "$TEMPLATE_DIR"/. "$PROJECT_DIR"/

# Rename _ prefixed directories to . prefixed
if [[ -d "$PROJECT_DIR/_claude" ]]; then
  mv "$PROJECT_DIR/_claude" "$PROJECT_DIR/.claude"
  ok "Renamed _claude → .claude"
fi

if [[ -d "$PROJECT_DIR/_storybook" ]]; then
  mv "$PROJECT_DIR/_storybook" "$PROJECT_DIR/.storybook"
  ok "Renamed _storybook → .storybook"
fi

# Strip visual-feedback annotation tool if user opted out
if [[ "$NO_VISUAL_FEEDBACK" -eq 1 && -d "$PROJECT_DIR/.storybook/visual-feedback" ]]; then
  rm -rf "$PROJECT_DIR/.storybook/visual-feedback"
  # Remove the visual-feedback panel import + setup from preview.ts (best-effort, leave a note if pattern not found)
  if grep -q "visual-feedback" "$PROJECT_DIR/.storybook/preview.ts" 2>/dev/null; then
    # Strip lines mentioning visual-feedback (import + register call)
    sed -i.bak '/visual-feedback/d' "$PROJECT_DIR/.storybook/preview.ts" && rm "$PROJECT_DIR/.storybook/preview.ts.bak"
  fi
  # Replace `concurrently "storybook" "node .storybook/visual-feedback/server.cjs"` with plain storybook
  if grep -q "visual-feedback" "$PROJECT_DIR/package.json" 2>/dev/null; then
    node -e '
      const fs = require("fs");
      const path = process.argv[1];
      const pkg = JSON.parse(fs.readFileSync(path, "utf8"));
      if (pkg.scripts) {
        for (const [k, v] of Object.entries(pkg.scripts)) {
          if (typeof v === "string" && v.includes("visual-feedback")) {
            // Fall back to bare storybook script
            pkg.scripts[k] = "storybook dev -p 6006";
          }
        }
      }
      fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
    ' "$PROJECT_DIR/package.json"
  fi
  ok "Visual-feedback tool removed (--no-visual-feedback)"
fi

if [[ -d "$PROJECT_DIR/_github" ]]; then
  mv "$PROJECT_DIR/_github" "$PROJECT_DIR/.github"
  ok "Renamed _github → .github"
fi

# Copy Dev Loop skills & commands from ai-forge into the project
info "Copying Dev Loop skills..."
mkdir -p "$PROJECT_DIR/.claude/skills" "$PROJECT_DIR/.claude/commands"
for skill_dir in "$FORGE_DIR/.claude/skills"/dev-*; do
  if [[ -d "$skill_dir" ]]; then
    cp -R "$skill_dir" "$PROJECT_DIR/.claude/skills/"
  fi
done
for cmd_file in "$FORGE_DIR/.claude/commands"/dev-*.md; do
  if [[ -f "$cmd_file" ]]; then
    cp "$cmd_file" "$PROJECT_DIR/.claude/commands/"
  fi
done
cp "$FORGE_DIR/.claude/PHASE_CONTRACT.md" "$PROJECT_DIR/.claude/" 2>/dev/null || true

# Copy framework state CLI + JSON schemas (used by all phase skills)
info "Installing forge-state CLI + schemas + roles..."
mkdir -p "$PROJECT_DIR/scripts/lib" "$PROJECT_DIR/.claude/schemas" "$PROJECT_DIR/.claude/roles"
for f in "$FORGE_DIR/scripts/lib"/forge-*.mjs "$FORGE_DIR/scripts/lib"/_common.mjs "$FORGE_DIR/scripts/lib"/enhancers.mjs; do
  [[ -f "$f" ]] && cp "$f" "$PROJECT_DIR/scripts/lib/"
done
cp "$FORGE_DIR/scripts/lib/package.json" "$PROJECT_DIR/scripts/lib/"
chmod +x "$PROJECT_DIR/scripts/lib"/*.mjs 2>/dev/null || true
cp "$FORGE_DIR/.claude/schemas/"*.json "$PROJECT_DIR/.claude/schemas/"
if [[ -d "$FORGE_DIR/.claude/roles" ]]; then
  cp "$FORGE_DIR/.claude/roles/"*.json "$PROJECT_DIR/.claude/roles/" 2>/dev/null || true
fi
CLI_COUNT=$(ls "$PROJECT_DIR/scripts/lib"/*.mjs 2>/dev/null | wc -l | tr -d ' ')
SCHEMA_COUNT=$(ls "$PROJECT_DIR/.claude/schemas"/*.json 2>/dev/null | wc -l | tr -d ' ')
ROLE_COUNT=$(ls "$PROJECT_DIR/.claude/roles"/*.json 2>/dev/null | wc -l | tr -d ' ')
ok "forge CLIs (${CLI_COUNT}) + schemas (${SCHEMA_COUNT}) + roles (${ROLE_COUNT}) installed"

# Merge framework .claude/settings.json (hooks) into project settings
if [[ -f "$FORGE_DIR/.claude/settings.json" ]]; then
  info "Merging framework hooks into .claude/settings.json..."
  node - "$PROJECT_DIR/.claude/settings.json" "$FORGE_DIR/.claude/settings.json" <<'JS'
    const fs = require('fs');
    const path = require('path');
    const [projectPath, forgePath] = process.argv.slice(2);
    const forge = JSON.parse(fs.readFileSync(forgePath, 'utf8'));
    let project = {};
    try { project = JSON.parse(fs.readFileSync(projectPath, 'utf8')); } catch {}

    const projectAllow = (project.permissions && project.permissions.allow) || [];
    const forgeAllow = (forge.permissions && forge.permissions.allow) || [];

    // Union hooks per event kind + matcher, deduped by command signature so a
    // fresh install picks up all framework hooks and any pre-existing user hooks.
    const projectHooks = project.hooks || {};
    const forgeHooks = forge.hooks || {};
    const hookKinds = new Set([...Object.keys(projectHooks), ...Object.keys(forgeHooks)]);
    const mergedHooks = {};
    for (const kind of hookKinds) {
      const projectEntries = Array.isArray(projectHooks[kind]) ? projectHooks[kind] : [];
      const forgeEntries = Array.isArray(forgeHooks[kind]) ? forgeHooks[kind] : [];
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
      },
      hooks: mergedHooks,
    };
    fs.mkdirSync(path.dirname(projectPath), { recursive: true });
    fs.writeFileSync(projectPath, JSON.stringify(merged, null, 2) + '\n');
JS
  ok "settings.json hooks merged"
fi

# Ship the tests/smoke/ template (consumed by dev-deploy Step 4.5)
if [[ -d "$FORGE_DIR/template/tests/smoke" && ! -d "$PROJECT_DIR/tests/smoke" ]]; then
  mkdir -p "$PROJECT_DIR/tests/smoke"
  cp -R "$FORGE_DIR/template/tests/smoke/." "$PROJECT_DIR/tests/smoke/"
  ok "tests/smoke/ installed"
fi

# Pin which forge version this project was scaffolded from (consumed by upgrade.sh)
FORGE_SHA="$(git -C "$FORGE_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
FORGE_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$PROJECT_DIR/.claude/version.txt" <<EOF
# ai-forge version pin (used by scripts/upgrade.sh)
forge_sha=$FORGE_SHA
scaffolded_at=$FORGE_DATE
EOF

# Copy phase enhancers (framework-level extension knowledge packs)
if [[ -d "$FORGE_DIR/.claude/enhancers" ]]; then
  cp -R "$FORGE_DIR/.claude/enhancers" "$PROJECT_DIR/.claude/"
  enhancer_count=$(find "$PROJECT_DIR/.claude/enhancers" -name '*.md' -not -name '_*' -not -name 'README.md' | wc -l | tr -d ' ')
  ok "Phase enhancers installed (${enhancer_count} active enhancer(s))"
fi

ok "Dev Loop skills installed (6 skills + 5 commands + phase contract + forge CLIs + roles + hooks)"

# ── Step 2: Replace project name placeholders ──────────────────

info "Setting project name: $PROJECT_NAME"

# Escape project name for use in sed (handles / in paths)
PROJECT_NAME_ESC="${PROJECT_NAME//\//\\/}"

# Replace __PROJECT_NAME__ in all text files
find "$PROJECT_DIR" -type f \( \
  -name "*.json" -o \
  -name "*.ts" -o \
  -name "*.tsx" -o \
  -name "*.js" -o \
  -name "*.mjs" -o \
  -name "*.md" -o \
  -name "*.toml" -o \
  -name "*.css" -o \
  -name "*.yml" \
\) -exec grep -l "__PROJECT_NAME__" {} \; 2>/dev/null | while read -r file; do
  sed -i '' "s/__PROJECT_NAME__/$PROJECT_NAME_ESC/g" "$file" 2>/dev/null || \
  sed -i "s/__PROJECT_NAME__/$PROJECT_NAME_ESC/g" "$file"
done

ok "Project name replaced in all files"

# ── Step 3: Create .loop/ directory structure ──────────────────

info "Creating .loop/ directory structure..."
mkdir -p "$PROJECT_DIR/.loop"/{prototype,dev,review,test,deploy,archive}

LOOP_ID="loop-$(date +%Y%m%d)-001"
CREATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
# Write through forge-state so the seed file is schema-validated
echo "{\"loopId\":\"$LOOP_ID\",\"requirement\":\"\",\"createdAt\":\"$CREATED_AT\",\"currentPhase\":\"prototype\",\"phases\":{\"prototype\":{\"status\":\"pending\"},\"dev\":{\"status\":\"pending\"},\"deploy\":{\"status\":\"pending\"}},\"artifacts\":{},\"schemaVersion\":1}" \
  | (cd "$PROJECT_DIR" && node scripts/lib/forge-state.mjs write .loop/session.json --schema session) \
  || error "forge-state seed write failed — check scripts/lib/forge-state.mjs"

ok ".loop/ directory created (session.json schema-validated)"

# ── Step 4: Install dependencies ───────────────────────────────

# Detect package manager: prefer pnpm (faster) if available
if command -v pnpm &>/dev/null; then
  PKG_MGR="pnpm"
  DLX="pnpm dlx"
  info "Installing dependencies with pnpm (this may take a minute)..."
else
  PKG_MGR="npm"
  DLX="npx"
  info "Installing dependencies (this may take a minute)..."
fi

pushd "$PROJECT_DIR" > /dev/null
if ! $PKG_MGR install 2>&1 | tail -5; then
  error "$PKG_MGR install 失败，请检查网络连接或 Node.js 版本（需要 >= 18）\n提示：可尝试添加淘宝镜像 → echo 'registry=https://registry.npmmirror.com' >> ~/.npmrc"
fi
popd > /dev/null

ok "Dependencies installed"

# ── Step 4.1: Install forge-state runtime deps (ajv) ───────────
info "Installing forge-state runtime deps..."
pushd "$PROJECT_DIR" > /dev/null
if ! node scripts/lib/forge-state.mjs --install-deps 2>&1 | tail -3; then
  warn "forge-state deps install failed — first /dev-loop run will retry"
fi
popd > /dev/null
ok "forge-state runtime ready"

# ── Step 5: Initialize MSW service worker ──────────────────────
# Note: shadcn init is skipped — template already includes components.json + UI components

info "Initializing MSW service worker..."
mkdir -p "$PROJECT_DIR/public"
# Use local pnpm exec (msw is already installed); fall back to npx/dlx if needed
if [[ "$PKG_MGR" == "pnpm" ]]; then
  MSW_INIT="pnpm exec msw init"
else
  MSW_INIT="npx msw init"
fi

pushd "$PROJECT_DIR" > /dev/null
if ! $MSW_INIT "$PROJECT_DIR/public/" --save 2>&1 | tail -3; then
  warn "MSW 初始化失败，请手动执行：$MSW_INIT public/ --save"
  warn "项目已创建，但 Storybook 原型和测试的 API 模拟需要手动初始化"
fi
popd > /dev/null
ok "MSW initialized"

# ── Step 5.5: Install Anthropic community skills ──────────────
# Skills referenced by enhancers (e.g. frontend-design used by enhancers/proto/frontend-design.md).
# Non-fatal — if network is unavailable, project still works, user can install later.

if [[ "${SKIP_SKILLS:-0}" != "1" ]]; then
  info "Installing community skills (frontend-design)..."
  pushd "$PROJECT_DIR" > /dev/null
  if npx --yes skills add https://github.com/anthropics/skills --skill frontend-design < /dev/null > /tmp/ai-forge-skills-$$.log 2>&1; then
    ok "frontend-design skill installed"
  else
    warn "Skill install failed (offline?). See /tmp/ai-forge-skills-$$.log"
    warn "Install later:  npx skills add https://github.com/anthropics/skills --skill frontend-design"
  fi
  rm -f /tmp/ai-forge-skills-$$.log
  popd > /dev/null
else
  info "Skipping community skill install (SKIP_SKILLS=1)"
fi

# ── Step 6: Initialize git ─────────────────────────────────────

info "Initializing git repository..."
pushd "$PROJECT_DIR" > /dev/null
git init -q
git add -A
git commit -q -m "feat: initial project from ai-forge template"
popd > /dev/null

ok "Git repository initialized"

# ── Done ───────────────────────────────────────────────────────

echo ""
echo "  ✅ Project created successfully!"
echo "  ─────────────────────────────────────────"
echo ""
echo "  📁 $PROJECT_DIR"
echo ""
echo "  Next steps:"
echo ""
echo "    cd $PROJECT_DIR"
echo "    $PKG_MGR run dev          # Start Next.js dev server"
echo "    $PKG_MGR run storybook    # Start Storybook"
echo ""
echo "  Dev Loop:"
echo ""
echo "    /dev-loop <requirement>    # Start a dev loop"
echo ""
echo "  Happy coding! 🔨"
echo ""

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

PROJECT_NAME="${1:-}"
TARGET_DIR="${2:-.}"

if [[ -z "$PROJECT_NAME" ]]; then
  echo ""
  echo "  ai-forge — AI-driven development framework"
  echo ""
  echo "  Usage: $0 <project-name> [target-directory]"
  echo ""
  echo "  Examples:"
  echo "    $0 my-app"
  echo "    $0 my-app ~/Projects"
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
cp "$FORGE_DIR/.claude/commands/dev-loop.md" "$PROJECT_DIR/.claude/commands/" 2>/dev/null || true
ok "Dev Loop skills installed (6 skills + 1 command)"

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

cat > "$PROJECT_DIR/.loop/session.json" <<EOF
{
  "id": "loop-$(date +%Y%m%d)-001",
  "requirement": "",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "currentPhase": "prototype",
  "phases": {
    "prototype": { "status": "pending" },
    "dev": { "status": "pending" },
    "deploy": { "status": "pending" }
  },
  "artifacts": {}
}
EOF

ok ".loop/ directory created"

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

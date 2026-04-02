#!/usr/bin/env bash
# Collect toride source code + current docs for analysis.
# Outputs a structured dump that an LLM can compare against the docs.
set -euo pipefail

DOCS_DIR="docs"
PACKAGES_DIR="packages"

echo "=========================================="
echo "TORIDE DOCS SITE UPDATE - DATA COLLECTION"
echo "=========================================="

# ─── Current Docs Content ───────────────────────────────────────────
echo ""
echo "===== DOCS: index.md (homepage) ====="
cat "$DOCS_DIR/index.md"

echo ""
echo "===== DOCS: guide/why-toride.md ====="
cat "$DOCS_DIR/guide/why-toride.md"

echo ""
echo "===== DOCS: guide/getting-started.md ====="
cat "$DOCS_DIR/guide/getting-started.md"

echo ""
echo "===== DOCS: guide/quickstart.md ====="
cat "$DOCS_DIR/guide/quickstart.md"

echo ""
echo "===== DOCS: concepts/policy-format.md ====="
cat "$DOCS_DIR/concepts/policy-format.md"

echo ""
echo "===== DOCS: concepts/roles-and-relations.md ====="
cat "$DOCS_DIR/concepts/roles-and-relations.md"

echo ""
echo "===== DOCS: concepts/resolvers.md ====="
cat "$DOCS_DIR/concepts/resolvers.md"

echo ""
echo "===== DOCS: concepts/conditions-and-rules.md ====="
cat "$DOCS_DIR/concepts/conditions-and-rules.md"

echo ""
echo "===== DOCS: concepts/partial-evaluation.md ====="
cat "$DOCS_DIR/concepts/partial-evaluation.md"

echo ""
echo "===== DOCS: concepts/client-side-hints.md ====="
cat "$DOCS_DIR/concepts/client-side-hints.md"

echo ""
echo "===== DOCS: integrations/prisma.md ====="
cat "$DOCS_DIR/integrations/prisma.md"

echo ""
echo "===== DOCS: integrations/drizzle.md ====="
cat "$DOCS_DIR/integrations/drizzle.md"

echo ""
echo "===== DOCS: integrations/codegen.md ====="
cat "$DOCS_DIR/integrations/codegen.md"

echo ""
echo "===== DOCS: reference/cli.md ====="
cat "$DOCS_DIR/reference/cli.md"

echo ""
echo "===== DOCS: reference/ide-setup.md ====="
cat "$DOCS_DIR/reference/ide-setup.md"

echo ""
echo "===== DOCS: VitePress config ====="
cat "$DOCS_DIR/.vitepress/config.ts"

# ─── Core Package Source ────────────────────────────────────────────
echo ""
echo "===== SOURCE: packages/toride/package.json ====="
cat "$PACKAGES_DIR/toride/package.json"

echo ""
echo "===== SOURCE: packages/toride/src/index.ts (public API) ====="
cat "$PACKAGES_DIR/toride/src/index.ts"

echo ""
echo "===== SOURCE: packages/toride/src/engine.ts ====="
cat "$PACKAGES_DIR/toride/src/engine.ts"

echo ""
echo "===== SOURCE: packages/toride/src/types.ts ====="
cat "$PACKAGES_DIR/toride/src/types.ts"

# Client module
if [ -f "$PACKAGES_DIR/toride/src/client.ts" ]; then
  echo ""
  echo "===== SOURCE: packages/toride/src/client.ts ====="
  cat "$PACKAGES_DIR/toride/src/client.ts"
fi

# Snapshot module
if [ -f "$PACKAGES_DIR/toride/src/snapshot.ts" ]; then
  echo ""
  echo "===== SOURCE: packages/toride/src/snapshot.ts ====="
  cat "$PACKAGES_DIR/toride/src/snapshot.ts"
fi

# Policy modules
echo ""
echo "===== SOURCE: packages/toride/src/policy/parser.ts ====="
cat "$PACKAGES_DIR/toride/src/policy/parser.ts"

echo ""
echo "===== SOURCE: packages/toride/src/policy/validator.ts ====="
cat "$PACKAGES_DIR/toride/src/policy/validator.ts"

if [ -f "$PACKAGES_DIR/toride/src/policy/merger.ts" ]; then
  echo ""
  echo "===== SOURCE: packages/toride/src/policy/merger.ts ====="
  cat "$PACKAGES_DIR/toride/src/policy/merger.ts"
fi

# Partial evaluation
if [ -f "$PACKAGES_DIR/toride/src/partial/constraint-types.ts" ]; then
  echo ""
  echo "===== SOURCE: packages/toride/src/partial/constraint-types.ts ====="
  cat "$PACKAGES_DIR/toride/src/partial/constraint-types.ts"
fi

# Testing utilities
if [ -d "$PACKAGES_DIR/toride/src/testing" ]; then
  echo ""
  echo "===== SOURCE: packages/toride/src/testing/ (files) ====="
  for f in "$PACKAGES_DIR/toride/src/testing/"*.ts; do
    echo "--- $f ---"
    cat "$f"
  done
fi

# CLI
if [ -d "$PACKAGES_DIR/toride/src/cli" ]; then
  echo ""
  echo "===== SOURCE: packages/toride/src/cli/ (files) ====="
  for f in "$PACKAGES_DIR/toride/src/cli/"*.ts; do
    echo "--- $f ---"
    cat "$f"
  done
fi

# ─── Codegen Package ───────────────────────────────────────────────
echo ""
echo "===== SOURCE: packages/codegen/package.json ====="
cat "$PACKAGES_DIR/codegen/package.json"

echo ""
echo "===== SOURCE: packages/codegen/src/index.ts ====="
cat "$PACKAGES_DIR/codegen/src/index.ts"

# Codegen CLI
if [ -f "$PACKAGES_DIR/codegen/src/cli.ts" ]; then
  echo ""
  echo "===== SOURCE: packages/codegen/src/cli.ts ====="
  cat "$PACKAGES_DIR/codegen/src/cli.ts"
fi

# ─── Prisma Package ────────────────────────────────────────────────
echo ""
echo "===== SOURCE: packages/prisma/package.json ====="
cat "$PACKAGES_DIR/prisma/package.json"

echo ""
echo "===== SOURCE: packages/prisma/src/index.ts ====="
cat "$PACKAGES_DIR/prisma/src/index.ts"

# Prisma adapter and resolver
for f in "$PACKAGES_DIR/prisma/src/"*.ts; do
  if [ "$f" != "$PACKAGES_DIR/prisma/src/index.ts" ]; then
    echo ""
    echo "===== SOURCE: $f ====="
    cat "$f"
  fi
done

# ─── Drizzle Package ───────────────────────────────────────────────
echo ""
echo "===== SOURCE: packages/drizzle/package.json ====="
cat "$PACKAGES_DIR/drizzle/package.json"

echo ""
echo "===== SOURCE: packages/drizzle/src/index.ts ====="
cat "$PACKAGES_DIR/drizzle/src/index.ts"

# Drizzle adapter and resolver
for f in "$PACKAGES_DIR/drizzle/src/"*.ts; do
  if [ "$f" != "$PACKAGES_DIR/drizzle/src/index.ts" ]; then
    echo ""
    echo "===== SOURCE: $f ====="
    cat "$f"
  fi
done

# ─── Example Projects ──────────────────────────────────────────────
if [ -d "examples" ]; then
  echo ""
  echo "===== EXAMPLES DIRECTORY LISTING ====="
  find examples -type f -name '*.ts' -o -name '*.yaml' -o -name '*.yml' | head -50
fi

# ─── Git Context ────────────────────────────────────────────────────
echo ""
echo "===== RECENT GIT LOG (last 30 commits) ====="
git log --oneline -30

echo ""
echo "===== ROOT package.json (version info) ====="
cat package.json

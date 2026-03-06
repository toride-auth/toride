#!/bin/bash
set -euo pipefail

# =============================================================================
# devcontainer-wt CLI — worktree lifecycle management
#
# Usage:
#   ./worktree.sh create <name> [--from <base>]  Create a new worktree
#   ./worktree.sh remove <name> [--force]         Remove a worktree and its container
#   ./worktree.sh list                             List worktrees with container status
#   ./worktree.sh prune                            Clean up orphaned containers
# =============================================================================

# --- Name validation ---

readonly NAME_PATTERN='^[a-z0-9][a-z0-9-]*$'

sanitize_name() {
  local raw="$1"
  echo "$raw" \
    | tr '[:upper:]' '[:lower:]' \
    | sed 's/[^a-z0-9-]/-/g' \
    | sed 's/-\{2,\}/-/g' \
    | sed 's/^-//;s/-$//'
}

validate_name() {
  local name="$1"
  [[ "$name" =~ $NAME_PATTERN ]] || {
    error "Invalid worktree name: '${name}'. Must match [a-z0-9][a-z0-9-]*."
    exit 1
  }
}

# --- Colors & logging ---

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

info()    { echo -e "${BLUE}[devcontainer-wt]${NC} $*"; }
warn()    { echo -e "${YELLOW}[devcontainer-wt]${NC} $*"; }
error()   { echo -e "${RED}[devcontainer-wt]${NC} $*" >&2; }
success() { echo -e "${GREEN}[devcontainer-wt]${NC} $*"; }

# --- Container guard ---

is_inside_container() {
  [[ -f /.dockerenv ]] || [[ -f /run/.containerenv ]] || \
    grep -qsw 'docker\|containerd' /proc/1/cgroup 2>/dev/null
}

# --- Project detection ---

detect_project() {
  local gitdir
  gitdir="$(git rev-parse --git-common-dir 2>/dev/null)" || {
    error "Not a git repository."
    exit 1
  }
  case $gitdir in
    /*) ;;
    *) gitdir="$PWD/$gitdir"
  esac
  GIT_COMMON_DIR=$(cd "$gitdir" && pwd)
  MAIN_REPO_DIR=$(dirname "$GIT_COMMON_DIR")
  MAIN_REPO_NAME=$(basename "$MAIN_REPO_DIR")
  PROJECT_NAME="${PROJECT_NAME:-$MAIN_REPO_NAME}"
}

# Compute the worktree path from a sanitized name
worktree_path_for() {
  local name="$1"
  echo "${MAIN_REPO_DIR}/../${PROJECT_NAME}-${name}"
}

# --- Worktreeinclude file copy ---

copy_worktreeinclude_files() {
  local target_root="$1"
  local include_file="${MAIN_REPO_DIR}/.worktreeinclude"
  local local_file="${MAIN_REPO_DIR}/.worktreeinclude.local"

  if [[ ! -f "$include_file" && ! -f "$local_file" ]]; then
    warn ".worktreeinclude not found, skipping file copy"
    return
  fi

  _copy_from_include_file "$include_file" "$target_root"
  _copy_from_include_file "$local_file" "$target_root"
}

_copy_from_include_file() {
  local include_file="$1" target_root="$2"

  [[ -f "$include_file" ]] || return 0

  while IFS= read -r line; do
    [[ -z "$line" || "$line" =~ ^# ]] && continue
    (
      cd "$MAIN_REPO_DIR"
      shopt -s dotglob nullglob
      shopt -s globstar 2>/dev/null || true
      for f in $line; do
        [[ "$f" == *node_modules* ]] && continue
        if [[ -f "$f" ]]; then
          mkdir -p "${target_root}/$(dirname "$f")"
          cp "$f" "${target_root}/${f}"
          info "  Copied: ${f}"
        fi
      done
    )
  done < "$include_file"
}

# --- Cleanup hook ---

run_on_remove_hook() {
  local wt_name="$1"
  local proj_name="$2"
  local branch_name="${3:-}"
  local hook_path="${MAIN_REPO_DIR}/.devcontainer/hooks/on-remove.sh"

  if [[ -f "$hook_path" && -x "$hook_path" ]]; then
    info "Running on-remove hook for worktree '${wt_name}'..."
    WORKTREE_NAME="$wt_name" PROJECT_NAME="$proj_name" BRANCH_NAME="$branch_name" \
      "$hook_path" || warn "on-remove hook returned non-zero exit code."
  fi
}

# --- Subcommand: create ---

cmd_create() {
  is_inside_container && { error "Cannot create worktrees from inside a container. Run this on the host."; exit 1; }

  local name="" from_ref=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --from) shift; from_ref="${1:-}"; [[ -z "$from_ref" ]] && { error "--from requires a branch name"; exit 1; } ;;
      -*)     error "Unknown option: $1"; exit 1 ;;
      *)      [[ -z "$name" ]] && name="$1" || { error "Unexpected argument: $1"; exit 1; } ;;
    esac
    shift
  done

  if [[ -z "$name" ]]; then
    echo -en "${BLUE}[devcontainer-wt]${NC} Branch name: " > /dev/tty
    read -r name < /dev/tty
    [[ -z "$name" ]] && { error "Branch name is required."; exit 1; }
  fi

  local branch_name="$name"
  local dir_name
  dir_name="$(sanitize_name "$name")"
  [[ -z "$dir_name" ]] && { error "Name '${name}' could not be sanitized to a valid worktree name."; exit 1; }
  [[ "$dir_name" != "$name" ]] && info "Sanitized directory name: '${name}' -> '${dir_name}'"
  validate_name "$dir_name"

  local worktree_path
  worktree_path="$(worktree_path_for "$dir_name")"

  [[ -d "$worktree_path" ]] && { error "Directory already exists: ${worktree_path}"; exit 1; }

  info "Creating worktree at ${BOLD}${worktree_path}${NC} (branch: ${branch_name})..."
  if [[ -z "$from_ref" ]]; then
    git worktree add "$worktree_path" -b "$branch_name" || {
      error "Failed to create worktree. If branch '${branch_name}' already exists, use --from ${branch_name}, or delete the branch first."
      exit 1
    }
  else
    git worktree add "$worktree_path" -b "$branch_name" "$from_ref" || {
      error "Failed to create worktree from ${from_ref}. If branch '${branch_name}' already exists, delete it first."
      exit 1
    }
  fi

  info "Copying files from .worktreeinclude..."
  copy_worktreeinclude_files "$worktree_path"

  echo
  success "Worktree created: ${worktree_path}"
  echo
  info "Next steps:"
  info "  ${BOLD}code ${worktree_path}${NC}   -- open in VS Code"
  info "  Then click ${BOLD}\"Reopen in Container\"${NC}"
}

# --- Subcommand: remove ---

cmd_remove() {
  is_inside_container && { error "Cannot remove worktrees from inside a container. Run this on the host."; exit 1; }

  local name="" force=false
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --force|-f) force=true ;;
      -*)         error "Unknown option: $1"; exit 1 ;;
      *)          [[ -z "$name" ]] && name="$1" || { error "Unexpected argument: $1"; exit 1; } ;;
    esac
    shift
  done

  [[ -z "$name" ]] && { error "Usage: ./worktree.sh remove <name> [--force]"; exit 1; }

  name="$(sanitize_name "$name")"
  [[ -z "$name" ]] && { error "Name could not be sanitized to a valid worktree name."; exit 1; }
  validate_name "$name"

  local wt_path
  wt_path="$(worktree_path_for "$name")"

  [[ -d "$wt_path" ]] || { error "Worktree directory not found: ${wt_path}"; exit 1; }

  local container_name="app-${PROJECT_NAME}-${name}"

  # Run cleanup hook
  run_on_remove_hook "$name" "$PROJECT_NAME" "$name"

  # Stop and remove the container
  if docker inspect "$container_name" > /dev/null 2>&1; then
    info "Removing container ${BOLD}${container_name}${NC}..."
    docker rm -f "$container_name" 2>/dev/null || true
  fi

  # Remove the worktree
  info "Removing worktree '${name}' at ${BOLD}${wt_path}${NC}..."
  if [[ "$force" == true ]]; then
    git worktree remove --force "$wt_path"
  else
    git worktree remove "$wt_path"
  fi

  git worktree prune 2>/dev/null || true
  success "Worktree '${name}' removed."
}

# --- Subcommand: list ---

cmd_list() {
  echo
  printf "  ${BOLD}%-20s %-40s %-20s %-12s${NC}\n" "NAME" "PATH" "BRANCH" "CONTAINER"
  printf "  %-20s %-40s %-20s %-12s\n" "----" "----" "------" "---------"

  local wt_path="" wt_branch=""
  local porcelain
  porcelain=$(git worktree list --porcelain)

  while IFS= read -r line; do
    case "$line" in
      "worktree "*)
        wt_path="${line#worktree }"
        wt_branch=""
        ;;
      "branch "*)
        wt_branch="${line#branch refs/heads/}"
        ;;
      "")
        _print_worktree_row
        wt_path=""
        wt_branch=""
        ;;
    esac
  done <<< "$porcelain"

  # Handle last entry if output doesn't end with blank line
  _print_worktree_row

  echo
}

_print_worktree_row() {
  [[ -z "${wt_path:-}" ]] && return

  local wt_dir_name wt_name container_name status status_display
  wt_dir_name=$(basename "$wt_path")

  # Extract worktree name: strip "<project>-" prefix, or show "main"
  if [[ "$wt_dir_name" == "${PROJECT_NAME}-"* ]]; then
    wt_name="${wt_dir_name#${PROJECT_NAME}-}"
  else
    wt_name="main"
  fi

  container_name="app-${PROJECT_NAME}-${wt_name}"

  status=$(docker inspect -f '{{.State.Status}}' "$container_name" 2>/dev/null) || status="none"

  case "$status" in
    running)              status_display="${GREEN}running${NC}" ;;
    exited|created|paused) status_display="${YELLOW}${status}${NC}" ;;
    none)                 status_display="${DIM}none${NC}" ;;
    *)                    status_display="${DIM}${status}${NC}" ;;
  esac

  printf "  %-20s %-40s %-20s " "$wt_name" "$wt_path" "${wt_branch:-(detached)}"
  echo -e "$status_display"
}

# --- Subcommand: prune ---

cmd_prune() {
  info "Checking for orphaned containers (project: ${PROJECT_NAME})..."

  local orphan_count=0
  local containers
  containers=$(docker ps -a --filter "label=devcontainer-wt.project=${PROJECT_NAME}" \
    --format '{{.Names}}\t{{.Label "devcontainer-wt.worktree-dir"}}\t{{.Label "devcontainer-wt.worktree"}}\t{{.Label "devcontainer-wt.branch"}}' 2>/dev/null) || true

  if [[ -n "$containers" ]]; then
    while IFS=$'\t' read -r container_name worktree_dir wt_name branch_name; do
      [[ -z "$container_name" ]] && continue
      if [[ ! -d "$worktree_dir" ]]; then
        orphan_count=$((orphan_count + 1))
        info "Orphaned container: ${BOLD}${container_name}${NC} (worktree dir: ${worktree_dir})"

        run_on_remove_hook "${wt_name:-}" "${PROJECT_NAME}" "${branch_name:-}"

        info "Removing ${container_name}..."
        docker rm -f "$container_name" 2>/dev/null || true
        success "Removed orphaned container: ${container_name}"
      fi
    done <<< "$containers"
  fi

  git worktree prune 2>/dev/null || true

  if [[ "$orphan_count" -eq 0 ]]; then
    success "No orphaned containers found."
  fi
}

# --- Usage ---

usage() {
  cat <<EOF
${BOLD}devcontainer-wt CLI${NC} — worktree lifecycle management

${BOLD}Usage:${NC}
  ./worktree.sh create <name> [--from <base>]  Create a new worktree with a new branch
  ./worktree.sh remove <name> [--force]         Remove a worktree and its container
  ./worktree.sh list                             List worktrees with container status
  ./worktree.sh prune                            Clean up orphaned containers

${BOLD}Name format:${NC}
  Lowercase alphanumeric + hyphens (e.g., my-feature, fix-123)
  Invalid characters are auto-sanitized (e.g., feature/wrk-123 -> feature-wrk-123)

${BOLD}Examples:${NC}
  ./worktree.sh create 001-setup
  ./worktree.sh create 002-feature --from origin/main
  ./worktree.sh remove 001-setup
  ./worktree.sh remove 001-setup --force
  ./worktree.sh list
  ./worktree.sh prune
EOF
}

# --- Main ---

detect_project

case "${1:-}" in
  create) shift; cmd_create "$@" ;;
  remove) shift; cmd_remove "$@" ;;
  list)   cmd_list ;;
  prune)  cmd_prune ;;
  -h|--help|help) usage ;;
  "") usage ;;
  *)
    error "Unknown command: $1. Run './worktree.sh help' for usage."
    exit 1
    ;;
esac

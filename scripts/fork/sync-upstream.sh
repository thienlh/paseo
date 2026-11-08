#!/usr/bin/env bash
# Rebase the fork's main onto upstream main and push it to the fork.
#
# Remotes: `origin` is getpaseo/paseo (upstream), `fork` is thienlh/paseo.
# Run from a clean checkout of main (for example ~/src/paseo).
set -euo pipefail

UPSTREAM="${UPSTREAM_REMOTE:-origin}"
FORK="${FORK_REMOTE:-fork}"

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree has changes. Commit or move them first." >&2
  exit 1
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$branch" != "main" ]; then
  echo "Check out main first (on $branch)." >&2
  exit 1
fi

git fetch "$UPSTREAM" main
git fetch "$FORK" main
if ! git merge-base --is-ancestor "$FORK/main" main; then
  if ! git merge --ff-only "$FORK/main"; then
    echo "Local main and $FORK/main have diverged. Reconcile them first." >&2
    exit 1
  fi
fi
git rebase "$UPSTREAM/main"
git push --force-with-lease "$FORK" main
echo "✓ fork/main is $(git rev-list --count "$UPSTREAM/main..main") commit(s) ahead of upstream"

#!/bin/bash
# Claude Code on the web: install the dependencies when a session starts.
#
# A cloud session starts from a fresh clone, without node_modules. Nothing can
# run there until `pnpm install` has: not the tests, not the typecheck, and not
# the git hooks either. husky is installed BY `pnpm install` (`prepare`
# script), so a session that never installs commits without lint-staged and
# pushes without the pre-push verification (.husky/pre-push).
#
# Local sessions are left alone: a developer's machine already has its
# node_modules, and reinstalling at every start would only slow it down.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# `--frozen-lockfile`, as in CI: install exactly what pnpm-lock.yaml says, and
# fail rather than rewrite it, so that no session starts with a lockfile diff
# nobody asked for. The install log goes to stderr: what a SessionStart hook
# prints on stdout lands in the session's context, and a hundred lines of
# package versions have nothing to do there.
pnpm install --frozen-lockfile >&2

echo "Dependencies installed and git hooks active: each commit runs lint-staged, and each \`git push\` first runs \`pnpm verify\` (typechecks + unit tests, about a minute) and is cancelled if it fails."

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Language — English only

Every comment in this project is written in **English**: code comments,
commit messages, pull request titles and descriptions, and GitHub comments and
reviews. Only product copy (`messages/*.json`, UI text) stays localized.

## Before pushing — `pnpm verify`

`git push` first runs the husky `pre-push` hook: `pnpm verify`, the three
typechecks and the unit tests in parallel (about a minute), and the push is
cancelled if one of them fails. Give the push command a timeout of at least
five minutes. When the push is refused, fix what failed, commit, and push
again: never bypass the hook with `--no-verify`. In Claude Code on the web,
the hook only exists once the dependencies are installed, which
`.claude/hooks/session-start.sh` does when the session starts.

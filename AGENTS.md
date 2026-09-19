<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


<!-- Hors blocs gérés par l'outillage : ne pas déplacer à l'intérieur. -->

## Compétences d'agents — une seule copie

`.claude/skills/` est la **copie unique** des skills Convex (30 fichiers).
`.agents/skills` est un **lien symbolique** qui pointe dessus : les deux
conventions restent donc résolvables, sans versionner deux fois le même
contenu (issue #19).

⚠️ `npx convex ai-files install` écrit les deux arborescences et **remplacera le
lien par un dossier réel**. Après l'avoir lancé, rétablir le lien :

```bash
rm -rf .agents/skills && ln -s ../.claude/skills .agents/skills
```

Le verrou de versions reste `skills-lock.json`, inchangé.

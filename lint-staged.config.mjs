// Pre-commit checks, on STAGED files only.
//
// This hook exists for a specific reason: the repo has just absorbed a
// formatting pass over 168 files. There would be no point redoing it every
// three months — code has to arrive formatted. lint-staged fixes and
// re-stages on the contributor's behalf rather than refusing the commit.
//
// Cost: `eslint --fix` triggers the typed rules, which build the entire
// TypeScript program — about 8 seconds, regardless of the number of
// staged files. That is the price of rules that see types; switching to
// untyped would silence the rules that found real defects here
// (no-floating-promises, no-base-to-string, no-misused-promises).
//
// `--no-warn-ignored`: a file that is staged but covered by the exclusions
// in eslint.config.mjs (convex/_generated/) must not make the commit fail.
export default {
  '*.{ts,tsx,mts,cts,mjs,js,cjs}': [
    'eslint --fix --no-warn-ignored',
    'prettier --write',
  ],
  '*.{json,css,yml,yaml}': ['prettier --write'],
};

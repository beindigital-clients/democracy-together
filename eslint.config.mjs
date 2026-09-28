// ESLint configuration for the repo (flat config, ESLint 10).
//
// METHOD — each active rule is active because it caught a real defect
// in this repo, or because it would catch one at no friction cost.
// Each rule disabled below carries the reason AND the figure that
// motivated it, measured on the 326 files before any fix (issue #17,
// step 2). A rule is NOT kept merely because it appears in a
// "recommended" set.
//
// Formatting is not ESLint's business: it is delegated to Prettier
// (.prettierrc.json). ESLint 10 removed its formatting rules and
// none of the three plugins used here provides any — `eslint-config-prettier`
// would therefore have nothing to disable and is deliberately not installed.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import next from '@next/eslint-plugin-next';
import globals from 'globals';

// `no-restricted-syntax` selectors. They are named here because the rule
// is redeclared in full for each exemption: a file allowed one must
// remain subject to the others.
const roleDefautEnDur = {
  selector:
    "LogicalExpression[operator='??'] > Literal.right[value=/^(visiteur|membre|moderateur|editeur|admin)$/]",
  message:
    "Rôle par défaut en dur : utiliser effectiveRole() (DEFAULT_ROLE, convex/lib/roles.ts) — la valeur par défaut ne s'écrit qu'à un seul endroit (issue #27).",
};
const libelleRattacheALaMain = {
  selector: "JSXAttribute[name.name='htmlFor']",
  message:
    "Champ assemblé à la main : passer par le système de champs (TextField / TextareaField / SelectField, ou la coquille Field pour un contrôle particulier) dans src/components/ui/field.tsx — c'est lui qui rattache libellé, aide et erreur au contrôle (issue #41).",
};

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      // Code produced by `convex codegen`: it already carries `/* eslint-disable */`
      // at the top and cannot be edited by hand.
      'convex/_generated/**',
      'public/**',
      'design/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      'screenshots/**',
      'next-env.d.ts',
    ],
  },

  // Without this key, `eslint .` would only analyze .js/.mjs/.cjs: TypeScript
  // extensions are not among ESLint's default targets.
  {
    files: ['**/*.{ts,tsx,mts,cts,mjs,js}'],
  },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        // dedicated tsconfig: the root tsconfig excludes convex/, tests/ and
        // *.test.*, which left 97 files outside any project (parse
        // error on each one).
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.node },
    },
    linterOptions: {
      // An `eslint-disable` directive that no longer hides anything is a lie
      // left in the code: the repo already had one (region-globe.tsx).
      reportUnusedDisableDirectives: 'error',
    },
  },

  // --- typescript-eslint: what we remove from `recommendedTypeChecked` ------
  {
    rules: {
      // 61 reports, all at a boundary with untyped third-party code:
      // world-atlas/topojson/d3-geo (30), test JSON fixtures (21), the
      // Convex Auth `profile` (4), the Sanity constructors (2). None
      // points to a defect: these rules measure the typing quality of the
      // dependencies, not of this code. `no-explicit-any` remains ACTIVE
      // below: it flags the exact spot where the `any` enters, which
      // is the useful signal; these five only propagate it.
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',

      // 12 reports, 12 interface conformances imposed from outside:
      // next.config's `headers()` must be async, `generateVerificationToken`
      // is by the Convex Auth contract, and the `fetch` mocks must
      // return a promise. None of these signatures is negotiable; the
      // rule therefore cannot catch anything here.
      '@typescript-eslint/require-await': 'off',

      // The leading `_` is the repo's convention for "bound but deliberately
      // unused" (`_ctx`, `Array.from(…, (_, i) => …)`).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // KEPT, but without the `attributes` sub-check: the 49 reports
      // were all `async` handlers passed to a JSX prop
      // (onClick/onSubmit), an idiomatic React pattern, and 31 of the 32 files
      // concerned already catch their errors internally. The sub-checks
      // that catch real bugs remain active: `conditionals`
      // (`if (promise)` is always true) and `voidReturn` outside JSX.
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },

  // --- React -----------------------------------------------------------------
  reactHooks.configs.flat['recommended-latest'],
  {
    rules: {
      // 5 reports, 5 times the same constrained pattern: reading the theme or the
      // consent from localStorage/DOM on mount, which is FORBIDDEN during
      // render (the server has no access to it — hydration mismatch).
      // The rule is a performance tip from the React compiler, not a
      // correctness rule, and the pattern it targets has no alternative
      // here. `set-state-in-render`, however, stays active: that one is a bug.
      'react-hooks/set-state-in-effect': 'off',
    },
  },

  // --- Next.js ---------------------------------------------------------------
  {
    plugins: { '@next/next': next },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs['core-web-vitals'].rules,

      // Rule written for the Pages Router: it enumerates the pages
      // directory and reports once per match. On this repo (App Router
      // + next-intl) it produced 10 reports for ONE SINGLE `<a>` — the one
      // in the `not-found` boundary, deliberately without a locale prefix because
      // the next-intl context is not guaranteed there. Ten times wrong.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },

  // --- Network roles: a single default value -----------------------------
  // The back office derived its own default (`u.role ?? 'membre'`) whereas the
  // server RBAC treats a missing role as "visiteur": the screen where one
  // decides who has access to what advertised a submission right that the server
  // refuses (issue #27). The default came from a fallback literal copied far
  // from the hierarchy — there is now only one, `DEFAULT_ROLE` in
  // convex/lib/roles.ts, and every read goes through `effectiveRole`. This
  // rule therefore caught a real defect in this repo, and it is what prevents
  // it from being silently reintroduced.
  //
  // --- Form fields: a single abstraction ---------------------------
  // `htmlFor` is the SIGNATURE of the manual `<label>` + `<Input>` assembly:
  // a label attached by hand, hence one more pair to fix the day
  // `aria-invalid`, `aria-describedby` or value preservation change.
  // Two families of fields coexisted — the components of
  // `components/auth/` and this assembly, copied into seventeen forms
  // (issue #41). Only one remains, and the only file that still attaches
  // a label is the shell itself (exemption below). WRAPPING
  // labels (checkbox, radio button, inline sort) have no
  // `htmlFor`: the association is structural, they are not targeted.
  {
    files: ['src/**/*.{ts,tsx}', 'convex/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        roleDefautEnDur,
        libelleRattacheALaMain,
      ],
    },
  },
  {
    files: ['src/components/ui/field.tsx'],
    rules: { 'no-restricted-syntax': ['error', roleDefautEnDur] },
  },

  // --- Navigation and locale: the repo's wrappers, not the bare APIs -------
  // `redirect`/`useRouter` from `next/navigation` IGNORE the language prefix;
  // their counterparts from `@/i18n/navigation` carry it. Using the wrong ones
  // produces a redirect that loses the language — a silent bug, visible
  // only in English. The repo had four (issue #41). Same reasoning
  // for `hasLocale`: normalizing a locale by hand is what had produced
  // twenty copies of the same function; `@/i18n/locale` is now the only
  // place that does it. `notFound`, `useSearchParams` and `useParams` are
  // NOT targeted: they do no navigation and have no localized equivalent.
  {
    files: ['src/**/*.{ts,tsx}'],
    // `src/i18n/` is precisely the place that wraps these APIs.
    ignores: ['src/i18n/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'next/navigation',
              importNames: [
                'redirect',
                'permanentRedirect',
                'useRouter',
                'usePathname',
                'RedirectType',
              ],
              message:
                "Navigation entre pages : importer depuis '@/i18n/navigation' — ces versions-là portent le préfixe de langue (issue #41).",
            },
            {
              name: 'next/link',
              message:
                "Lien interne : importer `Link` depuis '@/i18n/navigation' — sans quoi le lien perd la langue en cours (issue #41).",
            },
            {
              name: 'next-intl',
              importNames: ['hasLocale'],
              message:
                "Normalisation d'une locale : resolveLocale() ou isSupportedLocale() de '@/i18n/locale' — la règle ne s'écrit qu'à un seul endroit (issue #41).",
            },
          ],
        },
      ],
    },
  },

  // --- JS files ------------------------------------------------------------
  {
    files: ['**/*.mjs', '**/*.js'],
    // `allowJs` is on but not `checkJs`: TypeScript does not check these
    // files, it merely walks them. Typed rules would therefore
    // deliver a verdict on unchecked types.
    extends: [tseslint.configs.disableTypeChecked],
  },
);

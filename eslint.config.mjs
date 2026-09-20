// Configuration ESLint du dépôt (flat config, ESLint 10).
//
// MÉTHODE — chaque règle active l'est parce qu'elle a attrapé un vrai défaut
// sur ce dépôt, ou parce qu'elle en attraperait un sans coût de friction.
// Chaque règle désactivée ci-dessous porte le motif ET le chiffre qui l'a
// motivé, mesurés sur les 326 fichiers avant toute correction (issue #17,
// étape 2). Une règle n'est PAS gardée au seul motif qu'elle figure dans un
// ensemble « recommended ».
//
// Le formatage n'est pas l'affaire d'ESLint : il est délégué à Prettier
// (.prettierrc.json). ESLint 10 a retiré ses règles de mise en forme et
// aucun des trois greffons utilisés ici n'en fournit — `eslint-config-prettier`
// n'aurait donc rien à désactiver et n'est volontairement pas installé.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import next from '@next/eslint-plugin-next';
import globals from 'globals';

// Sélecteurs de `no-restricted-syntax`. Ils sont nommés ici parce que la règle
// se redéclare en entier à chaque dérogation : un fichier autorisé à l'une doit
// rester soumis aux autres.
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
      // Code produit par `convex codegen` : il porte déjà `/* eslint-disable */`
      // en tête et n'est pas modifiable à la main.
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

  // Sans cette clé, `eslint .` n'analyserait que .js/.mjs/.cjs : les extensions
  // TypeScript ne font pas partie des cibles par défaut d'ESLint.
  {
    files: ['**/*.{ts,tsx,mts,cts,mjs,js}'],
  },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        // tsconfig dédié : le tsconfig racine exclut convex/, tests/ et
        // *.test.*, ce qui laissait 97 fichiers hors de tout projet (erreur
        // d'analyse sur chacun).
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.node },
    },
    linterOptions: {
      // Une directive `eslint-disable` qui ne masque plus rien est un mensonge
      // laissé dans le code : le dépôt en comptait déjà une (region-globe.tsx).
      reportUnusedDisableDirectives: 'error',
    },
  },

  // --- typescript-eslint : ce qu'on retire de `recommendedTypeChecked` ------
  {
    rules: {
      // 61 signalements, tous à une frontière avec du code tiers non typé :
      // world-atlas/topojson/d3-geo (30), fixtures JSON de tests (21), le
      // `profile` de Convex Auth (4), les constructeurs Sanity (2). Aucun ne
      // désigne un défaut : ces règles mesurent la qualité du typage des
      // dépendances, pas celle de ce code. `no-explicit-any` reste ACTIVE
      // ci-dessous : elle signale l'endroit précis où le `any` entre, ce qui
      // est le signal utile ; ces cinq-là ne font que le propager.
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',

      // 12 signalements, 12 conformités d'interface imposées de l'extérieur :
      // `headers()` de next.config doit être async, `generateVerificationToken`
      // l'est par le contrat de Convex Auth, et les mocks de `fetch` doivent
      // rendre une promesse. Aucune de ces signatures n'est négociable ; la
      // règle ne peut donc rien attraper ici.
      '@typescript-eslint/require-await': 'off',

      // Le `_` initial est la convention du dépôt pour « lié mais délibérément
      // inutilisé » (`_ctx`, `Array.from(…, (_, i) => …)`).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // GARDÉE, mais sans le sous-contrôle `attributes` : les 49 signalements
      // étaient tous des gestionnaires `async` passés à une prop JSX
      // (onClick/onSubmit), motif idiomatique en React, et 31 des 32 fichiers
      // concernés attrapent déjà leurs erreurs en interne. Les sous-contrôles
      // qui attrapent de vrais bogues restent actifs : `conditionals`
      // (`if (promesse)` est toujours vrai) et les `voidReturn` hors JSX.
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
      // 5 signalements, 5 fois le même motif contraint : lire le thème ou le
      // consentement dans localStorage/DOM au montage, ce qui est INTERDIT au
      // rendu (le serveur n'y a pas accès — non-concordance d'hydratation).
      // La règle est un conseil de performance du compilateur React, pas une
      // règle de correction, et le motif qu'elle vise n'a pas d'alternative
      // ici. `set-state-in-render`, elle, reste active : celle-là est un bogue.
      'react-hooks/set-state-in-effect': 'off',
    },
  },

  // --- Next.js ---------------------------------------------------------------
  {
    plugins: { '@next/next': next },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs['core-web-vitals'].rules,

      // Règle écrite pour le Pages Router : elle énumère le répertoire des
      // pages et signale une fois par correspondance. Sur ce dépôt (App Router
      // + next-intl) elle a produit 10 signalements pour UN SEUL `<a>` — celui
      // de la frontière `not-found`, délibérément sans préfixe de locale parce
      // que le contexte next-intl n'y est pas garanti. Dix fois faux.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },

  // --- Rôles réseau : une seule valeur par défaut -----------------------------
  // Le back-office dérivait son propre défaut (`u.role ?? 'membre'`) quand le
  // RBAC serveur traite l'absence de rôle comme « visiteur » : l'écran où l'on
  // décide qui a accès à quoi annonçait un droit de dépôt que le serveur
  // refuse (issue #27). Le défaut venait d'un littéral de repli recopié loin
  // de la hiérarchie — il n'en existe plus qu'un, `DEFAULT_ROLE` dans
  // convex/lib/roles.ts, et toute lecture passe par `effectiveRole`. Cette
  // règle a donc attrapé un vrai défaut de ce dépôt, et c'est elle qui empêche
  // de le réintroduire en silence.
  //
  // --- Champs de formulaire : une seule abstraction ---------------------------
  // `htmlFor` est la SIGNATURE de l'assemblage manuel `<label>` + `<Input>` :
  // un libellé rattaché à la main, donc une paire de plus à corriger le jour où
  // `aria-invalid`, `aria-describedby` ou la conservation des valeurs changent.
  // Deux familles de champs coexistaient — les composants de
  // `components/auth/` et cet assemblage, recopié dans dix-sept formulaires
  // (issue #41). Il n'en reste qu'une, et le seul fichier qui rattache encore
  // un libellé est la coquille elle-même (dérogation ci-dessous). Les libellés
  // ENVELOPPANTS (case à cocher, bouton radio, tri en ligne) n'ont pas de
  // `htmlFor` : l'association est structurelle, ils ne sont pas visés.
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

  // --- Navigation et locale : les enveloppes du dépôt, pas les API nues -------
  // `redirect`/`useRouter` de `next/navigation` IGNORENT le préfixe de langue ;
  // leurs homologues de `@/i18n/navigation` le portent. Utiliser les mauvais
  // produit une redirection qui perd la langue — un bogue muet, visible
  // seulement en anglais. Le dépôt en comptait quatre (issue #41). Même motif
  // pour `hasLocale` : normaliser une locale à la main est ce qui avait produit
  // vingt copies de la même fonction ; `@/i18n/locale` est désormais le seul
  // endroit qui le fait. `notFound`, `useSearchParams` et `useParams` ne sont
  // PAS visés : ils ne font pas de navigation et n'ont pas d'équivalent localisé.
  {
    files: ['src/**/*.{ts,tsx}'],
    // `src/i18n/` est précisément l'endroit qui enveloppe ces API.
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

  // --- Fichiers JS ------------------------------------------------------------
  {
    files: ['**/*.mjs', '**/*.js'],
    // `allowJs` est actif mais pas `checkJs` : TypeScript ne vérifie pas ces
    // fichiers, il se contente de les parcourir. Les règles typées y rendraient
    // donc un verdict sur des types non vérifiés.
    extends: [tseslint.configs.disableTypeChecked],
  },
);

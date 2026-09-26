import { defineConfig, devices } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// Charge .env.local pour le process de test (NEXT_PUBLIC_CONVEX_URL sert à lire
// les codes OTP de dev via le client Convex).
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch {
  /* .env.local absent : on continue */
}

// Échappatoire pour un environnement dont le Chromium ne correspond PAS au
// build épinglé par Playwright (angle mort 2 de l'audit : build 1194 présent,
// 1228 réclamé — le navigateur refuse de démarrer, et aucun projet de ce
// fichier n'est jouable). Le contournement existait, mais dans la config
// d'audit seulement, en dur : il n'aidait donc personne à jouer
// `mobile-chromium` ou `dev-browser` hors CI.
//
//   PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm test:e2e
//
// Non définie — le cas de la CI, qui installe le build attendu — la variable
// ne change rien : `launchOptions` reste absent.
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const launchOptions = CHROMIUM ? { executablePath: CHROMIUM } : undefined;

// PORT DÉDIÉ — `E2E_PORT`, 3000 par défaut.
//
// POURQUOI. Le port était écrit en dur à trois endroits, et `reuseExistingServer`
// est actif hors CI : tout serveur qui écoute déjà sur 3000 est repris tel
// quel. Sur un poste où plusieurs arbres de travail (ou plusieurs agents)
// travaillent en parallèle, cela va du désagrément — on attend la campagne d'un
// autre — au faux verdict : la campagne interroge le serveur d'UN AUTRE PROJET
// et chaque spec échoue sur une 404 qui ne dit rien du code. C'est arrivé.
//
// Un port par arbre de travail sépare les campagnes sans rien changer à la CI,
// qui ne pose pas la variable et reste sur 3000.
//
//   E2E_PORT=3217 pnpm test:e2e
//
// `next start` lit `PORT` : la commande du serveur la pose, et l'URL d'attente
// comme la `baseURL` en découlent.
const PORT = Number(process.env.E2E_PORT ?? 3000);
const ORIGINE = `http://localhost:${PORT}`;

// LE CONSENTEMENT COOKIES EST LIÉ À UNE ORIGINE. `storageState` associe son
// `localStorage` à `http://localhost:3000` : servi sur un autre port, le
// bandeau F-09 reparaît et intercepte les clics des specs qui ne le visent
// pas. On dérive donc l'état pour l'origine réellement utilisée, dans
// `tests/e2e/.auth/` (ignoré par git). Sur 3000, le fichier committé sert tel
// quel — aucun fichier produit, aucun changement de comportement.
const CONSENTEMENT = './tests/e2e/cookie-consent-state.json';
function etatDeConsentement(): string {
  if (PORT === 3000) return CONSENTEMENT;
  const etat = JSON.parse(readFileSync(CONSENTEMENT, 'utf8')) as {
    origins: { origin: string }[];
  };
  etat.origins = etat.origins.map((o) => ({ ...o, origin: ORIGINE }));
  mkdirSync('tests/e2e/.auth', { recursive: true });
  const chemin = `./tests/e2e/.auth/cookie-consent-${PORT}.json`;
  writeFileSync(chemin, `${JSON.stringify(etat, null, 2)}\n`);
  return chemin;
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // 1 retry : absorbe les flakes de compilation à la demande de `next dev`
  // (première requête sur une route = compile, le champ peut apparaître tard).
  retries: 1,
  timeout: 45_000,
  // En CI, le reporter `github` pose les annotations sur la PR mais ne produit
  // AUCUN fichier : le pas « Publier le rapport » du workflow cherchait donc un
  // `playwright-report/` inexistant et signalait « No files were found » à
  // chaque exécution. Conséquence pratique : aucune trace, aucun instantané de
  // page à examiner, et chaque diagnostic coûtait une exécution complète à
  // l'aveugle (issue #66). On ajoute le rapport HTML, qui embarque les traces
  // déjà captées par `trace: 'on-first-retry'`.
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: ORIGINE,
    trace: 'on-first-retry',
    // Consentement cookies pré-positionné (utilisateur « déjà venu ») pour que le
    // bandeau F-09 (fixed, bas de page) n'intercepte pas les clics des autres
    // specs. Le test dédié `legal.spec` repart d'un état vierge pour le voir.
    // Le fichier porte le nom de ce qu'il contient (issue #44) : `storage-state`
    // est la convention Playwright pour un état d'AUTHENTIFICATION, et ce nom
    // invitait à y committer un jour une vraie session. Les états de session,
    // eux, sont produits par le projet `setup` dans `tests/e2e/.auth/` (ignoré).
    storageState: etatDeConsentement(),
    ...(launchOptions ? { launchOptions } : {}),
  },
  projects: [
    {
      // Ouvre les sessions partagées et les enregistre sur disque, une fois
      // pour toute l'exécution (cf. tests/e2e/_sessions.ts). Les projets
      // ci-dessous en dépendent : Playwright le joue d'abord, et s'arrête là
      // s'il échoue — un seul message clair plutôt que quinze specs qui
      // tombent chacune à sa façon.
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      // Les specs de `tests/e2e/mobile/` appartiennent au projet mobile : les
      // rejouer ici les exécuterait sur un viewport desktop, sans tactile —
      // exactement ce qu'elles vérifient. Le projet `setup` a son propre
      // fichier, qui n'est pas une spec.
      // `dev-browser.spec.ts` a son PROPRE projet (ci-dessous) : il pose lui-
      // même viewport et thème, et le rejouer ici le photographierait une fois
      // de plus, en desktop clair seulement.
      testIgnore: [
        '**/mobile/**',
        '**/auth.setup.ts',
        '**/dev-browser.spec.ts',
      ],
    },
    {
      // Le mobile est une exigence structurante du cadrage (premier usage
      // attendu en Afrique) : un projet dédié, avec un vrai viewport téléphone
      // et le tactile actif (`hasTouch`), pour que `locator.tap()` et les
      // gestes `pointerType: 'touch'` soient exercés pour de bon. Chromium
      // seul : `isMobile` n'est pas émulé par Firefox/WebKit.
      name: 'mobile-chromium',
      testDir: './tests/e2e/mobile',
      use: { ...devices['Pixel 7'] },
    },
    {
      // Niveau « dev-browser » (issue #50) : captures du rendu réel, à
      // REGARDER. Projet à part parce que ce n'est pas une porte — il ne
      // décide rien, il montre — et parce qu'il parcourt sa propre matrice
      // (clair/sombre × desktop/mobile) : aucune émulation n'est posée ici,
      // la spec la pose par bloc.
      //
      // Il dépend de `setup` comme les autres : l'état CONNECTÉ est l'une des
      // combinaisons exigées, et une capture qu'on saute en silence est
      // exactement ce que l'issue #50 reproche à la convention précédente.
      //
      // Il n'est PAS joué par `pnpm test:e2e`, qui nomme ses projets : 40
      // captures pleine page n'ont rien à faire dans le chemin de vérification
      // d'une PR. `pnpm test:dev-browser` le demande.
      name: 'dev-browser',
      testMatch: /dev-browser\.spec\.ts/,
      dependencies: ['setup'],
    },
  ],
  webServer: {
    // Build de prod : toutes les routes sont pré-compilées, donc pas de flake de
    // compilation à la demande quand plusieurs workers tapent en parallèle (et
    // on teste l'artefact réel). Démarrage plus lent, exécution déterministe.
    // La sortie du serveur est relayée dans le log des tests ET conservée dans
    // `server.log` : relayée, elle se noie au milieu de milliers de lignes de
    // build ; dans un fichier, le pas d'atelier peut en imprimer la fin, à un
    // endroit prévisible. C'est ce qui manquait pour diagnostiquer une page qui
    // répond « Internal Server Error » (issue #66).
    command: `pnpm build && PORT=${PORT} pnpm start 2>&1 | tee server.log`,
    stdout: 'pipe',
    stderr: 'pipe',
    url: `${ORIGINE}/fr`,
    reuseExistingServer: !process.env.CI,
    // Le runner GitHub est plus lent qu'un poste de dev, et ce démarrage inclut
    // un build de prod complet : 3 min y suffisent rarement. Un dépassement ici
    // ne dit rien du code, seulement de la machine -> marge plus large en CI.
    timeout: process.env.CI ? 420_000 : 180_000,
  },
});

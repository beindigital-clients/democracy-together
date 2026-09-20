import { test, expect } from '@playwright/test';
import { PROTECTED_SEGMENTS } from '../../src/lib/protected-routes';
import { SESSIONS } from './_sessions';

// Câblage du middleware (src/proxy.ts) — issue #42, point 5.
//
// Les fonctions de décision (`isProtectedPath`, `signInPathFor`) sont couvertes
// par tests/unit/protected-routes.test.ts. Ce qui ne l'était par rien, c'est le
// CÂBLAGE : l'appel à `convexAuth.isAuthenticated()` et la redirection. Il
// demande un vrai déploiement Convex, donc un E2E — débloqué depuis que chaque
// pull request obtient sa préversion (issue #43, .github/workflows/e2e.yml).
//
// POURQUOI `request.get(..., { maxRedirects: 0 })` ET NON `page.goto`.
// C'est tout le sujet. Les deux specs existantes (auth-protected.spec.ts) font
// `page.goto` puis vérifient l'URL finale — or l'ancien comportement, celui que
// la PR #4 a supprimé (audit § 5.1), les passerait aussi : la page renvoyait un
// HTML 200 « Chargement… » et redirigeait EN JAVASCRIPT au bout de 1,2 seconde.
// Même URL finale, mais aucune frontière HTTP, une page blanche sans JS, et un
// clignotement. Seule une requête qui NE SUIT PAS les redirections distingue
// les deux : ici on exige un 3xx du serveur, avant tout rendu.
//
// Le contrôle de RÔLE n'est pas le sujet : le middleware ne tranche que
// « connecté ou non » (il reste côté Convex, cf. convex/lib/rbac.ts).

const PRIVEES = [
  '/fr/admin',
  '/fr/admin/utilisateurs',
  '/fr/espace-membre',
  '/fr/espaces',
  '/fr/notifications',
  '/en/admin',
  '/en/espace-membre',
  '/en/espaces',
  '/en/notifications',
  // Sans préfixe de langue : le middleware s'exécute AVANT la redirection de
  // langue de next-intl, la garde doit donc mordre ici aussi.
  '/admin',
  '/espace-membre',
];

// Pages publiques de contre-épreuve. Elles sont choisies parmi celles qui ne
// LISENT RIEN dans Convex : la bibliothèque ou l'annuaire feraient dépendre une
// spec de MIDDLEWARE de l'état du jeu de données, donc échouer pour une raison
// étrangère à son sujet. `/connexion` y figure à dessein — c'est la cible de la
// redirection, et la garder publique est ce qui empêche la boucle.
const PUBLIQUES = [
  '/fr',
  '/en',
  '/fr/adhesion',
  '/en/adhesion',
  '/fr/connexion',
  '/en/connexion',
  '/fr/mentions-legales',
  '/en/mentions-legales',
];

// Chemins qui COMMENCENT comme un segment protégé sans en être un. Ils n'ont
// pas de page (404 attendu) — et c'est justement ce qui les rend utiles : une
// garde qui comparerait des préfixes de chaîne au lieu de segments entiers les
// renverrait vers /connexion. Le 404 dit que le middleware les a laissés
// passer jusqu'à l'application.
const SOSIES = [
  '/fr/administration',
  '/fr/espaces-verts',
  '/fr/notifications-publiques',
];

function estRedirection(status: number) {
  return status >= 300 && status < 400;
}

test.describe('Gating serveur — visiteur non connecté', () => {
  // Le tableau ci-dessus est écrit en dur (des URL concrètes, pas des motifs) :
  // ce test doit exercer de VRAIES routes. Mais il ne doit pas non plus rater
  // un segment ajouté plus tard à la liste de l'application — d'où ce garde-fou.
  test('les URL exercées couvrent tous les segments protégés', () => {
    for (const segment of PROTECTED_SEGMENTS) {
      expect(
        PRIVEES.some((url) => url.split('/')[2] === segment),
        `aucune URL ne couvre le segment « ${segment} »`,
      ).toBe(true);
    }
  });

  for (const url of PRIVEES) {
    test(`${url} : redirigée par le SERVEUR, avant tout rendu`, async ({
      request,
    }) => {
      const res = await request.get(url, { maxRedirects: 0 });

      expect(
        estRedirection(res.status()),
        `${url} a répondu ${res.status()} au lieu d'une redirection`,
      ).toBe(true);
      expect(res.headers()['location']).toContain('/connexion');
    });
  }

  // La langue demandée est conservée : renvoyer un anglophone sur
  // /fr/connexion serait un changement de langue non sollicité.
  test('la redirection garde la langue de la page demandée', async ({
    request,
  }) => {
    const fr = await request.get('/fr/admin', { maxRedirects: 0 });
    expect(fr.headers()['location']).toContain('/fr/connexion');

    const en = await request.get('/en/admin', { maxRedirects: 0 });
    expect(en.headers()['location']).toContain('/en/connexion');
  });

  // Contre-épreuve : la garde ne doit pas déborder sur le site public, sinon
  // elle verrouillerait la plateforme entière sans que rien ne le dise.
  for (const url of PUBLIQUES) {
    test(`${url} : publique, servie sans détour par la connexion`, async ({
      request,
    }) => {
      const res = await request.get(url, { maxRedirects: 0 });
      expect(res.status()).toBe(200);
    });
  }

  // La route d'échange de jeton de Convex Auth passe par le middleware (elle
  // est dans `config.matcher`) mais doit en ressortir intacte : le handler rend
  // la main avant toute garde pour `/api`. L'oublier a déjà cassé toute
  // l'authentification une fois — TESTING.md la cite parmi les bugs rattrapés.
  //
  // Le STATUT appartient à la route Convex Auth, pas au middleware : un GET nu
  // n'est pas ce qu'elle attend, et l'épingler ici ferait échouer cette spec au
  // premier changement de la bibliothèque. Ce qui est vérifié est ce dont le
  // middleware répond — ne pas l'avoir détournée.
  for (const url of SOSIES) {
    test(`${url} : ressemble à une zone privée sans en être une`, async ({
      request,
    }) => {
      const res = await request.get(url, { maxRedirects: 0 });
      expect(res.headers()['location'] ?? '').not.toContain('/connexion');
    });
  }

  test('/api/auth atteint bien l’échange de jeton', async ({ request }) => {
    const res = await request.get('/api/auth', { maxRedirects: 0 });
    const location = res.headers()['location'] ?? '';

    expect(location).not.toContain('/connexion');
    expect(location).not.toMatch(/\/(fr|en)\/api/);
    // LE 404 EST LE SIGNAL. Cette route n'existe pas comme fichier : elle est
    // servie par le middleware, à qui `config.matcher` doit explicitement la
    // confier (`convexAuthNextjsMiddleware` la reconnaît alors et relaie vers
    // Convex). Retirer cette entrée du matcher fait répondre 404 à toute
    // l'authentification — c'est arrivé, TESTING.md le compte parmi les bugs
    // rattrapés, et le reste du gating continue de fonctionner pendant ce
    // temps, donc aucun autre test de ce fichier ne le verrait.
    //
    // Vérifié en retirant l'entrée sur un build de production : la réponse
    // passe de 405 à 404, et ce test seul tombe. On n'épingle pas 405 : le
    // statut d'un GET nu appartient à Convex Auth, pas au middleware.
    expect(res.status()).not.toBe(404);
  });
});

// LA contre-épreuve du fichier. Sans elle, un middleware qui redirigerait TOUT
// LE MONDE — connecté compris — passerait chacun des tests ci-dessus : ils ne
// vérifient que le refus. Ce bloc vérifie que la porte s'ouvre, donc que
// `convexAuth.isAuthenticated()` est bien consulté et bien lu.
//
// SESSION « ÉDITEUR », et ce choix n'est pas arbitraire : `_sessions.ts` pose
// la règle qu'un compte partagé par deux fichiers voit sa session mourir (deux
// contextes présentent le même jeton de rafraîchissement, Convex Auth y voit un
// rejeu). `admin` porte déjà `admin.spec` et `admin-ecrans` ; s'y ajouter en
// ferait le TROISIÈME fichier — exactement le compte que l'issue #38 a vu
// tomber. `editeur` est provisionnée par le projet `setup` et n'est utilisée
// par aucune spec : ce fichier en est le seul client, donc aucun recouvrement.
//
// Le rôle n'a de toute façon aucune importance ici : le middleware ne tranche
// que « connecté ou non ».
test.describe('Gating serveur — compte connecté', () => {
  test.use({ storageState: SESSIONS.editeur.state });

  // Routes ouvertes à tout compte connecté : la réponse est la PAGE.
  for (const url of ['/fr/espace-membre', '/fr/notifications']) {
    test(`${url} : servie (200), sans détour par la connexion`, async ({
      page,
    }) => {
      // `page.request` partage le pot de cookies du contexte : c'est la session
      // ouverte par le projet `setup` qui est présentée, comme dans un vrai
      // navigateur.
      const res = await page.request.get(url, { maxRedirects: 0 });

      expect(
        res.status(),
        `${url} a répondu ${res.status()} : ${res.headers()['location'] ?? ''}`,
      ).toBe(200);
    });
  }

  // /admin avec un compte ÉDITEUR — et c'est le propos. Le middleware ne
  // connaît pas les rôles : il ouvre la porte HTTP dès que le visiteur est
  // connecté, et c'est Convex qui refuse ensuite les données (`requireNetworkRole`).
  // On vérifie donc l'absence de renvoi vers la connexion, et non le corps de
  // la page : ce corps appartient au contrôle de rôle, qui n'est pas ce fichier.
  test('/fr/admin : un compte connecté non-admin n’est pas renvoyé à la connexion', async ({
    page,
  }) => {
    const res = await page.request.get('/fr/admin', { maxRedirects: 0 });
    expect(res.headers()['location'] ?? '').not.toContain('/connexion');
  });
});

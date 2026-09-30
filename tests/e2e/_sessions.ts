// "Login file" — pre-opened sessions, one per role (issue #66).
//
// WHY. Every back-office spec replayed a full sign-in journey before
// getting to its real subject: account provisioning, password
// creation, reading the code, sign-in screen. It is long, repeated
// fifteen times, and above all it is fifteen chances to fail for a reason that
// is not the one being tested — the fifteen specs dead at the same line, on a
// password helper that could not work, are the
// demonstration.
//
// Playwright answers this with saved browser state: the session is
// opened ONCE, in a `setup` project that runs before the others, and
// each spec starts again from the produced file. A back-office spec now
// starts signed in, with the role it asks for.
//
// WHAT IS NOT SHORT-CIRCUITED. The AUTHENTICATION journeys themselves —
// `auth.spec`, `auth-negative`, `auth-reset`, `auth-otp`, `en-journey` — still go
// through the UI: signing in IS their subject. A session file
// would take away what they check.
//
// STABLE ADDRESSES. A CI preview is born empty, but a dev deployment
// lives long: accounts are therefore reused from one run to the next.
// This is harmless — `provisionUser` does an upsert, and `provisionPassword`
// links the same password to an account that already has it (verified: a second
// `signUp` with the same secret succeeds, it does not create a duplicate).

// ONE ACCOUNT, TWO FILES AT THE SAME TIME: THE SESSION DIES. Playwright
// runs FILES in parallel — `fullyParallel: false` only serializes the
// inside of a file. Two contexts started from the same state thus present
// the SAME refresh token; Convex Auth rotates it on
// each renewal, so the second pass looks like a replay and
// the session is invalidated. The symptom is not a slow test but a
// test that wakes up on /connexion, in the middle of its journey — and never
// the same one from one run to the next.
//
// Observed on issue #38: when adding a THIRD file on the moderator
// session (and a third on the admin session), `admin-moderation` then
// `admin.spec` landed on the sign-in screen, alternately. Hence the
// rule held here: when a spec file holds a session for a long time (it
// writes some data, then moderates it), it takes its OWN session rather than
// joining the queue of a shared account.
//
// The role is therefore no longer the key: a dedicated session carries the role it
// needs, and its entry says which file it belongs to.

export const SESSION_PASSWORD = 'session-e2e-partagee-2026';

// Same vocabulary as `convex/lib/roles`, redeclared here as in
// `_helpers.ts`: these files depend only on Playwright.
type NetworkRole = 'membre' | 'moderateur' | 'editeur' | 'admin';

export type SessionKey =
  | 'membre'
  | 'moderateur'
  | 'editeur'
  | 'admin'
  | 'confirmations'
  | 'devBrowser'
  | 'adminNav'
  | 'adminRecherche'
  | 'enTete'
  | 'adminContact'
  | 'adminModeration'
  | 'adminModerationIa'
  | 'paiements'
  | 'diffusion'
  | 'contenusEvenements'
  | 'contenusMembre'
  | 'contenusMedias'
  | 'comptes'
  | 'progAppelsAdmin'
  | 'progAppelsMembre'
  | 'progAppelsEvaluateur'
  | 'progMentoratCoordination'
  | 'progMentor'
  | 'progMentore'
  | 'progParcoursEditeur'
  | 'progParcoursMembre'
  | 'editorialRapports'
  | 'editorialAuteur'
  | 'editorialEditeur'
  | 'editorialRelecteur1'
  | 'editorialRelecteur2'
  | 'a11yClavier'
  | 'a11yAnnonces'
  | 'a11yAffichage'
  | 'espaceMembre'
  | 'espaceMembreAdmin';

export const SESSIONS: Record<
  SessionKey,
  { email: string; state: string; role: NetworkRole }
> = {
  membre: {
    email: 'e2e_session_membre@democracytogether.test',
    state: 'tests/e2e/.auth/membre.json',
    role: 'membre',
  },
  moderateur: {
    email: 'e2e_session_moderateur@democracytogether.test',
    state: 'tests/e2e/.auth/moderateur.json',
    role: 'moderateur',
  },
  editeur: {
    email: 'e2e_session_editeur@democracytogether.test',
    state: 'tests/e2e/.auth/editeur.json',
    role: 'editeur',
  },
  admin: {
    email: 'e2e_session_admin@democracytogether.test',
    state: 'tests/e2e/.auth/admin.json',
    role: 'admin',
  },
  // Session dedicated to `admin-confirmations.spec.ts` (issue #38). Its four
  // journeys write the data THEN moderate it: they hold a session from
  // end to end, and since the back-office guards are hierarchical, a single
  // administrator-rank account is enough for both ends.
  confirmations: {
    email: 'e2e_session_confirmations@democracytogether.test',
    state: 'tests/e2e/.auth/confirmations.json',
    role: 'admin',
  },
  // Session dedicated to `dev-browser.spec.ts` (issue #50). It is held from
  // one end of the `dev-browser` project to the other, hence for a long time: the rule
  // above applies. Administrator rank, because this file captures the
  // back office AND the member area — since the guards are hierarchical, a single
  // account covers both screens, and only one extra sign-in is paid for.
  devBrowser: {
    email: 'e2e_session_dev_browser@democracytogether.test',
    state: 'tests/e2e/.auth/dev-browser.json',
    role: 'admin',
  },
  // The two files of issue #49 EACH take their own. The rule
  // above does not state a threshold of three files: it describes a
  // mechanism that bites as soon as TWO contexts present the same refresh
  // token, and issue #38 only tells of the moment it became
  // visible. Since Playwright runs FILES in parallel, two files on one
  // account are enough to arm it.
  //
  // Worth noting, because the confusion cost a CI campaign: this was
  // NOT the cause of the `admin-recherche` failure (it failed the same way with its
  // own session). That file has five journeys, hence five contexts drawn from the
  // same state, and it was the last one that woke up on the sign-in screen
  // — the INTRA-file case, which `admin-confirmations.spec.ts` fixes by
  // rewriting the state after each test. The two precautions are distinct,
  // and both are needed here.
  //
  // Administrator rank for both: the screens exercised (users,
  // log) are precisely the ones this rank reserves.
  adminNav: {
    email: 'e2e_session_admin_nav@democracytogether.test',
    state: 'tests/e2e/.auth/admin-nav.json',
    role: 'admin',
  },
  adminRecherche: {
    email: 'e2e_session_admin_recherche@democracytogether.test',
    state: 'tests/e2e/.auth/admin-recherche.json',
    role: 'admin',
  },
  // Session dedicated to `header-stabilite.spec.ts` (audit F-13, SIGNED-IN case).
  // It applies the rule above: one file, its own session. The lowest rank
  // is enough — what is measured is the header width for a signed-in
  // visitor, not a reserved screen.
  enTete: {
    email: 'e2e_session_en_tete@democracytogether.test',
    state: 'tests/e2e/.auth/en-tete.json',
    role: 'membre',
  },
  // Session dedicated to `admin-contact.spec.ts` (audit F-12). This file writes a
  // message through the PUBLIC form then handles it from the back office: it
  // therefore holds its session from end to end, exactly the case the rule
  // above targets.
  //
  // MODERATOR rank, and no more: that is what `contact.listMessages`
  // and `contact.setHandled` require. Taking an administrator "to be safe"
  // would make the test pass even the day the guard was raised by mistake —
  // the minimal rank is what makes the screen verified.
  adminContact: {
    email: 'e2e_session_admin_contact@democracytogether.test',
    state: 'tests/e2e/.auth/admin-contact.json',
    role: 'moderateur',
  },
  // Session dedicated to `admin-moderation.spec.ts`.
  //
  // THIS FILE SHARED `moderateur` WITH `admin-ecrans.spec.ts`, and it
  // said so itself — its `describe` was titled "session modérateur
  // PARTAGÉE". That is exactly what the rule above forbids, and the
  // described symptom occurred: in CI, the test woke up on
  // `/connexion` in the middle of its journey, the failure snapshot showing the
  // sign-in page and the "Approuver" button detached from the DOM.
  //
  // It writes the application through the public path THEN moderates it: it
  // therefore holds its session from end to end. Moderator rank, the one it exercises.
  adminModeration: {
    email: 'e2e_session_admin_moderation@democracytogether.test',
    state: 'tests/e2e/.auth/admin-moderation.json',
    role: 'moderateur',
  },
  // Session dedicated to `admin-moderation-ia.spec.ts` (F-32, auto-acceptance).
  //
  // It configures the mechanism THEN submits THEN re-reads the queue and the log:
  // it therefore holds its session from end to end, the case the rule
  // above targets. ADMINISTRATOR rank, because that is the rank
  // `/admin/moderation-ia` requires — and since the guards are hierarchical, the same
  // account submits from the member area, which avoids a second account in
  // the file.
  adminModerationIa: {
    email: 'e2e_session_admin_moderation_ia@democracytogether.test',
    state: 'tests/e2e/.auth/admin-moderation-ia.json',
    role: 'admin',
  },
  // Session dedicated to `paiements-don.spec.ts` (F-28 to F-31). The file donates
  // THEN re-reads its receipt in the member area THEN finds the transaction in the
  // back office: it holds its session from end to end. ADMINISTRATOR
  // rank, the one /admin/finances requires — since the guards are
  // hierarchical, the same account donates and views its member area.
  paiements: {
    email: 'e2e_session_paiements@democracytogether.test',
    state: 'tests/e2e/.auth/paiements.json',
    role: 'admin',
  },
  // Session dedicated to `diffusion-newsletter.spec.ts` ("diffusion" workstream):
  // public subscription, confirmation via the email link, THEN
  // verification in the back office — the session is held from end to end.
  // EDITOR rank, the one `newsletter.listSubscribers` requires.
  diffusion: {
    email: 'e2e_session_diffusion@democracytogether.test',
    state: 'tests/e2e/.auth/diffusion.json',
    role: 'editeur',
  },
  // Sessions dedicated to the `contenus-*.spec.ts` specs ("contenus" workstream).
  // Each one creates some content then publishes it then re-reads it on the public side: they
  // hold their session from end to end. EDITOR rank, the one
  // `requireEditor` requires — an administrator would make the test pass even the day
  // the guard was raised by mistake. The MEMBER registered for the event has
  // their own: it is their address that opens the videoconference link for them.
  contenusEvenements: {
    email: 'e2e_session_contenus_evenements@democracytogether.test',
    state: 'tests/e2e/.auth/contenus-evenements.json',
    role: 'editeur',
  },
  contenusMembre: {
    email: 'e2e_session_contenus_membre@democracytogether.test',
    state: 'tests/e2e/.auth/contenus-membre.json',
    role: 'membre',
  },
  contenusMedias: {
    email: 'e2e_session_contenus_medias@democracytogether.test',
    state: 'tests/e2e/.auth/contenus-medias.json',
    role: 'editeur',
  },
  // Session dedicated to `comptes-suspension.spec.ts` ("comptes" workstream, F-63).
  // The file creates an account, has it sign in, suspends it then
  // deletes it: it holds the session from end to end, the case the rule
  // above targets. ADMINISTRATOR rank, the one required by creation,
  // suspension and deletion.
  comptes: {
    email: 'e2e_session_comptes@democracytogether.test',
    state: 'tests/e2e/.auth/comptes.json',
    role: 'admin',
  },
  // "programmes" workstream (F-56 to F-60). Each `programmes-*` file
  // chains SEVERAL people on the same journey (who publishes, who
  // applies, who evaluates; who coordinates, who mentors, who is mentored) and
  // holds each of them from end to end: one session per person AND per file,
  // per the rule above. The ranks are the MINIMAL ranks exercised —
  // moderator to publish a call and coordinate (`moderateur` guards),
  // editor for the toolbox, member to apply, evaluate, mentor.
  progAppelsAdmin: {
    email: 'e2e_session_prog_appels_admin@democracytogether.test',
    state: 'tests/e2e/.auth/prog-appels-admin.json',
    role: 'moderateur',
  },
  progAppelsMembre: {
    email: 'e2e_session_prog_appels_membre@democracytogether.test',
    state: 'tests/e2e/.auth/prog-appels-membre.json',
    role: 'membre',
  },
  progAppelsEvaluateur: {
    email: 'e2e_session_prog_appels_evaluateur@democracytogether.test',
    state: 'tests/e2e/.auth/prog-appels-evaluateur.json',
    role: 'membre',
  },
  progMentoratCoordination: {
    email: 'e2e_session_prog_mentorat_coord@democracytogether.test',
    state: 'tests/e2e/.auth/prog-mentorat-coord.json',
    role: 'moderateur',
  },
  progMentor: {
    email: 'e2e_session_prog_mentor@democracytogether.test',
    state: 'tests/e2e/.auth/prog-mentor.json',
    role: 'membre',
  },
  progMentore: {
    email: 'e2e_session_prog_mentore@democracytogether.test',
    state: 'tests/e2e/.auth/prog-mentore.json',
    role: 'membre',
  },
  progParcoursEditeur: {
    email: 'e2e_session_prog_parcours_editeur@democracytogether.test',
    state: 'tests/e2e/.auth/prog-parcours-editeur.json',
    role: 'editeur',
  },
  progParcoursMembre: {
    email: 'e2e_session_prog_parcours_membre@democracytogether.test',
    state: 'tests/e2e/.auth/prog-parcours-membre.json',
    role: 'membre',
  },
  // Editorial workstream (F-41 / F-43). `editorial-rapports.spec.ts` migrates
  // the hard-coded edition from the administration then downloads its PDFs:
  // EDITOR rank, the one `annualReports.*` requires.
  editorialRapports: {
    email: 'e2e_session_editorial_rapports@democracytogether.test',
    state: 'tests/e2e/.auth/editorial-rapports.json',
    role: 'editeur',
  },
  // `editorial-revue.spec.ts` involves FOUR people in double-blind review:
  // the author (member), the editor, and two moderator-rank reviewers —
  // the minimal rank the review requires of a reviewer. Each one holds their
  // session from one end of the journey to the other, in their own context.
  editorialAuteur: {
    email: 'e2e_session_editorial_auteur@democracytogether.test',
    state: 'tests/e2e/.auth/editorial-auteur.json',
    role: 'membre',
  },
  editorialEditeur: {
    email: 'e2e_session_editorial_editeur@democracytogether.test',
    state: 'tests/e2e/.auth/editorial-editeur.json',
    role: 'editeur',
  },
  editorialRelecteur1: {
    email: 'e2e_session_editorial_relecteur1@democracytogether.test',
    state: 'tests/e2e/.auth/editorial-relecteur1.json',
    role: 'moderateur',
  },
  editorialRelecteur2: {
    email: 'e2e_session_editorial_relecteur2@democracytogether.test',
    state: 'tests/e2e/.auth/editorial-relecteur2.json',
    role: 'moderateur',
  },
  // Sessions of the accessibility specs (F-08, RGAA audit): `a11y-clavier`,
  // `a11y-annonces` and `a11y-affichage` go through the member area and a
  // back-office screen. One session PER FILE, per the rule above; each one
  // rewrites its state after each test (`test.afterEach`), like
  // `admin-confirmations`, so as never to start again from a consumed token.
  // Administrator rank: since the guards are hierarchical, one account covers the member
  // area AND `/admin/utilisateurs`.
  a11yClavier: {
    email: 'e2e_session_a11y_clavier@democracytogether.test',
    state: 'tests/e2e/.auth/a11y-clavier.json',
    role: 'admin',
  },
  a11yAnnonces: {
    email: 'e2e_session_a11y_annonces@democracytogether.test',
    state: 'tests/e2e/.auth/a11y-annonces.json',
    role: 'admin',
  },
  a11yAffichage: {
    email: 'e2e_session_a11y_affichage@democracytogether.test',
    state: 'tests/e2e/.auth/a11y-affichage.json',
    role: 'admin',
  },
  // Sessions of `espace-membre.spec.ts` (member-area redesign): the member's
  // view and the administrator's view of the same screens. Two accounts,
  // because the file holds both and rewrites each state after each test.
  espaceMembre: {
    email: 'e2e_session_espace_membre@democracytogether.test',
    state: 'tests/e2e/.auth/espace-membre.json',
    role: 'membre',
  },
  espaceMembreAdmin: {
    email: 'e2e_session_espace_membre_admin@democracytogether.test',
    state: 'tests/e2e/.auth/espace-membre-admin.json',
    role: 'admin',
  },
};

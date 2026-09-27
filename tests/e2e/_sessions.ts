// « Fichier de login » — des sessions pré-ouvertes, une par rôle (issue #66).
//
// POURQUOI. Chaque spec de back-office rejouait un parcours de connexion
// complet avant d'aborder son vrai sujet : provisionnement du compte, création
// du mot de passe, lecture du code, écran de connexion. C'est long, répété
// quinze fois, et surtout c'est quinze occasions d'échouer pour une raison qui
// n'est pas celle qu'on teste — les quinze specs mortes à la même ligne, sur un
// helper de mot de passe qui ne pouvait pas fonctionner, en sont la
// démonstration.
//
// Playwright répond à cela par l'état de navigation sauvegardé : la session est
// ouverte UNE fois, dans un projet `setup` qui s'exécute avant les autres, et
// chaque spec repart du fichier produit. Une spec de back-office commence
// désormais connectée, au rôle qu'elle demande.
//
// CE QUI N'EST PAS COURT-CIRCUITÉ. Les parcours d'AUTHENTIFICATION eux-mêmes —
// `auth.spec`, `auth-negative`, `auth-reset`, `auth-otp`, `en-journey` — passent
// toujours par l'interface : s'y connecter EST leur sujet. Un fichier de
// session y ôterait ce qu'elles vérifient.
//
// ADRESSES STABLES. Une préversion CI naît vide, mais un déploiement de dev
// vit longtemps : les comptes sont donc réutilisés d'une exécution à l'autre.
// C'est sans danger — `provisionUser` fait un upsert, et `provisionPassword`
// relie le même mot de passe à un compte qui l'a déjà (vérifié : un second
// `signUp` avec le même secret aboutit, il ne crée pas de doublon).

// UN COMPTE, DEUX FICHIERS EN MÊME TEMPS : LA SESSION MEURT. Playwright
// exécute les FICHIERS en parallèle — `fullyParallel: false` ne sérialise que
// l'intérieur d'un fichier. Deux contextes repartis du même état présentent
// donc le MÊME jeton de rafraîchissement ; Convex Auth le fait tourner à
// chaque renouvellement, si bien que le second passage ressemble à un rejeu et
// que la session est invalidée. Le symptôme n'est pas un test lent mais un
// test qui se réveille sur /connexion, au milieu de son parcours — et jamais
// le même d'une exécution à l'autre.
//
// Constaté sur l'issue #38 : en ajoutant un TROISIÈME fichier sur la session
// modérateur (et un troisième sur la session admin), `admin-moderation` puis
// `admin.spec` sont tombés sur l'écran de connexion, en alternance. D'où la
// règle tenue ici : quand un fichier de spec tient une session longtemps (il
// écrit une donnée, puis la modère), il prend sa PROPRE session plutôt que de
// s'ajouter à la file d'attente d'un compte partagé.
//
// Le rôle n'est donc plus la clé : une session dédiée porte le rôle dont elle
// a besoin, et son entrée dit à quel fichier elle appartient.

export const SESSION_PASSWORD = 'session-e2e-partagee-2026';

// Même vocabulaire que `convex/lib/roles`, redéclaré ici comme dans
// `_helpers.ts` : ces fichiers ne dépendent que de Playwright.
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
  | 'a11yAffichage';

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
  // Session dédiée à `admin-confirmations.spec.ts` (issue #38). Ses quatre
  // parcours écrivent la donnée PUIS la modèrent : ils tiennent une session de
  // bout en bout, et les gardes du back-office étant hiérarchiques, un seul
  // compte de rang administrateur suffit aux deux bouts.
  confirmations: {
    email: 'e2e_session_confirmations@democracytogether.test',
    state: 'tests/e2e/.auth/confirmations.json',
    role: 'admin',
  },
  // Session dédiée à `dev-browser.spec.ts` (issue #50). Elle est tenue d'un
  // bout à l'autre du projet `dev-browser`, donc longtemps : la règle
  // ci-dessus s'applique. Rang administrateur, parce que ce fichier capture le
  // back-office ET l'espace membre — les gardes étant hiérarchiques, un seul
  // compte couvre les deux écrans, et une seule connexion de plus est payée.
  devBrowser: {
    email: 'e2e_session_dev_browser@democracytogether.test',
    state: 'tests/e2e/.auth/dev-browser.json',
    role: 'admin',
  },
  // Les deux fichiers de l'issue #49 prennent CHACUN la leur. La règle
  // ci-dessus n'énonce pas un seuil de trois fichiers : elle décrit un
  // mécanisme qui mord dès que DEUX contextes présentent le même jeton de
  // rafraîchissement, et l'issue #38 raconte seulement le moment où il s'est
  // vu. Playwright exécutant les FICHIERS en parallèle, deux fichiers sur un
  // compte suffisent à l'armer.
  //
  // À noter, parce que la confusion a coûté une campagne de CI : ce n'était
  // PAS la cause de l'échec de `admin-recherche` (il est tombé pareil avec sa
  // session à lui). Ce fichier a cinq parcours, donc cinq contextes tirés du
  // même état, et c'est le dernier qui se réveillait sur l'écran de connexion
  // — le cas INTRA-fichier, que `admin-confirmations.spec.ts` corrige en
  // réécrivant l'état après chaque test. Les deux précautions sont distinctes,
  // et les deux sont nécessaires ici.
  //
  // Rang administrateur pour les deux : les écrans exercés (utilisateurs,
  // journal) sont précisément ceux que ce rang réserve.
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
  // Session dédiée à `header-stabilite.spec.ts` (audit F-13, cas CONNECTÉ).
  // Elle applique la règle ci-dessus : un fichier, sa session. Le rang le plus
  // bas suffit — ce qui est mesuré est la largeur de l'en-tête d'un visiteur
  // connecté, pas un écran réservé.
  enTete: {
    email: 'e2e_session_en_tete@democracytogether.test',
    state: 'tests/e2e/.auth/en-tete.json',
    role: 'membre',
  },
  // Session dédiée à `admin-contact.spec.ts` (audit F-12). Ce fichier écrit un
  // message par le formulaire PUBLIC puis le traite depuis le back-office : il
  // tient donc sa session d'un bout à l'autre, exactement le cas que la règle
  // ci-dessus vise.
  //
  // Rang MODÉRATEUR, et pas plus : c'est ce qu'exigent `contact.listMessages`
  // et `contact.setHandled`. Prendre un administrateur « pour être tranquille »
  // ferait passer le test même le jour où la garde serait relevée par erreur —
  // le rang minimal est ce qui rend l'écran vérifié.
  adminContact: {
    email: 'e2e_session_admin_contact@democracytogether.test',
    state: 'tests/e2e/.auth/admin-contact.json',
    role: 'moderateur',
  },
  // Session dédiée à `admin-moderation.spec.ts`.
  //
  // CE FICHIER PARTAGEAIT `moderateur` AVEC `admin-ecrans.spec.ts`, et il
  // l'annonçait lui-même — son `describe` s'intitulait « session modérateur
  // PARTAGÉE ». C'est exactement ce que la règle ci-dessus proscrit, et le
  // symptôme décrit s'est produit : en CI, le test s'est réveillé sur
  // `/connexion` au milieu de son parcours, l'instantané d'échec montrant la
  // page de connexion et le bouton « Approuver » détaché du DOM.
  //
  // Il écrit la candidature par le chemin public PUIS la modère : il tient
  // donc sa session d'un bout à l'autre. Rang modérateur, celui qu'il exerce.
  adminModeration: {
    email: 'e2e_session_admin_moderation@democracytogether.test',
    state: 'tests/e2e/.auth/admin-moderation.json',
    role: 'moderateur',
  },
  // Session dédiée à `admin-moderation-ia.spec.ts` (F-32, auto-acceptation).
  //
  // Elle règle le dispositif PUIS dépose PUIS relit la file et le journal :
  // elle tient donc sa session d'un bout à l'autre, le cas que la règle
  // ci-dessus vise. Rang ADMINISTRATEUR, parce que c'est le rang qu'exige
  // `/admin/moderation-ia` — et les gardes étant hiérarchiques, le même
  // compte dépose depuis l'espace membre, ce qui évite un second compte dans
  // le fichier.
  adminModerationIa: {
    email: 'e2e_session_admin_moderation_ia@democracytogether.test',
    state: 'tests/e2e/.auth/admin-moderation-ia.json',
    role: 'admin',
  },
  // Session dédiée à `paiements-don.spec.ts` (F-28 à F-31). Le fichier donne
  // PUIS relit son reçu dans l'espace membre PUIS retrouve la transaction au
  // back-office : il tient sa session d'un bout à l'autre. Rang
  // ADMINISTRATEUR, celui qu'exige /admin/finances — les gardes étant
  // hiérarchiques, le même compte donne et consulte son espace membre.
  paiements: {
    email: 'e2e_session_paiements@democracytogether.test',
    state: 'tests/e2e/.auth/paiements.json',
    role: 'admin',
  },
  // Session dédiée à `diffusion-newsletter.spec.ts` (chantier diffusion) :
  // inscription publique, confirmation par le lien du courriel, PUIS
  // vérification au back-office — la session est tenue d'un bout à l'autre.
  // Rang ÉDITEUR, celui qu'exige `newsletter.listSubscribers`.
  diffusion: {
    email: 'e2e_session_diffusion@democracytogether.test',
    state: 'tests/e2e/.auth/diffusion.json',
    role: 'editeur',
  },
  // Sessions dédiées aux specs `contenus-*.spec.ts` (chantier « contenus »).
  // Chacune crée un contenu puis le publie puis le relit côté public : elles
  // tiennent leur session d'un bout à l'autre. Rang ÉDITEUR, celui qu'exige
  // `requireEditor` — un administrateur ferait passer le test même le jour où
  // la garde serait relevée par erreur. Le MEMBRE inscrit à l'événement a la
  // sienne : c'est son adresse qui lui ouvre le lien de visioconférence.
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
  // Session dédiée à `comptes-suspension.spec.ts` (chantier comptes, F-63).
  // Le fichier crée un compte, le fait se connecter, le suspend puis le
  // supprime : il tient la session d'un bout à l'autre, le cas que la règle
  // ci-dessus vise. Rang ADMINISTRATEUR, celui qu'exigent la création, la
  // suspension et la suppression.
  comptes: {
    email: 'e2e_session_comptes@democracytogether.test',
    state: 'tests/e2e/.auth/comptes.json',
    role: 'admin',
  },
  // Chantier « programmes » (F-56 à F-60). Chaque fichier `programmes-*`
  // enchaîne PLUSIEURS personnes sur un même parcours (qui publie, qui
  // candidate, qui évalue ; qui coordonne, qui mentore, qui est mentoré) et
  // tient chacune de bout en bout : une session par personne ET par fichier,
  // selon la règle ci-dessus. Les rangs sont les rangs MINIMAUX exercés —
  // modérateur pour publier un appel et coordonner (gardes `moderateur`),
  // éditeur pour la boîte à outils, membre pour candidater, évaluer, mentorer.
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
  // Chantier editorial (F-41 / F-43). `editorial-rapports.spec.ts` migre
  // l'édition codée depuis l'administration puis télécharge ses PDF : rang
  // ÉDITEUR, celui qu'exige `annualReports.*`.
  editorialRapports: {
    email: 'e2e_session_editorial_rapports@democracytogether.test',
    state: 'tests/e2e/.auth/editorial-rapports.json',
    role: 'editeur',
  },
  // `editorial-revue.spec.ts` fait jouer QUATRE personnes en double aveugle :
  // l'autrice (membre), l'éditeur, et deux relecteurs de rang modérateur —
  // le rang minimal que la revue exige d'un relecteur. Chacun tient sa
  // session d'un bout à l'autre du parcours, dans son propre contexte.
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
  // Sessions des specs d'accessibilité (F-08, audit RGAA) : `a11y-clavier`,
  // `a11y-annonces` et `a11y-affichage` parcourent l'espace membre et un écran
  // du back-office. Une session PAR FICHIER, selon la règle ci-dessus ; chacun
  // réécrit son état après chaque test (`test.afterEach`), comme
  // `admin-confirmations`, pour ne jamais repartir d'un jeton consommé. Rang
  // administrateur : les gardes étant hiérarchiques, un compte couvre l'espace
  // membre ET `/admin/utilisateurs`.
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
};

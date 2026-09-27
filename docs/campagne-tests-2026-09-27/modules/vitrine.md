# RAPPORT — module `vitrine` (vitrine publique)

Testeur QA « humain » · desktop clair (Desktop Chrome 1280×720) pour l'essentiel, rejeu des 4 pages clés en **mobile (Pixel 7, tactile)** et en **thème sombre (desktop)**.
Scripts : `explore/vitrine/*.mjs` · Sorties : `explore-out/vitrine--*/` (captures numérotées, vidéo `.webm`, `journal.json`, `journal.md`).
Contexte assumé : Sanity non configuré (chemin dégradé attendu), reCAPTCHA désactivé, Convex local avec données de démo.

**Bilan : 20 scénarios exécutés, 395 vérifications automatiques → 384 ✅ / 11 ❌, dont 5 ❌ sont des attentes trop strictes de mes scripts (expliquées § 2) et 6 correspondent à 4 anomalies réelles.** Aucune erreur de page JS, aucune requête ≥ 400 inattendue (seuls les 404 volontairement provoqués). Aucune anomalie bloquante ni majeure.

---

## 1. Périmètre couvert (scénarios et dossiers)

| # | Scénario | Dossier `explore-out/` | Vérifs |
|---|---|---|---|
| 1 | `/` (redirection de langue), `/xx/`, `/fr/nimporte-quoi`, slugs bizarres, `/sitemap.xml`, `/robots.txt` | `vitrine--racine-404-sitemap-robots` | 26 ✅ / 1 ❌* |
| 2 | `/fr` accueil : hero, 11 sections, CTA, globe, Précédent, focus clavier, **tous les liens en-tête + pied de page (26 URL uniques) → 200**, liens externes | `vitrine--accueil-et-liens` | 18 ✅ |
| 3 | En-tête : rubrique active, modale Recherche (clavier ↑↓ ↵ Échap, Ctrl+K, vide/2 car./résultats/aucun), menu Langue (5 endonymes, flèches, Échap, bascule EN ↔ FR avec **conservation de la query string**, cookie NEXT_LOCALE) | `vitrine--entete-recherche-langue` | 27 ✅ |
| 4 | `/fr/a-propos` ancres `#vision #gouvernance #fondateurs` (chargement direct + clic pied de page, focus qui suit) ; `/fr/actualites` et `/fr/actualites/slug-inexistant` (Sanity dégradé) | `vitrine--a-propos-ancres-actualites` | 19 ✅ |
| 5 | 13 pages éditoriales (partenaires, presse, rapports, rapports/2026, thématiques, thématiques/participation, experts, replays, appels-a-projets, don, mentions-legales, confidentialite, accessibilite) + `/fr/analyses` (redirection), `/fr/rapports/2025|abcd|2026.5|-1`, `/fr/thematiques/inexistant`, téléchargements presse FR et EN | `vitrine--pages-editoriales` | 82 ✅ / 2 ❌ (1 réel) |
| 6 | `/fr/barometre` : 5 sections, globe (survol pays, clic, sortie, boutons Tout/Afrique/Europe à la souris et au clavier), classement, 6 fichiers `/fr/barometre/data/*` (type, `Content-Disposition`, JSON valide, localisation ES), fichiers inexistants / traversée | `vitrine--barometre-dataviz-donnees` | 35 ✅ / 1 ❌* |
| 7 | `/fr/le-reseau` : compteur, carte, filtres région + thème + recherche (combinés, conservés dans l'URL), Réinitialiser, sans résultat, paramètres farfelus, XSS via `?q=`, `q` 3 000 car., `q[]=`, fiche membre (h1, aside, site web `rel`), fiche inexistante, slugs étranges | `vitrine--annuaire-filtres-fiche` | 31 ✅ / 4 ❌ (1 réel) |
| 8 | `/fr/contact` : vide (4 erreurs + focus + aria-invalid), e-mail invalide, `a@b`, message 4 500 car., XSS nom/sujet/message, double clic, succès → oracle `contact:latestForEmail`, rechargement, 2ᵉ message | `vitrine--contact-formulaire` | 18 ✅ / 1 ❌ (réel) |
| 9 | `/fr/newsletter` : vide, invalide, `a@b`, succès (adresse en MAJUSCULES + espaces) → `newsletter:isSubscribed`, réinscription, formulaire de l'accueil, `desinscription?token=` valide (→ `isSubscribed=false`), rejoué, faux, sans jeton, binaire | `vitrine--newsletter-inscription-desinscription` | 20 ✅ |
| 10 | `/fr/adhesion` : sections, FAQ, estimateur, vide (3 erreurs), e-mail/pays invalides, **organisation** (XSS dans la présentation, double clic) → `organizations:latestApplicationForEmail`, **individu** (libellé « Nom et prénom »), 2ᵉ candidature même adresse, Précédent après succès | `vitrine--adhesion-candidatures` | 24 ✅ |
| 11 | `/fr/jeunes#rejoindre` : vide (4 erreurs tutoiement), motivation courte, succès (XSS) → `youth:isYouthApplicant`, re-candidature ; `/fr/recherche?q=` vide, « démocratie », « Sahel », aucun, `<script>`, `"><img onerror>`, `' OR 1=1 --`, `%`, `*`, `"`, `\`, `é`, 3 000 car., 20 000 car., `q` répété | `vitrine--jeunes-et-recherche` | 28 ✅ / 2 ❌ (1 réel) |
| 12 | Bandeau cookies (`noConsent`) : texte, géométrie, refuser → persistance (rechargement + autre page), accepter au clavier → persistance, valeur corrompue, « En savoir plus », inventaire des cookies | `vitrine--bandeau-cookies` | 15 ✅ |
| 13–16 | **Mobile** : accueil (menu hamburger, focus, Langue vers le haut, Échap imbriqué, navigation, globe au toucher), annuaire (chips tactiles, filtre, fiche), contact (erreurs, succès + oracle), adhésion (comparatif défilable, estimateur, individu + oracle) | `vitrine--mobile-{accueil,annuaire,contact,adhesion}` | 22 ✅ |
| 17–20 | **Sombre** : accueil (globe, bascule de thème pied de page + persistance), annuaire (filtre), contact (erreurs), adhésion (erreurs, comparatif) ; échantillons de contraste | `vitrine--sombre-{accueil,annuaire,contact,adhesion}` | 19 ✅ |

\* ❌ imputables au script, voir § 2. `INDEX.md` porte 21 lignes `vitrine` : la première exécution du scénario 3 a échoué sur une erreur de mon script (bouton « Language » après bascule EN) et a été relancée après correction ; le dossier n'en garde que la version valide.

---

## 2. Tableau des vérifications par fonctionnalité

| Fonctionnalité | Résultat | Détail / preuve |
|---|---|---|
| `/` → `/fr` (307), `lang=fr`, préférence NEXT_LOCALE respectée | ✅ | 01-racine `01-racine-vers-fr.png` |
| `/xx/` langue inconnue | ✅ (❌ script) | 308 (barre finale) → `/xx` → 307 → `/fr/xx` → **404** bilingue « Page introuvable / Page not found » avec liens Accueil/Home. Mon script attendait 404 sur la 1ʳᵉ réponse. `02-langue-inconnue-xx.png` |
| `/fr/nimporte-quoi` 404 Next (racine, hors layout, bilingue) | ✅ | Attendu par `src/app/not-found.tsx`. `03-fr-nimporte-quoi-404.png` |
| 404 **localisées** dans le layout (`/fr/thematiques/inexistant`, `/fr/rapports/2025|abcd`, `/fr/le-reseau/inexistant` « Membre introuvable ») | ✅ | En-tête + pied de page conservés ; statut HTTP 404. `pages-editoriales/14,16`, `annuaire/09` |
| `sitemap.xml` (345 URL, 5 locales, hreflang, membres Convex, thématiques, rapports, pas de zone privée) | ✅ | |
| `robots.txt` (Disallow admin/espace-membre/espaces/inscription ×5 locales, studio, api ; Sitemap ; tunnels d'auth non bloqués) | ✅ | |
| Accueil : hero, CTA, 11 h2, globe, newsletter, canonical, aucune erreur console | ✅ | `accueil-et-liens/02-…-page-entiere.png` |
| **Tous les liens en-tête + pied de page → 200** (26 URL ; `/fr/analyses` → 307 → bibliothèque ; `/fr/espaces` → redirige vers connexion) | ✅ | journal, notes « OK … » |
| Liens externes `target=_blank` avec `rel=noopener` | ✅ | Seul lien externe rencontré : site web d'une fiche membre (`noopener noreferrer`). Aucun lien externe sur l'accueil/pied de page. |
| Focus clavier visible (outline 2px) | ✅ | `accueil-et-liens/03-accueil-focus-clavier.png` |
| Modale Recherche : ouverture (bouton, Ctrl+K), focus, seuil 2 car., résultats live, ↑↓ + ↵ ouvre l'option, Échap ferme + rend le focus, ↵ sans résultat → `/fr/recherche?q=` | ✅ | `entete-recherche-langue/01–04` |
| Menu Langue : 5 endonymes, cochée = courante, focus, flèches, Échap (menu seul), bascule EN **avec query conservée**, `lang=en`, retour FR, cookie | ✅ | `entete-recherche-langue/05–06` |
| `/fr/a-propos` ancres focalisables, défilement sous l'en-tête collant (top = 80 px), focus suit le clic pied de page | ✅ | `a-propos-…/02,03` |
| `/fr/actualites` dégradé : 200, h1, état vide lisible | ✅ (observation O1) | `a-propos-…/04` |
| `/fr/actualites/slug-inexistant` dégradé : 200, « Contenu momentanément indisponible », retour, **noindex,follow**, layout conservé | ✅ | `a-propos-…/05` |
| 13 pages éditoriales : 200, h1, aucune clé i18n brute, aucun débordement | ✅ (❌ script sur « accessibilité » : h1 = « Déclaration d'accessibilité », regex sensible à la casse) | `pages-editoriales/01–13` |
| `/fr/don` = « Bientôt » + retour accueil | ✅ | `10-don.png` |
| Presse : ressources CSV/codebook téléchargeables (200, attachment) | ✅ FR / **❌ EN → A2** | |
| Baromètre : sections, globe survol (« France · 0.83 · Libre »), clic, sortie efface, boutons région souris + clavier, focus visible, classement | ✅ | `barometre/03–07` |
| Données ouvertes : 6 fichiers 200 + `attachment` + types corrects, JSON valides, CSV/codebook localisés (ES ≠ FR) ; inexistant / `.xml` / traversée / `/data` nu → 404 | ✅ (❌ script : `composite.csv/` → 308 normalisation) | |
| Annuaire : compteur = nb de cartes, facettes, filtre région (chip `aria-current`, compteur = facette), région + thème combinés, recherche conserve les filtres, Réinitialiser, sans résultat, `?region=xyz` ignoré sans lien « Réinitialiser » (vérifié par curl : aucun `<a>` rendu) | ✅ (❌ script : 11 membres et non 10 — une candidature approuvée par la suite E2E a ajouté une fiche active) | `annuaire/02–06` |
| Annuaire : recherche par **nom de pays** | **❌ → A4** | « Kenya », « KE » → 0 résultat |
| Annuaire : XSS via `?q=` réfléchi échappé, 3 000 car. → 200, `q[]=` → 200 | ✅ | `annuaire/07` |
| Fiche membre : h1, Région/Pays/Langues, site web `noopener noreferrer`, CTA adhésion, title, retour | ✅ | `annuaire/08` |
| Contact : vide (4 erreurs rattachées `aria-invalid` + focus 1ᵉʳ fautif), e-mail invalide, `a@b` | ✅ | `contact/02,03` |
| Contact : message > 4 000 car. | **❌ → A3** | Refus serveur `INVALID_BODY`, message générique ; saisie conservée ✅ |
| Contact : XSS stocké en texte brut, aucun `alert` ; succès + oracle (`handled=false`) ; double clic → bouton désactivé « Envoi… », 1 seule confirmation ; rechargement vierge ; 2ᵉ message accepté | ✅ | `contact/05,06` |
| Newsletter : vide/invalide/`a@b` (1 erreur rattachée), succès + normalisation (majuscules/espaces) → `isSubscribed=true`, réinscription identique (pas d'oracle d'existence), formulaire de l'accueil | ✅ | `newsletter/02–05` |
| Désinscription : jeton valide → `isSubscribed=false`, rejeu idempotent, sans jeton → « invalide ou expiré », jeton binaire → 200 | ✅ | `newsletter/06,08` |
| Désinscription : **jeton faux** | ✅ techniquement (observation O2) | Affiche « Vous êtes désinscrit… » `newsletter/07` |
| Adhésion : sections, FAQ, estimateur (6 contrôles), comparatif avec caption ; vide (3 erreurs, focus), e-mail + pays invalides ; organisation → oracle (type, pays, statut pending), XSS inerte, double clic → 1 confirmation ; individu → oracle ; Précédent après succès | ✅ | `adhesion/01–07` |
| Adhésion : 2ᵉ candidature même adresse | ✅ techniquement (observation O3) | Deux candidatures pending coexistent |
| Jeunes : univers safran, ancre, vide (4 erreurs tutoyées), motivation < 10, succès + oracle, re-candidature | ✅ | `jeunes-et-recherche/01–04` |
| Recherche page : invite, autofocus, noindex, « démocratie » (2 publications + 2 membres), « Sahel », aucun, caractères spéciaux, 20 000 car. → 431/… < 500 | ✅ | `05–07` |
| Recherche page : XSS | ✅ (❌ script) | Aucun `alert`, aucun `<script>`/`<img>` injecté ; le ❌ vient du fait qu'un membre de test d'un autre module (« Institut Explo … », description contenant la charge) est trouvé, donc pas de message « Aucun résultat ». `08-recherche-xss.png` |
| Recherche page : terme très long | **❌ → A1** | `scrollWidth` 24 744 px |
| Cookies : bandeau (79 px, ancré en bas), texte honnête, lien confidentialité, refuser/accepter persistants, clavier, valeur corrompue → redemande, aucun cookie tiers | ✅ | `bandeau-cookies/01–04` |
| Mobile : pas de débordement (accueil, annuaire, fiche, contact, adhésion), menu (10 entrées, focus, Langue vers le haut dans l'écran, Échap imbriqué correct), chips ≥ 28 px, bouton Envoyer pleine largeur, comparatif défilable dans sa région, globe tactile (« Mali · 0.34 ») | ✅ | `mobile-*/` |
| Sombre : `data-theme=dark`, fond sombre, bascule pied de page + persistance, contrastes h1/p/a/label/input ≥ 5:1, globe lisible | ✅ | `sombre-*/` |
| Sombre : **messages d'erreur de formulaire** | **❌ → A5** | 2,68:1 mesuré |

---

## 3. Anomalies

Aucune anomalie **Bloquante** ni **Majeure**.

### Mineur

**A1 — `/fr/recherche` : un terme sans espace très long fait déborder la page horizontalement**
- Repro : ouvrir `/fr/recherche?q=` + un mot de 3 000 caractères (ex. « démocratie » ×300) ; ou saisir un tel mot dans le champ et valider.
- Attendu : le texte « Aucun résultat pour « … » » se replie ; pas de barre de défilement horizontale.
- Constaté : `document.documentElement.scrollWidth` = 24 744 px pour 1 280 px de fenêtre ; le message est coupé à droite (capture `vitrine--jeunes-et-recherche/09-recherche-tres-long.png`). Journal : `❌ q très long : pas de débordement horizontal`.
- Cause probable : `src/app/[locale]/recherche/page.tsx` l.128 — `<p className="mt-10 text-ink-soft">{t('empty', { q })}</p>` sans `break-words` / `overflow-wrap:anywhere` (le même motif `t('empty', { q: dq })` existe dans la modale `src/components/layout/search-dialog.tsx`). Suggestion : `break-words` ou tronquer `q` dans le message.

**A2 — `/en/presse` (et ES/PT/AR) : les ressources « Barometer data (CSV) » et « Codebook » pointent vers les fichiers FRANÇAIS**
- Repro : `GET /en/presse`, lire les `href` des cartes Ressources.
- Attendu : `/en/barometre/data/composite.csv` et `/en/barometre/data/codebook.txt` (la route sert bien des fichiers localisés, vérifié : l'en-tête CSV ES ≠ FR).
- Constaté : `["/fr/barometre/data/composite.csv","/fr/barometre/data/codebook.txt"]` sur `/en/presse` (journal `vitrine--pages-editoriales`, note « /en/presse : liens données »). Un journaliste anglophone télécharge un codebook en français.
- Cause : `src/lib/press-content.ts` l.95/103 (FR), l.152/160 (EN), l.209/217 (…) — `href: '/fr/barometre/data/…'` codé en dur dans chaque bloc de langue au lieu de dériver de la locale.

**A3 — `/fr/contact` : un message > 4 000 caractères est refusé avec un message générique et trompeur**
- Repro : remplir le formulaire avec un message de 4 500 caractères, envoyer.
- Attendu : soit une limite annoncée/affichée (compteur, `maxLength`), soit une erreur explicite « message trop long (4 000 caractères max) ».
- Constaté : « L'envoi a échoué. Réessayez dans un instant. » — l'utilisateur est invité à réessayer un envoi qui échouera toujours ; erreur console `[CONVEX A(contact:submit)] … Uncaught Error: INVALID_BODY` (capture `vitrine--contact-formulaire/04-contact-message-trop-long.png`). Rien n'est stocké (oracle vide), la saisie est conservée.
- Cause : `src/app/[locale]/contact/page.tsx` ne valide que le minimum (`< 10`) ; `convex/contact.ts` l.72-74 jette `INVALID_BODY` au-delà de `FIELD_MAX.body` (4 000) ; `isCaptchaFailed / isRateLimited` sont les seules erreurs distinguées → `errorGeneric`. Même schéma sur l'adhésion (présentation > 4 000) et jeunes (motivation > 4 000, non testé).

**A4 — Annuaire `/fr/le-reseau` : la recherche texte ignore le pays (« Kenya » → 0 résultat), alors que la recherche globale le prend en compte (mais sur le code ISO)**
- Repro : `/fr/le-reseau?q=Kenya` puis `?q=KE` → « Aucun think tank » ; `/fr/recherche?q=Kenya` → 0 aussi, mais la modale trouve le membre de Nairobi avec « démocratie ».
- Attendu : trouver « Nairobi Institute for Democratic Futures » (carte affichée « 🇰🇪 Kenya »), d'autant que la page invite à « filtrer par région » sans filtre pays.
- Constaté : journal `vitrine--annuaire-filtres-fiche` — `❌ Recherche par pays`. Note : l'interface n'offre **ni filtre pays ni filtre langue** (seulement région, thématique, texte), contrairement au périmètre demandé.
- Cause : `convex/lib/directory.ts` l.83 `matchesFilters` — meule = `name + description` seulement ; `convex/search.ts` l.41 inclut `o.country` mais c'est le code ISO (« KE »), pas le nom affiché. Suggestion : inclure le nom de pays localisé (ou au minimum le code) dans les deux.

**A5 — Thème sombre : les messages d'erreur de formulaire ont un contraste de 2,68:1 (échec WCAG AA 4,5:1)**
- Repro : thème sombre, `/fr/contact` (ou `/fr/adhesion`, `/fr/newsletter`, `/fr/jeunes`), envoyer le formulaire vide.
- Attendu : erreurs lisibles, ≥ 4,5:1.
- Constaté : texte `rgb(154,75,59)` sur fond `rgb(28,32,39)` → **2,68:1** (mesure `explore/vitrine/_contrast.mjs`) ; en clair la même couleur donne 5,84:1. Captures `vitrine--sombre-contact/03-sombre-contact-erreurs.png`, `vitrine--sombre-adhesion/03-sombre-adhesion-erreurs.png`.
- Cause : `src/app/globals.css` l.35 `--bar-5: #9a4b3b` (utilisé par `text-bar-5` pour les erreurs via `src/components/ui/field.tsx`) n'est **pas redéfini** dans le bloc `[data-theme='dark']` (l.89 sqq.), alors que `--paper/--surface` le sont. Il faut une variante claire de la couleur « non libre » pour le sombre (elle sert aussi de 5ᵉ teinte du baromètre — à vérifier sur le globe/légende sombres, lisibles mais ternes sur `sombre-globe.png`).

### Cosmétique / observations (pas des bugs au sens strict, à arbitrer)

- **O1** — `/fr/actualites` en panne Sanity affiche « Aucune actualité pour le moment. » (même message qu'une liste réellement vide), alors que le détail d'article distingue bien « Contenu momentanément indisponible ». Choix documenté dans `src/app/[locale]/actualites/page.tsx` (catch → `posts = []`), mais incohérent avec la doctrine F-02 appliquée ailleurs (`DataUnavailable`).
- **O2** — `/fr/newsletter/desinscription?token=faux-jeton-123` confirme « Vous êtes désinscrit de la lettre… » alors qu'aucun abonnement ne correspond ; « Lien de désinscription invalide ou expiré » n'apparaît que sans jeton. Idempotence assumée dans `desinscription/page.tsx` (`.finally(() => setStatus('done'))`) et `convex/newsletter.ts` `unsubscribe` retourne `ok:true` sans distinguer. Acceptable (pas d'oracle d'existence), mais un message plus neutre (« Si cette adresse était inscrite, elle ne l'est plus ») serait plus honnête.
- **O3** — L'adhésion accepte plusieurs candidatures « pending » pour la même adresse (deux en base après mon test), là où `/jeunes` dédoublonne doucement. Le back-office verra des doublons. `convex/organizations.ts` `storeApplication`.
- **O4** — `/fr/le-reseau/%00` et `/fr/bibliotheque/%00` répondent **200** avec la page de liste (Next normalise l'octet nul en segment vide) alors que `%00a` donne 404. Sans impact utilisateur ; à noter pour le SEO (URL dupliquée indexable) — le canonical corrige.
- **O5** — Le canvas du globe est `aria-hidden` : aucun accès clavier aux pays (seuls les boutons de région le sont). Assumé par le code (donnée dans le tableau #classement / la liste), mais la page d'accueil (variante « compact ») n'a ni tableau ni boutons : le globe y est purement décoratif au clavier.
- **O6** — Menu mobile : l'entrée « العربية » est composée en RTL (code « AR » à gauche) — intentionnel d'après le code, rendu correct.

---

## 4. Ce qui n'a PAS pu être testé, et pourquoi

- **Filtres « pays » et « langue » de l'annuaire** : ils n'existent pas dans l'interface (`src/components/directory/directory-filters.tsx` n'expose que région, thématique et recherche texte). Testés uniquement à travers la recherche texte (→ A4).
- **Actualités avec contenu** (cartes, article, JSON-LD Article, recherche d'actualités) : Sanity non configuré, seul le chemin dégradé est observable.
- **Quota de 5 messages/h par e-mail** et **plafonds par IP** (20/h) : non poussés volontairement pour ne pas épuiser les quotas partagés de la machine (autres agents) ; seul le 2ᵉ envoi d'une même adresse a été vérifié.
- **Double soumission réseau** (deux requêtes réellement parties) : l'UI désactive le bouton dès le premier clic (`Envoi…`) et aucun oracle ne compte les messages ; vérifié « une seule confirmation, formulaire disparu », pas le nombre de lignes en base.
- **Téléchargement effectif** des fichiers (boîte de dialogue navigateur) : vérifié par `Content-Disposition: attachment` et contenu, pas par un `download` Playwright.
- **reCAPTCHA** (désactivé) et **e-mails** (aucun envoi réel) : hors de portée de l'environnement.
- Le contraste « non libre » (`--bar-5`) sur la légende/le globe en sombre n'a été jugé qu'à l'œil (terne mais lisible), pas mesuré.

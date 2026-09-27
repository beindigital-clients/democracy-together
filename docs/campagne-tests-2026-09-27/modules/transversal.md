# RAPPORT — module TRANSVERSAL (multilingue / RTL, thème, mobile, accessibilité, faible débit, robustesse, SEO)

Environnement : Next `next start` sur http://localhost:3000, Convex local 127.0.0.1:3210, Sanity non configuré. Chromium Playwright 1.61 (Desktop Chrome 1280×720, Pixel 7 412×839 tactile). Scripts : `explore/transversal/*.mjs`. Dossiers de preuve : `explore-out/transversal--<scenario>/` (captures numérotées, `journal.md`, `journal.json`, vidéo `.webm`).

Bilan chiffré : **42 scénarios (dont 6 diagnostics), 1 600 vérifications automatiques : 1 474 ✅ / 126 ❌** — dont ~75 ❌ pour une seule cause (hreflang), ~12 faux positifs de mes détecteurs (documentés § 3.5), le reste correspond aux anomalies ci-dessous. Compte utilisé : `transversal_admin@democracytogether.test` (rôle admin, connexion par code via l'interface).

---

## 1. Périmètre couvert

| # | Scénario | Dossier(s) |
|---|---|---|
| 1a | 5 langues × 14 pages publiques : `<html lang/dir>`, clés brutes, résidus français, préfixe des liens du menu, débordement, capture | `transversal--langues-{fr,en,es,pt,ar}` |
| 1b | Sélecteur de langue (reste sur la page, query string), cookie `NEXT_LOCALE`, mémorisation après navigation/rechargement, `/` selon Accept-Language (6 cas), `/xx`, `/de`, `/FR`, `/en-US`, `/en/bibliotheque`, `/en/library` | `transversal--langues-switch` |
| 1c | Arabe RTL desktop + mobile : accueil, annuaire, contact, bibliothèque, événements (haut + pleine page), sélecteur de langue, menu mobile, formulaire de contact | `transversal--arabe-rtl-desktop`, `transversal--arabe-rtl-mobile`, `transversal--arabe-overflow-diag` |
| 2 | Thème : bascule par l'interface (menu mobile, pied de page desktop), persistance (rechargement, autre page, autre langue), `prefers-color-scheme`, flash au commit, 14 pages en sombre pleine page | `transversal--theme-bascule`, `transversal--theme-footer-desktop`, `transversal--theme-sombre-pages` |
| 3 | Mobile Pixel 7 : burger (ouvrir/fermer, focus piégé, Échap, lien actif, fond), 14 pages (débordement, cibles 2.5.8, textes < 11 px), formulaires au doigt (contact, OTP vide, recherche), bandeau cookies, paysage 839×412 | `transversal--mobile-{menu,pages,formulaires,cookies,paysage}`, diagnostics `transversal--mobile-barometre-{overflow-diag,bisect,scroll}` |
| 4 | axe WCAG 2.1 AA (fr/ar × clair/sombre, 14 pages + 2 pages connectées), clavier (ordre, focus visible, menu langue, Ctrl+K, repères, titres), reduced-motion (globe, reveals), zoom 200 % (640 px), sans JavaScript | `transversal--a11y-axe-*`, `transversal--connecte-axe-*`, `transversal--a11y-clavier`, `transversal--a11y-reduced-motion`, `transversal--a11y-zoom-200`, `transversal--a11y-sans-js` |
| 5 | 3G lente via CDP (400 kb/s, 400 ms), cache désactivé : `/fr`, `/fr/bibliotheque`, `/fr/barometre` (FCP, poids, ressources > 500 Ko, captures à 2/4/6/8 s) + diagnostics (échantillonnage DOM, captures CDP brutes) | `transversal--faible-debit`, `transversal--faible-debit-diag`, `transversal--faible-debit-capture-brute` |
| 6 | En-têtes de sécurité/CSP (6 URL), violations CSP en console, `/studio`, 404 × 5 langues, identifiants malformés/XSS, Convex bloqué côté navigateur (anonyme puis connecté) | `transversal--robustesse-headers`, `transversal--robustesse-erreurs`, `transversal--robustesse-convex-coupe`, `transversal--robustesse-convex-coupe-connecte` |
| 7 | SEO : 5 langues × 14 pages (title, description, canonical, hreflang, OG, Twitter, JSON-LD), unicité/traduction, sitemap (350 URL, échantillon HTTP), robots, cohérence noindex | `transversal--seo` |
| + | Pages connectées `/espace-membre`, `/admin` × 5 langues, déconnexion + Précédent | `transversal--connecte-login`, `transversal--connecte-langues` |

---

## 2. Tableau des vérifications

| Fonctionnalité | Résultat | Détail |
|---|---|---|
| `<html lang>` et `dir` (rtl pour ar) sur 14 pages × 5 langues + 2 pages connectées | ✅ | 80/80 pages, 200 partout |
| Aucune clé de traduction brute / marqueur ⟦…⟧ | ✅ | 0 (les 3 « dt.bar.series » sont des DOI, faux positif) |
| Aucun résidu français dans la chrome UI en en/es/pt/ar | ✅ | 0 (« Équipe Baromètre » = auteur de publication seedée ; « Message » = anglais) |
| Liens du menu préfixés par la langue courante | ✅ | 0 lien mal préfixé |
| Sélecteur de langue : 5 endonymes, reste sur la même page, conserve la query string | ✅ | fr→en→es→pt→ar→fr sur `/a-propos` ; `?theme=…&sort=…&page=2` conservé |
| Mémorisation : cookie `NEXT_LOCALE`, `/` → langue mémorisée, après rechargement | ✅ | cookie SameSite=Lax |
| `/` selon Accept-Language : en-US→/en, pt-BR→/pt, es-MX→/es, ar-MA→/ar, de-DE→/fr, fr-CA→/fr | ✅ | 307 systématique |
| `/FR` → `/fr` ; `/en/bibliotheque` fonctionne (slugs de route identiques dans les 5 langues, `/en/library` → 404) | ✅ | |
| `/xx`, `/xx/a-propos`, `/de`, `/en-US` → 404 **propre** | ❌ | 404 mais page racine hors charte, bilingue fr/en codée en dur (A-2) |
| RTL desktop : miroir (logo à droite, nav, menu de langue aligné sur le bord de fin, badge « العربية »), champs en rtl, police IBM Plex Sans Arabic | ✅ | |
| RTL mobile : pas de débordement | ❌ | `/ar/bibliotheque`, `/ar/evenements` : 446/412 px (A-5) ; accueil, annuaire, contact, recherche OK |
| RTL mobile : menu, menu de langue vers le haut dans le panneau, Échap ferme le calque intérieur seulement | ✅ | |
| Thème : bascule clair→sombre→clair, persistance rechargement / autre page / autre langue, `data-theme=dark` dès le commit (pas de flash) | ✅ | |
| Thème : `prefers-color-scheme: dark` respecté sans préférence enregistrée | ❌ | reste clair (A-7) |
| Thème : accès au bouton sur desktop ≥ 1120 px | ❌ | uniquement en pied de page (y ≈ 5 900 px), état non annoncé (A-8) |
| 14 pages en sombre : cohérence visuelle | ✅ | aucune zone blanche résiduelle ; voir contrastes (A-11) |
| Menu burger : aria-expanded/aria-modal, focus dans le panneau, piège à focus (15 Tab), Échap + retour du focus, tap sur le fond, lien actif `aria-current`, fermeture à la navigation, bascule de thème au doigt | ✅ | 14/14 |
| Mobile (fr) : débordement horizontal sur 14 pages | ✅ | 14/14 — le « 585/412 » remonté par le harnais sur `/fr/barometre` est un faux positif (`body.scrollWidth` = 412, `scrollLeft` reste 0 après `scrollTo(9999)`, les deux tableaux sont bien dans des `ScrollableRegion` défilantes — `transversal--mobile-barometre-scroll`) |
| Mobile (ar) : `/ar/barometre` | ❌ | 467/412 px, mise en page décalée de 55 px (A-6) |
| Mobile : cibles tactiles WCAG 2.5.8 (avec exception d'espacement) | ✅ | 0 cible fautive sur 14 pages + menu + bandeau |
| Mobile : formulaires au doigt (focus au tap, hauteur ≥ 40 px, police 16 px), erreurs OTP vide, recherche | ✅ | bouton d'envoi 40 px (cosmétique C-1) |
| Bandeau cookies mobile : visible, ancré, boutons, choix mémorisé, absent ensuite | ✅ | |
| Paysage 839×412 : 5 pages, panneau du menu défilant, menu de langue visible | ✅ | |
| axe serious/critical hors contraste — 14 pages × fr/ar × clair/sombre + 2 pages connectées × 4 | ✅ | 0 violation sur 64 analyses |
| axe `color-contrast` (règle différée par le dépôt) | ❌ | clair : safran (connu) ; **sombre : nouveaux écarts** (A-11) |
| Clavier : ordre logique de l'en-tête, focus visible (outline 2 px), menu de langue (Entrée, flèches, Échap → focus rendu), Ctrl+K / Échap, hiérarchie de titres | ✅ | captures `a11y-clavier/01..05` |
| Clavier : lien d'évitement « Aller au contenu » | ❌ | inexistant, 12 Tab avant le contenu (A-9) |
| Repères : un seul `<main>` | ❌ | 2 `<main>` imbriqués sur plusieurs pages (A-10) |
| reduced-motion : globe immobile, premier écran visible, blocs à l'écran visibles après saut en bas | ✅ | 3 blocs `[data-reveal]` restent voilés hors écran après défilement progressif (non confirmé visuellement, § 4) |
| Zoom 200 % (640 px) : 14 pages sans débordement | ✅ | |
| Sans JavaScript : 14 pages 200, texte présent, rien à opacité 0, pas de « Chargement… » | ✅ | globe = disque gris vide (C-3) |
| 3G lente : FCP < 5 s, aucune ressource > 500 Ko, poids ≤ 2 Mo, load < 30 s | ✅ | FCP 2,4–2,8 s ; 553–753 Ko ; load 12–15 s |
| 3G lente : contenu principal visible tôt | ❌ | `/fr` : premier écran vide jusqu'à l'hydratation (≈ 11–13 s) (A-3) ; bibliothèque/baromètre visibles à ≈ 2,5 s |
| En-têtes : nosniff, XFO, Referrer-Policy, HSTS, COOP, Permissions-Policy, CSP (default/object/frame-ancestors, pas d'unsafe-eval), Studio sans CSP, 0 violation CSP console | ✅ | |
| En-têtes : `X-Powered-By` absent | ❌ | `Next.js` exposé (A-12) |
| `/studio` (Sanity non configuré) | ⚠️ | 200, page blanche + spinner infini, 9 erreurs réseau (A-13) |
| 404 localisées `/{l}/page-inexistante` | ❌ | page racine, `lang=fr` même sous `/ar` (A-2) ; `/fr/tribune/zzz`, `/fr/bibliotheque/%E2%80%8B` → 404 localisée avec en-tête ✅ |
| Identifiants malformés / XSS (`<script>` dans l'URL et la recherche, `../..`, `%00`, `q` de 3 000 caractères, `page=-1&theme[]=x`) | ✅ | jamais de 500, aucune injection ; `/fr/le-reseau/%00` → 200 (index annuaire) |
| Convex bloqué (navigateur), anonyme : bibliothèque SSR lisible, navigation interne, annuaire, pas d'erreur applicative | ✅ | |
| Convex bloqué, connexion : information de l'utilisateur | ❌ | OTP : bouton grisé sans fin ; `/espace-membre`, `/admin` : « Chargement… » permanent ; palette : « Recherche… » sans fin (A-4) |
| SEO : title + description sur 70 pages, canonical, OG (title/description/locale/site_name/image 1200×630), Twitter card, JSON-LD Organization parsable | ✅ | |
| SEO : hreflang × 5 langues + x-default | ❌ | seulement fr/en/x-default sur 13 pages sur 14 (A-1) |
| SEO : titres uniques par langue ; traduits (es = pt sur 5 titres = même mot ; « Democracy Together » = nom propre) | ✅ | |
| SEO : descriptions uniques | ⚠️ | l'accueil porte la description par défaut du site (attendu) |
| sitemap.xml : 350 URL (70 × 5 langues), hreflang 5 + x-default, 0 zone privée, 70 URL fr + 12 échantillons → 200 ; robots.txt (Sitemap, Disallow admin/espace-membre × 5, /studio, /api/) ; aucune page noindex dans le sitemap | ✅ | incohérent avec les pages (A-1) |
| Pages connectées × 5 langues : lang/dir, traductions, liens, pas de « Chargement… » ; déconnexion + Précédent → pas de contenu privé | ✅ | 59/59 |

---

## 3. Anomalies

### Majeur

**A-1 — hreflang incomplet : es, pt, ar absents sur presque toutes les pages (SEO multilingue).**
- Repro : `curl -s http://localhost:3000/es/a-propos | grep alternate` → `hrefLang="fr"`, `"en"`, `"x-default"` seulement ; idem sur `/`, `/a-propos`, `/le-reseau`, `/bibliotheque`, `/barometre`, `/evenements`, `/tribune`, `/jeunes`, `/adhesion`, `/mentions-legales` dans les 5 langues (65 vérifications ❌ dans `transversal--seo/journal.md`). Seuls `/contact` (et `/don`, `/bibliotheque/[slug]` d'après le code) déclarent les 5.
- Attendu : chaque page indexable déclare `fr, en, es, pt, ar, x-default`, comme le fait le sitemap (350 URL avec 6 hreflang).
- Constaté : les pages es/pt/ar ne se déclarent pas elles-mêmes comme alternates → un moteur peut les considérer comme dupliquées ; incohérence page ↔ sitemap.
- Cause : `languages: { fr: …, en: …, 'x-default': … }` codé en dur dans `src/app/[locale]/{page,a-propos,le-reseau,bibliotheque,barometre,evenements,tribune,jeunes,adhesion,mentions-legales,…}/page.tsx` (≈ 25 fichiers), alors que `src/lib/seo.ts#alternatesFor` produit déjà les 5 langues et n'est utilisé que par `contact/layout.tsx`, `don/page.tsx`, `bibliotheque/[slug]/page.tsx`.

**A-2 — 404 hors charte et non localisée pour tout segment inconnu de premier niveau (`/ar/xyz`, `/xx`, `/de`).**
- Repro : ouvrir `/ar/page-inexistante-zzz` (ou `/xx` → 307 `/fr/xx`). Captures `transversal--robustesse-erreurs/01..05-404-*.png`, `transversal--langues-switch/xx-404.png`.
- Attendu : la 404 localisée du layout (en-tête, pied de page, langue de l'URL), comme pour `/fr/tribune/zzz`.
- Constaté : statut 404 correct, mais page `src/app/not-found.tsx` (racine) : `lang="fr"`, textes fr + en codés en dur, aucun en-tête/pied de page, aucun texte es/pt/ar. Sous `/ar/...` un lecteur d'écran arabe reçoit une page déclarée française.
- Cause : `src/app/[locale]/not-found.tsx` n'est rendu que par un `notFound()` explicite dans un segment existant ; il manque une route attrape-tout `src/app/[locale]/[...rest]/page.tsx` appelant `notFound()`. Le middleware redirige bien `/xx` → `/fr/xx` (locale inconnue ⇒ préfixe par défaut), c'est ensuite la 404 racine qui répond.

**A-3 — Accueil en faible débit : premier écran vide jusqu'à l'hydratation (≈ 11–13 s en 3G lente).**
- Repro : 3G lente (50 Ko/s, 400 ms), cache vide, `/fr` mobile. Captures `transversal--faible-debit/03-_fr-t4s.png`, `05-_fr-t8s.png` (en-tête + ligne du pied de page, rien d'autre), `06-_fr-charge.png` (après load) ; capture CDP brute `transversal--faible-debit-capture-brute/cdp-_fr-t4s.png` et `cdp-_fr-t6.1s.png` (vides) contre `cdp-_fr_bibliotheque-t2.5s.png` (texte visible dès 2,5 s en police de repli).
- Mesures : FCP 2,7 s (en-tête seulement) ; chunk `40-…js` (64 Ko / 200 Ko décodé) reçu à 11,7 s, `21w9…js` à 10,5 s ; texte de l'accueil peint après leur exécution.
- Cause : `src/components/home/home-hero.tsx` rend en SSR `style="opacity:0;transform:translateY(12px)"` (×4), `translateY(18px)` (×2), `scale(1.06)` (×1) via `initial={{ opacity: 0 … }}` de framer-motion (lignes 74, 108, 122, 143 ; le titre est masqué par `initial={{ y: '108%' }}` dans un conteneur `overflow-hidden`). Le correctif F-05 de `reveal.tsx` (`initial={false}`) ne s'applique pas ici. La règle `<noscript>` du layout masque le problème seulement quand JS est désactivé — pas quand JS est lent. Vérification : `curl -s localhost:3000/fr | grep -c 'opacity:0'` → 7 ; `/fr/bibliotheque`, `/fr/barometre` → 0.

**A-4 — Backend Convex injoignable depuis le navigateur : attente muette sur la connexion, « Chargement… » permanent sur les pages privées.**
- Repro : bloquer `http(s)://127.0.0.1:3210/**` et `ws(s)://127.0.0.1:3210/**` (`context.route` + `routeWebSocket`), compte existant, `/fr/connexion-otp` → code (envoyé par le serveur, non bloqué) → « Se connecter ». Captures `transversal--robustesse-convex-coupe-connecte/04-apres-code-15s.png`, `05-espace-membre-convex-coupe-15s.png`, `06-admin-convex-coupe-12s.png`, `02-palette-recherche-convex-coupe.png`.
- Attendu : un message (« service indisponible, réessayez ») après quelques secondes.
- Constaté : après 15 s, le bouton « Se connecter » reste grisé (disabled) sans aucun message ; `/fr/espace-membre` et `/fr/admin` affichent « Chargement… » indéfiniment (l'en-tête, rendu serveur, dit pourtant « Espace membre · Déconnexion ») ; la palette Ctrl+K affiche « Recherche… » sans fin. Les pages publiques restent lisibles (rendu serveur) ✅ ; les formulaires de connexion pour un compte inconnu affichent bien une erreur (`/api/auth` passe par le serveur).
- Hypothèse : `useConvexAuth().isLoading` / `useQuery` sans délai maximal ni état d'erreur (`src/components/auth/redirect-after-auth.ts`, `src/components/auth/auth-gate.tsx`, pages `espace-membre`/`admin`, `search-dialog.tsx`) ; `ConvexReactClient` reconnecte en boucle silencieusement.

**A-5 — RTL mobile : débordement horizontal de 34 px sur `/ar/bibliotheque` et `/ar/evenements`, bouton « بحث » coupé.**
- Repro : Pixel 7, `/ar/bibliotheque`. Captures `transversal--arabe-rtl-mobile/07-bibliotheque-haut.png`, `09-evenements-haut.png` (page dézoomée, bouton de recherche tronqué à gauche) ; mesures `transversal--arabe-overflow-diag/journal.md` : `scrollWidth 446 / clientWidth 412`, `scrollX −33`, input 351 px + bouton 67 px + gap 12 px dans un formulaire de 380 px. Les mêmes pages en fr/en et `/ar/le-reseau`, `/ar/recherche` (autre formulaire) sont propres.
- Cause : `src/app/[locale]/bibliotheque/page.tsx:99-144` et `evenements/page.tsx:134` — `<form class="flex …">` avec `<input class="flex-1 …">` sans `min-w-0` : la largeur intrinsèque de l'input (placeholder arabe long, police IBM Plex Sans Arabic) l'emporte sur `flex-1`. Ajouter `min-w-0` (ou `w-full`) à l'input.

**A-6 — `/ar/barometre` mobile : la page est élargie de 55 px par le tableau « Télécharger et citer » (RTL), mise en page décalée.**
- Repro : Pixel 7, `/ar/barometre`. Mesures `transversal--mobile-barometre-bisect/journal.md` (bissection par masquage) : `documentElement.scrollWidth 467 / 412`, en-tête et `<main>` non clippés décalés à `[54, 466]` ; le coupable est la `ScrollableRegion` « التنزيل والاستشهاد » (tableau de 492 px, `left = −43`) : masquer ce tableau ramène la page à 412 px. Captures `transversal--mobile-barometre-overflow-diag/01-_ar_barometre-element-debordant-scrolle-a-droite.png` (contenu coupé à droite après défilement latéral) et `transversal--mobile-barometre-bisect/02-_ar_barometre-zone-coupable.png` (page dézoomée). En français, la même page ne déborde pas réellement (voir § 3.5).
- Attendu : comme en LTR, le tableau défile dans sa région sans élargir le document.
- Constaté : en RTL, le contenu qui dépasse à gauche de la région `overflow-x-auto` (`src/components/ui/scrollable-region.tsx`) élargit le document ; le viewport visuel s'élargit, la page se dézoome et le bord droit est tronqué. Même famille que A-5 (largeur intrinsèque + RTL).
- Hypothèse : `src/app/[locale]/barometre/page.tsx:514-601` — la région n'a pas `min-w-0`/`max-w-full` et `overflow-hidden` n'est posé que sur son parent `Reveal` (motion.div) ; en RTL Chromium comptabilise le dépassement à gauche dans la largeur du document. À reproduire aussi sur `/ar/adhesion` (même motif) et corriger au niveau de `ScrollableRegion` (`max-w-full min-w-0` + `direction` explicite ou `overflow-x: auto` sur un conteneur en `display:block` isolé).

### Mineur

**A-7 — `prefers-color-scheme: dark` ignoré sans préférence enregistrée.** Contexte `colorScheme: 'dark'`, localStorage sans `dt-theme` → `data-theme="light"`, fond `rgb(244,242,236)`. Capture `transversal--theme-bascule/prefers-dark-sans-preference.png`. Cause : `src/app/[locale]/layout.tsx` `themeInit` : `t==='dark'?'dark':'light'` sans `matchMedia('(prefers-color-scheme: dark)')`. (La préférence enregistrée, elle, prime bien.)

**A-8 — Bascule de thème introuvable sur desktop hors pied de page ; état non annoncé.** Sur 1280 px, aucun bouton dans l'en-tête (`site-header.tsx` : `ThemeToggle` commenté ; `MobileNav` masqué ≥ 1120 px) ; le seul bouton est en pied de page à y ≈ 5 866 px sur `/a-propos` (`transversal--theme-footer-desktop/01-pied-de-page-clair.png`). Le bouton a un `aria-label` fixe « Changer de thème » sans `aria-pressed` ni libellé d'état (`src/components/layout/theme-toggle.tsx`). Fonctionnellement il marche (clic, Entrée, persistance ✅).

**A-9 — Pas de lien d'évitement « Aller au contenu ».** 12 tabulations (logo → 7 rubriques → recherche → langue → connexion → rejoindre) avant le premier lien du contenu (`transversal--a11y-clavier/journal.md`). Les repères ARIA existent (header/nav/main/footer), ce qui atténue, mais un lien d'évitement reste attendu (RGAA 12.7). Emplacement : `src/app/[locale]/layout.tsx` avant `<SiteHeader />`.

**A-10 — Deux `<main>` imbriqués.** `src/app/[locale]/layout.tsx` rend `<main class="flex-1">` et `src/app/[locale]/{bibliotheque,evenements,evenements/calendrier,evenements/[slug],le-reseau/[slug]}/page.tsx` rendent un second `<main>` (`curl -s localhost:3000/fr/bibliotheque | grep -o '<main[^>]*>'` → 2). Repère `main` dupliqué pour les technologies d'assistance (axe ne le remonte qu'en « best-practice »).

**A-11 — Contrastes insuffisants en thème sombre (nouveaux, hors palette safran connue).** Mesures axe (`transversal--a11y-axe-fr-sombre/journal.json`, note `AXE`) : badges de type sur les cartes de la bibliothèque `text-bar-1` #2e6e8e sur #1c2027 = **2,9:1** (8 nœuds, 10 px) ; baromètre catégories `text-bar-1`/`text-bar-5` = **3,19 / 2,94** (13 nœuds, 12,5 px) ; adhésion `text-muted` sur `bg-accent-tint` = 3,93 ; jeunes badges `opacity-70` = 2,93 ; accueil bloc 01 `text-accent-contrast/80` sur bleu = 4,49. Les variables `--color-bar-*` ne sont pas redéfinies pour `[data-theme=dark]`. En clair : écarts déjà connus/différés (safran : 1,8–2,2 sur `/`, `/jeunes`, `/a-propos` ; `text-bar-2/4` sur `/barometre`).

**A-12 — `X-Powered-By: Next.js` exposé** sur toutes les pages HTML (`transversal--robustesse-headers/journal.md`). `poweredByHeader: false` manquant dans `next.config.ts`. Les autres en-têtes et la CSP sont conformes (script-src `'unsafe-inline'` sans `unsafe-eval`, assumé et documenté).

**A-13 — `/studio` : page blanche avec spinner infini quand Sanity est injoignable** (`transversal--robustesse-headers/01-studio.png`, 9 × `ERR_TUNNEL_CONNECTION_FAILED`). Attendu par l'environnement (Sanity non configuré), mais la dégradation n'est pas « propre » : aucun message. Non compté comme bug applicatif, à documenter.

### Cosmétique

**C-1** — Bouton « Envoyer le message » du contact mobile : 40 px de haut (conforme 2.5.8, mais < 44 px recommandé) ; `transversal--mobile-formulaires/01-contact-rempli-au-doigt.png`.
**C-2** — Textes de 10–10,5 px sur mobile : badges « Accès ouvert » et DOI (bibliothèque), « CSV/XLSX/JSON » (baromètre), `dt` « Dates/Lieu/Langues/Accès » (événements), libellés des offres (adhésion) — `transversal--mobile-pages/journal.md`.
**C-3** — Sans JavaScript, `/fr/barometre` et `/fr/le-reseau` affichent un grand disque gris vide (placeholder du globe) sans légende — `transversal--a11y-sans-js/05-barometre-sans-js.png`.
**C-4** — `/icon.png` (95 Ko) est téléchargé sur `/fr/bibliotheque` et `/fr/barometre` (plus grosse ressource de la page en 3G) — `transversal--faible-debit/journal.md`.
**C-5** — Les titres/auteurs des publications de démo sont en français sur les pages en/es/pt/ar (contenu de la base, pas l'interface) — `transversal--langues-en/04-bibliotheque.png`.

### 3.5 Faux positifs de mes détecteurs (ne pas traiter)
`dt.bar.series|sources|geo` = DOI `10.59000/dt.bar.*` ; « Baromètre » sur `/bibliotheque` = auteur « Équipe Baromètre Democracy Together » ; « Message » = anglais valide ; `/FR` → 307 `/fr` 200 = correct ; « h1 aligné à droite » sur annuaire/contact mobile = h1 pleine largeur (texte bien à droite sur les captures) ; « titre traduit » es = pt (« Biblioteca », « Eventos », « Contacto », « Aviso legal », « Tribuna democrática ») = même mot ; « descriptions uniques » = seul l'accueil porte la description du site ; « l'en-tête parcouru dans l'ordre » = ordre correct, ma condition d'arrêt était trop stricte (voir capture `a11y-clavier/02-focus-2-_propos.png` : outline bleu 2 px visible) ; « `/fr/barometre` mobile 585/412 » = `documentElement.scrollWidth` gonflé par les tableaux des régions défilantes, mais `body.scrollWidth` = 412 et la page ne défile pas (`transversal--mobile-barometre-scroll`) — attention, le même indicateur est en revanche RÉEL en arabe (A-5, A-6 : éléments non clippés décalés, `scrollX` négatif, capture dézoomée). Le harnais `horizontalOverflow` gagnerait à croiser `body.scrollWidth` et un test de `scrollTo`.

---

## 4. Ce qui n'a PAS pu être testé, et pourquoi
- **Panne Convex côté serveur** (fetchQuery SSR, `/api/auth`) : il aurait fallu arrêter le backend (interdit). Seul le blocage côté navigateur a été simulé ; l'authentification passe par le serveur et n'est donc pas affectée.
- **Page 500 localisée** (`src/app/[locale]/error.tsx`) : aucun moyen de provoquer une erreur serveur sans modifier le dépôt ; toutes les URL farfelues ont répondu 200/404.
- **Flash de thème au pixel près** : vérifié `data-theme=dark` dès `commit` et absence de fond clair sur la première capture ; non mesuré image par image (une vidéo `.webm` est jointe dans `transversal--theme-bascule`).
- **Reduced-motion — 3 blocs `[data-reveal]` voilés sur `/barometre`** après défilement progressif (`DIV.mb-6`, `DIV.mt-5 grid`, `DIV.mb-8`) : détecté par script, non reproduit visuellement (le contrôle « blocs à l'écran visibles après saut en bas » passe). À confirmer à la main.
- **Lecteur d'écran réel, appareil physique 3G, Studio Sanity fonctionnel, traduction/modération IA** : hors de portée de l'environnement (Sanity non configuré, pas de clé IA).
- **Pages connectées sur mobile et menu mobile connecté** : couverts uniquement sur desktop (fr/ar × clair/sombre).
- Pages hors liste de référence (`/thematiques`, `/rapports`, `/actualites`, `/experts`…) : uniquement via l'échantillon HTTP du sitemap (82 URL → 200).

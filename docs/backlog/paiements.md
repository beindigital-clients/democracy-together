# Paiements — cotisations, dons, reçus, suivi financier (F-27 à F-31)

> Chantier « paiements » du backlog (27/09). Ce document dit ce qui est livré,
> comment l'activer, et ce qui reste à valider avec de vraies clés.

## 1. Ce qui est livré

| Fiche | Livré |
|---|---|
| **F-27** Formules & cotisations | Barème en base (`paymentPlans` : catégorie organisation / individuel / jeune × zone de revenu élevé / intermédiaire / modeste, un montant EUR et XOF par formule). Écran d'édition `/admin/finances/formules` (admin, audité) avec initialisation depuis le barème indicatif. `/adhesion` affiche le barème réel dès qu'il existe (sinon l'estimation, dite indicative). Règlement dans `/espace-membre/cotisations` : le montant vient du barème, jamais du navigateur ; période de 12 mois, renouvellement anticipé prolongé depuis la fin de la période en cours. |
| **F-28** Dons | `/don` : montants suggérés, montant libre borné (5–10 000 € ; 1 000–5 000 000 FCFA), ponctuel ou mensuel, EUR/XOF selon les prestataires configurés, anonymat public, message, reCAPTCHA v3 + plafonds (IP, global, adresse). Retour `/paiement/retour` (succès, en attente, annulé, échoué) avec relecture chez le prestataire si le webhook tarde. Mensuel : abonnement Stripe (EUR) ; relance planifiée par e-mail pour PayDunya (XOF). |
| **F-29** Reçus | PDF généré côté serveur (pdf-lib), stocké dans Convex, numéro `DT-AAAA-NNNNNN` continu par année (attribué dans la transaction du paiement : ni trou, ni doublon). Téléchargeable par le compte propriétaire, par un administrateur, ou par le lien personnel envoyé par e-mail (donateur sans compte). En français (pièce comptable). |
| **F-30** Espace membre | `/espace-membre/cotisations` : cotisation en cours et échéance, règlement, dons mensuels (arrêt), historique des paiements et reçus. |
| **F-31** Back-office | `/admin/finances` (admin) : encaissé par mois × devise × type (remboursements déduits), transactions filtrables (type, devise, statut, prestataire), remboursement (marqué, ou exécuté chez Stripe), export CSV journalisé, cotisations en retard, dons mensuels (arrêt), journal des opérations `payment.*`. |

Architecture : `convex/lib/payments/` (couche **indépendante du prestataire** :
`types.ts` = contrat d'adaptateur, `stripe.ts`, `paydunya.ts`, `fake.ts`,
`ledger.ts` = grand livre idempotent), `convex/payments/` (fonctions Convex),
tables dans `convex/lib/tables/paiements.ts`.

## 2. Variables d'environnement (déploiement Convex)

Toutes se posent avec `npx convex env set NOM valeur` (sur la PRODUCTION :
`--prod`). Aucune clé n'est dans le code. Sans configuration, l'interface dit
que le paiement en ligne n'est pas ouvert et propose virement ou contact.

| Variable | Rôle |
|---|---|
| `STRIPE_SECRET_KEY` | Clé secrète Stripe (`sk_test_…` puis `sk_live_…`, ou clé restreinte `rk_…` avec droits Checkout Sessions, Subscriptions, Refunds, Invoices en lecture). |
| `STRIPE_WEBHOOK_SECRET` | Secret de signature du point de terminaison webhook (`whsec_…`). Stripe n'est activé que si les DEUX variables sont posées. |
| `PAYDUNYA_MASTER_KEY` · `PAYDUNYA_PRIVATE_KEY` · `PAYDUNYA_TOKEN` | Clés de l'application PayDunya (Business → Intégrez notre API). Les trois sont requises. |
| `PAYDUNYA_MODE` | `test` (défaut : API `sandbox-api`) ou `live`. |
| `SITE_URL` | Déjà utilisée par l'e-mail : sert aux URL de retour (`/<langue>/paiement/retour?ref=…`) et aux liens de reçu. |
| `CONVEX_SITE_URL` | Fournie par Convex : sert à l'URL de callback PayDunya. |
| `PAYMENTS_BANK_IBAN` · `PAYMENTS_BANK_HOLDER` · `PAYMENTS_BANK_BIC` · `PAYMENTS_BANK_NAME` | Facultatives : coordonnées de virement affichées quand aucun prestataire n'est disponible. Sans IBAN, l'interface renvoie au formulaire de contact. |
| `ASSOCIATION_NAME` · `ASSOCIATION_LEGAL_FORM` · `ASSOCIATION_ADDRESS` · `ASSOCIATION_RNA` · `ASSOCIATION_SIRET` · `ASSOCIATION_REPRESENTATIVE` | Mentions du reçu (docs/infos-legales-client.md : siège, RNA/SIRET, représentant légal). Sans valeur : `[à compléter avant mise en ligne]`, comme les mentions légales. Forme juridique par défaut : « loi du 1er juillet 1901 » — à remplacer si l'entité qui encaisse est la structure sénégalaise. |
| `ASSOCIATION_TAX_RECEIPT_ELIGIBLE` | `true` UNIQUEMENT si l'éligibilité au mécénat est confirmée (rescrit) : le reçu cite alors les art. 200 et 238 bis du CGI. Sinon il précise qu'il ne vaut pas reçu fiscal. |
| `PAYMENTS_FAKE_PROVIDER` | `1` = prestataire factice (dev/E2E). **Jamais en production** — voir § 5. |
| `PAYMENTS_FAKE_WEBHOOK_SECRET` | Facultative : secret HMAC du webhook factice (valeur par défaut acceptable, le factice ne touche aucun argent). |

## 3. URL de webhook à déclarer

Routes HTTP (`convex/http.ts`), sur le domaine `CONVEX_SITE_URL`
(`https://<déploiement>.convex.site`) :

| Prestataire | URL | Où la déclarer |
|---|---|---|
| Stripe | `POST <CONVEX_SITE_URL>/payments/webhook/stripe` | Dashboard → Développeurs → Webhooks → Ajouter un point de terminaison. Événements : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `invoice.paid`, `customer.subscription.deleted`, `charge.refunded`. Copier le secret de signature dans `STRIPE_WEBHOOK_SECRET`. |
| PayDunya | `POST <CONVEX_SITE_URL>/payments/webhook/paydunya` | Rien à déclarer : l'URL est envoyée à chaque facture (`actions.callback_url`). Vérifier qu'aucune URL IPN globale contradictoire n'est posée dans le compte. |
| Factice | `POST <CONVEX_SITE_URL>/payments/webhook/fake` | Répond 404 hors garde (§ 5). |

Réponses : 400 signature/hash invalide (non rejoué), 404 prestataire non
configuré, 500 inscription impossible (le prestataire REJOUE — l'inscription
est idempotente), 200 sinon.

## 4. Procédure d'activation

1. **Informations légales** : poser les variables `ASSOCIATION_*` dès que
   l'association les a fournies (siège, RNA/SIRET, représentant légal).
2. **Stripe (EUR)** : créer le compte, activer Checkout ; poser les clés de
   TEST, déclarer le webhook (§ 3), faire un don de 5 € avec la carte
   `4242 4242 4242 4242`, vérifier : retour « Merci », reçu dans l'e-mail et
   dans l'espace membre, ligne dans `/admin/finances`. Tester un don mensuel
   (abonnement créé, facture `invoice.paid` inscrite une fois) et son arrêt
   depuis l'espace membre (l'abonnement disparaît chez Stripe). Puis passer
   aux clés `sk_live_…`.
3. **PayDunya (XOF)** : créer l'application (mode test), poser les trois clés
   et `PAYDUNYA_MODE=test`, faire un don de 1 000 FCFA avec un compte client
   fictif du sandbox. Vérifier en particulier les points du § 6. Puis
   `PAYDUNYA_MODE=live` et les clés de production.
4. **Barème** : `/admin/finances/formules` → « Initialiser avec le barème
   indicatif », ajuster, enregistrer. `/adhesion` affiche alors le barème réel.
5. **E-mail** : `AUTH_RESEND_KEY` (déjà requis) — sans lui, confirmation et
   relances échouent (le paiement et le reçu restent enregistrés).
6. **Contrôle production** : `npx convex env list --prod --names-only` ne doit
   mentionner ni `PAYMENTS_FAKE_PROVIDER` ni `AUTH_DEV_OTP`.

Régénérer un reçu dont le PDF a échoué :
`npx convex run payments/receipts:regenerate '{"receiptId":"…"}'`.

## 5. Prestataire factice (dev / E2E)

Actif seulement si **les trois** conditions tiennent (modèle `AUTH_DEV_OTP`) :
`PAYMENTS_FAKE_PROVIDER` vaut exactement `1`, `AUTH_DEV_OTP=true`, et aucun
indicateur de production (`STRIPE_SECRET_KEY` en `sk_live_`/`rk_live_`,
`PAYDUNYA_MODE=live`). Drapeau posé mais garde refusée : état « refusé »,
bruyant dans les journaux et affiché au back-office ; le point de webhook
factice répond 404 et la simulation lève `FAKE_PROVIDER_DISABLED`. Tests :
`convex/payments.test.ts` (« Prestataire factice — garde »).

Il ne court-circuite rien : la page `/paiement/simulateur` fabrique un webhook
signé HMAC qui passe par la même vérification et le même grand livre. Il
couvre EUR et XOF, et le don mensuel par relance. Ses reçus portent
« document de test — aucun paiement réel ». `e2e.yml` le pose sur la
préversion CI ; en local : `npx convex env set PAYMENTS_FAKE_PROVIDER 1`.

## 6. À valider avec des clés sandbox PayDunya

La documentation officielle (developers.paydunya.com) n'était pas joignable
depuis l'environnement de développement le 27/09 : l'adaptateur suit le SDK
Node officiel (`paydunyadev/paydunya-node-master`) et la description publique
de l'IPN. À vérifier :

- [ ] Forme exacte de l'IPN : `application/x-www-form-urlencoded` avec
  `data[hash]` et `data[invoice][token]` (le JSON `{"data":{…}}` est aussi
  accepté par `readPaydunyaIpn`).
- [ ] `data[hash]` = SHA-512 hexadécimal (minuscules) de la MASTER-KEY.
- [ ] `GET /checkout-invoice/confirm/{token}` renvoie `custom_data.checkoutRef`
  et `invoice.total_amount` (le montant confirmé est comparé au montant
  demandé ; un écart n'ouvre ni reçu ni cotisation).
- [ ] Le retour navigateur (`return_url`) après un paiement mobile money
  différé : la page reste « confirmation en cours » jusqu'à l'IPN.
- [ ] Statuts renvoyés par `confirm` (`pending`, `completed`, `cancelled` ;
  un éventuel `failed` est aujourd'hui ignoré — la demande reste ouverte).

## 7. Limites connues

- **Reçu non fiscal** tant que l'éligibilité au mécénat n'est pas confirmée
  (RMDL-cadrage-technique.md, risques juridiques) ; flag
  `ASSOCIATION_TAX_RECEIPT_ELIGIBLE`.
- **Polices standard du PDF** : un nom en écriture arabe s'imprime « ???? »
  sur le reçu (le nom latin et l'adresse restent exacts). Embarquer une police
  Unicode (Noto) lèverait la limite au prix de ~300 Ko par reçu.
- **Remboursement** : total uniquement. Stripe : exécutable depuis le
  back-office pour un don ponctuel (intention de paiement connue) ; une
  échéance d'abonnement se rembourse dans le dashboard Stripe (le webhook
  `charge.refunded` la marque alors automatiquement). PayDunya : pas d'API de
  remboursement — le back-office MARQUE le remboursement, fait à la main.
  Un reçu remboursé garde son numéro (la série reste continue) ; la ligne est
  marquée remboursée.
- **Arrêt d'un abonnement Stripe** : effet immédiat côté plateforme ; si
  l'appel à Stripe échoue, l'erreur est journalisée (« à faire à la main ») —
  vérifier dans le dashboard Stripe.
- **Cotisations en retard** : membres dont la dernière période est échue. Un
  membre qui n'a jamais cotisé n'y figure pas.
- **Relances XOF** : lien envoyé à l'échéance, renvoyé au plus tous les 7
  jours ; après 3 relances sans paiement, l'engagement passe « suspendu ».
- **Suppression de compte** : `deleteUserDataPaiements(ctx, userId)`
  (`convex/lib/payments/ledger.ts`, ré-exportée par
  `convex/payments/member.ts`) détache le compte des pièces comptables
  (conservées : obligation légale), arrête les dons mensuels et efface le
  message libre des dons. À brancher par l'orchestrateur.
- **Devises** : EUR et XOF uniquement ; ajouter une devise = l'ajouter à
  `CURRENCIES`/`currencyValidator` et lui donner un adaptateur.

## 8. Tests

- `convex/payments.test.ts` — signature Stripe (invalide, corps modifié,
  horodatage expiré, rotation), idempotence (rejeu, deux événements pour un
  même paiement, factures d'abonnement), montant incohérent, IPN PayDunya
  (hash faux sans appel réseau, confirmation serveur, rejeu), garde du
  factice, bornes des montants, plafonds, reCAPTCHA.
- `convex/payments-ledger.test.ts` — numérotation continue (y compris
  paiement rejeté entre deux, changement d'année), PDF produit, accès au reçu
  (propriétaire, autre compte, anonyme, admin, jeton), barème et cotisations,
  retards, remboursements, export, relances mensuelles, arrêt, suppression
  de compte.
- `tests/unit/payments.test.tsx` — règles pures et écran « aucun prestataire ».
- `tests/e2e/paiements-don.spec.ts` — don factice → reçu dans l'espace membre
  → transaction au back-office ; annulation.

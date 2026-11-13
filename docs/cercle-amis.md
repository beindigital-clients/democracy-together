# Cercle des Amis — decisions and hand-over notes

Working notes for the "Cercle des Amis" workstream (plan of 2026-11-12, section
A). Each section is written when its feature lands. Everything marked **to
confirm** is awaited from the client (Philippe Kourilsky) and is a placeholder
in the code.

## 1. The "Ami" status — extra role or separate status?

**Decision: a separate status** (`users.amiSince`, plus `users.amiGrantedBy`),
not a new value in `ROLE_ORDER`.

Why:

- Every access guard in the repo reads the **rank** (`requireNetworkRole(ctx,
  'membre')` accepts `membre` and everything above it, ~35 call sites in
  workspaces, tribune, KOHOP, publications, payments…). A rank inserted between
  `visiteur` and `membre` would be silently accepted or refused by dozens of
  call sites written before it existed. The failure mode is a leak, which is
  the one thing this workstream must not produce.
- With a flag, an Ami is a `visiteur` for the whole platform. Nothing that
  already exists changes. The status opens ONE thing: the Cercle's private
  space (`hasCercleAccess`, `requireCercleAccess`).
- A member can hold the status too (granted before they became a member, or
  kept after): it adds nothing on top of the rank, and withdrawing it never
  lowers a member. `cercle.access` reports such an account as `member`.
- Suspension needs no extra code: `requireCercleAccess` is built on
  `requireUser`, which already refuses a suspended account.

Single source: `convex/lib/roles.ts` (`isAmi`, `hasCercleAccess`), shared with
the UI through the `@convex/*` alias. The server guard is
`requireCercleAccess` / `getCercleUser` (`convex/lib/rbac.ts`).

Granting and withdrawing: `users.setAmi` (administrator, audited as
`user.ami_granted` / `user.ami_revoked`), a switch on `/admin/utilisateurs`.
A Cercle request approval (feature 2) grants it too.

Proof: `convex/cercle-access.test.ts` — matrix of anonymous / visitor / Ami /
member / moderator / editor / admin against rank-guarded doors (an Ami must not
pass any) and against the Cercle's own doors (an Ami must pass). New Cercle
functions are added to `CERCLE_PROBES` in that file.
E2E: `tests/e2e/cercle-ami-admin.spec.ts`.

## 2. Request to join the Cercle

Public page `/cercle` (presentation + form), the president's screen
`/admin/cercle` (administrator only), module `convex/cercle.ts`.

**Is `organizations.reviewApplication` reusable? No, its pieces are.** That
mutation grants the `membre` rank, creates a directory profile and sits in the
moderators' queue (moderator rank). A Cercle request grants a status, is
decided by an administrator only, and must never appear in the moderators'
queue. A dedicated table (`cercleRequests`) and mutation (`cercle.reviewRequest`)
reuse the same building blocks: `assertTransition` state machine (decision is
final, a refused person asks again), `normalizeEmail`, account creation by
approval (so the person can sign in by one-time code), audit trail, and the
"reserved test domains get no e-mail" rule.

Behaviour, all enforced server-side:

- A pending request gives NO access: the person has no account yet (accounts
  only exist after approval). A signed-in visitor who asks stays a visitor.
- Form: name, e-mail, optional country and motivation, **CV (PDF, 5 MB)**,
  charter checkbox, notice checkbox. Both boxes are `v.literal(true)` on the
  action's arguments. The versions of the charter and of the notice are stored
  with the request (`consent`), like the newsletter's consent proof.
- **CV upload goes through an HTTP action** (`POST /cercle/cv`,
  `convex/cercleHttp.ts`), not a storage upload URL: the endpoint is anonymous,
  so it checks the per-IP/global caps BEFORE reading the body, the size, and the
  `%PDF-` signature before storing anything. The returned id is recorded in
  `cercleUploads`; only such an id can be attached to a request, once. An id
  nobody attaches is deleted (blob + row) after 24 h by an hourly cron.
- CV use (stated in the notice): read by administrators only; every opening is
  an audited mutation (`cercle.cv_viewed`); **deleted at once when the request
  is refused**; kept for an approved Ami until the account is deleted
  (account deletion and the "mes données" export cover it:
  `convex/lib/cercleUserData.ts`).
- Approval: creates a plain `visiteur` account with the Ami status (or adds the
  status to the existing account, never touching its rank) and e-mails a
  sign-in invitation. Refusal: e-mail with no outcome in the subject, the
  reviewer's note never travels.
- Receipt, approval and refusal e-mails exist in the five site languages
  (`convex/lib/cercleEmails.ts`) and echo nothing the person typed.
- Existence oracle: submitting never says whether an address already has an
  account.

CSP: a local/self-hosted deployment serves HTTP actions from another origin
than its API; `convexSiteCspOrigins` opens it in `connect-src` (nothing is added
for a Convex cloud deployment: `*.convex.site` was already allowed).

Tests: `convex/cercle-request.test.ts`, `convex/cercle-upload.test.ts`,
`tests/unit/convex-origins.test.ts`; e2e `tests/e2e/cercle-demande.spec.ts`.

**To confirm with the client:** the final charter text (the 4 commitments in
`messages/*.json` namespace `cercle` are a clearly marked draft, version
`2026-11-draft`); CV retention for approved Amis; who is alerted when a request
arrives (today: nobody, the president opens `/admin/cercle`); whether other
people than the administrators should decide.

## 3. Private contributions space

Screen `/espace-membre/cercle` (a "Cercle des Amis" entry in the member-area
navigation, offered to Amis and to members and above), module
`convex/cercleContributions.ts`, table `cercleContributions`.

- Visible only to the Cercle: every function goes through
  `requireCercleAccess`, so a visitor without the status, an anonymous caller
  and a suspended Ami are refused **by the server**. The interface mirrors that
  decision (`cercle.access`) and shows a closed door otherwise; the open page
  reacts live when the status is withdrawn.
- Separate from the public KOHOP contributions: its own table and functions,
  no shared query that could list one in the other.
- Submission: free text from 10 to 5,000 characters, several submissions
  allowed, 20 per account and per day. Reading: everything the Cercle has
  written, newest first, paginated. The author is shown by display name, never
  by address ("A Friend of the Circle" when no name is set).
- Taking down: the author removes their own contribution (text erased, a
  tombstone stays); moderators and above can remove any, audited
  (`cercle.contribution_removed`).
- Account deletion deletes the account's contributions; the "mes données"
  export returns them.

Tests: `convex/cercle-contributions.test.ts`, the access matrix
(`CERCLE_PROBES` in `convex/cercle-access.test.ts`), the navigation rules
(`tests/unit/member-area-rules.test.ts`); e2e `tests/e2e/cercle-espace.spec.ts`.

## 4. Leak control before opening

The Cercle's text (contributions, requests, CVs) must not reach the public
site. Audit of each path, and what now pins it:

| Path | Finding | Pinned by |
| --- | --- | --- |
| Publication list, public lists (news, events, partners, press, replays, themes, KOHOP, tribune, directory, experts) | Each reads its own tables; none can reach a Cercle table | `convex/cercle-leaks.test.ts` asks all of them (anonymous, plain visitor, suspended Ami, member) with markers in every Cercle table; a control marker in a published publication proves the calls return real data |
| Search | `SEARCH_SOURCES` is a closed list (publications, organizations, tribune, kohop, experts); no Cercle table has a search or vector index or a `search*` field | `convex/cercle-leaks.test.ts` (schema inspection + `globalSearch` / `searchBySource`) and `tests/unit/cercle-leaks.test.ts` (search modules never mention the Cercle) |
| Sitemap, robots | The sitemap lists the public `/cercle` page only; the private space is under `/espace-membre`, disallowed by robots.txt and behind sign-in at the HTTP level | `tests/unit/cercle-leaks.test.ts`, e2e `tests/e2e/cercle-fuites.spec.ts` (real `/sitemap.xml`, `/robots.txt`, anonymous redirect) |
| Convex HTTP and Next routes | The only Cercle HTTP route is the anonymous CV upload (POST + CORS preflight), which answers with an id and never reads a table; no `route.ts` mentions the Cercle; no server-side `fetchQuery` of a Cercle function exists | `tests/unit/cercle-leaks.test.ts`, e2e (GET on the endpoint → 404/405) |
| Automatic translation | `translationSourceType` is a closed union (tribune post, publication): a Cercle source is refused by the validator, and the translation modules never mention the Cercle | `convex/cercle-leaks.test.ts`, `tests/unit/cercle-leaks.test.ts` |
| Who can read a Cercle table at all | Only `cercle.ts`, `cercleContributions.ts` and the account-data adapter | `tests/unit/cercle-leaks.test.ts` fails if any other module names one (verified by a mutation: adding a read to `publications.ts` turns it red) |

### AI moderation — DECISION TO FLAG TO THE CLIENT

AI moderation (`convex/aiModeration.ts`, `communityModeration.ts`) sends the
text to a third-party model provider through the AI Gateway. **Default chosen:
private contributions are NOT sent to it.** Nothing in
`convex/cercleContributions.ts` imports or schedules the moderation, no network
call is made when one is submitted, read or removed, and the "no scheduled
function, no `fetch`" behaviour is tested even with moderation set to `auto`
(`convex/cercle-leaks.test.ts`).

Consequence: nobody reviews a private contribution before it is read by the
other Amis. The safeguards are the charter, the Cercle's closed membership
(every Ami was accepted by the president), the author's own removal and staff
removal (moderators and above, audited). If the client wants contributions
screened, the options are (a) a human review queue before display, (b) the AI
moderation, which requires an explicit decision since it sends private text to
a third party, to be stated in the notice shown at the request form.

### Residual risks, accepted and written down

- A CV URL (`cercle.openCv`) is a Convex storage URL: anyone holding it can
  fetch the file until the file is deleted. It is handed only to an
  administrator's browser, and each handing is audited. It is never stored.
- Several existing features accept a storage id from the client (workspace
  files, project calls, peer review, annual reports). Ids are unguessable and a
  CV id is only ever shown inside a URL to an administrator; the Cercle does not
  add a path from one to the other, but it does not forbid it either.
- Uploads of valid PDFs that are never attached to a request are deleted after
  24 hours (hourly cron), bounded by the per-IP and global caps.

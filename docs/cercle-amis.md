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
arrives (an e-mail alert exists, § 11: it needs `CERCLE_ALERT_EMAILS`); whether other
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

## 5. The Cercle's mailing list

Separate from the public newsletter: its own table (`cercleContacts`), its own
confirmation, unsubscribe and footer. Modules `convex/cercleMailing.ts`,
`convex/lib/cercleMailing*.ts`, `convex/lib/cercleContacts.ts`; screens under
the "Liste de diffusion" tab of `/admin/cercle`, public pages
`/cercle/confirmation` and `/cercle/desinscription`.

**One engine, two lists.** The campaign engine of `convex/newsletter.ts`
(batches, idempotency keys, lease and resume, failure tracking, retry) now
serves two audiences. A campaign has an `audience` (`newsletter` by default,
or `cercle`); a delivery row points to a newsletter subscription or to a Cercle
contact; enqueue, claim and render branch on the audience in one place each.
The two lists never share a recipient (tests send a Cercle campaign and a
newsletter campaign over both lists and check who got what). A separate table,
rather than a `list` field on `newsletterSubscriptions`, so that no query meant
for one list can reach the other, and so that one address can sit on both.

Two ways onto the list:

- **A request accepted by the president**: the person is put on the list as
  `confirmed`, with the version of the notice they accepted at the form as
  proof (the form told them, before sending, that they would receive the
  Cercle's news). An earlier unsubscribe is lifted by this new, informed
  request.
- **CSV import by an administrator** (one address per line, or a table with an
  `email` column and an optional language column; 500 rows per import; test
  domains are counted and ignored). These people asked for nothing, so they are
  `pending` and **receive exactly ONE message: a confirmation request** — the
  legal point of the plan. Nothing else is sent to them until they click. The
  link is single use and valid 30 days; without a click, the row is deleted at
  its deadline. No reminder is ever sent; a message that failed to *send* is
  retried, bounded to 3 sends in all.

**Unsubscribing** keeps a suppression entry (`unsubscribed`): a re-import never
writes to someone who said no. Every message carries the unsubscribe link in
its footer and the one-click `List-Unsubscribe` headers (RFC 8058); the GET on
the one-click address only redirects to the page, so a prefetching antivirus
unsubscribes nobody.

**Footer and sender identity.** Every message ends with the association's name
and postal address. They are Convex environment variables
(`CERCLE_SENDER_NAME`, `CERCLE_SENDER_ADDRESS`), **placeholders marked
"[À CONFIRMER …]" until Philippe supplies them**, and while a placeholder is
left, **sending to real recipients is refused** (confirmation wave and campaign;
a simulated development send is allowed). The president's screen says so.

Sending: the confirmation message goes in waves at the cadence of every campaign
(`NEWSLETTER_BATCH_SIZE`, `NEWSLETTER_RATE_PER_MINUTE`, read on each wave).
Account deletion removes the person's place on the list; the data export includes it.

Tests: `convex/cercle-mailing.test.ts` (parsing, import, waves, outage and retry,
confirm, unsubscribe, purge, HTTP one-click, the two audiences kept apart,
sender-identity guard), `tests/unit/cercle-leaks.test.ts`; e2e
`tests/e2e/cercle-liste.spec.ts`.

**To confirm with the client:** association name and postal address; the exact
wording of the confirmation message (in particular how the contacts' origin is
described — the draft only says the address is "in our contacts"); who may
import and send (today: administrators import, editors compose and send, like
the newsletter); the recipient list itself.

## 6. Sending in waves

What changed in the campaign engine (`convex/newsletter.ts`,
`convex/lib/newsletterDelivery.ts`), for the Cercle's list and — where noted —
the newsletter too. All of it is enforced by the server.

**Cadence, tuned to the sending service (Resend today).**

- *Request rate.* Resend allows 2 requests per second per account, shared with
  every other message the platform sends (sign-in codes, receipts), and a batch
  request carries up to 100 messages. So it is the pause between two batches that
  has to stay above 1/rate. The floor was 200 ms (5 requests/s) and is now
  `MIN_INTERVAL_MS = 600` (~1.7 requests/s). The defaults are unchanged and
  gentle: batches of 50 every 5 s (600 messages a minute), tunable with
  `NEWSLETTER_BATCH_SIZE` and `NEWSLETTER_RATE_PER_MINUTE`, read on every batch.
- *Daily quota.* `EMAIL_DAILY_LIMIT` (unset = no cap) is the sending service's
  daily allowance. The platform counts what it sent per UTC day (`emailQuota`:
  campaigns and confirmation messages), shrinks a batch to what is left, and when
  the day's quota is spent the campaign **pauses and resumes by itself at the next
  UTC midnight**, the screen saying until when. A list larger than the quota
  therefore goes out over several days instead of failing its tail. This is also
  the lever for *warm-up* of a new sending domain: start with a low cap and
  raise it. Applies to the newsletter as well (one account at the provider).

**Waves released by hand (Cercle campaigns).** `sendCampaign` takes an optional
`waveSize`: the campaign serves that many recipients, then is held `paused`;
nothing is scheduled until an editor calls `releaseNextWave` (audited). The gap
is the time to look at what the first wave produced — failures, bounces, replies
— before going on. Not offered on the newsletter, whose screen does not know the
`paused` state.

**Failure tracking and retry.** Unchanged engine behaviour, now visible for the
Cercle: a transient failure resumes the same batch with the same idempotency key
(no duplicate), three failed attempts mark the rows failed, `campaignFailures`
groups the reasons and the new `campaignFailedRecipients` names the addresses;
`retryFailedDeliveries` re-queues only the failed ones (never someone already
served). A Cercle retry is refused while the sender identity is a placeholder.

**Internal test before the full list.** `sendTestCampaign` accepts up to 5
addresses, which must be **team accounts** (moderator and above, not suspended):
an open field would make the platform write to strangers, and the refusal for an
unknown address is the same as for a non-team one, so a test cannot be used to
find out who has an account. Every version goes to each address, subject prefixed
`[TEST]`, with a dummy unsubscribe token. **A Cercle campaign cannot be sent to
its list unless a test went out after its last change** (`TEST_REQUIRED`); the
newsletter keeps its own rule (no test required, as before).

The screen is the "Messages" tab of `/admin/cercle`: draft, team test, send (all
at once or in waves), progress, held-between-waves and daily-quota notices,
failures and retry.

Tests: `convex/cercle-waves.test.ts` (cadence floor, daily quota over days for
campaigns and confirmations, waves, failure list and retry, internal test and its
gate); e2e `tests/e2e/cercle-messages.spec.ts`.

**Recommended, not built:** wire the provider's bounce and complaint webhooks to
mark the matching contact `unsubscribed` (a bounced or complaining address kept on
the list damages the sender's reputation), and a per-campaign open/click view if
the association wants one. Translations of a Cercle message are supported by the
engine (`upsertCampaignVariant`) but have no screen yet: a message goes out in
its reference language.

**To confirm with the client:** the daily limit of the Resend plan to be used and
whether a warm-up schedule is wanted; the size of the first wave; who may send
(the Cercle screen is administrator-only today, the server accepts editors, so
David Ojcius's account either gets the administrator rank or the screen is
opened to editors).

## 7. Account security for the Amis

**Immediate suspension — verified.** The suspension that already existed
(`accounts.suspendAccount`, administrator, reason required) deletes the account's
sessions and refresh tokens, and every guard reads the suspension, so a token
still in hand opens nothing. For an Ami this means: every Cercle door answers
`ACCOUNT_SUSPENDED`, `cercle.access` says `none`, the account's earlier
contributions stay readable by the others, reactivation restores everything. One
thing was added: **a suspended Ami no longer receives the Cercle's news** (the
campaign engine skips a contact whose account is suspended; their contact row is
untouched, so reactivation puts them back). Withdrawing the status
(`users.setAmi`) is just as immediate. Tests: `convex/cercle-security.test.ts`,
e2e `tests/e2e/cercle-securite.spec.ts`.

**Second factor — study and recommendation: do NOT enforce it on the Amis at
launch; DO switch it on for the staff before opening.**

What exists: TOTP, enforced from the moderator rank when the policy
`twoFactorRequiredForStaff` is on, and open to any account that wants it from its
security screen. An Ami who enrolls is held to it (a new sign-in without the
code opens nothing: tested). The staff requirement does not reach an Ami (tested).

Why not enforce it on the Amis:

- Amis sign in by a one-time e-mail code. Adding a second factor to a volunteer
  population is the friction most likely to cost the Cercle members, for little
  gain: an Ami holds no staff power, sees only free-text contributions shown by
  first name, and cannot reach a CV, the mailing list or any administration.
- What an attacker gains by taking over an Ami's mailbox is reading and writing in
  a closed circle that the president already admitted person by person; both are
  cut instantly by a suspension.

If the client decides otherwise, the extension is small and local: a
`twoFactorRequiredForAmis` field on `securitySettings`, one extra condition in
`evaluateAccess` (`convex/lib/accountAccess.ts`, next to `roleRequiresTwoFactor`,
reading the policy only for an Ami), the same two safeguards `setSecurityPolicy`
already applies (key configured, the administrator enabling it has enrolled), and
a second switch in the policy panel. It was not built: it would change the
sign-in experience of accounts that never had a staff screen, with no e2e
coverage of that path, for a threat the closed-circle design already bounds.

**The point that matters before opening — the staff 2FA policy is OFF by
default** (`DEFAULT_SECURITY_POLICY`, a deliberate choice for the shared test
deployment). The Cercle makes administrators the holders of personal data: they
open CVs and import contact lists. **Enable the staff requirement before the
Cercle opens** (`/admin`, the two-factor panel; the dashboard warns until it is
done). With it on, an administrator without an enrolled device is stopped before
any CV or import (tested).

## 8. Later — not built, with its extension point

Depending on Philippe's decision, the Cercle could grow **sponsorship by an
existing Ami**, a **read-only first stage** for the sponsored person, and a
**review of their first contributions** before they can write; and an **AI summary
of a CV, only to help sort requests — never a score, a ranking or a label on a
person**. None of it is built. What is in place so that adding it does not
reopen what exists: every Cercle door already asks for a level —
`requireCercleAccess(ctx, 'read' | 'write')` — and `cercleAccessLevel`
(`convex/lib/roles.ts`) is the one function that maps an account to `none`,
`read` or `write` (today: all or nothing, pinned by a test). A sponsored Ami
starting read-only is then one field on the account and one branch in that
function, with the request carrying an optional sponsor; the review of first
contributions is a `pending` state on `cercleContributions` filtered by the list
query. Two conditions to settle first: the AI summary sends a CV to a third-party
model, so it needs the same explicit decision as the AI moderation (§ 4), the
notice shown at the request form updated, and an output limited to a neutral
summary shown to the president next to the CV, never stored as a field on the
person.

## 9. CV summary by an automatic tool (OFF by default)

When the president opens a pending request, a short neutral summary of the CV can
be there to help sort: studies, experience, languages, themes. **A human always
decides.** Module `convex/cercleCvAi.ts`, rules `convex/lib/cercleCvAi.ts`; it
reuses the repo's AI client (`convex/lib/aiGateway.ts`, `runStructured` with the
PDF attached, schema-constrained output).

**What it does NOT do — on purpose.** No score, rank, grade, label, rating, risk
or "deviation" flag, no recommendation to accept or refuse, no automatic decision,
and no inference about age, gender, origin, religion, health, family or opinions.
Philippe mentioned "spotting deviances": **that is not built and should not be**.
Detecting deviant profiles from a CV is profiling of people on sensitive grounds
(GDPR art. 22 on automated decisions, art. 9 on special categories) with a
legal risk the association should not take for a sorting convenience. Three
guarantees back this, all tested (`convex/cercle-cv-ai.test.ts`): the tool's
output schema has five fields (overview, education, experience, languages,
themes) and nothing that could carry a verdict; whatever else a model returns —
a `score`, a `risk` — is dropped when the answer is read (`readCvSummary`); the
stored summary has no such field either.

**Three gates, all server-side.** Nothing leaves the deployment unless all hold:
1. the deployment switch `CERCLE_CV_AI_ENABLED=true` (anything else is off; the
   default, and the state to ship in production);
2. the person's own **optional** consent, a checkbox at the request form shown only
   when the switch is on (`cvAiConsent`, with the notice version). Optional, so
   that consent is free: without it only a human reads the CV;
3. the request still pending, with its CV on file (a summary that finishes after a
   decision is dropped).

**What is kept.** Only the summary, next to the CV, and for the same time: a
refusal deletes the summary with the CV; account deletion deletes the request and
therefore the summary; an approved Ami's summary stays with their CV. The
administrator's screen shows it with a standing note that it scores no one and
decides nothing, and a retry button when the tool failed (audited). It is part of
the list query, which is administrator-only; nobody else reads it. A failure of
the tool leaves the request as it was: a human reads the CV.

**Key, notice and cost — read before turning it on.**
- One AI Gateway key serves the test and the production deployments (the same
  `AI_GATEWAY_API_KEY` the moderation and KOHOP checks already use). It lives
  only in the Convex environment of each deployment — never in code, a commit, a
  log or this documentation, and never under a `NEXT_PUBLIC_` name. It is copied
  there by script from the owner's private secrets file, without being printed.
- Tests use a substitute `fetch` and fictitious CVs only. The e2e uses a canned
  summary (`CERCLE_CV_AI_MOCK=true`, honoured **only** where `AUTH_DEV_OTP=true`,
  never in production), so no CV reaches any provider.
- **The applicant notice must be live before the switch is turned on in
  production.** Real CVs go to a third-party provider the moment it is on; the
  notice (fr/en/es/pt/ar in `messages/*.json`, namespace `cercle`, keys
  `cvAiTitle`, `cvAiNotice`, `acceptCvAi`; version `2026-11-draft`) is what tells
  people so, and it is shown on the form whenever the switch is on. It must be
  approved as true of the provider actually used.
- **Real CVs: the owner's written authorization is recorded.** The gateway key is
  a trial key, and the owner's rule is that no real client data goes through it
  without their written go. On 2026-11-13, in the chat of the working session, the
  owner answered "Oui, les deux" to the question whether real candidate CVs may be
  sent to the AI provider through their AI Gateway key. That authorization holds
  **once the candidate notice is live**. It does not turn the switch on: enabling
  `CERCLE_CV_AI_ENABLED` in production still needs the notice live and the owner's
  go on the exact command.
- **Cost.** Usage is billed to the owner's AI Gateway account. Set a spending
  limit in the gateway dashboard before turning the tool on.
- Model: `CERCLE_CV_AI_MODEL` (default `anthropic/claude-sonnet-5.5`).

To turn it on, once the notice is live, the owner has given their written go and
a spending limit is set: make sure `AI_GATEWAY_API_KEY` is present on the
deployment (`npx convex env list --names-only`), then
`npx convex env set CERCLE_CV_AI_ENABLED true`. To turn it off:
`npx convex env set CERCLE_CV_AI_ENABLED false` (summaries already stored stay
until their CV goes).

## 10. Production release checklist for this change

Nothing below has been run. Each command waits for the owner's go.

**Where the live app runs today.** `docs/deploiement.md` (§ "Déploiement en
cours") says the site is served by the **development** deployment
`dev:rare-alpaca-677`, not a separate production one, and that the Vercel build
**never pushes Convex**: merged Convex code is pushed by hand, from a clean copy of
`main`. Replace the target below if the client has since moved to a production
deployment (then use `npx convex deploy` and the `--prod` flags of
`deploiement.md` § 2).

**A. Before anything: the PR.** Merge to `main` only when CI is green and the
Convex check passes (the owner merges: `gh pr merge <n> --merge`).

**B. Convex — schema, crons, no data migration.** The push adds tables
(`cercleRequests`, `cercleUploads`, `cercleContributions`, `cercleContacts`,
`emailQuota`), fields on `users` (`amiSince`, `amiGrantedBy`), on
`newsletterCampaigns` (`audience`, `status: 'paused'`, `editedAt`, `waveLimit`,
`pausedUntil`) and on `newsletterDeliveries` (`subscriptionId` becomes optional,
`contactId`), their indexes, two HTTP routes (`/cercle/cv`, `/cercle/unsubscribe`)
and two new crons (`cercle-purge-unclaimed-uploads`,
`cercle-purge-pending-contacts`). All additions are optional or new: **existing
documents stay valid, no backfill is needed**. The existing newsletter keeps
working unchanged (audience missing = newsletter).
```bash
git fetch origin
git worktree add --detach /tmp/dt-convex-push origin/main
cd /tmp/dt-convex-push && pnpm install --frozen-lockfile
pnpm typecheck:convex
CONVEX_DEPLOYMENT=dev:rare-alpaca-677 npx convex dev --once
npx convex function-spec   # check: cercle.*, cercleContributions.*, cercleMailing.*, cercleCvAi.* are there
cd - && git worktree remove --force /tmp/dt-convex-push
```
Then check in the Convex dashboard that the two new crons are listed.

**C. Convex environment variables** (`npx convex env set`, deployment, never Vercel):

| Variable | Value | Needed to go live? |
|---|---|---|
| `SITE_URL` | the public site origin (already set; links in the Cercle's e-mails use it) | already there |
| `CERCLE_ALERT_EMAILS` | who is told by e-mail when a request arrives (comma separated; § 11) | optional — unset: nobody is told, nothing fails |
| `CERCLE_SENDER_NAME`, `CERCLE_SENDER_ADDRESS` | association name and postal address | **not to go live, required before any real sending** (refused while unset) |
| `AUTH_RESEND_KEY`, `AUTH_EMAIL_FROM` | the client's own sending key and a verified domain | before real sending (the test `onboarding@resend.dev` sender writes only to the account owner) |
| `EMAIL_DAILY_LIMIT` | the daily quota of the Resend plan | recommended before the first real send (free plan: 100/day) |
| `NEWSLETTER_BATCH_SIZE`, `NEWSLETTER_RATE_PER_MINUTE` | optional; defaults are gentle | no |
| `CERCLE_CV_AI_ENABLED` | **leave unset (off)** | no — turn on only once the notice is live, the owner has given their written go and a gateway spending limit is set (§ 9) |
| `AI_GATEWAY_API_KEY` | the same key as on the test deployment, copied by script from the private secrets file (never printed, never `NEXT_PUBLIC_`); exact command to be run by the owner, or on their go | only for the CV tool (and the existing moderation / KOHOP checks) |
| contributions mailbox address (Zoho) | **to be given by the owner** — not guessed. It is not wired to anything yet: decide where it must appear (Cercle message footer, `Reply-To`, request confirmation) before it becomes a variable | open question |
| `AUTH_DEV_OTP`, `RECAPTCHA_DISABLED`, `CERCLE_CV_AI_MOCK` | ⛔ never in production | — |

**D. Staff 2FA** — enable the requirement before opening: `/admin`, the two-factor
panel (the enabling administrator must have enrolled a device first). Philippe
agreed to wait on 2FA for the **Amis**; this is the **staff** one, which protects
CVs and imports (§ 7).

**E. Vercel** — the app: merge to `main` triggers the build as usual. The build
needs `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL` (the latter is
what the CV upload posts to; already set if the site was built from the repo
config — check it, a missing value breaks only the request form). The CSP opens
`*.convex.site`, nothing to add.

**F. Order of operations.** (1) PR green and merged by the owner. (2) Push Convex
(B) **before** or together with the Vercel deploy: the site calls
`api.cercle.*`, and a site deployed first would hit "Could not find public
function". (3) Set the variables of C that apply. (4) Enable staff 2FA (D).
(5) Smoke test on the live site (below). (6) Tell Philippe it is live.

**G. Smoke test, no real person involved.** Sign in as the administrator →
`/admin/cercle` opens, three tabs. Open `/fr/cercle` signed out → the form shows,
no CV-tool checkbox (switch off). Send a request with a fictitious address on a
reserved test domain and a dummy PDF → it appears pending; refuse it → its CV is
gone. `/fr/espace-membre/cercle` signed out → redirected to sign-in.
`/sitemap.xml` lists `/fr/cercle` and nothing under `espace-membre`.

**H. What still blocks REAL sending** (the site can go live without it: sending is
refused until these are set): association name and postal address; the final
charter text (the 4-line draft is shown to applicants until replaced, version tag
`2026-11-draft`); the client's own sending key and verified domain; the recipient
list and the date. Until then Amis can be accepted and can use the private space,
but no message — not even the confirmation request — leaves the platform.

**I. Rollback.** The site can be rolled back on Vercel at once. The Convex additions
are inert if the old front is served (nothing reads them); do not delete tables.
To stop all Cercle sending immediately: unset `CERCLE_SENDER_NAME`.

## 11. E-mail alert when a request arrives

A request waits for the president's decision on `/admin/cercle`, and nothing told
anyone it was there. A new pending request now schedules an e-mail alert
(`convex/cercle.ts`: `scheduleRequestAlert` in the request's transaction, then the
internal action `sendRequestAlert`; rules in `convex/lib/cercleAlert.ts`, template
in `convex/lib/cercleEmails.ts`).

- **Who:** the addresses of the Convex variable `CERCLE_ALERT_EMAILS` (comma,
  semicolon or space separated, 5 at most). No address in the code. **Unset or
  empty: nobody is told and nothing fails** — the request is stored as before.
  Invalid addresses and reserved test domains are dropped. The real addresses
  (Philippe's, the contributions mailbox, perhaps others) are still to be given.
- **What it says:** that a request is waiting, how many are, and a link to
  `/admin/cercle` built from `SITE_URL`. **Never** the applicant's name, address,
  motivation, CV or summary (tested). Language: the recipient account's
  preference when the address has an account, French otherwise.
- **Throttle — choice made:** at most one alert per 15 minutes. The first request
  in a while tells at once and starts the window; the ones that follow inside it
  are covered by **one follow-up scheduled for the window's end**, which reports
  the count then (dropped if every request was decided meanwhile). Decided in the
  request's transaction, so two simultaneous requests cannot both tell. The state
  is one row of two timestamps (`cercleAlertState`).
- **Like the receipt:** a request from a reserved test address tells no one. A
  failure to send never fails or blocks the request (the alert only schedules an
  action); each recipient is tried on its own, and the log counts the failures
  without writing the addresses.

Tests: `convex/cercle-alert.test.ts` (rules, then the whole path from the public
action to the e-mails sent).

**Check before the announcement — e-mail on `rare-alpaca-677` (read on 2026-11-13).**
`convex/email.ts` only simulates (logs `[DEV EMAIL]`, sends nothing) when **no**
provider key is set and `AUTH_DEV_OTP=true`. On `rare-alpaca-677` both
`AUTH_DEV_OTP=true` and `AUTH_RESEND_KEY` are set, and the provider wins: mail is
handed to Resend, so the applicant's receipt, the decision e-mails and this alert
are **not** simulated there. What decides whether they reach a person is the
sender: `AUTH_EMAIL_FROM` is `Democracy Together <no-reply@lecombatdalya.org>`, a
domain that is not Democracy Together's. Whether Resend has it verified for that
key was **not checked** (it needs a call with the key). Without a verified domain
Resend refuses, or delivers only to the account owner, and every send fails
silently from the applicant's side. Before the announcement: confirm the sending
domain is verified and is the one the association wants, set `AUTH_EMAIL_FROM`
accordingly, and remove `AUTH_DEV_OTP` and `RECAPTCHA_DISABLED` from the
deployment (`docs/deploiement.md` § 1.1: dev-only switches that open the test
surface, including readable sign-in codes).

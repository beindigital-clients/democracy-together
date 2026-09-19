import { execFileSync } from 'node:child_process';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';

// TEMPORAIRE (issue #66) — sonde de diagnostic, retirée avec le correctif.
//
// Elle tourne en PAS D'ATELIER, après la suite Playwright (`if: always()`), et
// non comme une spec : le rapport tombe ainsi en FIN de log, là où il se lit
// sans rapatrier les 3 700 lignes du job.
//
// Ce qu'elle établit, dans l'ordre des maillons suspects :
//   1. la CLI écrit-elle (c'est ce que fait `provisionUser`) ;
//   2. relit-elle sa propre écriture (`created:false` au second appel) ;
//   3. l'application, jointe par la MÊME url que le navigateur, accepte-t-elle
//      la demande de code — l'étape exacte où meurent les 15 specs ;
//   4. que rend vraiment une relecture CLI, en sortie brute (le parsing
//      « dernière ligne non vide » de `tests/e2e/_helpers.ts` en dépend).

const preview = process.env.CONVEX_PREVIEW_NAME;
const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const email = `e2e_sonde_${Date.now()}@democracytogether.test`;

function cli(fn, args) {
  const env = { ...process.env };
  delete env.CONVEX_DEPLOYMENT;
  try {
    return execFileSync(
      'npx',
      [
        'convex',
        'run',
        ...(preview ? ['--preview-name', preview] : []),
        fn,
        JSON.stringify(args),
      ],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], env },
    );
  } catch (e) {
    return `__ÉCHEC__ stdout=${JSON.stringify(e.stdout)} stderr=${JSON.stringify(e.stderr)}`;
  }
}

console.log('===== SONDE #66 =====');
console.log('NEXT_PUBLIC_CONVEX_URL =', url ?? '(absente)');
console.log('CONVEX_PREVIEW_NAME    =', preview ?? '(absente)');
console.log(
  'CONVEX_DEPLOYMENT      =',
  process.env.CONVEX_DEPLOYMENT ?? '(absente)',
);
console.log(
  'CONVEX_DEPLOY_KEY      =',
  process.env.CONVEX_DEPLOY_KEY
    ? `(présente, préfixe ${process.env.CONVEX_DEPLOY_KEY.split(':')[0]})`
    : '(absente)',
);
console.log('e-mail de la sonde     =', email);

console.log('----- 1) CLI setRoleByEmail (création attendue) -----');
console.log(cli('devAdmin:setRoleByEmail', { email, role: 'visiteur' }).trim());

console.log(
  '----- 2) CLI setRoleByEmail à nouveau (created:false attendu) -----',
);
console.log(cli('devAdmin:setRoleByEmail', { email, role: 'visiteur' }).trim());

console.log('----- 3) auth:signIn otp-signin via NEXT_PUBLIC_CONVEX_URL -----');
if (!url) {
  console.log('pas d’URL, rien à tenter');
} else {
  const client = new ConvexHttpClient(url);
  const signIn = makeFunctionReference('auth:signIn');
  try {
    const res = await client.action(signIn, {
      provider: 'otp-signin',
      params: { email },
    });
    console.log('SIGNIN OK    :', JSON.stringify(res));
  } catch (e) {
    console.log('SIGNIN ERREUR:', e instanceof Error ? e.message : String(e));
  }
}

console.log('----- 4) CLI otp:latestDevCode (sortie brute) -----');
console.log(JSON.stringify(cli('otp:latestDevCode', { email })));
console.log('===== FIN SONDE #66 =====');

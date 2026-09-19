import { test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';

// TEMPORAIRE (issue #66) — sonde de diagnostic, à retirer une fois la cause
// établie. Les 15 specs qui ouvrent une session échouent toutes à la DEMANDE de
// code, et les oracles de relecture rendent `null` : la sonde vérifie les trois
// maillons qui expliqueraient les deux symptômes à la fois — la CLI écrit-elle
// là où l'application lit, l'application accepte-t-elle la demande de code, et
// la relecture CLI rend-elle bien quelque chose d'analysable.
//
// Le rapport est porté par le MESSAGE D'ÉCHEC, et non par console.log : le
// reporter `github` (celui de la CI) n'affiche pas systématiquement la sortie
// standard d'un test qui passe, alors qu'il imprime toujours l'erreur.

const report: string[] = [];
function log(...parts: unknown[]): void {
  const line = parts
    .map((p) => (typeof p === 'string' ? p : JSON.stringify(p)))
    .join(' ');
  report.push(line);
  console.log(line);
}

function cli(fn: string, args: Record<string, unknown>): string {
  const env = { ...process.env };
  delete env.CONVEX_DEPLOYMENT;
  const preview = process.env.CONVEX_PREVIEW_NAME;
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
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return `__ÉCHEC__ stdout=${JSON.stringify(err.stdout)} stderr=${JSON.stringify(err.stderr)} message=${err.message}`;
  }
}

test('SONDE #66 : où écrit la CLI, et que répond la demande de code', async () => {
  const email = `e2e_sonde_${Date.now()}@democracytogether.test`;

  log(
    'NEXT_PUBLIC_CONVEX_URL =',
    process.env.NEXT_PUBLIC_CONVEX_URL ?? '(absente)',
  );
  log(
    'CONVEX_PREVIEW_NAME    =',
    process.env.CONVEX_PREVIEW_NAME ?? '(absente)',
  );
  log('CONVEX_DEPLOYMENT      =', process.env.CONVEX_DEPLOYMENT ?? '(absente)');
  log(
    'CONVEX_DEPLOY_KEY      =',
    process.env.CONVEX_DEPLOY_KEY
      ? `(présente, préfixe ${process.env.CONVEX_DEPLOY_KEY.split(':')[0]})`
      : '(absente)',
  );
  log('e-mail de la sonde     =', email);

  // 1) La CLI écrit-elle ? (c'est ce que fait provisionUser)
  log('--- 1) CLI setRoleByEmail, création attendue ---');
  log(cli('devAdmin:setRoleByEmail', { email, role: 'visiteur' }).trim());

  // 2) La CLI relit-elle sa propre écriture ? (created doit passer à false)
  log('--- 2) CLI setRoleByEmail à nouveau, created:false attendu ---');
  log(cli('devAdmin:setRoleByEmail', { email, role: 'visiteur' }).trim());

  // 3) L'application, jointe par la MÊME url que le navigateur, accepte-t-elle
  //    la demande de code ? C'est l'étape exacte où les 15 specs meurent.
  log('--- 3) auth:signIn otp-signin via NEXT_PUBLIC_CONVEX_URL ---');
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    log('pas d’URL, rien à tenter');
  } else {
    const client = new ConvexHttpClient(url);
    try {
      const res = await client.action(api.auth.signIn, {
        provider: 'otp-signin',
        params: { email },
      });
      log('SIGNIN OK    :', JSON.stringify(res));
    } catch (e) {
      log('SIGNIN ERREUR:', e instanceof Error ? e.message : String(e));
    }
  }

  // 4) Relecture du code : sortie BRUTE, pour juger le parsing « dernière ligne
  //    non vide » de _helpers.convexRunQuery.
  log('--- 4) CLI otp:latestDevCode, sortie brute ---');
  log(JSON.stringify(cli('otp:latestDevCode', { email })));

  // Échec DÉLIBÉRÉ : c'est ainsi que le rapport traverse le reporter `github`.
  throw new Error(`SONDE #66 — rapport\n${report.join('\n')}`);
});

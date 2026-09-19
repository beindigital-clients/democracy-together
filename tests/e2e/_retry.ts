// Rejoue une opération dont l'échec est un incident de TRANSPORT, jamais une
// erreur applicative. La suite parle à un déploiement Convex distant, et chaque
// appel ci-dessous ouvre sa propre connexion : `getOtp` en déclenche jusqu'à 24
// pour une seule connexion. Sous cette rafale, la première exécution réelle des
// E2E a rendu 18 `TypeError: fetch failed` et 4 `ECONNRESET` — la préversion
// répondait pourtant (le seed du workflow venait de passer).
//
// Le filtre est volontairement ÉTROIT : on ne rejoue que les pannes de
// transport nommées ci-dessous. Une fonction Convex qui lève (validateur,
// autorisation, argument invalide) remonte immédiatement — sinon un défaut
// applicatif deviendrait une attente de 3 secondes suivie du même échec, en
// moins lisible.
const TRANSPORT =
  /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network|Connection closed/i;

// Aplatit en texte ce qu'une erreur peut porter. `execFileSync` lève une Error
// dont `stderr` est un Uint8Array (vérifié, pas supposé) et dont le `message`
// contient DÉJÀ la sortie d'erreur ; `ConvexHttpClient`, lui, chaîne la panne
// réseau dans `cause`. On lit les trois, sans jamais laisser un objet tomber
// dans `[object Object]`.
function text(value: unknown, depth = 0): string {
  if (value == null || depth > 3) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array) return Buffer.from(value).toString('utf8');
  if (value instanceof Error) {
    return `${value.message} ${text(value.cause, depth + 1)}`;
  }
  return '';
}

export function isTransport(err: unknown): boolean {
  const e = err as { stderr?: unknown };
  return TRANSPORT.test(`${text(err)} ${text(e?.stderr)}`);
}

export function retrySync<T>(label: string, run: () => T): T {
  let last: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return run();
    } catch (err) {
      if (!isTransport(err)) throw err;
      last = err;
      // 300 ms, 600 ms, 1200 ms — attente active assumée : ces helpers sont
      // synchrones (execFileSync), et les rendre asynchrones changerait la
      // signature de la moitié des specs pour un gain nul.
      const wait = 300 * 2 ** (attempt - 1);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
    }
  }
  throw new Error(
    `${label} : échec de transport après 4 tentatives. Dernière erreur :\n${String(last)}`,
  );
}

export async function retryAsync<T>(
  label: string,
  run: () => Promise<T>,
): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (!isTransport(err)) throw err;
      last = err;
      await new Promise((r) => setTimeout(r, 300 * 2 ** (attempt - 1)));
    }
  }
  throw new Error(
    `${label} : échec de transport après 4 tentatives. Dernière erreur :\n${String(last)}`,
  );
}

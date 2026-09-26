// Passerelle IA (Vercel AI Gateway) — ADAPTATEUR ISOLÉ.
//
// C'est le SEUL point du dépôt qui parle à un fournisseur de modèles, comme
// `convex/email.ts` est le seul à parler à un fournisseur d'e-mails et
// `convex/lib/recaptcha.ts` le seul à parler à Google. Changer de passerelle,
// d'endpoint ou de format de réponse se fait ici, dans un fichier, sans
// toucher à la logique de modération.
//
// POURQUOI `fetch` DIRECT ET PAS LE SDK. L'appel tient en une requête JSON ;
// le SDK (`ai` + `@ai-sdk/gateway`) apporterait deux dépendances, leur chaîne
// transitive et leur cadence de mise à jour pour cela. Le runtime par défaut
// de Convex fournit `fetch` : aucun `"use node"` n'est nécessaire, et le
// fichier reste lisible d'un bout à l'autre. Le dépôt a déjà tranché ainsi
// deux fois (Resend, reCAPTCHA) ; on ne tranche pas autrement ici.
//
// POURQUOI L'ENDPOINT `/v1/responses`. C'est le seul des trois formats de la
// passerelle qui documente À LA FOIS la sortie contrainte par schéma JSON
// (`text.format`) et la pièce jointe PDF (`input_file`). Les deux nous sont
// nécessaires, et un seul chemin vaut mieux que deux formats à maintenir.
//
// CONFIG : `AI_GATEWAY_API_KEY` posée sur le déploiement Convex
//   npx convex env set AI_GATEWAY_API_KEY vck_xxx
// La clé ne transite JAMAIS par le navigateur : tout appel part d'une action
// Convex. Sans clé, l'appel ÉCHOUE (fail-closed) — cf. `email.ts` et
// `recaptcha.ts` : une clé oubliée doit être une panne visible, pas une
// fonctionnalité silencieusement absente. Ici, « échouer » veut dire que le
// dépôt part en file humaine ; jamais qu'il est publié sans avis.

const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/responses';

// Un arbitrage éditorial sur un PDF prend du temps ; une action Convex n'est
// pas éternelle. 120 s couvre largement un dépôt long et coupe une passerelle
// qui ne répond plus.
const TIMEOUT_MS = 120_000;

export type GatewayAttachment = {
  filename: string;
  // Contenu encodé en base64, SANS le préfixe `data:` (ajouté ici).
  base64: string;
  contentType: string;
};

export type GatewayRequest = {
  model: string;
  // Consigne système : rôle, barème, discipline de réponse.
  instructions: string;
  // Contenu à examiner — donnée, jamais consigne.
  userText: string;
  attachment?: GatewayAttachment;
  schemaName: string;
  schema: unknown;
  maxOutputTokens: number;
};

export type GatewayUsage = {
  promptTokens?: number;
  completionTokens?: number;
};

export type GatewayResult =
  | { ok: true; data: unknown; usage: GatewayUsage; model: string }
  | { ok: false; code: string; detail?: string };

// Codes d'échec — stables, journalisés, affichés traduits.
export const GATEWAY_ERRORS = {
  NOT_CONFIGURED: 'AI_GATEWAY_NOT_CONFIGURED',
  HTTP: 'AI_GATEWAY_HTTP_ERROR',
  TIMEOUT: 'AI_GATEWAY_TIMEOUT',
  NETWORK: 'AI_GATEWAY_NETWORK_ERROR',
  BAD_RESPONSE: 'AI_GATEWAY_BAD_RESPONSE',
  NOT_JSON: 'AI_GATEWAY_NOT_JSON',
} as const;

export function isGatewayConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY);
}

type ResponseContentPart = { type?: string; text?: string };
type ResponseOutputItem = { type?: string; content?: ResponseContentPart[] };

// Extrait le texte de la réponse. Deux chemins, dans cet ordre :
// `output_text` (raccourci fourni par la passerelle) puis le parcours de
// `output[]`. Le second existe parce que le raccourci est une commodité, pas
// une garantie du format — et qu'une réponse correcte perdue faute de savoir
// la lire renverrait le dépôt en file humaine sans raison.
function extractText(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const root = body as Record<string, unknown>;

  if (typeof root.output_text === 'string' && root.output_text.trim()) {
    return root.output_text;
  }
  if (Array.isArray(root.output)) {
    for (const item of root.output as ResponseOutputItem[]) {
      if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
      const text = item.content
        .filter((part) => typeof part?.text === 'string')
        .map((part) => part.text)
        .join('');
      if (text.trim()) return text;
    }
  }
  return null;
}

function extractUsage(body: unknown): GatewayUsage {
  if (typeof body !== 'object' || body === null) return {};
  const usage = (body as Record<string, unknown>).usage;
  if (typeof usage !== 'object' || usage === null) return {};
  const u = usage as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === 'number' ? x : undefined);
  return {
    promptTokens: num(u.input_tokens) ?? num(u.prompt_tokens),
    completionTokens: num(u.output_tokens) ?? num(u.completion_tokens),
  };
}

// Appel unique, sortie contrainte par schéma JSON.
//
// Ne lève jamais : tout échec sort en `{ ok: false, code }`. L'appelant est
// une action qui doit, dans TOUS les cas, aller écrire une trace et laisser le
// dépôt en file — une exception qui remonterait ferait perdre les deux.
export async function runStructuredAnalysis(
  req: GatewayRequest,
): Promise<GatewayResult> {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    console.error(
      '[ai-gateway] AI_GATEWAY_API_KEY absente — aucune analyse possible. Poser la clé : npx convex env set AI_GATEWAY_API_KEY vck_xxx. Les dépôts restent en file de modération humaine.',
    );
    return { ok: false, code: GATEWAY_ERRORS.NOT_CONFIGURED };
  }

  const content: unknown[] = [{ type: 'input_text', text: req.userText }];
  if (req.attachment) {
    content.push({
      type: 'input_file',
      filename: req.attachment.filename,
      file_data: `data:${req.attachment.contentType};base64,${req.attachment.base64}`,
    });
  }

  let response: Response;
  try {
    response = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: req.model,
        instructions: req.instructions,
        input: [{ type: 'message', role: 'user', content }],
        max_output_tokens: req.maxOutputTokens,
        text: {
          format: {
            type: 'json_schema',
            name: req.schemaName,
            strict: true,
            schema: req.schema,
          },
        },
      }),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    return {
      ok: false,
      code: timedOut ? GATEWAY_ERRORS.TIMEOUT : GATEWAY_ERRORS.NETWORK,
      detail: error instanceof Error ? error.message : undefined,
    };
  }

  if (!response.ok) {
    // Le corps d'erreur de la passerelle nomme la cause (modèle inconnu, quota,
    // clé révoquée) : on le garde BORNÉ pour le journal, il fait gagner l'appel
    // de diagnostic suivant.
    const detail = await response.text().catch(() => '');
    return {
      ok: false,
      code: GATEWAY_ERRORS.HTTP,
      detail: `${response.status} ${detail.slice(0, 500)}`,
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, code: GATEWAY_ERRORS.BAD_RESPONSE };
  }

  const text = extractText(body);
  if (text === null) return { ok: false, code: GATEWAY_ERRORS.BAD_RESPONSE };

  try {
    return {
      ok: true,
      data: JSON.parse(text),
      usage: extractUsage(body),
      model: req.model,
    };
  } catch {
    return {
      ok: false,
      code: GATEWAY_ERRORS.NOT_JSON,
      detail: text.slice(0, 300),
    };
  }
}

// Encodage base64 d'un binaire, par tranches.
//
// `String.fromCharCode(...octets)` sur un PDF de plusieurs mégaoctets dépasse
// la taille d'argument admise et lève — un plantage qui n'apparaîtrait que sur
// les gros dépôts, c'est-à-dire en production et pas en test.
export function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

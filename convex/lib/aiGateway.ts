// AI gateway (Vercel AI Gateway) — ISOLATED ADAPTER.
//
// It is the ONLY place in the repository that talks to a model provider, just as
// `convex/email.ts` is the only one talking to an e-mail provider and
// `convex/lib/recaptcha.ts` the only one talking to Google. Changing gateway,
// endpoint or response format is done here, in one file, without
// touching the moderation logic.
//
// WHY DIRECT `fetch` AND NOT THE SDK. The call fits in one JSON request;
// the SDK (`ai` + `@ai-sdk/gateway`) would bring two dependencies, their
// transitive chain and their update cadence for that. Convex's default
// runtime provides `fetch`: no `"use node"` is needed, and the
// file stays readable end to end. The repository already decided this way
// twice (Resend, reCAPTCHA); we don't decide otherwise here.
//
// WHY THE `/v1/responses` ENDPOINT. It is the only one of the gateway's three
// formats that documents BOTH JSON-schema-constrained output
// (`text.format`) and PDF attachments (`input_file`). We need both,
// and one path is better than two formats to maintain.
//
// CONFIG: `AI_GATEWAY_API_KEY` set on the Convex deployment
//   npx convex env set AI_GATEWAY_API_KEY vck_xxx
// The key NEVER passes through the browser: every call originates from a Convex
// action. Without a key, the call FAILS (fail-closed) — cf. `email.ts` and
// `recaptcha.ts`: a forgotten key must be a visible outage, not a
// silently missing feature. Here, "failing" means the
// submission goes to the human queue; never that it is published without review.

const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/responses';

// An editorial assessment of a PDF takes time; a Convex action does not
// run forever. 120 s comfortably covers a long submission and cuts off a
// gateway that stopped responding.
const TIMEOUT_MS = 120_000;

export type GatewayAttachment = {
  filename: string;
  // Base64-encoded content, WITHOUT the `data:` prefix (added here).
  base64: string;
  contentType: string;
};

export type GatewayRequest = {
  model: string;
  // System instructions: role, rubric, response discipline.
  instructions: string;
  // Content to examine — data, never instructions.
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

// Failure codes — stable, logged, displayed translated.
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

// Extracts the response text. Two paths, in this order:
// `output_text` (shortcut provided by the gateway) then walking
// `output[]`. The second exists because the shortcut is a convenience, not
// a guarantee of the format — and a correct response lost for lack of knowing
// how to read it would send the submission to the human queue for no reason.
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

// Single call, output constrained by a JSON schema.
//
// THE NAME SAYS WHAT THE FUNCTION DOES, not what the caller does. It
// was called `runStructuredAnalysis` when editorial moderation was
// its only use; content translation (convex/translation.ts) uses it
// for something else entirely, with the same contract — one request, one schema,
// one response or a failure code.
//
// Never throws: every failure comes out as `{ ok: false, code }`. The caller is
// an action that must, in ALL cases, go and write a trace — an
// exception bubbling up would make it lose that.
export async function runStructured(
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
    // The gateway's error body names the cause (unknown model, quota,
    // revoked key): we keep it BOUNDED for the log, it saves the next
    // diagnostic call.
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

// Base64 encoding of a binary, in chunks.
//
// `String.fromCharCode(...bytes)` on a multi-megabyte PDF exceeds
// the allowed argument size and throws — a crash that would only show up on
// large submissions, i.e. in production and not in tests.
export function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

import type { NormalizedEvent } from './validators';
import { sha512Hex, timingSafeEqual } from './crypto';
import {
  PaymentProviderError,
  type CheckoutRequest,
  type HeaderReader,
  type PaymentAdapter,
  type WebhookParseResult,
} from './types';
import { associationInfo, siteUrl } from './config';

// ADAPTATEUR PAYDUNYA — franc CFA (XOF), prestataire basé au Sénégal : mobile
// money (Orange Money, Wave, Free Money…) et cartes de la zone UEMOA.
//
// SOURCES : API « HTTP/JSON » de PayDunya (developers.paydunya.com, non
// joignable depuis l'environnement de développement le 27/09) et SDK Node
// officiel `paydunyadev/paydunya-node-master`, dont on reprend à l'identique :
//  - les URL de base (`/api/v1` en production, `/sandbox-api/v1` en test) ;
//  - les en-têtes PAYDUNYA-MASTER-KEY / PAYDUNYA-PRIVATE-KEY / PAYDUNYA-TOKEN ;
//  - la création `POST /checkout-invoice/create` (réponse `response_code` = "00",
//    `token`, et l'URL de paiement dans `response_text`) ;
//  - la confirmation `GET /checkout-invoice/confirm/{token}` (`status` :
//    `pending` | `completed` | `cancelled`, `invoice.total_amount`,
//    `custom_data`).
// À VALIDER avec des clés sandbox (docs/backlog/paiements.md § PayDunya).
//
// L'IPN, ET POURQUOI ON NE LUI FAIT PAS CONFIANCE SEUL. PayDunya poste sur
// `callback_url` un formulaire `application/x-www-form-urlencoded` dont la clé
// `data` porte la facture, avec `data[hash]` = SHA-512 de la clé principale
// (MASTER-KEY). Ce hash est STATIQUE : il prouve que l'émetteur connaît la
// clé, pas que le statut ou le montant du corps viennent de PayDunya. On
// vérifie donc le hash (rejet immédiat d'une requête forgée à l'aveugle), PUIS
// on relit la facture chez PayDunya avec nos propres clés : seul le résultat
// de cette confirmation serveur à serveur fait foi — statut, montant et
// référence de la demande.
//
// Pas d'abonnement chez PayDunya : le don mensuel en XOF passe par la relance
// planifiée (convex/payments/recurring.ts).

function baseUrl(): string {
  return (process.env.PAYDUNYA_MODE ?? 'test').toLowerCase() === 'live'
    ? 'https://app.paydunya.com/api/v1'
    : 'https://app.paydunya.com/sandbox-api/v1';
}

function headers(): Record<string, string> {
  const master = process.env.PAYDUNYA_MASTER_KEY;
  const priv = process.env.PAYDUNYA_PRIVATE_KEY;
  const token = process.env.PAYDUNYA_TOKEN;
  if (!master || !priv || !token) {
    throw new PaymentProviderError('paydunya', 'clés PayDunya absentes');
  }
  return {
    'PAYDUNYA-MASTER-KEY': master,
    'PAYDUNYA-PRIVATE-KEY': priv,
    'PAYDUNYA-TOKEN': token,
    'Content-Type': 'application/json',
  };
}

type Obj = Record<string, unknown>;

/** Réponse de `confirm` → événements normalisés. Exportée pour les tests. */
export function eventsFromPaydunyaConfirm(
  token: string,
  body: Obj,
  now: number,
): NormalizedEvent[] {
  if (body.response_code !== '00') return [];
  const status = body.status;
  const custom = (body.custom_data ?? {}) as Obj;
  const ref =
    typeof custom.checkoutRef === 'string' ? custom.checkoutRef : undefined;
  if (status === 'completed') {
    const invoice = (body.invoice ?? {}) as Obj;
    const amount = Number(invoice.total_amount);
    if (!Number.isFinite(amount)) return [];
    return [
      {
        kind: 'payment_succeeded',
        providerPaymentId: token,
        checkoutRef: ref,
        amountMinor: Math.round(amount),
        currency: 'XOF',
        paidAt: now,
        providerRef:
          typeof body.receipt_identifier === 'string'
            ? body.receipt_identifier
            : undefined,
      },
    ];
  }
  if (status === 'cancelled') {
    return [
      {
        kind: 'checkout_closed',
        checkoutRef: ref,
        providerSessionId: token,
        outcome: 'cancelled',
      },
    ];
  }
  return [];
}

async function confirmInvoice(token: string): Promise<Obj> {
  const res = await fetch(
    `${baseUrl()}/checkout-invoice/confirm/${encodeURIComponent(token)}`,
    { method: 'GET', headers: headers() },
  );
  const body = (await res.json().catch(() => ({}))) as Obj;
  if (!res.ok) {
    throw new PaymentProviderError('paydunya', `confirm → ${res.status}`);
  }
  return body;
}

/** Extrait le hash et le jeton d'un IPN, formulaire ou JSON. */
export function readPaydunyaIpn(
  rawBody: string,
  contentType: string | null,
): { hash: string | null; token: string | null } {
  if ((contentType ?? '').includes('application/json')) {
    try {
      const body = JSON.parse(rawBody) as Obj;
      const data = (body.data ?? {}) as Obj;
      const invoice = (data.invoice ?? {}) as Obj;
      return {
        hash: typeof data.hash === 'string' ? data.hash : null,
        token: typeof invoice.token === 'string' ? invoice.token : null,
      };
    } catch {
      return { hash: null, token: null };
    }
  }
  const form = new URLSearchParams(rawBody);
  return {
    hash: form.get('data[hash]'),
    token: form.get('data[invoice][token]'),
  };
}

export async function verifyPaydunyaHash(
  hash: string | null,
  masterKey: string,
): Promise<boolean> {
  if (!hash) return false;
  const expected = await sha512Hex(masterKey);
  return timingSafeEqual(hash.toLowerCase(), expected);
}

export const paydunyaAdapter: PaymentAdapter = {
  id: 'paydunya',
  currencies: ['XOF'],
  nativeSubscriptions: false,

  async createCheckout(req: CheckoutRequest) {
    const association = associationInfo();
    const body = {
      invoice: {
        total_amount: req.amountMinor,
        description: req.description,
        items: {
          item_0: {
            name: req.description,
            quantity: 1,
            unit_price: req.amountMinor,
            total_price: req.amountMinor,
          },
        },
      },
      store: { name: association.name, website_url: siteUrl() },
      actions: {
        cancel_url: req.cancelUrl,
        return_url: req.successUrl,
        callback_url: req.webhookUrl,
      },
      custom_data: { checkoutRef: req.ref, purpose: req.purpose },
    };
    const res = await fetch(`${baseUrl()}/checkout-invoice/create`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });
    const out = (await res.json().catch(() => ({}))) as Obj;
    if (
      !res.ok ||
      out.response_code !== '00' ||
      typeof out.token !== 'string' ||
      typeof out.response_text !== 'string'
    ) {
      throw new PaymentProviderError(
        'paydunya',
        `create → ${res.status} ${typeof out.response_text === 'string' ? out.response_text : ''}`,
      );
    }
    return { providerSessionId: out.token, redirectUrl: out.response_text };
  },

  async parseWebhook(
    rawBody: string,
    header: HeaderReader,
  ): Promise<WebhookParseResult> {
    const master = process.env.PAYDUNYA_MASTER_KEY;
    if (!master) return { ok: false, reason: 'not-configured' };
    const { hash, token } = readPaydunyaIpn(rawBody, header('content-type'));
    if (!(await verifyPaydunyaHash(hash, master))) {
      return { ok: false, reason: 'bad-hash' };
    }
    if (!token) return { ok: false, reason: 'missing-token' };
    // Confirmation serveur à serveur : SEULE source de vérité.
    const confirmed = await confirmInvoice(token);
    const events = eventsFromPaydunyaConfirm(token, confirmed, Date.now());
    const status =
      typeof confirmed.status === 'string' ? confirmed.status : 'unknown';
    return {
      ok: true,
      eventId: `${token}:${status}`,
      type: `invoice.${status}`,
      events,
    };
  },

  async fetchCheckout(token: string) {
    return eventsFromPaydunyaConfirm(
      token,
      await confirmInvoice(token),
      Date.now(),
    );
  },

  // Pas de remboursement ni d'abonnement par API : `refund` et
  // `cancelSubscription` sont volontairement absents (remboursement MARQUÉ).
};

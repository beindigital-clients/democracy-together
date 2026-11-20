// @vitest-environment edge-runtime
import { describe, it, expect, afterEach, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { cercleUserDataModule } from './lib/cercleUserData';
import {
  buildCercleTranslationInstructions,
  buildCercleTranslationSchema,
  contributionFingerprint,
  contributionParagraphs,
  parseCercleTranslation,
} from './lib/cercleTranslation';

// CERCLE DES AMIS — ON-DEMAND TRANSLATION OF THE PRIVATE CONTRIBUTIONS.
//
// What must hold: only the Cercle reads or asks for a translation; every model
// call is made under zero data retention; a removed contribution has no
// translation and none survives it (removal, account deletion). The provider
// is a substitute `fetch` and every text is fictitious.

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

const drains: (() => Promise<void>)[] = [];
function newConvexTest() {
  const t = convexTest(schema, modules);
  drains.push(() => t.finishAllScheduledFunctions(vi.runAllTimers));
  return t;
}
afterEach(async () => {
  vi.useFakeTimers();
  try {
    for (const drain of drains.splice(0)) await drain();
  } finally {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  }
});

type T = ReturnType<typeof newConvexTest>;

async function user(
  t: T,
  email: string,
  over: Record<string, unknown> = {},
): Promise<{ id: Id<'users'>; as: ReturnType<T['withIdentity']> }> {
  const id = await t.run((ctx) =>
    ctx.db.insert('users', { email, role: 'visiteur', ...over }),
  );
  return { id, as: t.withIdentity({ subject: `${id}|s` }) };
}

const ami = (t: T, email = 'ami@example.test') =>
  user(t, email, { amiSince: Date.now() });

type Call = { url: string; body: Record<string, unknown> };

/** Substitute provider: answers in English, names French as the source. */
function fakeProvider(
  answer: ((paragraphs: string[]) => Record<string, unknown>) | 'fail' = (
    paragraphs,
  ) => ({
    sourceLanguage: 'fr',
    body: paragraphs.map((p) => `EN: ${p}`),
  }),
): Call[] {
  const calls: Call[] = [];
  vi.stubEnv('AI_GATEWAY_API_KEY', 'test-key-not-real');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      calls.push({ url, body });
      if (answer === 'fail') return new Response('down', { status: 500 });
      const input = body.input as { content: { text: string }[] }[];
      const sent = JSON.parse(input[0].content[0].text) as { body: string[] };
      return new Response(
        JSON.stringify({ output_text: JSON.stringify(answer(sent.body)) }),
        { status: 200 },
      );
    }),
  );
  return calls;
}

async function contribute(
  as: ReturnType<T['withIdentity']>,
  body = 'Je suis préoccupée par l’éducation des jeunes.\n\nComment peut évoluer la démocratie ?',
): Promise<Id<'cercleContributions'>> {
  return await as.mutation(api.cercleContributions.submit, { body });
}

describe('Cercle translation — pure rules', () => {
  it('splits on blank lines only and fingerprints the paragraphs', () => {
    expect(contributionParagraphs('a\nb\n\nc')).toEqual(['a\nb', 'c']);
    expect(contributionParagraphs('seul')).toEqual(['seul']);
    expect(contributionFingerprint(['a', 'b'])).not.toBe(
      contributionFingerprint(['ab']),
    );
  });

  it('pins the paragraph count and the language codes in the schema', () => {
    const schema = buildCercleTranslationSchema(3) as {
      properties: {
        body: { minItems: number; maxItems: number };
        sourceLanguage: { enum: string[] };
      };
      additionalProperties: boolean;
    };
    expect(schema.properties.body.minItems).toBe(3);
    expect(schema.properties.body.maxItems).toBe(3);
    expect(schema.properties.sourceLanguage.enum).toEqual([
      'fr',
      'en',
      'es',
      'pt',
      'ar',
      'other',
    ]);
    expect(schema.additionalProperties).toBe(false);
  });

  it('refuses a lost or emptied paragraph and an unknown language', () => {
    const source = ['Un.', 'Deux.'];
    expect(
      parseCercleTranslation(source, {
        sourceLanguage: 'fr',
        body: ['One.', 'Two.'],
      }),
    ).toEqual({ sourceLanguage: 'fr', body: ['One.', 'Two.'] });
    expect(
      parseCercleTranslation(source, { sourceLanguage: 'fr', body: ['One.'] }),
    ).toBeNull();
    expect(
      parseCercleTranslation(source, {
        sourceLanguage: 'fr',
        body: ['One.', ' '],
      }),
    ).toBeNull();
    expect(
      parseCercleTranslation(source, {
        sourceLanguage: 'de',
        body: ['One.', 'Two.'],
      }),
    ).toBeNull();
  });

  it('tells the model the text is data and to keep a same-language text', () => {
    const instructions = buildCercleTranslationInstructions('en');
    expect(instructions).toMatch(/into English/);
    expect(instructions).toMatch(/already written in English/);
    expect(instructions).toMatch(/DATA to translate/);
  });
});

describe('Cercle translation — who may read and ask', () => {
  it('refuses a visitor, a suspended Ami and an anonymous caller, and calls nothing', async () => {
    const t = newConvexTest();
    const calls = fakeProvider();
    const author = await ami(t);
    const id = await contribute(author.as);
    const visitor = await user(t, 'v@example.test');
    const suspended = await ami(t, 's@example.test');
    await t.run((ctx) =>
      ctx.db.patch(suspended.id, { suspendedAt: Date.now() }),
    );

    for (const who of [visitor.as, suspended.as]) {
      expect(
        await who.action(api.cercleTranslations.request, {
          contributionId: id,
          targetLocale: 'en',
        }),
      ).toEqual({ ok: false, code: 'FORBIDDEN' });
    }
    expect(
      await t.action(api.cercleTranslations.request, {
        contributionId: id,
        targetLocale: 'en',
      }),
    ).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(calls).toHaveLength(0);

    // Once a translation exists, a visitor still reads nothing.
    await author.as.action(api.cercleTranslations.request, {
      contributionId: id,
      targetLocale: 'en',
    });
    expect(
      await visitor.as.query(api.cercleTranslations.get, {
        contributionId: id,
        targetLocale: 'en',
      }),
    ).toBeNull();
    expect(
      await t.query(api.cercleTranslations.get, {
        contributionId: id,
        targetLocale: 'en',
      }),
    ).toBeNull();
  });
});

describe('Cercle translation — zero data retention and cache', () => {
  it('asks the gateway for zero data retention, then serves the cache', async () => {
    const t = newConvexTest();
    const calls = fakeProvider();
    const author = await ami(t);
    const reader = await user(t, 'm@example.test', { role: 'membre' });
    const id = await contribute(author.as);

    expect(
      await reader.as.action(api.cercleTranslations.request, {
        contributionId: id,
        targetLocale: 'en',
      }),
    ).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].body.providerOptions).toEqual({
      gateway: { zeroDataRetention: true },
    });

    const translated = await author.as.query(api.cercleTranslations.get, {
      contributionId: id,
      targetLocale: 'en',
    });
    expect(translated).toMatchObject({
      status: 'ready',
      detectedLocale: 'fr',
      sameLanguage: false,
      fresh: true,
      body: [
        'EN: Je suis préoccupée par l’éducation des jeunes.',
        'EN: Comment peut évoluer la démocratie ?',
      ],
    });

    // A second reader of the same language costs no call.
    await author.as.action(api.cercleTranslations.request, {
      contributionId: id,
      targetLocale: 'en',
    });
    expect(calls).toHaveLength(1);

    // Nothing reaches the public translation table.
    expect(
      await t.run((ctx) => ctx.db.query('contentTranslations').collect()),
    ).toEqual([]);
  });

  it('marks a text already in the reader’s language as such', async () => {
    const t = newConvexTest();
    fakeProvider((paragraphs) => ({ sourceLanguage: 'fr', body: paragraphs }));
    const author = await ami(t);
    const id = await contribute(author.as);
    await author.as.action(api.cercleTranslations.request, {
      contributionId: id,
      targetLocale: 'fr',
    });
    expect(
      await author.as.query(api.cercleTranslations.get, {
        contributionId: id,
        targetLocale: 'fr',
      }),
    ).toMatchObject({ status: 'ready', sameLanguage: true });
  });

  it('records a failure instead of showing a partial translation', async () => {
    const t = newConvexTest();
    fakeProvider('fail');
    const author = await ami(t);
    const id = await contribute(author.as);
    const result = await author.as.action(api.cercleTranslations.request, {
      contributionId: id,
      targetLocale: 'en',
    });
    expect(result.ok).toBe(false);
    expect(
      await author.as.query(api.cercleTranslations.get, {
        contributionId: id,
        targetLocale: 'en',
      }),
    ).toMatchObject({ status: 'failed' });
  });
});

describe('Cercle translation — gone with the contribution', () => {
  it('a removed contribution can no longer be translated and loses its translations', async () => {
    const t = newConvexTest();
    const calls = fakeProvider();
    const author = await ami(t);
    const id = await contribute(author.as);
    await author.as.action(api.cercleTranslations.request, {
      contributionId: id,
      targetLocale: 'en',
    });
    await author.as.action(api.cercleTranslations.request, {
      contributionId: id,
      targetLocale: 'es',
    });
    expect(
      await t.run((ctx) => ctx.db.query('cercleTranslations').collect()),
    ).toHaveLength(2);

    await author.as.mutation(api.cercleContributions.remove, {
      contributionId: id,
    });
    expect(
      await t.run((ctx) => ctx.db.query('cercleTranslations').collect()),
    ).toEqual([]);
    expect(
      await author.as.action(api.cercleTranslations.request, {
        contributionId: id,
        targetLocale: 'pt',
      }),
    ).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(calls).toHaveLength(2);
  });

  it('account deletion deletes the translations of the account’s contributions', async () => {
    const t = newConvexTest();
    fakeProvider();
    const author = await ami(t, 'gone@example.test');
    const other = await ami(t, 'stays@example.test');
    const mine = await contribute(author.as);
    const theirs = await contribute(other.as, 'Une autre question fictive.');
    for (const contributionId of [mine, theirs]) {
      await other.as.action(api.cercleTranslations.request, {
        contributionId,
        targetLocale: 'en',
      });
    }

    await t.run((ctx) =>
      cercleUserDataModule.delete(ctx, author.id, {
        email: 'gone@example.test',
      }),
    );
    const left = await t.run((ctx) =>
      ctx.db.query('cercleTranslations').collect(),
    );
    expect(left.map((r) => r.contributionId)).toEqual([theirs]);
  });
});

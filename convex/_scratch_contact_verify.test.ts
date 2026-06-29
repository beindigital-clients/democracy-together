// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { internal } from './_generated/api';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

describe('SCRATCH verify', () => {
  it('rejects blank-only fields server-side', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.contact.store, {
        name: '   ',
        email: 'awa@example.org',
        subject: '   ',
        body: '          ',
      }),
    ).rejects.toThrow();
    const all = await t.run((ctx) =>
      ctx.db.query('contactMessages').collect(),
    );
    expect(all).toHaveLength(0);
  });

  it('trims surrounding whitespace before storing', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.contact.store, {
      name: '  Awa Diop  ',
      email: '  awa@example.org  ',
      subject: '  Partenariat  ',
      body: '  Bonjour, notre institut souhaite echanger.  ',
    });
    const all = await t.run((ctx) =>
      ctx.db.query('contactMessages').collect(),
    );
    expect(all[0].name).toBe('Awa Diop');
    expect(all[0].email).toBe('awa@example.org');
    expect(all[0].subject).toBe('Partenariat');
    expect(all[0].body).toBe('Bonjour, notre institut souhaite echanger.');
  });
});

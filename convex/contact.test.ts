// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

describe('Contact — submit (F-17)', () => {
  it('stocke un message valide, marqué non traité', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.contact.submit, {
      name: 'Awa Diop',
      email: 'awa@example.org',
      subject: 'Partenariat',
      body: 'Bonjour, notre institut souhaite échanger avec le réseau.',
    });
    const all = await t.run((ctx) =>
      ctx.db.query('contactMessages').collect(),
    );
    expect(all).toHaveLength(1);
    expect(all[0].handled).toBe(false);
    expect(all[0].name).toBe('Awa Diop');
    expect(all[0].subject).toBe('Partenariat');
  });

  it('rejette chaque champ invalide avec son code précis (chaque frontière)', async () => {
    const t = convexTest(schema, modules);
    const ok = {
      name: 'Awa',
      email: 'awa@example.org',
      subject: 'Sujet',
      body: 'Un message assez long pour passer.',
    };
    await expect(
      t.mutation(api.contact.submit, { ...ok, name: 'A' }),
    ).rejects.toThrow('INVALID_NAME');
    await expect(
      t.mutation(api.contact.submit, { ...ok, email: 'pas-un-email' }),
    ).rejects.toThrow('INVALID_EMAIL');
    await expect(
      t.mutation(api.contact.submit, { ...ok, subject: 'X' }),
    ).rejects.toThrow('INVALID_SUBJECT');
    await expect(
      t.mutation(api.contact.submit, { ...ok, body: 'court' }),
    ).rejects.toThrow('INVALID_BODY');

    const all = await t.run((ctx) =>
      ctx.db.query('contactMessages').collect(),
    );
    expect(all).toHaveLength(0);
  });
});

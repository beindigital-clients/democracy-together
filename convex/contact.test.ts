// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { internal } from './_generated/api';

// The storage/validation logic lives in the `store` internalMutation;
// the public `submit` action only adds the reCAPTCHA gate (tested separately,
// recaptcha.test.ts). So here we test the internal mutation directly.

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
    await t.mutation(internal.contact.store, {
      name: 'Awa Diop',
      email: 'awa@example.org',
      subject: 'Partenariat',
      body: 'Bonjour, notre institut souhaite échanger avec le réseau.',
    });
    const all = await t.run((ctx) => ctx.db.query('contactMessages').collect());
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
      t.mutation(internal.contact.store, { ...ok, name: 'A' }),
    ).rejects.toThrow('INVALID_NAME');
    await expect(
      t.mutation(internal.contact.store, { ...ok, email: 'pas-un-email' }),
    ).rejects.toThrow('INVALID_EMAIL');
    await expect(
      t.mutation(internal.contact.store, { ...ok, subject: 'X' }),
    ).rejects.toThrow('INVALID_SUBJECT');
    await expect(
      t.mutation(internal.contact.store, { ...ok, body: 'court' }),
    ).rejects.toThrow('INVALID_BODY');

    const all = await t.run((ctx) => ctx.db.query('contactMessages').collect());
    expect(all).toHaveLength(0);
  });

  // `store`'s `trim()` is the only barrier preventing a submission of
  // whitespace from passing the length checks — and the only reason
  // what is stored is clean. Both halves are checked here.
  it('neutralise les blancs : rejet si le champ est vide une fois trimé, stockage trimé sinon', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.contact.store, {
        name: '   ',
        email: 'awa@example.org',
        subject: '   ',
        body: '          ',
      }),
    ).rejects.toThrow('INVALID_NAME');
    expect(
      await t.run((ctx) => ctx.db.query('contactMessages').collect()),
    ).toHaveLength(0);

    await t.mutation(internal.contact.store, {
      name: '  Awa Diop  ',
      email: '  awa@example.org  ',
      subject: '  Partenariat  ',
      body: '  Bonjour, notre institut souhaite échanger.  ',
    });
    const all = await t.run((ctx) => ctx.db.query('contactMessages').collect());
    expect(all[0].name).toBe('Awa Diop');
    expect(all[0].email).toBe('awa@example.org');
    expect(all[0].subject).toBe('Partenariat');
    expect(all[0].body).toBe('Bonjour, notre institut souhaite échanger.');
  });
});

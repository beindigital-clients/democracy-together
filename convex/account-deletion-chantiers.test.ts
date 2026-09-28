// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { USER_DATA_MODULES, advanceDeletion } from './lib/accountDeletion';
import { AVAILABILITIES } from './lib/programmes';

// MERGE OF THE BACKLOG WORKSTREAMS (27/09): account deletion must
// go through the modules of ALL workstreams, not only the core
// written before them. This test pins the registry and checks that a deletion
// carried through to completion leaves nothing of a workstream's personal data.
const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

describe('Suppression de compte — registre des chantiers', () => {
  it('appelle chaque chantier, la communauté avant la tribune et les espaces du socle', () => {
    const keys = USER_DATA_MODULES.map((m) => m.key);
    for (const k of [
      'social',
      'programmes',
      'editorial',
      'contenus',
      'paiements',
      'diffusion',
      'communaute',
    ]) {
      expect(keys).toContain(k);
    }
    expect(keys.indexOf('communaute')).toBeLessThan(keys.indexOf('tribune'));
    expect(keys.indexOf('communaute')).toBeLessThan(keys.indexOf('workspaces'));
    // Sign-in methods go last.
    expect(keys[keys.length - 1]).toBe('authAccounts');
  });

  it('une suppression menée à terme efface le profil jeune et les suivis', async () => {
    const t = convexTest(schema, modules);
    const { userId, otherId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        email: 'efface@test.org',
        role: 'membre',
      });
      const otherId = await ctx.db.insert('users', {
        email: 'reste@test.org',
        role: 'membre',
      });
      await ctx.db.insert('youthProfiles', {
        userId,
        displayName: 'Awa',
        background: 'Études de droit public',
        country: 'SN',
        languages: ['fr'],
        interests: [],
        availability: AVAILABILITIES[0],
        consentProcessing: true,
        consentPartnerContact: false,
        consentedAt: 0,
        createdAt: 0,
        updatedAt: 0,
      });
      await ctx.db.insert('follows', {
        followerId: userId,
        followeeId: otherId,
        createdAt: 0,
      });
      await ctx.db.insert('follows', {
        followerId: otherId,
        followeeId: userId,
        createdAt: 0,
      });
      return { userId, otherId };
    });

    await t.run(async (ctx) => {
      let step = 0;
      for (let i = 0; i < 50; i++) {
        const r = await advanceDeletion(ctx, userId, step, {
          email: 'efface@test.org',
        });
        step = r.step;
        if (r.done) break;
      }
      expect(step).toBe(USER_DATA_MODULES.length);
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.query('youthProfiles').collect()).toHaveLength(0);
      expect(await ctx.db.query('follows').collect()).toHaveLength(0);
      // The third party, for its part, is intact.
      expect(await ctx.db.get(otherId)).not.toBeNull();
    });
  });
});

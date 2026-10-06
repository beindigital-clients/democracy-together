import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FAKE_PLAGIARISM_MARKER,
  FAKE_TRANSLATED_MARKER,
  configuredProvider,
  runExternalCheck,
} from './index';

afterEach(() => vi.unstubAllEnvs());

describe('Adaptateur anti-plagiat', () => {
  it('par défaut : aucun fournisseur, contrôle « indisponible » (jamais « rien à signaler »)', async () => {
    expect(configuredProvider()).toBe('none');
    expect(await runExternalCheck('un texte')).toEqual({
      status: 'unavailable',
      provider: 'none',
      error: 'NO_PROVIDER',
    });
  });

  it('le fournisseur factice rapporte ce qu’on lui a promis, et rien d’autre', async () => {
    vi.stubEnv('PLAGIARISM_PROVIDER', 'fake');
    const clean = await runExternalCheck('un texte sans marque');
    expect(clean).toMatchObject({ status: 'done', matches: [] });
    const hit = await runExternalCheck(`avant ${FAKE_PLAGIARISM_MARKER} après`);
    expect(hit).toMatchObject({ status: 'done' });
    expect(hit.status === 'done' && hit.matches).toHaveLength(1);
  });

  it('demande la détection d’une langue à l’autre, et ne laisse pas le service garder le texte', async () => {
    vi.stubEnv('PLAGIARISM_PROVIDER', 'fake');
    const result = await runExternalCheck(
      `x ${FAKE_TRANSLATED_MARKER} y`,
      'fr',
    );
    expect(result.status === 'done' && result.matches[0].crossLanguage).toBe(
      true,
    );
  });

  it('un fournisseur nommé mais non construit : « indisponible », avec la raison', async () => {
    vi.stubEnv('PLAGIARISM_PROVIDER', 'acme');
    expect(await runExternalCheck('t')).toMatchObject({
      status: 'unavailable',
      error: 'NO_API_KEY',
    });
    vi.stubEnv('PLAGIARISM_API_KEY', 'k');
    expect(await runExternalCheck('t')).toMatchObject({
      status: 'unavailable',
      error: 'PROVIDER_NOT_IMPLEMENTED',
    });
  });
});

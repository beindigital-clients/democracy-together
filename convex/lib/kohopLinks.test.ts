import { describe, it, expect } from 'vitest';
import {
  NO_FACTS,
  emailDomain,
  evaluateLinks,
  foldName,
  hostOf,
  isPublicMailbox,
  linkLevel,
  matchesOrganizationDomain,
  type LinkFacts,
} from './kohopLinks';
import { KOHOP_AI_LINK_TYPES, KOHOP_LINK_TYPES } from './kohop';

const facts = (patch: Partial<LinkFacts>): LinkFacts => ({
  ...NO_FACTS,
  ...patch,
});
const types = (patch: Partial<LinkFacts>) =>
  evaluateLinks(facts(patch)).map((f) => f.type);

describe('liens par règles — niveaux bloquants', () => {
  it.each([
    ['isAuthor', 'self'],
    ['isCoAuthor', 'coauthor'],
    ['sameOrganization', 'same_organization'],
    ['mentoringPair', 'mentoring'],
    ['crossReviewRecent', 'cross_review'],
    ['coSignedRecently', 'recent_cosign'],
  ] as const)('%s → %s, bloquant', (fact, type) => {
    expect(types({ [fact]: true })).toEqual([type]);
    expect(linkLevel(facts({ [fact]: true }))).toBe('blocking');
  });

  it.each(['family', 'personal', 'hierarchical'])(
    'un lien déclaré « %s » est bloquant',
    (declared) => {
      expect(types({ declaredRelationship: declared })).toEqual([
        'declared_relationship',
      ]);
      expect(linkLevel(facts({ declaredRelationship: declared }))).toBe(
        'blocking',
      );
    },
  );

  it('« aucun lien » déclaré, ou une valeur inconnue, ne bloque pas', () => {
    expect(types({ declaredRelationship: 'none' })).toEqual([]);
    expect(types({ declaredRelationship: 'inconnu' })).toEqual([]);
    expect(types({ declaredRelationship: undefined })).toEqual([]);
  });
});

describe('liens par règles — niveaux signalés', () => {
  it.each([
    ['sameWorkspace', 'same_workspace'],
    ['mutualFollow', 'mutual_follow'],
    ['organizationDomainMatch', 'organization_domain'],
    ['sharedLibraryAuthorName', 'shared_library_author'],
    ['publicMailbox', 'public_mailbox'],
  ] as const)('%s → %s, signalé', (fact, type) => {
    expect(types({ [fact]: true })).toEqual([type]);
    expect(linkLevel(facts({ [fact]: true }))).toBe('flagged');
  });

  it('la récurrence se signale à partir de deux désignations en douze mois', () => {
    expect(types({ previousDesignations: 0 })).toEqual([]);
    expect(types({ previousDesignations: 1 })).toEqual([]);
    expect(types({ previousDesignations: 2 })).toEqual(['recurrence']);
    expect(linkLevel(facts({ previousDesignations: 5 }))).toBe('flagged');
  });

  it('aucun fait : aucun lien', () => {
    expect(evaluateLinks(NO_FACTS)).toEqual([]);
    expect(linkLevel(NO_FACTS)).toBe('none');
  });

  it('un bloquant l’emporte sur les signalés, et les bloquants sortent en premier', () => {
    const found = evaluateLinks(
      facts({ sameWorkspace: true, mentoringPair: true, mutualFollow: true }),
    );
    expect(found[0].type).toBe('mentoring');
    expect(linkLevel(facts({ sameWorkspace: true, mentoringPair: true }))).toBe(
      'blocking',
    );
  });

  it('chaque constat de règle porte un détail ; les types IA restent « signalés »', () => {
    const all = evaluateLinks({
      isAuthor: true,
      isCoAuthor: true,
      sameOrganization: true,
      mentoringPair: true,
      crossReviewRecent: true,
      coSignedRecently: true,
      declaredRelationship: 'family',
      sameWorkspace: true,
      mutualFollow: true,
      organizationDomainMatch: true,
      previousDesignations: 3,
      sharedLibraryAuthorName: true,
      publicMailbox: true,
    });
    expect(all.length).toBe(13);
    expect(all.every((f) => f.detail.length > 0)).toBe(true);
    // The rules never produce an AI-only type.
    for (const f of all) expect(KOHOP_AI_LINK_TYPES).not.toContain(f.type);
    for (const t of KOHOP_AI_LINK_TYPES)
      expect(KOHOP_LINK_TYPES[t]).toBe('flagged');
  });
});

describe('liens par règles — utilitaires', () => {
  it('domaine d’une adresse', () => {
    expect(emailDomain('Awa@Institut.ORG')).toBe('institut.org');
    expect(emailDomain('sans-arobase')).toBeNull();
    expect(emailDomain('a@')).toBeNull();
    expect(emailDomain(undefined)).toBeNull();
  });

  it('hôte d’un site, sans « www. »', () => {
    expect(hostOf('https://www.institut.org/a')).toBe('institut.org');
    expect(hostOf('pas une url')).toBeNull();
  });

  it('adresse sur le domaine du site de l’organisation, sous-domaines compris', () => {
    expect(
      matchesOrganizationDomain('a@institut.org', 'https://www.institut.org'),
    ).toBe(true);
    expect(
      matchesOrganizationDomain('a@mail.institut.org', 'https://institut.org'),
    ).toBe(true);
    expect(
      matchesOrganizationDomain('a@autre.org', 'https://institut.org'),
    ).toBe(false);
    expect(
      matchesOrganizationDomain('a@notinstitut.org', 'https://institut.org'),
    ).toBe(false);
    // A public mailbox never matches an organization, even gmail.com's own site.
    expect(matchesOrganizationDomain('a@gmail.com', 'https://gmail.com')).toBe(
      false,
    );
  });

  it('messagerie grand public', () => {
    expect(isPublicMailbox('a@gmail.com')).toBe(true);
    expect(isPublicMailbox('a@institut.org')).toBe(false);
    expect(isPublicMailbox(null)).toBe(false);
  });

  it('noms comparés sans accents, casse ni ponctuation', () => {
    expect(foldName('  Aïssatou  N’DIAYE ')).toBe('aissatou n diaye');
    expect(foldName('Aissatou N-Diaye')).toBe('aissatou n diaye');
  });
});

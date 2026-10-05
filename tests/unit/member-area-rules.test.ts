import { describe, it, expect } from 'vitest';
import fr from '@/messages/fr.json';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import pt from '@/messages/pt.json';
import ar from '@/messages/ar.json';
import {
  MEMBER_NAV_GROUPS,
  currentMemberNavItem,
  isMemberNavItemActive,
  visibleMemberNavGroups,
} from '@/lib/member-nav';
import {
  COMPLETION_ANCHORS,
  COMPLETION_STEPS,
  profileCompletion,
  type CompletionInput,
} from '@/lib/profile-completion';
import { memberName } from '@/lib/member-identity';
import { relativeTime } from '@/lib/relative-time';
import {
  COUNTRY_CODES,
  countryOptions,
  guessCountryCode,
} from '@/lib/countries';
import {
  draftFrom,
  sameDraft,
  toggleIn,
  type ProfileDraft,
} from '@/components/social/profile-draft';
import { ROLE_ORDER } from '@/lib/roles';
import { notificationKind } from '@/lib/notification-kind';

// MEMBER AREA — the rules behind the redesigned screens, without a browser:
// who is offered which entry, which entry is current, what the profile meter
// counts, how a name and a date are shown, when a profile has unsaved
// changes.

const keysOf = (items: readonly { key: string }[]) => items.map((i) => i.key);

describe('Navigation de l’espace membre — ce que chaque rôle se voit proposer', () => {
  const offered = (role: string | null) =>
    visibleMemberNavGroups(role).flatMap((g) => keysOf(g.items));

  // What every signed-in account is offered, whatever its role.
  const EVERYONE = [
    'dashboard',
    'profile',
    'messages',
    'notifications',
    'network',
    'security',
    'password',
    'data',
  ];

  it('un visiteur : son compte, et les programmes ouverts avant l’adhésion', () => {
    expect(offered('visiteur').sort()).toEqual(
      [...EVERYONE, 'youth', 'mentoring', 'learning', 'payments'].sort(),
    );
    // Reserved to members: a visitor would only find a closed door.
    const groups = visibleMemberNavGroups('visiteur').map((g) => g.key);
    expect(groups).not.toContain('contributions');
    expect(groups).not.toContain('staff');
  });

  it('un membre : tout ce que fait un participant du réseau, pas le back-office', () => {
    expect(offered('membre').sort()).toEqual(
      [
        ...EVERYONE,
        'people',
        'workspaces',
        'publications',
        'tribune',
        'kohop',
        'kohopReviews',
        'manuscripts',
        'projects',
        'evaluations',
        'youth',
        'mentoring',
        'learning',
        'payments',
        'organization',
      ].sort(),
    );
  });

  it('l’équipe : le back-office, le réseau et ce qu’elle publie — ni programmes, ni cotisation', () => {
    for (const role of ['moderateur', 'editeur', 'admin'] as const) {
      expect(offered(role).sort(), role).toEqual(
        [
          ...EVERYONE,
          'admin',
          'people',
          'workspaces',
          'publications',
          'tribune',
          'kohop',
          'kohopReviews',
        ].sort(),
      );
      const groups = visibleMemberNavGroups(role).map((g) => g.key);
      // An administrator does not need a youth space: the programmes are
      // run from the back office, and their group disappears.
      expect(groups, role).not.toContain('programmes');
      // The back office right after the everyday entries: it is where the
      // team works.
      expect(groups.indexOf('staff'), role).toBe(1);
    }
  });

  it('chaque rôle a un menu, et la même entrée n’est jamais proposée deux fois', () => {
    for (const role of ROLE_ORDER) {
      const keys = offered(role);
      expect(keys.length, role).toBeGreaterThan(EVERYONE.length - 1);
      expect(new Set(keys).size, role).toBe(keys.length);
    }
    const hrefs = MEMBER_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('un rôle inconnu vaut visiteur ; un rôle illisible n’offre que le compte', () => {
    expect(visibleMemberNavGroups('super-admin')).toEqual(
      visibleMemberNavGroups('visiteur'),
    );
    // `null`: the column's reads failed. Only what every account has.
    expect(offered(null).sort()).toEqual([...EVERYONE].sort());
  });
});

describe('Navigation de l’espace membre — entrée courante', () => {
  it('le tableau de bord ne s’allume que sur sa propre adresse', () => {
    expect(isMemberNavItemActive('/espace-membre', '/espace-membre')).toBe(
      true,
    );
    expect(isMemberNavItemActive('/espace-membre', '/espace-membre/')).toBe(
      true,
    );
    expect(
      isMemberNavItemActive('/espace-membre', '/espace-membre/profil'),
    ).toBe(false);
  });

  it('une sous-page allume son entrée, sur un segment entier', () => {
    expect(
      isMemberNavItemActive(
        '/espace-membre/contributions',
        '/espace-membre/contributions/abc123',
      ),
    ).toBe(true);
    expect(
      isMemberNavItemActive(
        '/espace-membre/projets',
        '/espace-membre/projets-archives',
      ),
    ).toBe(false);
  });

  it('le formulaire de dépôt est rattaché à « Mes publications »', () => {
    expect(currentMemberNavItem('/espace-membre/deposer', 'membre')?.key).toBe(
      'publications',
    );
  });

  it('une page que le rôle ne se voit pas proposer n’allume rien', () => {
    expect(
      currentMemberNavItem('/espace-membre/evaluations', 'visiteur'),
    ).toBeNull();
    expect(currentMemberNavItem('/espace-membre/jeunes', 'admin')).toBeNull();
    expect(
      currentMemberNavItem('/espace-membre/evaluations', 'membre')?.key,
    ).toBe('evaluations');
  });

  it('les écrans hors de /espace-membre allument leur entrée', () => {
    expect(currentMemberNavItem('/membres', 'membre')?.key).toBe('people');
    expect(currentMemberNavItem('/espaces/abc123', 'membre')?.key).toBe(
      'workspaces',
    );
    expect(currentMemberNavItem('/notifications', 'visiteur')?.key).toBe(
      'notifications',
    );
  });
});

describe('Navigation de l’espace membre — libellés dans les cinq langues', () => {
  const NAV_LABEL: Record<string, keyof typeof fr.member> = {
    dashboard: 'navDashboard',
    profile: 'navProfile',
    messages: 'navMessages',
    notifications: 'navNotifications',
    network: 'navNetwork',
    people: 'navPeople',
    workspaces: 'navWorkspaces',
    publications: 'navPublications',
    tribune: 'navTribune',
    kohop: 'navKohop',
    kohopReviews: 'navKohopReviews',
    manuscripts: 'navManuscripts',
    youth: 'navYouth',
    mentoring: 'navMentoring',
    learning: 'navLearning',
    projects: 'navProjects',
    evaluations: 'navEvaluations',
    payments: 'navPayments',
    organization: 'navOrganization',
    security: 'navSecurity',
    password: 'navPassword',
    data: 'navData',
    admin: 'navAdmin',
  };

  it('chaque entrée du tableau a son libellé, partout', () => {
    for (const group of MEMBER_NAV_GROUPS) {
      for (const item of group.items) {
        const key = NAV_LABEL[item.key];
        expect(key, item.key).toBeDefined();
        for (const [lang, cat] of Object.entries({ fr, en, es, pt, ar })) {
          expect(
            (cat.member as Record<string, string>)[key],
            `${lang} ${key}`,
          ).toBeTruthy();
        }
      }
    }
  });
});

const EMPTY: CompletionInput = {
  exists: false,
  photoUrl: null,
  jobTitle: '',
  bio: '',
  country: '',
  themes: [],
  languages: ['fr'],
  links: [],
  visibility: 'members',
};

const FULL: CompletionInput = {
  exists: true,
  photoUrl: 'https://example.org/p.jpg',
  jobTitle: 'Chercheuse',
  bio: 'Gouvernance numérique.',
  country: 'SN',
  themes: ['numerique'],
  languages: ['fr'],
  links: [{ url: 'https://example.org' }],
  visibility: 'public',
};

describe('Complétude du profil', () => {
  it('un profil non créé ne compte rien, pas même les champs pré-remplis', () => {
    const c = profileCompletion(EMPTY);
    expect(c.done).toBe(0);
    expect(c.percent).toBe(0);
    expect(c.complete).toBe(false);
  });

  it('un profil complet atteint 100 %', () => {
    const c = profileCompletion(FULL);
    expect(c).toMatchObject({
      done: COMPLETION_STEPS.length,
      total: COMPLETION_STEPS.length,
      percent: 100,
      complete: true,
    });
  });

  it('chaque manque ne retire qu’une étape, et c’est la bonne', () => {
    const cases: [Partial<CompletionInput>, string][] = [
      [{ photoUrl: null }, 'photo'],
      [{ jobTitle: '   ' }, 'jobTitle'],
      [{ bio: '' }, 'bio'],
      [{ country: '' }, 'country'],
      [{ themes: [] }, 'themes'],
      [{ languages: [] }, 'languages'],
      [{ links: [{ url: '  ' }] }, 'links'],
      [{ visibility: 'private' }, 'visibility'],
    ];
    for (const [change, step] of cases) {
      const c = profileCompletion({ ...FULL, ...change });
      expect(
        c.steps.filter((s) => !s.done).map((s) => s.key),
        step,
      ).toEqual([step]);
    }
  });

  it('chaque étape mène à une section de l’éditeur', () => {
    for (const step of COMPLETION_STEPS) {
      expect(COMPLETION_ANCHORS[step]).toMatch(/^profil-/);
    }
  });
});

describe('Nom affiché dans l’espace membre', () => {
  it('le nom du profil prime, puis celui du compte', () => {
    expect(
      memberName({
        profileExists: true,
        profileName: ' Awa Diallo ',
        accountName: 'awa',
      }),
    ).toBe('Awa Diallo');
    expect(
      memberName({
        profileExists: false,
        profileName: 'Brouillon',
        accountName: 'Awa D.',
      }),
    ).toBe('Awa D.');
  });

  it('sans nom, rien — jamais l’adresse e-mail en guise de nom', () => {
    expect(
      memberName({ profileExists: false, profileName: '', accountName: null }),
    ).toBeNull();
    expect(
      memberName({ profileExists: true, profileName: '  ', accountName: ' ' }),
    ).toBeNull();
  });
});

describe('Dates relatives', () => {
  const NOW = Date.UTC(2026, 8, 30, 12, 0, 0);
  const MIN = 60_000;

  // `Intl` separates number and unit with a no-break space: compared as
  // plain spaces, the typography is its business.
  const flat = (s: string) => s.replace(/\s/g, ' ');

  it('du plus proche au plus lointain, en français', () => {
    expect(relativeTime(NOW - 20_000, NOW, 'fr')).toBe('maintenant');
    expect(flat(relativeTime(NOW - 5 * MIN, NOW, 'fr'))).toBe('il y a 5 min');
    expect(flat(relativeTime(NOW - 3 * 60 * MIN, NOW, 'fr'))).toBe(
      'il y a 3 h',
    );
    expect(relativeTime(NOW - 24 * 60 * MIN, NOW, 'fr')).toBe('hier');
  });

  it('au-delà d’une semaine, la date elle-même (avec l’année si elle diffère)', () => {
    expect(relativeTime(Date.UTC(2026, 7, 1, 12), NOW, 'fr')).toMatch(
      /^1 août$/,
    );
    expect(relativeTime(Date.UTC(2025, 7, 1, 12), NOW, 'fr')).toMatch(/2025/);
  });

  it('en arabe, des chiffres occidentaux comme le reste du site', () => {
    const out = relativeTime(NOW - 5 * MIN, NOW, 'ar');
    expect(out).toMatch(/5/);
    expect(out).not.toMatch(/[٠-٩]/);
  });
});

describe('Liste des pays du profil', () => {
  it('nommée et triée dans la langue de l’interface', () => {
    const fr = countryOptions('fr');
    expect(fr).toHaveLength(COUNTRY_CODES.length);
    expect(fr.find((c) => c.code === 'SN')?.name).toBe('Sénégal');
    const names = fr.map((c) => c.name);
    expect(names).toEqual(
      [...names].sort((a, b) => new Intl.Collator('fr').compare(a, b)),
    );
    expect(countryOptions('en').find((c) => c.code === 'CI')?.name).toMatch(
      /Côte d.Ivoire/,
    );
  });

  it('un code enregistré hors liste reste proposé, pour ne jamais être perdu', () => {
    expect(countryOptions('fr').some((c) => c.code === 'QZ')).toBe(false);
    expect(countryOptions('fr', 'qz').some((c) => c.code === 'QZ')).toBe(true);
  });
});

const DRAFT: ProfileDraft = {
  displayName: 'Awa Diallo',
  handle: 'awa-diallo',
  jobTitle: 'Chercheuse',
  country: 'SN',
  bio: '',
  themes: ['numerique', 'elections'],
  languages: ['fr'],
  links: [{ kind: 'website', url: 'https://example.org' }],
  visibility: 'members',
  messagePolicy: 'members',
  mutedNotificationTypes: [],
  messageEmail: false,
  notReviewer: false,
};

describe('Pays écrit en texte libre (candidature d’adhésion)', () => {
  const LOCALES = ['fr', 'en', 'es', 'pt', 'ar'] as const;

  it('reconnaît un pays nommé dans l’une des langues du site, ou son code', () => {
    expect(guessCountryCode('Sénégal', LOCALES)).toBe('SN');
    expect(guessCountryCode('  senegal ', LOCALES)).toBe('SN');
    expect(guessCountryCode('Senegal', ['en'])).toBe('SN');
    expect(guessCountryCode('Côte-d’Ivoire', LOCALES)).toBe('CI');
    expect(guessCountryCode("cote d'ivoire", LOCALES)).toBe('CI');
    expect(guessCountryCode('Ghana', LOCALES)).toBe('GH');
    expect(guessCountryCode('sn', LOCALES)).toBe('SN');
  });

  it('ne devine jamais : sans correspondance exacte, rien', () => {
    expect(guessCountryCode('Afrique de l’Ouest', LOCALES)).toBeNull();
    expect(guessCountryCode('Sénég', LOCALES)).toBeNull();
    expect(guessCountryCode('ZZ', LOCALES)).toBeNull();
    expect(guessCountryCode('', LOCALES)).toBeNull();
    expect(guessCountryCode(undefined, LOCALES)).toBeNull();
  });
});

describe('Brouillon du profil — y a-t-il quelque chose à enregistrer ?', () => {
  it('une copie est identique, et indépendante de l’original', () => {
    const copy = draftFrom(DRAFT);
    expect(sameDraft(copy, DRAFT)).toBe(true);
    copy.themes.push('climat');
    expect(DRAFT.themes).not.toContain('climat');
  });

  it('cocher puis décocher ne laisse rien à enregistrer', () => {
    const once = { ...DRAFT, themes: toggleIn(DRAFT.themes, 'climat') };
    expect(sameDraft(once, DRAFT)).toBe(false);
    const back = { ...once, themes: toggleIn(once.themes, 'climat') };
    expect(sameDraft(back, DRAFT)).toBe(true);
  });

  it('l’ordre d’un ensemble de choix ne compte pas, celui des liens si', () => {
    expect(
      sameDraft({ ...DRAFT, themes: ['elections', 'numerique'] }, DRAFT),
    ).toBe(true);
    const two = {
      ...DRAFT,
      links: [
        { kind: 'website' as const, url: 'https://a.org' },
        { kind: 'orcid' as const, url: 'https://b.org' },
      ],
    };
    expect(sameDraft({ ...two, links: [...two.links].reverse() }, two)).toBe(
      false,
    );
  });

  it('les espaces en bord de champ et un lien vide ne comptent pas', () => {
    expect(sameDraft({ ...DRAFT, displayName: ' Awa Diallo ' }, DRAFT)).toBe(
      true,
    );
    expect(
      sameDraft(
        { ...DRAFT, links: [...DRAFT.links, { kind: 'other', url: '' }] },
        DRAFT,
      ),
    ).toBe(true);
  });

  it('un changement de confidentialité est un changement', () => {
    expect(sameDraft({ ...DRAFT, visibility: 'public' }, DRAFT)).toBe(false);
    expect(sameDraft({ ...DRAFT, messageEmail: true }, DRAFT)).toBe(false);
  });
});

describe('Notifications — une icône par nature', () => {
  // The catalogue's words that are not notification titles.
  const UI_KEYS = new Set([
    'title',
    'loading',
    'empty',
    'markAll',
    'bell',
    'bellUnread',
    'bellUnreadMany',
    'unknown',
    'unreadMark',
    'seeAll',
    'pageLead',
    'filterLabel',
    'filterAll',
    'filterUnread',
    'emptyUnread',
  ]);
  const titles = Object.keys(fr.notifications).filter((k) => !UI_KEYS.has(k));

  it('chaque notification du catalogue a une nature (donc une icône)', () => {
    expect(titles.length).toBeGreaterThan(40);
    const unclassified = titles.filter((k) => notificationKind(k) === 'other');
    expect(unclassified).toEqual([]);
  });

  it('les préfixes les plus précis l’emportent', () => {
    expect(notificationKind('socialFollow')).toBe('follow');
    expect(notificationKind('socialMessage')).toBe('message');
    expect(notificationKind('peerReviewAssigned')).toBe('review');
    expect(notificationKind('manuscriptSubmitted')).toBe('review');
    expect(notificationKind('pubPublished')).toBe('publication');
    expect(notificationKind('tribuneComment')).toBe('tribune');
    expect(notificationKind('orgMemberAdded')).toBe('organization');
    expect(notificationKind('mentoringActive')).toBe('programme');
    // A key the interface does not know yet: a neutral icon.
    expect(notificationKind('somethingNew')).toBe('other');
  });
});

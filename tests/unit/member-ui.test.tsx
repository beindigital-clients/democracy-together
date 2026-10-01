// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import {
  render,
  screen,
  cleanup,
  within,
  fireEvent,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import fr from '@/messages/fr.json';
import en from '@/messages/en.json';
import ar from '@/messages/ar.json';
import { MemberNav } from '@/components/member/member-nav';
import { HeroView, type HeroData } from '@/components/member/dashboard/hero';
import { StaffPanelView } from '@/components/member/dashboard/staff-panel';
import { CompletionView } from '@/components/member/dashboard/profile-completion-card';
import { StatTilesView } from '@/components/member/dashboard/stat-tiles';
import {
  RecentPublicationsView,
  RECENT_PUBLICATIONS,
} from '@/components/member/dashboard/recent-publications';
import {
  TribuneSummaryView,
  tribuneCounts,
} from '@/components/member/dashboard/tribune-summary';
import { MembershipView } from '@/components/member/dashboard/membership-card';
import { SecurityView } from '@/components/member/dashboard/security-card';
import {
  ActivityPanelView,
  type ActivityNotification,
} from '@/components/member/dashboard/activity-panel';
import { ProgrammesGrid } from '@/components/member/dashboard/programmes-grid';
import {
  ChipGroup,
  ChoiceCards,
  SwitchRow,
} from '@/components/social/profile-controls';
import { MemberPageHeader } from '@/components/member/page-header';
import {
  ComboboxField,
  SelectMenuField,
  foldSearch,
  matchesSearch,
} from '@/components/ui/choice-fields';
import { profileCompletion } from '@/lib/profile-completion';
import type { MyPublication } from '@/components/member/publications-table';
import type { Id } from '@convex/_generated/dataModel';

afterEach(cleanup);

// THE REDESIGNED MEMBER AREA, mounted with the real catalogs: a missing key
// makes a render fail instead of showing the last segment of the key.
// Only PURE views are rendered here (no Convex, no router): the containers
// read the data and hand it over, as elsewhere in the repo.

const CATALOGS = { fr, en, ar } as const;

function mount(ui: ReactNode, locale: keyof typeof CATALOGS = 'fr') {
  return render(
    <NextIntlClientProvider locale={locale} messages={CATALOGS[locale]}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe('Navigation latérale', () => {
  it('nommée, et une seule entrée courante', () => {
    mount(<MemberNav role="membre" pathname="/espace-membre/deposer" />);
    const nav = screen.getByRole('navigation', { name: 'Mon espace' });
    const current = within(nav)
      .getAllByRole('link')
      .filter((a) => a.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    // The submission form belongs to "Mes publications".
    expect(current[0].textContent).toBe('Mes publications');
  });

  it('les entrées suivent le rôle : visiteur, membre, administrateur', () => {
    mount(<MemberNav role="visiteur" pathname="/espace-membre" />);
    expect(screen.queryByRole('link', { name: 'Mes publications' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Administration' })).toBeNull();
    cleanup();

    mount(<MemberNav role="admin" pathname="/espace-membre" />);
    expect(
      screen.getByRole('link', { name: 'Administration' }).getAttribute('href'),
    ).toBe('/fr/admin');
    expect(screen.getByRole('link', { name: 'Mes publications' })).toBeTruthy();
  });

  it('les groupes sont titrés, et leurs listes rattachées à leur titre', () => {
    mount(<MemberNav role="membre" pathname="/espace-membre" />);
    expect(screen.getByRole('list', { name: 'Contributions' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Compte' })).toBeTruthy();
  });

  it('les conversations non lues : pastille visuelle ET phrase lue', () => {
    mount(
      <MemberNav
        role="membre"
        pathname="/espace-membre"
        unreadMessages={{ count: 2, capped: false }}
      />,
    );
    const link = screen.getByRole('link', {
      name: 'Messages (2 conversations non lues)',
    });
    // The badge is for the eye: its number is not read twice.
    const badge = link.querySelector('[aria-hidden="true"].rounded-pill');
    expect(badge?.textContent).toBe('2');
    // Never the header badge's wording: the E2E journeys find that one by
    // name, and two links answering it would be ambiguous.
    expect(link.textContent).not.toMatch(/Messages, /);
  });

  it('les notifications non lues : pastille ET phrase lue, comme les messages', () => {
    mount(
      <MemberNav
        role="visiteur"
        pathname="/notifications"
        unreadNotifications={{ count: 3, capped: false }}
      />,
    );
    const link = screen.getByRole('link', {
      name: 'Notifications (3 notifications non lues)',
    });
    expect(link.getAttribute('href')).toBe('/fr/notifications');
    expect(link.getAttribute('aria-current')).toBe('page');
  });

  it('au-delà du plafond, « plus de 9 »', () => {
    mount(
      <MemberNav
        role="membre"
        pathname="/espace-membre"
        unreadMessages={{ count: 9, capped: true }}
      />,
    );
    expect(
      screen.getByRole('link', {
        name: 'Messages (plus de 9 conversations non lues)',
      }),
    ).toBeTruthy();
  });

  it('traduite (arabe)', () => {
    mount(<MemberNav role="membre" pathname="/espace-membre" />, 'ar');
    expect(screen.getByRole('navigation', { name: 'فضائي' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'لوحة المتابعة' })).toBeTruthy();
  });
});

const NOW = Date.UTC(2026, 8, 30, 12);
const HERO: HeroData = {
  name: 'Awa Diallo',
  email: 'awa@example.org',
  photoUrl: null,
  role: 'membre',
  organization: { name: 'Institut Démo', slug: 'institut-demo' },
  profile: { exists: true, handle: 'awa-diallo', visibility: 'members' },
};

describe('En-tête du tableau de bord', () => {
  it('le titre de niveau 1 nomme le lieu ET salue la personne', () => {
    mount(<HeroView data={HERO} now={NOW} />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toBe('Espace membre. Bonjour, Awa Diallo');
  });

  it('en anglais, « Member area » reste dans le nom du titre', () => {
    mount(<HeroView data={HERO} now={NOW} />, 'en');
    expect(
      screen.getByRole('heading', { level: 1, name: /^Member area/ })
        .textContent,
    ).toContain('Hello, Awa Diallo');
  });

  it('sans nom : une salutation, jamais l’adresse e-mail', () => {
    mount(<HeroView data={{ ...HERO, name: null }} now={NOW} />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toContain('Bonjour et bienvenue');
    expect(h1.textContent).not.toContain('@');
  });

  it('profil existant et visible : modifier, et voir sa page', () => {
    mount(<HeroView data={HERO} now={NOW} />);
    expect(
      screen.getByRole('link', { name: 'Modifier mon profil' }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'Voir ma page de profil' })
        .getAttribute('href'),
    ).toBe('/fr/membres/awa-diallo');
  });

  it('pas de page à montrer : profil privé, ou compte visiteur', () => {
    mount(
      <HeroView
        data={{
          ...HERO,
          profile: { ...HERO.profile, visibility: 'private' },
        }}
        now={NOW}
      />,
    );
    expect(
      screen.queryByRole('link', { name: 'Voir ma page de profil' }),
    ).toBeNull();
    cleanup();
    mount(<HeroView data={{ ...HERO, role: 'visiteur' }} now={NOW} />);
    expect(
      screen.queryByRole('link', { name: 'Voir ma page de profil' }),
    ).toBeNull();
  });

  it('sans profil : l’action est de le créer', () => {
    mount(
      <HeroView
        data={{
          ...HERO,
          profile: { exists: false, handle: '', visibility: 'members' },
        }}
        now={NOW}
      />,
    );
    expect(
      screen
        .getByRole('link', { name: 'Créer mon profil' })
        .getAttribute('href'),
    ).toBe('/fr/espace-membre/profil');
  });
});

describe('Bloc Administration', () => {
  const STATS = {
    pendingApplications: 2,
    pendingPublications: 0,
    unhandledContacts: 1,
    totalUsers: 40,
  };

  it('chaque file mène à son écran ; le lien du back-office est unique', () => {
    mount(<StaffPanelView stats={STATS} role="admin" />);
    const region = screen.getByRole('region', { name: 'Administration' });
    expect(
      within(region)
        .getByRole('link', { name: /Candidatures en attente/ })
        .getAttribute('href'),
    ).toBe('/fr/admin/candidatures');
    expect(
      within(region)
        .getByRole('link', { name: /Comptes utilisateurs/ })
        .getAttribute('href'),
    ).toBe('/fr/admin/utilisateurs');
    // The E2E journey finds the back office by this name: exactly one.
    expect(
      screen.getAllByRole('link', { name: /Espace d.administration/ }),
    ).toHaveLength(1);
  });

  it('un modérateur voit le nombre de comptes, sans lien vers un écran qui lui est fermé', () => {
    mount(<StaffPanelView stats={STATS} role="moderateur" />);
    expect(
      screen.queryByRole('link', { name: /Comptes utilisateurs/ }),
    ).toBeNull();
    expect(screen.getByText('Comptes utilisateurs')).toBeTruthy();
  });

  it('rien en attente : il le dit', () => {
    mount(
      <StaffPanelView
        stats={{
          pendingApplications: 0,
          pendingPublications: 0,
          unhandledContacts: 0,
          totalUsers: 3,
        }}
        role="admin"
      />,
    );
    expect(
      screen.getByText("Rien n'attend de décision pour le moment."),
    ).toBeTruthy();
  });
});

describe('Complétude du profil (bloc)', () => {
  it('ne liste que ce qui reste à faire, chaque étape menant à sa section', () => {
    const completion = profileCompletion({
      exists: true,
      photoUrl: null,
      jobTitle: 'Chercheuse',
      bio: 'Texte',
      country: 'SN',
      themes: ['numerique'],
      languages: ['fr'],
      links: [],
      visibility: 'members',
    });
    mount(<CompletionView completion={completion} />);
    const links = screen
      .getAllByRole('link')
      .map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['Ajouter une photo', '/fr/espace-membre/profil#profil-photo'],
      [
        'Ajouter un lien (site, LinkedIn, ORCID…)',
        '/fr/espace-membre/profil#profil-liens',
      ],
    ]);
    expect(screen.getByText('Encore 2 étapes.')).toBeTruthy();
    expect(screen.getByText('7 étapes sur 9 terminées')).toBeTruthy();
  });

  it('disparaît une fois le profil complet', () => {
    const { container } = mount(
      <CompletionView
        completion={profileCompletion({
          exists: true,
          photoUrl: 'https://example.org/p.jpg',
          jobTitle: 'x',
          bio: 'x',
          country: 'SN',
          themes: ['numerique'],
          languages: ['fr'],
          links: [{ url: 'https://example.org' }],
          visibility: 'public',
        })}
      />,
    );
    expect(container.textContent).toBe('');
  });
});

describe('Chiffres du tableau de bord', () => {
  it('chaque chiffre mène là où il se traite, et le plafond s’affiche « 9+ »', () => {
    mount(
      <StatTilesView
        data={{
          followers: { value: 12 },
          following: { value: 3 },
          unreadMessages: { value: 9, capped: true },
          unreadNotifications: { value: 0, capped: false },
        }}
      />,
    );
    const messages = screen.getByRole('link', {
      name: /Conversations non lues/,
    });
    expect(messages.getAttribute('href')).toBe('/fr/espace-membre/messages');
    expect(messages.textContent).toContain('9+');
    expect(screen.getByRole('link', { name: /Abonnés/ }).textContent).toContain(
      '12',
    );
  });
});

function pub(i: number, status: string): MyPublication {
  return {
    _id: `p${i}`,
    title: `Publication ${i}`,
    slug: `publication-${i}`,
    type: 'rapport',
    status,
    submittedAt: NOW - i * 86_400_000,
    reviewNotes: status === 'draft' ? 'Préciser la méthode.' : null,
  };
}

describe('Mes publications (bloc)', () => {
  it('vide : l’invitation à déposer la première', () => {
    mount(<RecentPublicationsView items={[]} />);
    expect(
      screen
        .getByRole('link', { name: 'Déposer ma première publication' })
        .getAttribute('href'),
    ).toBe('/fr/espace-membre/deposer');
  });

  it('les dernières seulement, statut écrit, « Ouvrir » pour ce qui est en ligne', () => {
    const items = [
      pub(1, 'pending'),
      pub(2, 'published'),
      pub(3, 'draft'),
      ...Array.from({ length: 4 }, (_, i) => pub(i + 4, 'published')),
    ];
    mount(<RecentPublicationsView items={items} />);
    const table = screen.getByRole('table', { name: 'Mes publications' });
    // Header row + the latest five.
    expect(within(table).getAllByRole('row')).toHaveLength(
      RECENT_PUBLICATIONS + 1,
    );
    const pending = within(table)
      .getAllByRole('row')
      .find((r) => r.textContent?.includes('Publication 1'))!;
    expect(within(pending).getByText('En revue')).toBeTruthy();
    expect(within(pending).queryByRole('link', { name: 'Ouvrir' })).toBeNull();
    const published = within(table)
      .getAllByRole('row')
      .find((r) => r.textContent?.includes('Publication 2'))!;
    expect(
      within(published)
        .getByRole('link', { name: 'Ouvrir' })
        .getAttribute('href'),
    ).toBe('/fr/bibliotheque/publication-2');
    // The editorial note of a publication to revise is shown to its author.
    expect(screen.getByText('Préciser la méthode.')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /Voir mes 7 publications/ }),
    ).toBeTruthy();
  });
});

describe('Tribune (bloc)', () => {
  it('rejetés et retirés comptent ensemble comme « non retenus »', () => {
    expect(
      tribuneCounts(
        [
          { status: 'published' },
          { status: 'pending' },
          { status: 'rejected' },
          { status: 'removed' },
        ],
        [{}, {}],
      ),
    ).toEqual({ published: 1, pending: 1, declined: 2, comments: 2 });
  });

  it('rien encore : l’invitation à prendre la parole', () => {
    mount(
      <TribuneSummaryView
        counts={{ published: 0, pending: 0, declined: 0, comments: 0 }}
      />,
    );
    expect(
      screen
        .getByRole('link', { name: 'Prendre la parole' })
        .getAttribute('href'),
    ).toBe('/fr/tribune');
  });
});

describe('Mon adhésion (bloc)', () => {
  it('à jour, échue, jamais réglée : un statut écrit et la bonne action', () => {
    const periodEnd = Date.UTC(2027, 4, 14);
    mount(<MembershipView dues={{ status: 'upToDate', periodEnd }} />);
    expect(screen.getByText('À jour')).toBeTruthy();
    expect(screen.getByText(/réglée jusqu'au 14 mai 2027/)).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Gérer mon adhésion' }),
    ).toBeTruthy();
    cleanup();

    mount(<MembershipView dues={{ status: 'expired', periodEnd }} />);
    expect(screen.getByText('À renouveler')).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'Régler ma cotisation' })
        .getAttribute('href'),
    ).toBe('/fr/espace-membre/cotisations');
    cleanup();

    mount(<MembershipView dues={{ status: 'none' }} />);
    expect(screen.getByText('Non réglée')).toBeTruthy();
  });
});

describe('Sécurité du compte (bloc)', () => {
  it('garde les libellés des parcours qui partent d’ici', () => {
    mount(<SecurityView state={{ enabled: false, required: false }} />);
    expect(
      screen
        .getByRole('link', { name: /Sécurité et double authentification/ })
        .getAttribute('href'),
    ).toBe('/fr/espace-membre/securite');
    expect(
      screen
        .getByRole('link', { name: /Définir ou changer mon mot de passe/ })
        .getAttribute('href'),
    ).toBe('/fr/espace-membre/mot-de-passe');
    expect(
      screen.getByText('Double authentification désactivée.'),
    ).toBeTruthy();
  });

  it('obligatoire pour le rôle et inactive : il le dit', () => {
    mount(<SecurityView state={{ enabled: false, required: true }} />);
    expect(screen.getByText(/obligatoire pour votre rôle/)).toBeTruthy();
    cleanup();
    mount(<SecurityView state={{ enabled: true, required: true }} />);
    expect(screen.getByText('Double authentification activée.')).toBeTruthy();
    expect(screen.queryByText(/obligatoire pour votre rôle/)).toBeNull();
  });
});

describe('Activité récente (bloc)', () => {
  const NOTIF: ActivityNotification = {
    _id: 'n1' as Id<'notifications'>,
    titleKey: 'socialFollow',
    params: { name: 'Awa Diallo' },
    link: '/espace-membre/reseau',
    read: false,
    createdAt: NOW - 5 * 60_000,
  };

  it('traduit la notification, signale le non-lu, et confie l’ouverture au conteneur', () => {
    const onOpen = vi.fn();
    mount(
      <ActivityPanelView
        notifications={[NOTIF]}
        feed={[]}
        showFeed
        now={NOW}
        onOpenNotification={onOpen}
      />,
    );
    const button = screen.getByRole('button', {
      name: /Awa Diallo vous suit désormais\. \(non lue\)/,
    });
    button.click();
    expect(onOpen).toHaveBeenCalledWith(NOTIF);
  });

  it('une clé inconnue ne s’affiche jamais brute', () => {
    mount(
      <ActivityPanelView
        notifications={[{ ...NOTIF, titleKey: 'cleQuiNExistePas', read: true }]}
        feed={undefined}
        showFeed={false}
        now={NOW}
        onOpenNotification={() => undefined}
      />,
    );
    expect(screen.getByText('Nouvelle notification')).toBeTruthy();
    expect(screen.queryByText(/cleQuiNExistePas/)).toBeNull();
    // A visitor has no network section.
    expect(screen.queryByText('Dans votre réseau')).toBeNull();
  });

  it('un réseau vide invite à découvrir des membres', () => {
    mount(
      <ActivityPanelView
        notifications={[]}
        feed={[]}
        showFeed
        now={NOW}
        onOpenNotification={() => undefined}
      />,
    );
    expect(
      screen
        .getByRole('link', { name: /Découvrir des membres/ })
        .getAttribute('href'),
    ).toBe('/fr/membres');
  });

  it('le fil du réseau lie la contribution et son auteur', () => {
    mount(
      <ActivityPanelView
        notifications={[]}
        feed={[
          {
            kind: 'publication',
            title: 'Confiance institutionnelle',
            href: '/bibliotheque/confiance',
            at: NOW - 3 * 3_600_000,
            author: { handle: 'awa-diallo', displayName: 'Awa Diallo' },
          },
        ]}
        showFeed
        now={NOW}
        onOpenNotification={() => undefined}
      />,
    );
    expect(
      screen
        .getByRole('link', { name: 'Confiance institutionnelle' })
        .getAttribute('href'),
    ).toBe('/fr/bibliotheque/confiance');
    expect(
      screen.getByRole('link', { name: 'Awa Diallo' }).getAttribute('href'),
    ).toBe('/fr/membres/awa-diallo');
  });
});

describe('Programmes (bloc)', () => {
  it('appels à projets et évaluations réservés aux membres', () => {
    mount(<ProgrammesGrid role="visiteur" />);
    expect(screen.getAllByRole('link')).toHaveLength(3);
    cleanup();
    mount(<ProgrammesGrid role="membre" />);
    expect(screen.getAllByRole('link')).toHaveLength(5);
    expect(
      screen
        .getByRole('link', { name: /Appels à projets/ })
        .getAttribute('href'),
    ).toBe('/fr/espace-membre/projets');
  });

  it('l’équipe n’a pas de bloc programmes : elle les pilote depuis le back-office', () => {
    for (const role of ['moderateur', 'editeur', 'admin']) {
      const { container } = mount(<ProgrammesGrid role={role} />);
      expect(container.textContent, role).toBe('');
      cleanup();
    }
  });
});

describe('Contrôles de l’éditeur de profil', () => {
  it('pastilles : de vraies cases à cocher, dans un groupe nommé', () => {
    const onToggle = vi.fn();
    mount(
      <ChipGroup
        legend="Thématiques"
        options={[
          { value: 'numerique', label: 'Numérique' },
          { value: 'climat', label: 'Climat' },
        ]}
        value={['numerique']}
        onToggle={onToggle}
      />,
    );
    const group = screen.getByRole('group', { name: 'Thématiques' });
    const boxes = within(group).getAllByRole('checkbox');
    expect(boxes.map((b) => (b as HTMLInputElement).checked)).toEqual([
      true,
      false,
    ]);
    within(group).getByRole('checkbox', { name: 'Climat' }).click();
    expect(onToggle).toHaveBeenCalledWith('climat');
  });

  it('cartes de choix : des boutons radio dont le nom COMMENCE par le titre', () => {
    const onChange = vi.fn();
    mount(
      <ChoiceCards
        legend="Visibilité du profil"
        name="visibility"
        options={[
          { value: 'members', title: 'Membres du réseau', description: 'x' },
          { value: 'public', title: 'Public', description: 'y' },
        ]}
        value="members"
        onChange={onChange}
      />,
    );
    // The E2E journeys pick these by /^Public/ and /^Membres du réseau/.
    const pub = screen.getByRole('radio', { name: /^Public/ });
    expect(
      screen.getByRole('radio', {
        name: /^Membres du réseau/,
      }).checked,
    ).toBe(true);
    pub.click();
    expect(onChange).toHaveBeenCalledWith('public');
  });

  it('interrupteur : une case à cocher au rôle « switch »', () => {
    const onChange = vi.fn();
    mount(
      <SwitchRow label="Nouvel abonné" checked={false} onChange={onChange} />,
    );
    const sw = screen.getByRole('switch', { name: 'Nouvel abonné' });
    expect((sw as HTMLInputElement).checked).toBe(false);
    sw.click();
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('En-tête d’un écran de l’espace membre', () => {
  it('un seul titre de niveau 1, et les actions de l’écran', () => {
    mount(
      <MemberPageHeader
        title="Mes publications"
        lead="Tout ce que vous avez déposé."
        actions={<button type="button">Nouvelle publication</button>}
      />,
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Mes publications' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Nouvelle publication' }),
    ).toBeTruthy();
  });
});

describe('Champs de choix (shadcn) — liés à leur libellé comme un champ texte', () => {
  const COUNTRIES = [
    { value: 'CI', label: 'Côte d’Ivoire' },
    { value: 'SN', label: 'Sénégal' },
    { value: 'FR', label: 'France' },
  ];

  it('la recherche ignore accents et casse, et trouve aussi le code', () => {
    expect(foldSearch('  Sénégal ')).toBe('senegal');
    expect(matchesSearch('Sénégal SN', 'senegal')).toBe(true);
    expect(matchesSearch('Sénégal SN', 'SÉNÉ')).toBe(true);
    expect(matchesSearch('Côte d’Ivoire CI', 'ci')).toBe(true);
    expect(matchesSearch('France FR', 'sen')).toBe(false);
    // Nothing typed: everything stays listed.
    expect(matchesSearch('France FR', '   ')).toBe(true);
  });

  it('liste déroulante : nommée par son libellé, montre le choix courant', () => {
    mount(
      <SelectMenuField
        label="Type de lien"
        value="SN"
        onValueChange={() => {}}
        options={COUNTRIES}
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Type de lien' });
    expect(trigger.textContent).toContain('Sénégal');
  });

  it('liste déroulante : le choix vide a son libellé, et l’erreur est reliée', () => {
    mount(
      <SelectMenuField
        label="Pays"
        value=""
        onValueChange={() => {}}
        options={COUNTRIES}
        emptyLabel="Tous les pays"
        error="Choisissez un pays."
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Pays' });
    expect(trigger.textContent).toContain('Tous les pays');
    expect(trigger.getAttribute('aria-invalid')).toBe('true');
    const described = trigger.getAttribute('aria-describedby') ?? '';
    expect(
      described
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' '),
    ).toContain('Choisissez un pays.');
  });

  it('liste avec recherche : on tape, la liste se réduit, un clic choisit', () => {
    const onValueChange = vi.fn();
    mount(
      <ComboboxField
        label="Pays"
        value=""
        onValueChange={onValueChange}
        options={COUNTRIES}
        placeholder="Choisir un pays"
        emptyLabel="Non précisé"
        searchLabel="Rechercher un pays"
        searchPlaceholder="Rechercher…"
        noResults="Aucun pays ne correspond."
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Pays' });
    expect(trigger.textContent).toContain('Choisir un pays');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const search = screen.getByRole('combobox', { name: 'Rechercher un pays' });
    expect(screen.getAllByRole('option')).toHaveLength(4);

    fireEvent.change(search, { target: { value: 'senegal' } });
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Sénégal']);

    fireEvent.click(options[0]);
    expect(onValueChange).toHaveBeenCalledWith('SN');
  });

  it('liste avec recherche : aucune correspondance, un message le dit', () => {
    mount(
      <ComboboxField
        label="Pays"
        value="FR"
        onValueChange={() => {}}
        options={COUNTRIES}
        placeholder="Choisir un pays"
        searchLabel="Rechercher un pays"
        searchPlaceholder="Rechercher…"
        noResults="Aucun pays ne correspond."
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Pays' });
    // The current choice is shown on the trigger.
    expect(trigger.textContent).toContain('France');
    fireEvent.click(trigger);
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Rechercher un pays' }),
      { target: { value: 'zzz' } },
    );
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('Aucun pays ne correspond.')).toBeTruthy();
  });
});

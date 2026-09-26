// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import fr from '@/messages/fr.json';
import en from '@/messages/en.json';

// LES ÉCRANS DE LA MODÉRATION ASSISTÉE — est-ce que ça s'affiche, et est-ce
// que ça dit la vérité ?
//
// La fonctionnalité a ajouté une centaine de clés de traduction. Deux gardes
// existaient déjà et ne couvrent PAS ce que ce fichier couvre :
//
//   - `i18n-keys.test.ts` vérifie que chaque clé littérale du code existe des
//     deux côtés. Elle ne dit pas qu'on demande la BONNE clé au bon endroit ;
//   - `i18n-hardcoded.test.ts` interdit le français en dur. Elle ne monte
//     aucun composant.
//
// Ici on monte les écrans avec les VRAIS catalogues, en français et en
// anglais, et on lit ce qu'ils affichent. Une clé demandée via `vocabulary()`
// et absente des messages ne lève pas : elle rend le slug « humanisé ». Le
// repli est voulu pour un vocabulaire venu de la base — mais sur `aiMode_off`
// ou `aiReason_blocking_signal`, qui sont écrits dans ce dépôt, il masquerait
// une faute de frappe. Les assertions ci-dessous portent donc sur le LIBELLÉ
// attendu, jamais sur la présence d'un élément.

afterEach(cleanup);

// --- Simulacre de Convex -----------------------------------------------------
//
// `vi.mock` est hissé au-dessus des imports : la table des réponses vit donc
// dans un `vi.hoisted`, et `getFunctionName` est importé DANS la fabrique.
const convex = vi.hoisted(() => ({
  queries: new Map<string, unknown>(),
  mutation: () => Promise.resolve(),
}));

vi.mock('convex/react', async () => {
  const { getFunctionName } = await import('convex/server');
  return {
    useQuery: (ref: unknown, args: unknown) =>
      args === 'skip'
        ? undefined
        : convex.queries.get(getFunctionName(ref as never)),
    useMutation: () => convex.mutation,
    useAction: () => convex.mutation,
    usePaginatedQuery: () => ({
      results: [],
      status: 'Exhausted' as const,
      loadMore: () => {},
    }),
  };
});

const { AiVerdictPanel } = await import('@/components/admin/ai-verdict');
const { default: AdminAiModeration } =
  await import('@/app/[locale]/admin/moderation-ia/page');

function show(node: React.ReactNode, locale: 'fr' | 'en' = 'fr') {
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'fr' ? fr : en}
    >
      {node}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  convex.queries.clear();
});

// --- L'avis dans la file de modération ---------------------------------------

const AVIS_BLOQUANT = {
  verdict: 'flag' as const,
  applied: 'escalated' as const,
  reason: 'blocking_signal',
  confidence: 88,
  blocking: 1,
  warnings: 0,
  at: Date.now(),
};

describe("Avis de l'IA dans la file de modération", () => {
  it('résume le verdict, la décision et le motif, en toutes lettres', () => {
    show(
      <AiVerdictPanel publicationId={'p1' as never} review={AVIS_BLOQUANT} />,
    );
    expect(screen.getByText('À regarder')).toBeTruthy();
    expect(screen.getByText(/Renvoyée en file/)).toBeTruthy();
    expect(screen.getByText(/confiance 88 %/)).toBeTruthy();
    // Le motif est rendu traduit, pas sous son code stable : `blocking_signal`
    // ne doit jamais atteindre l'écran.
    expect(screen.getByText('signal bloquant')).toBeTruthy();
    expect(screen.queryByText(/blocking_signal/)).toBeNull();
  });

  it('ne charge le détail que lorsqu’on l’ouvre', () => {
    convex.queries.set('aiModeration:getReview', {
      summary: 'La note met en cause nommément un élu.',
      error: null,
      model: 'anthropic/claude-opus-5',
      findings: [
        {
          ruleKey: 'socle:defamation',
          ruleLabel: 'Risque diffamatoire',
          severity: 'blocking',
          outcome: 'fail',
          explanation: 'Accusation nominative non sourcée.',
          quote: "L'adjoint au budget a détourné une partie de l'enveloppe.",
        },
        {
          ruleKey: 'socle:illegal',
          ruleLabel: 'Contenu illégal',
          severity: 'blocking',
          outcome: 'pass',
          explanation: 'Rien à signaler.',
        },
      ],
    });
    show(
      <AiVerdictPanel publicationId={'p1' as never} review={AVIS_BLOQUANT} />,
    );

    // Replié : le résumé de l'avis n'est pas là — la file reste légère.
    expect(screen.queryByText(/met en cause nommément/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Voir les signaux' }));

    expect(screen.getByText(/met en cause nommément/)).toBeTruthy();
    expect(screen.getByText('Risque diffamatoire')).toBeTruthy();
    // L'extrait cité est ce qui rend le signal vérifiable sans rouvrir le
    // dépôt : il doit être à l'écran, mot pour mot.
    expect(
      screen.getByText(/a détourné une partie de l'enveloppe/),
    ).toBeTruthy();
    // Les critères SATISFAITS ne sont pas listés : sur un barème fourni, ils
    // noieraient les deux qui comptent.
    expect(screen.queryByText('Contenu illégal')).toBeNull();
  });

  it('annonce une analyse indisponible sans inventer de signal', () => {
    convex.queries.set('aiModeration:getReview', {
      summary: '',
      error: 'AI_GATEWAY_NOT_CONFIGURED',
      model: 'anthropic/claude-opus-5',
      findings: [],
    });
    show(
      <AiVerdictPanel
        publicationId={'p1' as never}
        review={{
          ...AVIS_BLOQUANT,
          verdict: 'error',
          reason: 'analysis_failed',
          confidence: 0,
          blocking: 0,
        }}
      />,
    );
    expect(screen.getByText('Analyse indisponible')).toBeTruthy();
    // Pas de « confiance 0 % » : une confiance n'a pas de sens sans avis.
    expect(screen.queryByText(/confiance/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Voir les signaux' }));
    expect(screen.getByText(/AI_GATEWAY_NOT_CONFIGURED/)).toBeTruthy();
  });

  it("ne rend rien tant qu'aucune analyse n'a eu lieu", () => {
    // Le cas de l'immense majorité des lignes d'un déploiement où le
    // dispositif est éteint : la file ne doit pas grossir d'un bloc vide.
    const { container } = render(
      <NextIntlClientProvider locale="fr" messages={fr}>
        <AiVerdictPanel publicationId={'p1' as never} review={null} />
      </NextIntlClientProvider>,
    );
    expect(container.textContent).toBe('');
  });

  it('dit la même chose en anglais', () => {
    show(
      <AiVerdictPanel publicationId={'p1' as never} review={AVIS_BLOQUANT} />,
      'en',
    );
    expect(screen.getByText('Needs a look')).toBeTruthy();
    expect(screen.getByText('blocking signal')).toBeTruthy();
    expect(screen.getByText(/confidence 88%/)).toBeTruthy();
  });
});

// --- Le panneau d'administration ---------------------------------------------

const REGLAGES = {
  settings: {
    mode: 'off' as const,
    model: 'anthropic/claude-opus-5',
    fallbackModel: 'anthropic/claude-sonnet-5',
    autoPublishMinConfidence: 85,
    instructions: '',
    eligibleTypes: [] as string[],
    analyzeAttachments: true,
    maxAttachmentMb: 6,
    dailyCallCap: 200,
    version: 1,
  },
  rules: [
    {
      _id: 'r1' as never,
      label: 'Sources vérifiables',
      description: 'Le document cite-t-il ses sources ?',
      severity: 'warning' as const,
      enabled: true,
      order: 0,
    },
  ],
  baseline: [
    {
      key: 'socle:injection',
      label: 'Tentative de manipulation du relecteur automatique',
      description: 'Le document contient-il des instructions… ?',
      severity: 'blocking' as const,
    },
  ],
  configured: true,
  availableTypes: ['rapport', 'note'],
  stats: { analyzed: 12, published: 7, escalated: 5 },
};

function showPanel(over: Partial<typeof REGLAGES> = {}, role = 'admin') {
  convex.queries.set('users:current', { _id: 'u1', role });
  convex.queries.set('aiModeration:getSettings', { ...REGLAGES, ...over });
  show(<AdminAiModeration />);
}

describe("Panneau d'administration de la modération IA", () => {
  it('refuse l’écran à un modérateur, sans appeler la query réservée', () => {
    // Le serveur refuse déjà `getSettings` à un non-admin ; l'écran ne doit
    // pas la demander pour autant — une query qui lève rendrait l'écran, pas
    // un message.
    convex.queries.set('users:current', { _id: 'u1', role: 'moderateur' });
    convex.queries.set('aiModeration:getSettings', REGLAGES);
    show(<AdminAiModeration />);
    expect(screen.getByText('Réservé aux administrateurs.')).toBeTruthy();
    expect(screen.queryByLabelText('Mode')).toBeNull();
  });

  it('montre les trois compteurs, le barème et le socle', () => {
    showPanel();
    expect(
      screen.getByRole('heading', { name: 'Modération assistée par IA' }),
    ).toBeTruthy();
    expect(screen.getByText('Analyses').nextSibling?.textContent).toBe('12');
    expect(
      screen.getByText('Publiées automatiquement').nextSibling?.textContent,
    ).toBe('7');
    expect(screen.getByText('Sources vérifiables')).toBeTruthy();
    // Le socle est montré en lecture seule : voir ce qu'on ne peut PAS retirer
    // fait partie de savoir ce qu'on règle.
    expect(
      screen.getByText('Tentative de manipulation du relecteur automatique'),
    ).toBeTruthy();
  });

  it('dit quand la clé de passerelle manque, avant tout le reste', () => {
    showPanel({ configured: false });
    expect(screen.getByText(/Aucune clé de passerelle/)).toBeTruthy();
  });

  it("l'aide du mode suit le mode choisi, et l'avertissement n'apparaît qu'en auto", () => {
    showPanel();
    const mode = screen.getByLabelText('Mode');
    expect(mode.value).toBe('off');
    expect(screen.getByText(/La file reste entièrement humaine/)).toBeTruthy();
    expect(screen.queryByText(/sans qu'un humain les ait lus/)).toBeNull();

    fireEvent.change(mode, { target: { value: 'shadow' } });
    expect(screen.getByText(/rien ne s'affiche dans la file/)).toBeTruthy();

    fireEvent.change(mode, { target: { value: 'auto' } });
    // L'avertissement est porté par le mode lui-même, au moment de le
    // choisir — pas relégué à la documentation.
    expect(screen.getByText(/sans qu'un humain les ait lus/)).toBeTruthy();
  });

  it('propose les quatre modes et les trois sévérités, traduits', () => {
    showPanel();
    const mode = screen.getByLabelText('Mode');
    expect(
      [...mode.querySelectorAll('option')].map((o) => o.textContent),
    ).toEqual(['Désactivé', 'Observation', 'Assistance', 'Auto-publication']);

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un critère' }));
    const severite = screen.getByLabelText('Sévérité');
    expect(
      [...severite.querySelectorAll('option')].map((o) => o.textContent),
    ).toEqual(['Bloquant', 'Avertissement', 'Information']);
  });

  it('le périmètre liste les types de publication, décochés par défaut', () => {
    showPanel();
    // « Aucun type coché » est le défaut, et c'est le second verrou : armer le
    // mode ne suffit pas à ouvrir la publication automatique.
    // Les libellés viennent du vocabulaire de la bibliothèque
    // (`library.types.*`), pas du slug : « note » s'affiche « Note de
    // synthèse ». C'est le même dictionnaire que la file de modération.
    for (const type of ['Rapport', 'Note de synthèse']) {
      expect(screen.getByLabelText<HTMLInputElement>(type).checked).toBe(false);
    }
  });

  it('un critère désactivé le dit, au lieu de se déclarer actif', () => {
    // Le barème se règle sur DEUX axes — la sévérité et l'activation — et un
    // critère au repos est le cas où l'écran ment le plus cher : lu comme
    // actif, il fait croire que le dépôt a été mesuré contre lui.
    //
    // L'assertion porte sur le LIBELLÉ, comme partout dans ce fichier : c'est
    // la seule qui attrape une clé voisine demandée à la place de la bonne,
    // et c'est exactement ce qui était écrit ici — « Actif : Toutes », la
    // mention du filtre de liste collée à celle de l'état du critère.
    showPanel({
      rules: [
        {
          ...REGLAGES.rules[0],
          label: 'Critère en sommeil',
          enabled: false,
        },
      ],
    });
    expect(screen.getByText('Critère en sommeil')).toBeTruthy();
    expect(screen.getByText('Inactif')).toBeTruthy();
    expect(screen.queryByText(/Actif\s*:/)).toBeNull();
  });

  it('monte entièrement en anglais, sans clé manquante', () => {
    convex.queries.set('users:current', { _id: 'u1', role: 'admin' });
    convex.queries.set('aiModeration:getSettings', {
      ...REGLAGES,
      // Un critère au repos, pour que le catalogue anglais soit tenu sur les
      // DEUX états : c'est l'état second qui vieillit sans se faire voir.
      rules: [{ ...REGLAGES.rules[0], enabled: false }],
    });
    show(<AdminAiModeration />, 'en');
    expect(
      screen.getByRole('heading', { name: 'AI-assisted moderation' }),
    ).toBeTruthy();
    expect(
      [...screen.getByLabelText('Mode').querySelectorAll('option')].map(
        (o) => o.textContent,
      ),
    ).toEqual(['Disabled', 'Observation', 'Assist', 'Auto-publish']);
    expect(screen.getByText('Inactive')).toBeTruthy();
    expect(screen.getByText('Safety floor')).toBeTruthy();
    expect(screen.getByText('Test bench')).toBeTruthy();
  });
});

// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import fr from '@/messages/fr.json';
import en from '@/messages/en.json';

// THE AI-ASSISTED MODERATION SCREENS — do they render, and do
// they tell the truth?
//
// The feature added about a hundred translation keys. Two guards
// already existed and do NOT cover what this file covers:
//
//   - `i18n-keys.test.ts` checks that every literal key in the code exists on
//     both sides. It does not say that the RIGHT key is requested in the right place;
//   - `i18n-hardcoded.test.ts` forbids hard-coded French. It mounts
//     no component.
//
// Here we mount the screens with the REAL catalogs, in French and in
// English, and read what they display. A key requested via `vocabulary()`
// and missing from the messages does not throw: it renders the "humanized" slug. The
// fallback is intended for vocabulary coming from the database — but on `aiMode_off`
// or `aiReason_blocking_signal`, which are written in this repo, it would hide
// a typo. The assertions below therefore target the expected LABEL,
// never the mere presence of an element.

afterEach(cleanup);

// --- Convex mock -------------------------------------------------------------
//
// `vi.mock` is hoisted above the imports: the response table therefore lives
// in a `vi.hoisted`, and `getFunctionName` is imported INSIDE the factory.
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

// --- The assessment in the moderation queue ----------------------------------

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
    // The reason is rendered translated, not as its stable code: `blocking_signal`
    // must never reach the screen.
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

    // Collapsed: the assessment summary is not there — the queue stays light.
    expect(screen.queryByText(/met en cause nommément/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Voir les signaux' }));

    expect(screen.getByText(/met en cause nommément/)).toBeTruthy();
    expect(screen.getByText('Risque diffamatoire')).toBeTruthy();
    // The quoted excerpt is what makes the signal verifiable without reopening the
    // submission: it must be on screen, word for word.
    expect(
      screen.getByText(/a détourné une partie de l'enveloppe/),
    ).toBeTruthy();
    // SATISFIED criteria are not listed: on a full rubric, they
    // would drown the two that matter.
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
    // No "confiance 0 %": a confidence makes no sense without an assessment.
    expect(screen.queryByText(/confiance/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Voir les signaux' }));
    expect(screen.getByText(/AI_GATEWAY_NOT_CONFIGURED/)).toBeTruthy();
  });

  it("ne rend rien tant qu'aucune analyse n'a eu lieu", () => {
    // The case of the vast majority of rows on a deployment where the
    // feature is off: the queue must not grow by an empty block.
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

// --- The administration panel ------------------------------------------------

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
    // The server already refuses `getSettings` to a non-admin; the screen must
    // not request it anyway — a throwing query would crash the screen, not
    // show a message.
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
    // The baseline is shown read-only: seeing what you CANNOT remove
    // is part of knowing what you are configuring.
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
    // The warning is carried by the mode itself, at the moment of
    // choosing it — not relegated to the documentation.
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
    // "No type checked" is the default, and it is the second lock: arming the
    // mode is not enough to open up automatic publication.
    // The labels come from the library vocabulary
    // (`library.types.*`), not from the slug: "note" displays as "Note de
    // synthèse". It is the same dictionary as the moderation queue.
    for (const type of ['Rapport', 'Note de synthèse']) {
      expect(screen.getByLabelText<HTMLInputElement>(type).checked).toBe(false);
    }
  });

  it('un critère désactivé le dit, au lieu de se déclarer actif', () => {
    // The rubric is configured on TWO axes — severity and activation — and a
    // dormant criterion is where the screen's lie costs the most: read as
    // active, it suggests the submission was measured against it.
    //
    // The assertion targets the LABEL, as everywhere in this file: it is
    // the only one that catches a neighboring key requested instead of the right one,
    // and that is exactly what was written here — "Actif : Toutes", the
    // list filter label stuck onto the criterion's state label.
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
      // A dormant criterion, so that the English catalog is held on
      // BOTH states: it is the secondary state that ages unnoticed.
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

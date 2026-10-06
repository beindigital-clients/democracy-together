import { describe, it, expect } from 'vitest';
import {
  KOHOP_BOUNDS,
  KOHOP_DELAYS_DAYS,
  KOHOP_DELAYS_MS,
  KOHOP_EVENTS,
  KOHOP_EVENT_ACTOR,
  KOHOP_FIELDS,
  KOHOP_FIELD_THEME,
  KOHOP_FINAL_STAGES,
  KOHOP_LINK_TYPES,
  KOHOP_LINK_TYPE_LIST,
  KOHOP_AI_LINK_TYPES,
  KOHOP_MACHINE,
  KOHOP_PUBLIC_EVENT_KINDS,
  KOHOP_EVENT_KINDS,
  KOHOP_STAGES,
  KOHOP_WITHDRAWABLE_STAGES,
  actorMayTrigger,
  assertRefusal,
  canRefuseAgainstPresumption,
  canTransition,
  eventsFor,
  isPositive,
  levelOf,
  nextStage,
  normalizeFields,
  positiveCount,
  presumptionOfAcceptance,
  type KohopEvent,
  type KohopRecommendation,
  type KohopStage,
} from './kohop';
import { NETWORK_THEMES } from './themes';

// The state machine, walked over EVERY (stage × event) pair: only the pairs of
// the table pass, every other one throws a NAMED error before anything is
// written.

const ALLOWED: Record<KohopStage, Partial<Record<KohopEvent, KohopStage>>> = {
  draft: { submit: 'submitted', withdraw: 'withdrawn' },
  submitted: {
    return: 'returned',
    declareInadmissible: 'refused',
    startReview: 'in_review',
    withdraw: 'withdrawn',
  },
  returned: { submit: 'submitted', withdraw: 'withdrawn' },
  in_review: { reviewsComplete: 'revision', withdraw: 'withdrawn' },
  revision: {
    submitRevision: 'decision',
    revisionExpired: 'decision',
    withdraw: 'withdrawn',
  },
  decision: { accept: 'production', refuse: 'refused', withdraw: 'withdrawn' },
  production: { sendProof: 'proof', markReady: 'ready', withdraw: 'withdrawn' },
  proof: {
    approveProof: 'ready',
    requestCorrections: 'production',
    withdraw: 'withdrawn',
  },
  ready: { publish: 'published', schedule: 'scheduled', withdraw: 'withdrawn' },
  scheduled: {
    unschedule: 'ready',
    publishScheduled: 'published',
    withdraw: 'withdrawn',
  },
  published: { retract: 'retracted' },
  refused: {},
  withdrawn: {},
  retracted: {},
};

const PAIRS = KOHOP_STAGES.flatMap((from) =>
  KOHOP_EVENTS.map((event) => [from, event] as const),
);

describe('KOHOP — machine à états : toutes les paires étape × événement', () => {
  it('couvre 14 étapes × 19 événements', () => {
    expect(KOHOP_STAGES).toHaveLength(14);
    expect(KOHOP_EVENTS).toHaveLength(19);
    expect(PAIRS).toHaveLength(14 * 19);
  });

  it('la table du module est exactement celle du contrat ci-dessus', () => {
    expect(KOHOP_MACHINE).toEqual(ALLOWED);
  });

  it.each(PAIRS)('%s + %s', (from, event) => {
    const expected = ALLOWED[from][event];
    if (expected) {
      expect(nextStage(from, event)).toBe(expected);
      expect(canTransition(from, event)).toBe(true);
    } else {
      expect(canTransition(from, event)).toBe(false);
      const refusal = KOHOP_FINAL_STAGES.includes(from)
        ? 'ALREADY_FINAL'
        : 'INVALID_TRANSITION';
      expect(() => nextStage(from, event)).toThrow(refusal);
    }
  });

  it('les étapes finales n’ont aucune sortie', () => {
    for (const stage of KOHOP_FINAL_STAGES) {
      expect(Object.keys(KOHOP_MACHINE[stage])).toEqual([]);
    }
  });

  it('l’auteur peut se retirer avant la parution, et seulement là', () => {
    for (const stage of KOHOP_STAGES) {
      expect(canTransition(stage, 'withdraw')).toBe(
        KOHOP_WITHDRAWABLE_STAGES.includes(stage),
      );
    }
    expect(canTransition('published', 'withdraw')).toBe(false);
  });
});

describe('KOHOP — invariants de publication', () => {
  const entering = (target: KohopStage) =>
    PAIRS.filter(([from, event]) => ALLOWED[from][event] === target).map(
      ([, event]) => event,
    );

  it('seuls des événements du chef de revue mènent à « production » (acceptation)', () => {
    const events = new Set(entering('production'));
    // `requestCorrections` comes back from the proof, it is not an acceptance:
    // acceptance is `accept`, from `decision`.
    const fromDecision = PAIRS.filter(
      ([from, event]) =>
        from === 'decision' && ALLOWED[from][event] === 'production',
    ).map(([, event]) => event);
    expect(fromDecision).toEqual(['accept']);
    expect(KOHOP_EVENT_ACTOR.accept).toBe('chief');
    expect(events.has('accept')).toBe(true);
  });

  it('seuls des événements du chef de revue mènent à « scheduled »', () => {
    for (const event of entering('scheduled')) {
      expect(KOHOP_EVENT_ACTOR[event]).toBe('chief');
    }
  });

  it('« published » n’est atteint que par « publish » (chef) ou par l’événement système depuis « scheduled »', () => {
    const paths = PAIRS.filter(
      ([from, event]) => ALLOWED[from][event] === 'published',
    );
    expect(paths.map(([from, event]) => `${from}+${event}`).sort()).toEqual([
      'ready+publish',
      'scheduled+publishScheduled',
    ]);
    expect(KOHOP_EVENT_ACTOR.publish).toBe('chief');
    expect(KOHOP_EVENT_ACTOR.publishScheduled).toBe('system');
  });

  it('l’événement système de publication n’est accepté que depuis « scheduled »', () => {
    for (const stage of KOHOP_STAGES) {
      expect(canTransition(stage, 'publishScheduled')).toBe(
        stage === 'scheduled',
      );
    }
  });

  it('ni l’auteur ni le système ne peuvent accepter, programmer, publier ni refuser', () => {
    const reserved: KohopEvent[] = [
      'accept',
      'refuse',
      'schedule',
      'publish',
      'declareInadmissible',
      'startReview',
      'retract',
    ];
    for (const event of reserved) {
      expect(actorMayTrigger('author', event)).toBe(false);
      expect(actorMayTrigger('system', event)).toBe(false);
      expect(actorMayTrigger('chief', event)).toBe(true);
    }
  });

  it('chaque événement a un seul type d’acteur, et eventsFor le restitue', () => {
    for (const event of KOHOP_EVENTS) {
      const actors = (['author', 'chief', 'system'] as const).filter((a) =>
        actorMayTrigger(a, event),
      );
      expect(actors, event).toHaveLength(1);
    }
    expect(eventsFor('submitted', 'chief').sort()).toEqual([
      'declareInadmissible',
      'return',
      'startReview',
    ]);
    expect(eventsFor('submitted', 'author')).toEqual(['withdraw']);
    expect(eventsFor('in_review', 'system')).toEqual(['reviewsComplete']);
  });

  it('les événements du parcours public existent tous dans le journal', () => {
    for (const kind of KOHOP_PUBLIC_EVENT_KINDS) {
      expect(KOHOP_EVENT_KINDS).toContain(kind);
    }
  });
});

describe('KOHOP — avis et présomption d’acceptation', () => {
  const r = (recommendation: KohopRecommendation) => ({ recommendation });

  it('favorable et « avec réserves » sont positifs, défavorable non (D-4)', () => {
    expect(isPositive('favorable')).toBe(true);
    expect(isPositive('reserves')).toBe(true);
    expect(isPositive('defavorable')).toBe(false);
  });

  it('deux avis positifs créent la présomption', () => {
    expect(presumptionOfAcceptance([r('favorable'), r('favorable')])).toBe(
      true,
    );
    expect(presumptionOfAcceptance([r('favorable'), r('reserves')])).toBe(true);
  });

  it('un avis défavorable, ou moins de deux avis, suppriment la présomption', () => {
    expect(presumptionOfAcceptance([r('favorable'), r('defavorable')])).toBe(
      false,
    );
    expect(presumptionOfAcceptance([r('favorable')])).toBe(false);
    expect(presumptionOfAcceptance([])).toBe(false);
  });

  it('compte les avis positifs', () => {
    expect(
      positiveCount([r('favorable'), r('defavorable'), r('reserves')]),
    ).toBe(2);
  });

  it('seuls outrance, charte et plagiat permettent de refuser malgré la présomption', () => {
    expect(canRefuseAgainstPresumption('outrance')).toBe(true);
    expect(canRefuseAgainstPresumption('charte')).toBe(true);
    expect(canRefuseAgainstPresumption('plagiat')).toBe(true);
    for (const code of ['hors_champ', 'hors_format', 'autre'] as const) {
      expect(canRefuseAgainstPresumption(code)).toBe(false);
    }
  });

  describe('assertRefusal', () => {
    const positive = [r('favorable'), r('reserves')];
    const split = [r('favorable'), r('defavorable')];
    const reason = 'Le texte reprend sans les citer des passages publiés.';

    it('exige un motif et une justification d’au moins 20 caractères', () => {
      expect(() =>
        assertRefusal({ code: undefined, reason, reviews: split }),
      ).toThrow('REASON_REQUIRED');
      expect(() =>
        assertRefusal({ code: 'autre', reason: 'trop court', reviews: split }),
      ).toThrow('REASON_REQUIRED');
      expect(() =>
        assertRefusal({
          code: 'autre',
          reason: ' '.repeat(40),
          reviews: split,
        }),
      ).toThrow('REASON_REQUIRED');
    });

    it('avis partagés : le chef décide librement, avec un motif quelconque', () => {
      for (const code of ['hors_champ', 'autre', 'charte'] as const) {
        expect(assertRefusal({ code, reason, reviews: split })).toEqual({
          againstPresumption: false,
        });
      }
    });

    it('contre la présomption : refusé sauf outrance, charte ou plagiat', () => {
      for (const code of ['hors_champ', 'hors_format', 'autre'] as const) {
        expect(() =>
          assertRefusal({ code, reason, reviews: positive }),
        ).toThrow('PRESUMPTION_REASON');
      }
      for (const code of ['outrance', 'charte', 'plagiat'] as const) {
        expect(assertRefusal({ code, reason, reviews: positive })).toEqual({
          againstPresumption: true,
        });
      }
    });
  });
});

describe('KOHOP — bornes, délais, champs, liens', () => {
  it('reprend les bornes du plan', () => {
    expect(KOHOP_BOUNDS.words).toEqual({ min: 500, max: 1000 });
    expect(KOHOP_BOUNDS.analysisWords).toEqual({ min: 150, max: 1500 });
    expect(KOHOP_BOUNDS.responseWords.max).toBe(800);
    expect(KOHOP_BOUNDS.reviewers).toEqual({ titular: 2, substitute: 1 });
    expect(KOHOP_BOUNDS.suggestions).toBe(5);
    expect(KOHOP_BOUNDS.reason.min).toBe(20);
  });

  it('délais D-10 : 5, 14, 14 et 5 jours, en constantes cohérentes', () => {
    expect(KOHOP_DELAYS_DAYS).toMatchObject({
      invitationReply: 5,
      analysis: 14,
      revision: 14,
      proof: 5,
    });
    for (const key of Object.keys(KOHOP_DELAYS_DAYS) as Array<
      keyof typeof KOHOP_DELAYS_DAYS
    >) {
      expect(KOHOP_DELAYS_MS[key]).toBe(
        KOHOP_DELAYS_DAYS[key] * 24 * 60 * 60 * 1000,
      );
    }
  });

  it('dix champs thématiques ; une contribution en porte un ou deux', () => {
    expect(KOHOP_FIELDS).toHaveLength(10);
    expect(normalizeFields(['health', 'health', 'norms', 'science'])).toEqual([
      'health',
      'norms',
    ]);
    expect(normalizeFields(['inconnu', 'education'])).toEqual(['education']);
    expect(normalizeFields([])).toEqual([]);
  });

  it('la correspondance vers les cinq axes ne cible que des axes existants', () => {
    for (const theme of Object.values(KOHOP_FIELD_THEME)) {
      expect(NETWORK_THEMES).toContain(theme);
    }
  });

  it('les liens bloquants sont ceux du plan ; l’IA ne produit que du « signalé »', () => {
    const blocking = KOHOP_LINK_TYPE_LIST.filter(
      (t) => KOHOP_LINK_TYPES[t] === 'blocking',
    ).sort();
    expect(blocking).toEqual(
      [
        'coauthor',
        'cross_review',
        'declared_relationship',
        'mentoring',
        'recent_cosign',
        'same_organization',
        'self',
      ].sort(),
    );
    for (const type of KOHOP_AI_LINK_TYPES) {
      expect(KOHOP_LINK_TYPES[type]).toBe('flagged');
    }
  });

  it('levelOf : bloquant > signalé > aucun', () => {
    expect(levelOf([])).toBe('none');
    expect(levelOf([{ type: 'same_workspace' }])).toBe('flagged');
    expect(levelOf([{ type: 'same_workspace' }, { type: 'mentoring' }])).toBe(
      'blocking',
    );
    expect(levelOf([{ type: 'external_cosign' }])).toBe('flagged');
  });
});

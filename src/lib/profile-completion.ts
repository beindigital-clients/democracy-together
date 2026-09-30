// PROFILE COMPLETENESS — what a profile still lacks to be useful to the
// network, step by step.
//
// Read in two places with the same function: the dashboard (from the saved
// profile) and the profile editor's preview (from the form being edited, so
// the meter moves as the person types). Pure, hence tested without a
// browser (tests/unit/profile-completion.test.ts).
//
// Each step names ONE thing to do, and the anchor of the editor section where
// it is done: a checklist that says "finish your profile" without saying
// where is a chore; one that links to the field is a two-second task.

export type CompletionInput = {
  exists: boolean;
  photoUrl: string | null;
  jobTitle: string;
  bio: string;
  country: string;
  themes: readonly string[];
  languages: readonly string[];
  links: readonly { url: string }[];
  visibility: 'private' | 'members' | 'public';
};

export const COMPLETION_STEPS = [
  'profile',
  'photo',
  'jobTitle',
  'bio',
  'country',
  'themes',
  'languages',
  'links',
  'visibility',
] as const;

export type CompletionStep = (typeof COMPLETION_STEPS)[number];

// Section of `/espace-membre/profil` where each step is completed. The ids
// are the `aria-labelledby` targets of the editor's sections.
export const COMPLETION_ANCHORS: Record<CompletionStep, string> = {
  profile: 'profil-identite',
  photo: 'profil-photo',
  jobTitle: 'profil-identite',
  bio: 'profil-identite',
  country: 'profil-identite',
  themes: 'profil-centres',
  languages: 'profil-centres',
  links: 'profil-liens',
  visibility: 'profil-confidentialite',
};

export type Completion = {
  steps: { key: CompletionStep; done: boolean }[];
  done: number;
  total: number;
  percent: number;
  complete: boolean;
};

const filled = (s: string) => s.trim().length > 0;

export function profileCompletion(p: CompletionInput): Completion {
  // Before the profile exists, nothing else counts as done: the photo cannot
  // be sent, and the fields prefilled from the account (name, language) are
  // not saved anywhere yet.
  const saved = p.exists;
  const state: Record<CompletionStep, boolean> = {
    profile: saved,
    photo: saved && p.photoUrl !== null,
    jobTitle: saved && filled(p.jobTitle),
    bio: saved && filled(p.bio),
    country: saved && filled(p.country),
    themes: saved && p.themes.length > 0,
    languages: saved && p.languages.length > 0,
    links: saved && p.links.some((l) => filled(l.url)),
    // A private profile is complete as a record but invisible to the
    // network: the step asks for at least "members".
    visibility: saved && p.visibility !== 'private',
  };
  const steps = COMPLETION_STEPS.map((key) => ({ key, done: state[key] }));
  const done = steps.filter((s) => s.done).length;
  const total = steps.length;
  return {
    steps,
    done,
    total,
    percent: Math.round((done / total) * 100),
    complete: done === total,
  };
}

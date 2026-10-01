import type {
  LinkKind,
  MessagePolicy,
  ProfileVisibility,
} from '@convex/lib/social';

// The profile being edited, as ONE value: what the form shows, what the
// preview draws, and what is compared with the last saved state to tell
// "unsaved changes". Pure, tested in tests/unit/profile-draft.test.ts.

export type ProfileDraft = {
  displayName: string;
  handle: string;
  jobTitle: string;
  country: string;
  bio: string;
  themes: string[];
  languages: string[];
  links: { kind: LinkKind; url: string }[];
  visibility: ProfileVisibility;
  messagePolicy: MessagePolicy;
  mutedNotificationTypes: string[];
  messageEmail: boolean;
};

export function draftFrom(me: ProfileDraft): ProfileDraft {
  return {
    displayName: me.displayName,
    handle: me.handle,
    jobTitle: me.jobTitle,
    country: me.country,
    bio: me.bio,
    themes: [...me.themes],
    languages: [...me.languages],
    links: me.links.map((l) => ({ kind: l.kind, url: l.url })),
    visibility: me.visibility,
    messagePolicy: me.messagePolicy,
    mutedNotificationTypes: [...me.mutedNotificationTypes],
    messageEmail: me.messageEmail,
  };
}

const sorted = (list: readonly string[]) => [...list].sort();

// Two drafts are the same profile when every field says the same thing.
// Order does not count in a SET of choices (themes, languages, muted
// notifications): ticking then unticking a box leaves nothing to save. It
// counts in the links, which the page shows in the order entered. Leading
// and trailing spaces do not count either: the server trims them.
export function sameDraft(a: ProfileDraft, b: ProfileDraft): boolean {
  const norm = (d: ProfileDraft) =>
    JSON.stringify({
      displayName: d.displayName.trim(),
      handle: d.handle.trim(),
      jobTitle: d.jobTitle.trim(),
      country: d.country.trim(),
      bio: d.bio.trim(),
      themes: sorted(d.themes),
      languages: sorted(d.languages),
      links: d.links
        .map((l) => ({ kind: l.kind, url: l.url.trim() }))
        .filter((l) => l.url !== ''),
      visibility: d.visibility,
      messagePolicy: d.messagePolicy,
      mutedNotificationTypes: sorted(d.mutedNotificationTypes),
      messageEmail: d.messageEmail,
    });
  return norm(a) === norm(b);
}

export function toggleIn(list: readonly string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';
import {
  KOHOP_BOUNDS,
  KOHOP_FIELDS,
  KOHOP_LANGS,
  KOHOP_CHARTER_VERSION,
  KOHOP_LICENCE,
  normalizeFields,
} from '@convex/lib/kohop';
import { countWords, isHttpsUrl, validateBody } from '@convex/lib/kohopText';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CheckboxChoice,
  CheckboxChoiceIndicator,
} from '@/components/ui/checkbox';
import { FormError, TextField, TextareaField } from '@/components/ui/field';
import { SelectField } from '@/components/ui/choice-fields';
import { vocabulary } from '@/i18n/vocabulary';
import { cn } from '@/lib/utils';
import { MarkdownEditor } from './markdown-editor';
import { ReviewerPicker } from './reviewer-picker';
import { useKohopDates, useKohopError } from './use-kohop';

type File = NonNullable<FunctionReturnType<typeof api.kohop.getMine>>;

type LinkRow = { label: string; url: string };
type CoAuthorRow = { name: string; affiliation: string; email: string };

const SAVE_DELAY_MS = 1500;

function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="rounded-md border border-line bg-surface p-5 sm:p-6"
    >
      <h2 id={id} className="font-display text-xl text-ink">
        {title}
      </h2>
      {lead ? <p className="mt-1 text-sm text-ink-soft">{lead}</p> : null}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

// THE AUTHOR'S EDITOR — draft, information, links, reviewers, commitments,
// submission. The draft is saved by itself; what is checked on screen is what
// the server will check (same bounds, same word count), so the checklist never
// promises what the server refuses.
export function AuthorEditor({ file }: { file: File }) {
  const t = useTranslations('kohop');
  const router = useRouter();
  const errorMessage = useKohopError();
  const dates = useKohopDates();
  const save = useMutation(api.kohop.saveDraft);
  const submit = useMutation(api.kohop.submit);

  const [title, setTitle] = useState(file.title);
  const [standfirst, setStandfirst] = useState(file.version?.standfirst ?? '');
  const [body, setBody] = useState(file.version?.body ?? '');
  const [lang, setLang] = useState<'fr' | 'en'>(file.lang);
  const [fields, setFields] = useState<string[]>(file.fields);
  const [keywords, setKeywords] = useState(file.keywords.join(', '));
  const [coAuthors, setCoAuthors] = useState<CoAuthorRow[]>(
    file.coAuthors.map((c) => ({
      name: c.name,
      affiliation: c.affiliation,
      email: c.email ?? '',
    })),
  );
  const [links, setLinks] = useState<LinkRow[]>(
    (file.version?.links ?? [])
      .filter((l) => l.url)
      .map((l) => ({ label: l.label, url: l.url ?? '' })),
  );
  const [priorWorks, setPriorWorks] = useState(file.priorWorks.join('\n'));
  const [acceptCharter, setAcceptCharter] = useState(false);
  const [acceptAgreement, setAcceptAgreement] = useState(false);
  const [declareOriginality, setDeclareOriginality] = useState(false);

  const [saveState, setSaveState] = useState<
    | { kind: 'saved'; at: number }
    | { kind: 'saving' }
    | { kind: 'error'; message: string }
    | { kind: 'clean' }
  >(() =>
    file.version
      ? { kind: 'saved', at: file.submittedAt ?? Date.now() }
      : { kind: 'clean' },
  );
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const latest = useRef({
    title,
    standfirst,
    body,
    lang,
    fields,
    keywords,
    coAuthors,
    links,
    priorWorks,
  });
  useEffect(() => {
    latest.current = {
      title,
      standfirst,
      body,
      lang,
      fields,
      keywords,
      coAuthors,
      links,
      priorWorks,
    };
  });

  const touch = useCallback(() => setDirty(true), []);

  const persist = useCallback(async () => {
    const s = latest.current;
    setSaveState({ kind: 'saving' });
    try {
      const result = await save({
        contributionId: file._id,
        title: s.title,
        standfirst: s.standfirst,
        body: s.body,
        lang: s.lang,
        fields: s.fields,
        keywords: s.keywords
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean),
        coAuthors: s.coAuthors
          .filter((c) => c.name.trim())
          .map((c) => ({
            name: c.name,
            affiliation: c.affiliation,
            ...(c.email.trim() ? { email: c.email } : {}),
          })),
        // Half-typed rows are kept on screen but not sent.
        links: s.links
          .filter((l) => l.label.trim() && isHttpsUrl(l.url.trim()))
          .map((l) => ({ label: l.label, url: l.url.trim() })),
        priorWorks: s.priorWorks
          .split('\n')
          .map((w) => w.trim())
          .filter(Boolean),
      });
      setDirty(false);
      setSaveState({ kind: 'saved', at: result.savedAt });
    } catch (err) {
      setSaveState({ kind: 'error', message: errorMessage(err) });
    }
  }, [file._id, save, errorMessage]);

  // Automatic saving: a moment after the last change.
  useEffect(() => {
    if (!dirty) return;
    const id = setTimeout(() => void persist(), SAVE_DELAY_MS);
    return () => clearTimeout(id);
  }, [
    dirty,
    title,
    standfirst,
    body,
    lang,
    fields,
    keywords,
    coAuthors,
    links,
    priorWorks,
    persist,
  ]);

  // The same checks as the server, in the same order.
  const B = KOHOP_BOUNDS;
  const words = useMemo(() => countWords(body), [body]);
  const bodyProblem = useMemo(
    () => validateBody(body, B.words),
    [body, B.words],
  );
  const checks = {
    title:
      title.trim().length >= B.title.min && title.trim().length <= B.title.max,
    standfirst:
      standfirst.trim().length >= B.standfirst.min &&
      standfirst.trim().length <= B.standfirst.max,
    body: bodyProblem === null,
    fields: normalizeFields(fields).length >= B.fields.min,
    reviewers:
      file.reviewers.filter(
        (r) => r.slot === 'titular' && r.status !== 'recused',
      ).length >= B.reviewers.titular,
    commitments: acceptCharter && acceptAgreement && declareOriginality,
  };
  const ready = Object.values(checks).every(Boolean);

  const checklist: {
    key: keyof typeof checks;
    label: string;
    anchor: string;
  }[] = [
    { key: 'title', label: t('check_title'), anchor: 'kohop-info' },
    { key: 'standfirst', label: t('check_standfirst'), anchor: 'kohop-info' },
    {
      key: 'body',
      label: t('check_body', { min: B.words.min, max: B.words.max }),
      anchor: 'kohop-text',
    },
    { key: 'fields', label: t('check_fields'), anchor: 'kohop-info' },
    {
      key: 'reviewers',
      label: t('check_reviewers'),
      anchor: 'kohop-reviewers',
    },
    {
      key: 'commitments',
      label: t('check_commitments'),
      anchor: 'kohop-commitments',
    },
  ];

  function toggleField(field: string) {
    touch();
    setFields((current) =>
      current.includes(field)
        ? current.filter((f) => f !== field)
        : current.length >= B.fields.max
          ? current
          : [...current, field],
    );
  }

  async function onSubmit() {
    setSubmitError('');
    setSubmitting(true);
    try {
      // The latest text first: the server submits what it stored.
      await persist();
      await submit({
        contributionId: file._id,
        acceptCharter,
        acceptAgreement,
        declareOriginality,
      });
      router.refresh();
    } catch (err) {
      setSubmitError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
      <div className="space-y-6">
        <Section
          id="kohop-text"
          title={t('sectionText')}
          lead={t('sectionTextLead')}
        >
          <MarkdownEditor
            label={t('bodyLabel')}
            hint={t('bodyHint')}
            value={body}
            lang={lang}
            min={B.words.min}
            max={B.words.max}
            onChange={(v) => {
              setBody(v);
              touch();
            }}
          />
        </Section>

        <Section id="kohop-info" title={t('sectionInfo')}>
          <TextField
            label={t('titleLabel')}
            hint={t('titleHint', { min: B.title.min, max: B.title.max })}
            value={title}
            maxLength={B.title.max}
            onChange={(e) => {
              setTitle(e.target.value);
              touch();
            }}
          />
          <TextareaField
            label={t('standfirstLabel')}
            hint={t('standfirstHint', {
              count: standfirst.trim().length,
              min: B.standfirst.min,
              max: B.standfirst.max,
            })}
            rows={3}
            maxLength={B.standfirst.max}
            value={standfirst}
            onChange={(e) => {
              setStandfirst(e.target.value);
              touch();
            }}
          />
          <SelectField
            label={t('langLabel')}
            hint={t('langHint')}
            value={lang}
            onValueChange={(v) => {
              setLang(v as 'fr' | 'en');
              touch();
            }}
            options={KOHOP_LANGS.map((l) => ({
              value: l,
              label: vocabulary(t, 'lang_', l),
            }))}
          />
          <fieldset>
            <legend className="text-sm text-ink-soft">
              {t('fieldsLabel')}
            </legend>
            <p className="mt-1 text-xs text-muted">
              {t('fieldsHint', { max: B.fields.max })}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {KOHOP_FIELDS.map((f) => (
                <CheckboxChoice
                  key={f}
                  checked={fields.includes(f)}
                  onCheckedChange={() => toggleField(f)}
                  className="rounded-pill px-4 py-1.5"
                >
                  <CheckboxChoiceIndicator />
                  {vocabulary(t, 'field_', f)}
                </CheckboxChoice>
              ))}
            </div>
          </fieldset>
          <TextField
            label={t('keywordsLabel')}
            hint={t('keywordsHint', { max: B.keywords.max })}
            value={keywords}
            onChange={(e) => {
              setKeywords(e.target.value);
              touch();
            }}
          />
        </Section>

        <Section
          id="kohop-coauthors"
          title={t('sectionCoAuthors')}
          lead={t('sectionCoAuthorsLead')}
        >
          {coAuthors.map((c, i) => (
            <div
              key={i}
              className="grid gap-3 rounded-md border border-line p-3 sm:grid-cols-3"
            >
              <TextField
                label={t('coAuthorName')}
                value={c.name}
                onChange={(e) => {
                  setCoAuthors((rows) =>
                    rows.map((r, j) =>
                      j === i ? { ...r, name: e.target.value } : r,
                    ),
                  );
                  touch();
                }}
              />
              <TextField
                label={t('coAuthorAffiliation')}
                value={c.affiliation}
                onChange={(e) => {
                  setCoAuthors((rows) =>
                    rows.map((r, j) =>
                      j === i ? { ...r, affiliation: e.target.value } : r,
                    ),
                  );
                  touch();
                }}
              />
              <TextField
                label={t('coAuthorEmail')}
                hint={t('coAuthorEmailHint')}
                type="email"
                value={c.email}
                onChange={(e) => {
                  setCoAuthors((rows) =>
                    rows.map((r, j) =>
                      j === i ? { ...r, email: e.target.value } : r,
                    ),
                  );
                  touch();
                }}
              />
              <div className="sm:col-span-3">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={t('removeCoAuthorFor', { n: i + 1 })}
                  onClick={() => {
                    setCoAuthors((rows) => rows.filter((_, j) => j !== i));
                    touch();
                  }}
                >
                  {t('remove')}
                </Button>
              </div>
            </div>
          ))}
          {coAuthors.length < B.coAuthors.max ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setCoAuthors((rows) => [
                  ...rows,
                  { name: '', affiliation: '', email: '' },
                ])
              }
            >
              {t('addCoAuthor')}
            </Button>
          ) : null}
        </Section>

        <Section
          id="kohop-links"
          title={t('sectionLinks')}
          lead={t('sectionLinksLead', { max: B.links.max })}
        >
          {links.map((l, i) => {
            const invalidUrl = l.url.trim() !== '' && !isHttpsUrl(l.url.trim());
            return (
              <div
                key={i}
                className="grid gap-3 rounded-md border border-line p-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-start"
              >
                <TextField
                  label={t('linkLabel')}
                  value={l.label}
                  maxLength={B.links.label}
                  onChange={(e) => {
                    setLinks((rows) =>
                      rows.map((r, j) =>
                        j === i ? { ...r, label: e.target.value } : r,
                      ),
                    );
                    touch();
                  }}
                />
                <TextField
                  label={t('linkUrl')}
                  type="url"
                  inputMode="url"
                  dir="ltr"
                  placeholder="https://"
                  value={l.url}
                  error={invalidUrl ? t('linkUrlInvalid') : undefined}
                  onChange={(e) => {
                    setLinks((rows) =>
                      rows.map((r, j) =>
                        j === i ? { ...r, url: e.target.value } : r,
                      ),
                    );
                    touch();
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="sm:mt-6"
                  aria-label={t('removeLinkFor', { n: i + 1 })}
                  onClick={() => {
                    setLinks((rows) => rows.filter((_, j) => j !== i));
                    touch();
                  }}
                >
                  {t('remove')}
                </Button>
              </div>
            );
          })}
          {links.length < B.links.max ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setLinks((rows) => [...rows, { label: '', url: '' }])
              }
            >
              {t('addLink')}
            </Button>
          ) : null}
        </Section>

        <Section
          id="kohop-reviewers"
          title={t('sectionReviewers')}
          lead={t('sectionReviewersLead')}
        >
          <ReviewerPicker
            contributionId={file._id}
            reviewers={file.reviewers}
          />
        </Section>

        <Section
          id="kohop-commitments"
          title={t('sectionCommitments')}
          lead={t('sectionCommitmentsLead')}
        >
          <TextareaField
            label={t('priorWorksLabel')}
            hint={t('priorWorksHint')}
            rows={3}
            value={priorWorks}
            onChange={(e) => {
              setPriorWorks(e.target.value);
              touch();
            }}
          />
          <ul className="space-y-3">
            {(
              [
                [
                  acceptCharter,
                  setAcceptCharter,
                  t('acceptCharter', { version: KOHOP_CHARTER_VERSION }),
                ],
                [
                  acceptAgreement,
                  setAcceptAgreement,
                  t('acceptAgreement', { licence: KOHOP_LICENCE }),
                ],
                [
                  declareOriginality,
                  setDeclareOriginality,
                  t('declareOriginality'),
                ],
              ] as const
            ).map(([checked, set, label], i) => (
              <li key={i}>
                <label className="flex items-start gap-3 text-sm text-ink">
                  <Checkbox
                    className="mt-0.5"
                    checked={checked}
                    onCheckedChange={(c) => set(c === true)}
                  />
                  <span>{label}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <Link
              href="/kohop/charte"
              target="_blank"
              rel="noopener"
              className="font-medium text-accent-text hover:underline"
            >
              {t('readCharter')}{' '}
              <span className="sr-only">{t('inNewTab')}</span>
            </Link>
            <Link
              href="/kohop/guide-auteur"
              target="_blank"
              rel="noopener"
              className="font-medium text-accent-text hover:underline"
            >
              {t('readAuthorGuide')}{' '}
              <span className="sr-only">{t('inNewTab')}</span>
            </Link>
          </p>
          <p className="text-xs text-muted">{t('privacyNotice')}</p>
        </Section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6">
        <section
          aria-labelledby="kohop-checklist"
          className="rounded-md border border-line bg-surface p-5"
        >
          <h2 id="kohop-checklist" className="font-display text-lg text-ink">
            {t('checklistTitle')}
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {checklist.map((c) => (
              <li key={c.key} className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-0.5 inline-grid size-4 shrink-0 place-content-center rounded-full text-[10px] font-bold',
                    checks[c.key]
                      ? 'bg-bar-1 text-white'
                      : 'border border-line-strong text-transparent',
                  )}
                >
                  ✓
                </span>
                <a
                  href={`#${c.anchor}`}
                  className={cn(
                    'hover:underline',
                    checks[c.key] ? 'text-ink-soft' : 'text-ink',
                  )}
                >
                  <span className="sr-only">
                    {checks[c.key] ? t('checkDone') : t('checkTodo')}{' '}
                  </span>
                  {c.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 font-mono text-xs tabular-nums text-ink-soft">
            {t('words', { count: words })}
          </p>
        </section>

        <section
          className="rounded-md border border-line bg-surface p-5"
          aria-label={t('saveStatus')}
        >
          <p role="status" className="text-sm text-ink-soft">
            {saveState.kind === 'saving'
              ? t('saving')
              : saveState.kind === 'error'
                ? saveState.message
                : saveState.kind === 'saved'
                  ? t('savedAt', { time: dates.time(saveState.at) })
                  : t('notSavedYet')}
          </p>
          {saveState.kind === 'error' ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => void persist()}
            >
              {t('retrySave')}
            </Button>
          ) : null}
          <Button
            type="button"
            className="mt-4 w-full"
            disabled={!ready || submitting}
            onClick={onSubmit}
          >
            {submitting ? t('submitting') : t('submit')}
          </Button>
          {!ready ? (
            <p className="mt-2 text-xs text-muted">{t('submitBlocked')}</p>
          ) : null}
          <FormError className="mt-2">{submitError}</FormError>
        </section>
      </aside>
    </div>
  );
}

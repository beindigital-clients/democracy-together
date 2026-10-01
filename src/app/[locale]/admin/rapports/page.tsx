'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { FunctionReturnType } from 'convex/server';
import { REPORT_BOUNDS } from '@convex/lib/annualReports';
import { routing, type Locale } from '@/i18n/routing';
import { LOCALE_ENDONYMS, direction } from '@/i18n/direction';
import { intlLocale } from '@/i18n/locale';
import { vocabulary } from '@/i18n/vocabulary';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TextField, TextareaField } from '@/components/ui/field';
import { SelectField } from '@/components/ui/choice-fields';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  useActionFeedback,
  useFailureFeedback,
} from '@/components/admin/action-feedback';
import { Checkbox } from '@/components/ui/checkbox';

type AdminReport = FunctionReturnType<
  typeof api.annualReports.adminList
>['reports'][number];

type Draft = {
  title: string;
  intro: string;
  // Paragraphs of a chapter separated by a blank line: that is how one
  // writes prose in a text area, and that is what the PDF renders.
  chapters: { heading: string; body: string }[];
  keyFigures: { value: string; label: string }[];
};

const EMPTY_DRAFT: Draft = {
  title: '',
  intro: '',
  chapters: [{ heading: '', body: '' }],
  keyFigures: [],
};

function useSizeFormat() {
  const locale = useLocale();
  const kb = new Intl.NumberFormat(intlLocale(locale), {
    style: 'unit',
    unit: 'kilobyte',
    unitDisplay: 'short',
    maximumFractionDigits: 0,
  });
  return (bytes: number) => kb.format(Math.max(1, Math.round(bytes / 1024)));
}

// Editor for one language of an edition. The bounds displayed are those the
// server applies (`REPORT_BOUNDS`, same module).
function ContentEditor({
  reportId,
  locale,
  onClose,
}: {
  reportId: Id<'annualReports'>;
  locale: Locale;
  onClose: () => void;
}) {
  const t = useTranslations('reports');
  const detail = useQuery(api.annualReports.adminGet, { reportId });
  const save = useMutation(api.annualReports.saveReportContent);
  const notify = useActionFeedback();
  const fail = useFailureFeedback();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  if (detail === undefined) return null;
  const existing = detail?.contents.find((c) => c.locale === locale);
  const current: Draft =
    draft ??
    (existing
      ? {
          title: existing.title,
          intro: existing.intro,
          chapters: existing.chapters.map((c) => ({
            heading: c.heading,
            body: c.body.join('\n\n'),
          })),
          keyFigures: existing.keyFigures.map((f) => ({ ...f })),
        }
      : EMPTY_DRAFT);
  const update = (patch: Partial<Draft>) => setDraft({ ...current, ...patch });
  const B = REPORT_BOUNDS;

  async function onSave() {
    setBusy(true);
    try {
      await save({
        reportId,
        locale,
        title: current.title,
        intro: current.intro,
        chapters: current.chapters.map((c) => ({
          heading: c.heading,
          body: c.body.split(/\n\s*\n/),
        })),
        keyFigures: current.keyFigures,
      });
      notify(t('adminSaved', { language: LOCALE_ENDONYMS[locale] }));
      onClose();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      lang={locale}
      dir={direction(locale)}
      className="mt-4 space-y-4 rounded-md border border-accent-edge bg-surface p-4"
    >
      <h4 className="font-display text-lg">
        {t('adminEditing', { language: LOCALE_ENDONYMS[locale] })}
      </h4>
      <TextField
        label={t('adminFieldTitle')}
        maxLength={B.title.max}
        value={current.title}
        onChange={(e) => update({ title: e.target.value })}
      />
      <TextareaField
        label={t('adminFieldIntro')}
        rows={3}
        maxLength={B.intro.max}
        value={current.intro}
        onChange={(e) => update({ intro: e.target.value })}
      />

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-ink-soft">
          {t('keyFigures')}
        </legend>
        <p className="text-xs text-muted">{t('adminFiguresHint')}</p>
        {current.keyFigures.map((f, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <TextField
              label={t('adminFigureValue')}
              className="w-32"
              maxLength={B.figureValue.max}
              value={f.value}
              onChange={(e) =>
                update({
                  keyFigures: current.keyFigures.map((x, j) =>
                    j === i ? { ...x, value: e.target.value } : x,
                  ),
                })
              }
            />
            <TextField
              label={t('adminFigureLabel')}
              className="min-w-0 flex-1"
              maxLength={B.figureLabel.max}
              value={f.label}
              onChange={(e) =>
                update({
                  keyFigures: current.keyFigures.map((x, j) =>
                    j === i ? { ...x, label: e.target.value } : x,
                  ),
                })
              }
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                update({
                  keyFigures: current.keyFigures.filter((_, j) => j !== i),
                })
              }
            >
              {t('adminRemove')}
            </Button>
          </div>
        ))}
        {current.keyFigures.length < B.keyFigures.max ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              update({
                keyFigures: [...current.keyFigures, { value: '', label: '' }],
              })
            }
          >
            {t('adminAddFigure')}
          </Button>
        ) : null}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium text-ink-soft">
          {t('adminChapters')}
        </legend>
        {current.chapters.map((c, i) => (
          <div key={i} className="space-y-2 rounded border border-line p-3">
            <TextField
              label={t('adminChapterHeading', { n: i + 1 })}
              maxLength={B.heading.max}
              value={c.heading}
              onChange={(e) =>
                update({
                  chapters: current.chapters.map((x, j) =>
                    j === i ? { ...x, heading: e.target.value } : x,
                  ),
                })
              }
            />
            <TextareaField
              label={t('adminChapterBody')}
              hint={t('adminChapterBodyHint')}
              rows={6}
              value={c.body}
              onChange={(e) =>
                update({
                  chapters: current.chapters.map((x, j) =>
                    j === i ? { ...x, body: e.target.value } : x,
                  ),
                })
              }
            />
            {current.chapters.length > 1 ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  update({
                    chapters: current.chapters.filter((_, j) => j !== i),
                  })
                }
              >
                {t('adminRemoveChapter')}
              </Button>
            ) : null}
          </div>
        ))}
        {current.chapters.length < B.chapters.max ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              update({
                chapters: [...current.chapters, { heading: '', body: '' }],
              })
            }
          >
            {t('adminAddChapter')}
          </Button>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={onSave}>
          {t('adminSave')}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          {t('adminCancel')}
        </Button>
      </div>
      <p className="text-xs text-muted">{t('adminPdfAuto')}</p>
    </div>
  );
}

function ReportCard({ report }: { report: AdminReport }) {
  const t = useTranslations('reports');
  const size = useSizeFormat();
  const update = useMutation(api.annualReports.updateReportMeta);
  const regenerate = useMutation(api.annualReports.regenerateReportPdfs);
  const remove = useMutation(api.annualReports.deleteReport);
  const notify = useActionFeedback();
  const fail = useFailureFeedback();
  const [editing, setEditing] = useState<Locale | null>(null);
  const [addLocale, setAddLocale] = useState<Locale | ''>('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await action();
      notify(message);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  const missing = routing.locales.filter(
    (l) => !report.locales.some((x) => x.locale === l),
  );
  const published = report.status === 'published';

  return (
    <li className="rounded-md border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-mono text-2xl font-semibold text-ink">
          {report.year}
        </h2>
        <Badge variant={published ? 'accent' : 'default'}>
          {vocabulary(t, 'adminStatus_', report.status)}
        </Badge>
        {report.inaugural ? (
          <Badge variant="outline">{t('inaugural')}</Badge>
        ) : null}
        <span className="text-[13px] text-muted">
          {vocabulary(t, 'adminOrigin_', report.origin)}
        </span>
      </div>

      <table className="mt-4 w-full border-collapse text-sm">
        <caption className="sr-only">
          {t('adminLanguagesCaption', { year: report.year })}
        </caption>
        <thead>
          <tr className="border-b border-line text-start">
            <th scope="col" className="py-2 text-start font-medium text-muted">
              {t('adminColLanguage')}
            </th>
            <th scope="col" className="py-2 text-start font-medium text-muted">
              {t('adminColTitle')}
            </th>
            <th scope="col" className="py-2 text-start font-medium text-muted">
              {t('adminColPdf')}
            </th>
            <th scope="col" className="py-2" />
          </tr>
        </thead>
        <tbody>
          {report.locales.map((l) => (
            <tr key={l.locale} className="border-b border-line last:border-0">
              <td className="py-2 pe-3" lang={l.locale}>
                {LOCALE_ENDONYMS[l.locale]}
              </td>
              <td
                className="py-2 pe-3 wrap-anywhere"
                lang={l.locale}
                dir={direction(l.locale)}
              >
                {l.title}
              </td>
              <td className="py-2 pe-3">
                {l.pdf === 'fresh' && l.pdfUrl ? (
                  <a
                    href={l.pdfUrl}
                    className="inline-block py-1 text-accent-text hover:underline"
                  >
                    {t('adminPdfFresh', {
                      size: size(l.pdfSize ?? 0),
                      pages: l.pdfPages ?? 0,
                    })}
                  </a>
                ) : (
                  <span className="text-muted">
                    {vocabulary(t, 'adminPdf_', l.pdf)}
                  </span>
                )}
              </td>
              <td className="py-2 text-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setEditing(editing === l.locale ? null : l.locale)
                  }
                >
                  {t('adminEdit')}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {missing.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <SelectField
            label={t('adminAddLanguage')}
            controlClassName="w-auto"
            value={addLocale}
            onValueChange={(v) => setAddLocale(v as Locale | '')}
            placeholder={t('adminChooseLanguage')}
            // Each language by its own name, in its own language.
            options={missing.map((l) => ({
              value: l,
              label: LOCALE_ENDONYMS[l],
              lang: l,
            }))}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!addLocale}
            onClick={() => {
              if (addLocale) setEditing(addLocale);
              setAddLocale('');
            }}
          >
            {t('adminWrite')}
          </Button>
        </div>
      ) : null}

      {editing ? (
        <ContentEditor
          key={editing}
          reportId={report._id}
          locale={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            run(
              () =>
                update({
                  reportId: report._id,
                  status: published ? 'draft' : 'published',
                }),
              published
                ? t('adminUnpublished', { year: report.year })
                : t('adminPublished', { year: report.year }),
            )
          }
        >
          {published ? t('adminUnpublish') : t('adminPublish')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            run(
              () =>
                update({ reportId: report._id, inaugural: !report.inaugural }),
              t('adminSavedMeta', { year: report.year }),
            )
          }
        >
          {report.inaugural
            ? t('adminUnmarkInaugural')
            : t('adminMarkInaugural')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || report.locales.length === 0}
          onClick={() =>
            run(
              () => regenerate({ reportId: report._id }),
              t('adminRegenerating', { year: report.year }),
            )
          }
        >
          {t('adminRegenerate')}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={busy}
          onClick={() => setConfirmDelete(true)}
        >
          {t('adminDelete')}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title={t('adminDeleteTitle', { year: report.year })}
        description={t('adminDeleteBody')}
        confirmLabel={t('adminDelete')}
        cancelLabel={t('adminCancel')}
        destructive
        pending={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await run(
            () => remove({ reportId: report._id }),
            t('adminDeleted', { year: report.year }),
          );
          setConfirmDelete(false);
        }}
      />
    </li>
  );
}

// ANNUAL REPORTS (F-41) — administration, editor rank (the guard is on the
// Convex side: `requireNetworkRole(ctx, 'editeur')`). Migration of the hard-coded
// editions, creation, per-language drafting, publication; each
// language's PDF is automatically recomposed on every save.
export default function AdminReports() {
  const t = useTranslations('reports');
  const ta = useTranslations('admin');
  const data = useQuery(api.annualReports.adminList, {});
  const importCoded = useMutation(api.annualReports.importCodedReport);
  const create = useMutation(api.annualReports.createReport);
  const notify = useActionFeedback();
  const fail = useFailureFeedback();
  const [year, setYear] = useState('');
  const [inaugural, setInaugural] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await action();
      notify(message);
      return true;
    } catch (err) {
      fail(err);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="admin-reports">
      <h1 className="font-display text-3xl">{t('adminTitle')}</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">{t('adminIntro')}</p>

      {data === undefined ? (
        <p className="mt-6 text-ink-soft">{ta('loading')}</p>
      ) : (
        <>
          {data.codedToImport.length > 0 ? (
            <section
              aria-labelledby="reports-import"
              className="mt-6 rounded-md border border-accent-edge bg-accent-tint p-5"
            >
              <h2 id="reports-import" className="font-display text-xl">
                {t('adminImportTitle')}
              </h2>
              <p className="mt-1 max-w-[70ch] text-sm text-ink-soft">
                {t('adminImportIntro')}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {data.codedToImport.map((y) => (
                  <Button
                    key={y}
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => importCoded({ year: y }),
                        t('adminImported', { year: y }),
                      )
                    }
                  >
                    {t('adminImport', { year: y })}
                  </Button>
                ))}
              </div>
            </section>
          ) : null}

          <section
            aria-labelledby="reports-create"
            className="mt-6 rounded-md border border-line bg-surface p-5"
          >
            <h2 id="reports-create" className="font-display text-xl">
              {t('adminCreateTitle')}
            </h2>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <TextField
                type="number"
                inputMode="numeric"
                label={t('adminYear')}
                controlClassName="w-32"
                min={REPORT_BOUNDS.yearMin}
                max={REPORT_BOUNDS.yearMax}
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
              <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
                <Checkbox
                  checked={inaugural}
                  onCheckedChange={(checked) => setInaugural(checked === true)}
                />
                {t('inaugural')}
              </label>
              <Button
                disabled={busy || !/^\d{4}$/.test(year)}
                onClick={async () => {
                  const ok = await run(
                    () => create({ year: Number(year), inaugural }),
                    t('adminCreated', { year }),
                  );
                  if (ok) {
                    setYear('');
                    setInaugural(false);
                  }
                }}
              >
                {t('adminCreate')}
              </Button>
            </div>
          </section>

          {data.reports.length === 0 ? (
            <p className="mt-6 text-ink-soft">{t('adminEmpty')}</p>
          ) : (
            <ul aria-label={t('adminTitle')} className="mt-6 space-y-4">
              {data.reports.map((r) => (
                <ReportCard key={r._id} report={r} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

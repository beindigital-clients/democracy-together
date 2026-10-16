'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  Quote,
  Link2,
} from 'lucide-react';
import { countWords, parseText } from '@convex/lib/kohopText';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { vocabulary } from '@/i18n/vocabulary';
import { KohopText } from './kohop-text';

// The text editor: a plain text area, a small toolbar and a live preview — no
// WYSIWYG, so the text stays a constrained Markdown the server and the
// browser read the same way (same `countWords`, same parser).
//
// Works on a phone and over a slow connection: nothing is loaded beyond the
// parser itself. The toolbar only inserts Markdown at the selection; every
// action is also a typed character away, so keyboard users lose nothing.

type Action =
  | { kind: 'wrap'; mark: string }
  | { kind: 'line'; prefix: string }
  | { kind: 'link' };

export function WordCounter({
  words,
  min,
  max,
  id,
}: {
  words: number;
  min: number;
  max: number;
  id: string;
}) {
  const t = useTranslations('kohop');
  const state = words < min ? 'short' : words > max ? 'long' : 'ok';
  return (
    <p
      id={id}
      className={cn(
        'font-mono text-xs tabular-nums',
        state === 'ok' ? 'text-ink-soft' : 'text-bar-5',
      )}
    >
      <span className="font-semibold">{t('words', { count: words })}</span>
      {' · '}
      {state === 'ok'
        ? t('wordsOk', { min, max })
        : state === 'short'
          ? t('wordsShort', { missing: min - words, min })
          : t('wordsLong', { extra: words - max, max })}
    </p>
  );
}

export function MarkdownEditor({
  value,
  onChange,
  lang,
  min,
  max,
  disabled,
  label,
  hint,
}: {
  value: string;
  onChange: (value: string) => void;
  lang: string;
  min: number;
  max: number;
  disabled?: boolean;
  label: string;
  hint?: string;
}) {
  const t = useTranslations('kohop');
  const ref = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const id = useId();
  const counterId = `${id}-count`;
  const hintId = `${id}-hint`;
  const errorsId = `${id}-errors`;

  const words = useMemo(() => countWords(value), [value]);
  const errors = useMemo(() => parseText(value).errors, [value]);

  function apply(action: Action) {
    const el = ref.current;
    if (!el || disabled) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);
    let next: string;
    let from = start;
    let to = end;

    if (action.kind === 'wrap') {
      const inner = selected || t('toolbarPlaceholder');
      next = `${value.slice(0, start)}${action.mark}${inner}${action.mark}${value.slice(end)}`;
      from = start + action.mark.length;
      to = from + inner.length;
    } else if (action.kind === 'line') {
      // Prefix every selected line (or the current line).
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const lineEndIdx = value.indexOf('\n', end);
      const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
      const block = value.slice(lineStart, lineEnd);
      const prefixed = block
        .split('\n')
        .map((l) => `${action.prefix}${l}`)
        .join('\n');
      next = `${value.slice(0, lineStart)}${prefixed}${value.slice(lineEnd)}`;
      from = lineStart + action.prefix.length;
      to = lineStart + prefixed.length;
    } else {
      const inner = selected || t('toolbarLinkText');
      const url = 'https://';
      next = `${value.slice(0, start)}[${inner}](${url})${value.slice(end)}`;
      from = start + inner.length + 3;
      to = from + url.length;
    }
    onChange(next);
    // Restore the selection once React has written the new value.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(from, to);
    });
  }

  const tools: {
    key: string;
    label: string;
    icon: typeof Bold;
    action: Action;
  }[] = [
    {
      key: 'bold',
      label: t('toolbarBold'),
      icon: Bold,
      action: { kind: 'wrap', mark: '**' },
    },
    {
      key: 'italic',
      label: t('toolbarItalic'),
      icon: Italic,
      action: { kind: 'wrap', mark: '*' },
    },
    {
      key: 'h2',
      label: t('toolbarH2'),
      icon: Heading2,
      action: { kind: 'line', prefix: '## ' },
    },
    {
      key: 'h3',
      label: t('toolbarH3'),
      icon: Heading3,
      action: { kind: 'line', prefix: '### ' },
    },
    {
      key: 'list',
      label: t('toolbarList'),
      icon: List,
      action: { kind: 'line', prefix: '- ' },
    },
    {
      key: 'quote',
      label: t('toolbarQuote'),
      icon: Quote,
      action: { kind: 'line', prefix: '> ' },
    },
    {
      key: 'link',
      label: t('toolbarLink'),
      icon: Link2,
      action: { kind: 'link' },
    },
  ];

  return (
    <div>
      <div className="flex justify-end">
        <ToggleGroup
          type="single"
          size="sm"
          value={mode}
          onValueChange={(v) => {
            if (v === 'write' || v === 'preview') setMode(v);
          }}
          aria-label={t('editorMode')}
        >
          <ToggleGroupItem value="write">{t('modeWrite')}</ToggleGroupItem>
          <ToggleGroupItem value="preview">{t('modePreview')}</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <Field label={label} id={id}>
        {(control) => (
          <>
            {mode === 'write' ? (
              <div
                role="toolbar"
                aria-label={t('toolbar')}
                aria-controls={id}
                className="flex flex-wrap gap-1 rounded-t-md border border-b-0 border-line bg-surface-2 p-1"
              >
                {tools.map(({ key, label: l, icon: Icon, action }) => (
                  <button
                    key={key}
                    type="button"
                    disabled={disabled}
                    aria-label={l}
                    title={l}
                    onClick={() => apply(action)}
                    className="inline-flex size-9 items-center justify-center rounded-sm text-ink-soft transition-colors hover:bg-surface hover:text-ink disabled:opacity-50"
                  >
                    <Icon aria-hidden="true" className="size-4" />
                  </button>
                ))}
              </div>
            ) : null}
            {/* Always mounted (hidden in preview): the text, the caret and the
                label's target survive a switch of mode. */}
            <Textarea
              {...control}
              ref={ref}
              lang={lang}
              dir="auto"
              rows={18}
              value={value}
              disabled={disabled}
              hidden={mode !== 'write'}
              onChange={(e) => onChange(e.target.value)}
              aria-describedby={
                [
                  hint ? hintId : null,
                  counterId,
                  errors.length ? errorsId : null,
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              aria-invalid={errors.length > 0 || undefined}
              className="min-h-[22rem] resize-y rounded-t-none font-mono text-[15px] leading-relaxed"
            />
            {mode === 'preview' ? (
              <div
                className="min-h-[22rem] rounded-md border border-line bg-surface p-5"
                aria-label={t('modePreview')}
                role="region"
              >
                {value.trim() ? (
                  <KohopText markdown={value} lang={lang} />
                ) : (
                  <p className="text-sm text-muted">{t('previewEmpty')}</p>
                )}
              </div>
            ) : null}
          </>
        )}
      </Field>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <WordCounter words={words} min={min} max={max} id={counterId} />
        {hint ? (
          <p id={hintId} className="text-xs text-muted">
            {hint}
          </p>
        ) : null}
      </div>

      {errors.length > 0 ? (
        <ul
          id={errorsId}
          className="mt-2 space-y-1 rounded-md border border-bar-5/40 bg-bar-5/5 p-3 text-sm text-bar-5"
        >
          {errors.slice(0, 8).map((e, i) => (
            <li key={`${e.line}-${e.code}-${i}`}>
              {t('textErrorLine', { line: e.line })}{' '}
              {vocabulary(t, 'textErr_', e.code)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

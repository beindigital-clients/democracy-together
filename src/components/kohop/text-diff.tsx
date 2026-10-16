'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  diffTexts,
  diffWords,
  countWordsInPlainText,
  toPlainText,
} from '@convex/lib/kohopText';
import { cn } from '@/lib/utils';

// What changed between two versions of a text, block by block, with the words
// inside a modified block. An addition or a removal is never carried by the
// colour alone (RGAA 3.1): <ins>/<del> carry the meaning, an off-screen prefix
// says it to a screen reader, and the underline / strike-through shows it.

/** Words added and removed, for the one-line summary. */
export function diffStats(
  before: string,
  after: string,
): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const op of diffWords(toPlainText(before), toPlainText(after))) {
    if (op.op === 'insert') added += countWordsInPlainText(op.text);
    else if (op.op === 'delete') removed += countWordsInPlainText(op.text);
  }
  return { added, removed };
}

const INS =
  'bg-bar-1/15 text-ink underline decoration-bar-1 underline-offset-2';
const DEL = 'bg-bar-5/15 text-ink-soft line-through decoration-bar-5';

export function TextDiff({
  before,
  after,
  lang,
}: {
  before: string;
  after: string;
  lang: string;
}) {
  const t = useTranslations('kohop');
  const blocks = useMemo(() => diffTexts(before, after), [before, after]);
  const changed = blocks.filter((b) => b.op !== 'equal');
  if (changed.length === 0) {
    return <p className="text-sm text-ink-soft">{t('noChanges')}</p>;
  }
  return (
    <div lang={lang} className="space-y-3 text-ink">
      {blocks.map((b, i) => {
        if (b.op === 'equal') {
          return (
            <p key={i} className="text-ink-soft">
              {b.text}
            </p>
          );
        }
        if (b.op === 'insert') {
          return (
            <p key={i}>
              <ins className={cn(INS, 'no-underline-offset-0')}>
                <span className="sr-only">{t('diffAdded')} </span>
                {b.text}
              </ins>
            </p>
          );
        }
        if (b.op === 'delete') {
          return (
            <p key={i}>
              <del className={DEL}>
                <span className="sr-only">{t('diffRemoved')} </span>
                {b.text}
              </del>
            </p>
          );
        }
        return (
          <p key={i}>
            {b.words.map((w, j) =>
              w.op === 'equal' ? (
                <span key={j}>{w.text}</span>
              ) : w.op === 'insert' ? (
                <ins key={j} className={INS}>
                  <span className="sr-only">{t('diffAdded')} </span>
                  {w.text}
                </ins>
              ) : (
                <del key={j} className={DEL}>
                  <span className="sr-only">{t('diffRemoved')} </span>
                  {w.text}
                </del>
              ),
            )}
          </p>
        );
      })}
    </div>
  );
}

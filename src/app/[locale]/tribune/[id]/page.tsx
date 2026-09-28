import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Link } from '@/i18n/navigation';
import { Reveal } from '@/components/motion/reveal';
import { resolveLocale, intlLocale } from '@/i18n/locale';
import { CommentForm } from '@/components/tribune/comment-form';
import { ReportButton } from '@/components/tribune/report-button';
import { ReactionButton } from '@/components/tribune/reaction-button';
import { DeepenPanel } from '@/components/tribune/deepen-panel';
import { vocabulary } from '@/i18n/vocabulary';
import {
  TranslationNotice,
  textAttrs,
} from '@/components/i18n/translation-notice';
import { resolveArticleDisplay } from '@/lib/article-translation';
import { fetchOrFallback } from '@/lib/convex-fallback';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

async function load(id: string) {
  try {
    return await fetchQuery(api.tribune.getPost, {
      postId: id as Id<'tribunePosts'>,
    });
  } catch {
    return null; // malformed id
  }
}

// A Tribune post is written in ONE single language by its author. It
// can now be TRANSLATED ON READ (convex/translation.ts), and that changes
// nothing about the two decisions below — on the contrary, it supports them:
// an automatic, unreviewed translation, displayed with a notice and
// revocable in one click, is not a language version of the post. Declaring
// it to search engines would promise them editorial content that does not
// exist, and get a page indexed whose text may change with the next model.
//
// Hence two decisions (issue #35), which stand for each other:
//
//  - NO `languages` / hreflang. An `hreflang="en"` promises an English
//    version; on a French post, it points to one that does not exist and
//    serves French text to an English query. Better to declare nothing than
//    a false translation — `x-default` included.
//  - ONE canonical, the one for the post's language, EMITTED IDENTICALLY
//    under both prefixes. Previously each locale self-canonicalized: two
//    canonical pages for a single text, i.e. duplicate content.
//
// `post.lang` is missing from posts older than the field; `resolveLocale`
// maps them to the default language, which the existing corpus confirms.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const post = await load(id);
  if (!post) return {};
  return {
    title: post.title,
    description: post.body.slice(0, 160),
    alternates: {
      canonical: `${SITE}/${resolveLocale(post.lang)}/tribune/${id}`,
    },
  };
}

export default async function TribunePostPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const loc = resolveLocale(locale);
  const post = await load(id);
  if (!post) notFound();

  const t = await getTranslations('tribune');
  const tl = await getTranslations('library');
  const postLang = resolveLocale(post.lang);

  // TRANSLATION ON READ. The post is written in a single language; when
  // it is not the page's, we look for a cached translation and, failing
  // that, offer to request one. The read is FAULT-TOLERANT
  // (`fetchOrFallback`): Convex unreachable renders a post without a banner,
  // not an error page — the original stays readable, that is what matters.
  const sp = await searchParams;
  const wantsOriginal = sp.original === '1';
  const cached =
    postLang === loc
      ? null
      : await fetchOrFallback(
          'tribune/traduction',
          () =>
            fetchQuery(api.translation.getTranslation, {
              sourceType: 'tribunePost',
              sourceId: id,
              targetLocale: loc,
            }),
          null,
        );
  const display = resolveArticleDisplay(postLang, loc, cached, wantsOriginal);
  // The DISPLAYED text and its language go together: separating them means
  // putting `lang="fr"` on Arabic text at the first refactor.
  const shown =
    display.kind === 'translated'
      ? {
          title: display.fields.title,
          body: display.fields.body.join('\n\n'),
          lang: loc,
        }
      : { title: post.title, body: post.body, lang: postLang };
  const attrs = textAttrs(shown.lang, loc);

  const fmtDate = (ms: number) =>
    new Intl.DateTimeFormat(intlLocale(loc), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(ms);

  return (
    <article className="mx-auto max-w-[760px] px-4 py-12 sm:px-6 md:py-16">
      <Reveal>
        <p className="text-[13px] text-muted">
          <Link href="/" className="text-muted hover:text-ink">
            {t('home')}
          </Link>{' '}
          /{' '}
          <Link href="/tribune" className="text-muted hover:text-ink">
            {t('title')}
          </Link>
        </p>
      </Reveal>

      <header className="mt-4 border-b border-line pb-6">
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="rounded-pill border border-accent-edge bg-accent-tint px-2.5 py-0.5 font-medium text-accent-text">
            {vocabulary(tl, 'themes.', post.theme)}
          </span>
          <span className="font-mono uppercase tracking-[0.06em] text-muted">
            {vocabulary(t, 'format_', post.format)}
          </span>
        </div>
        {/* The post is not translated: when its language differs from the
            page's, tell assistive technology, otherwise a screen reader
            reads English text with the French voice (issue #35). */}
        <h1
          {...attrs}
          className="mt-3 font-display text-[clamp(26px,3.6vw,40px)] font-medium leading-[1.1] tracking-[-0.015em]"
        >
          {shown.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted">
          <span>{post.authorName}</span>
          <span aria-hidden="true">·</span>
          <span>{fmtDate(post.createdAt)}</span>
          <span aria-hidden="true">·</span>
          <ReportButton targetType="post" targetId={post._id} />
        </div>
      </header>

      {/* IN-DEPTH FOLLOW-UP (F-48): the in-depth contribution names the post
          it extends… */}
      {post.parent ? (
        <p className="mt-4 rounded-md border border-accent-edge bg-accent-tint px-4 py-3 text-sm text-ink">
          {t('deepensLabel')}{' '}
          <Link
            href={`/tribune/${post.parent._id}`}
            className="wrap-anywhere font-semibold text-accent-text hover:underline"
          >
            {post.parent.title}
          </Link>{' '}
          <span className="text-ink-soft">
            {t('byAuthor', { name: post.parent.authorName })}
          </span>
        </p>
      ) : null}

      <TranslationNotice
        display={display}
        readerLocale={loc}
        sourceType="tribunePost"
        sourceId={id}
        pathname={`/tribune/${id}`}
      />

      <div
        {...attrs}
        className="mt-6 whitespace-pre-line text-[17px] leading-relaxed text-ink-soft"
      >
        {shown.body}
      </div>

      {/* …and the short post lists the contributions that extend it. */}
      {post.deepenings.length > 0 ? (
        <section
          aria-labelledby="tr-deepenings"
          className="mt-8 rounded-md border border-line bg-surface p-5"
        >
          <h2 id="tr-deepenings" className="font-display text-lg">
            {t('deepeningsTitle', { count: post.deepenings.length })}
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {post.deepenings.map((d) => (
              <li key={d._id}>
                <Link
                  href={`/tribune/${d._id}`}
                  className="wrap-anywhere font-medium text-accent-text hover:underline"
                >
                  {d.title}
                </Link>{' '}
                <span className="font-mono text-[11px] text-muted">
                  {t('byAuthor', { name: d.authorName })} ·{' '}
                  {fmtDate(d.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Expand / invite / propose to the library (client island,
          depending on the rights the server grants the reader). */}
      <DeepenPanel postId={post._id} title={post.title} theme={post.theme} />

      {/* Support ("like" reaction) */}
      <div className="mt-8 flex items-center">
        <ReactionButton postId={post._id} />
      </div>

      {/* Comments */}
      <section className="mt-12 border-t border-line pt-8">
        <h2 className="font-display text-2xl">
          {t('commentsCount', { count: post.commentCount })}
        </h2>

        {post.comments.length > 0 ? (
          <ul className="mt-5 flex flex-col gap-4">
            {post.comments.map((c) => (
              <li
                key={c._id}
                className="rounded-md border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted">
                  <span className="text-ink">{c.authorName}</span>
                  <span aria-hidden="true">·</span>
                  <span>{fmtDate(c.createdAt)}</span>
                  <span aria-hidden="true">·</span>
                  <ReportButton targetType="comment" targetId={c._id} />
                </div>
                <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink">
                  {c.body}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-ink-soft">{t('noComments')}</p>
        )}

        <CommentForm postId={post._id} />
      </section>
    </article>
  );
}

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
    return null; // id malformé
  }
}

// Un billet de Tribune est rédigé dans UNE seule langue par son auteur. Il
// peut désormais être TRADUIT À LA LECTURE (convex/translation.ts), et cela ne
// change rien aux deux décisions ci-dessous — au contraire, cela les appuie :
// une traduction automatique, non relue, affichée sous mention et révocable
// d'un clic, n'est pas une version linguistique du billet. La déclarer aux
// moteurs reviendrait à leur promettre un contenu éditorial qui n'existe pas,
// et à faire indexer une page dont le texte peut changer au prochain modèle.
//
// D'où deux décisions (issue #35), qui valent l'une pour l'autre :
//
//  - AUCUN `languages` / hreflang. Un `hreflang="en"` promet une version
//    anglaise ; sur un billet français, il en désigne une qui n'existe pas et
//    fait servir un texte français à une requête anglaise. Mieux vaut ne rien
//    déclarer qu'une fausse traduction — `x-default` compris.
//  - UN canonical, celui de la langue du billet, ÉMIS À L'IDENTIQUE sous les
//    deux préfixes. Auparavant chaque locale s'auto-canonicalisait : deux
//    pages canoniques pour un seul texte, soit du contenu dupliqué.
//
// `post.lang` manque aux billets antérieurs au champ ; `resolveLocale` les
// ramène à la langue par défaut, ce que le corpus existant vérifie.
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

  // TRADUCTION À LA LECTURE. Le billet est rédigé dans une seule langue ; quand
  // ce n'est pas celle de la page, on cherche une traduction en cache et, à
  // défaut, on propose de la demander. La lecture est TOLÉRANTE À LA PANNE
  // (`fetchOrFallback`) : Convex injoignable rend un billet sans bandeau, pas
  // une page en erreur — l'original reste lisible, c'est ce qui compte.
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
  // Le texte AFFICHÉ et sa langue vont de pair : les dissocier, c'est poser
  // `lang="fr"` sur un texte arabe au premier refactor.
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
        {/* Le billet n'est pas traduit : quand sa langue diffère de celle de
            la page, le dire à l'assistance technique, sans quoi un lecteur
            d'écran lit un texte anglais avec la voix française (issue #35). */}
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

      {/* APPROFONDISSEMENT (F-48) : la contribution de fond nomme le billet
          qu'elle prolonge… */}
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

      {/* …et le billet court liste les contributions qui le prolongent. */}
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

      {/* Approfondir / inviter / proposer à la bibliothèque (îlot client,
          selon les droits que le serveur reconnaît au lecteur). */}
      <DeepenPanel postId={post._id} title={post.title} theme={post.theme} />

      {/* Soutien (réaction « like ») */}
      <div className="mt-8 flex items-center">
        <ReactionButton postId={post._id} />
      </div>

      {/* Commentaires */}
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

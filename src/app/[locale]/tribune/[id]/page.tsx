import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Link } from '@/i18n/navigation';
import { Reveal } from '@/components/motion/reveal';
import { resolveLocale } from '@/i18n/locale';
import { CommentForm } from '@/components/tribune/comment-form';
import { ReportButton } from '@/components/tribune/report-button';
import { ReactionButton } from '@/components/tribune/reaction-button';
import { vocabulary } from '@/i18n/vocabulary';

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

// Un billet de Tribune est rédigé dans UNE seule langue par son auteur et
// n'est jamais traduit : /fr/tribune/<id> et /en/tribune/<id> servent le même
// titre et le même corps, seul l'habillage change. D'où deux décisions (issue
// #35), qui valent l'une pour l'autre :
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
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const loc = resolveLocale(locale);
  const post = await load(id);
  if (!post) notFound();

  const t = await getTranslations('tribune');
  const tl = await getTranslations('library');
  const postLang = resolveLocale(post.lang);

  const fmtDate = (ms: number) =>
    new Intl.DateTimeFormat(loc, {
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
          lang={postLang !== loc ? postLang : undefined}
          className="mt-3 font-display text-[clamp(26px,3.6vw,40px)] font-medium leading-[1.1] tracking-[-0.015em]"
        >
          {post.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted">
          <span>{post.authorName}</span>
          <span aria-hidden="true">·</span>
          <span>{fmtDate(post.createdAt)}</span>
          <span aria-hidden="true">·</span>
          <ReportButton targetType="post" targetId={post._id} />
        </div>
      </header>

      <div
        lang={postLang !== loc ? postLang : undefined}
        className="mt-6 whitespace-pre-line text-[17px] leading-relaxed text-ink-soft"
      >
        {post.body}
      </div>

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

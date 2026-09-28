'use client';

import { useParams } from 'next/navigation';
import { useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { AuthGate, AuthGateLoading } from '@/components/auth/auth-gate';
import { Link } from '@/i18n/navigation';
import { vocabulary } from '@/i18n/vocabulary';
import { PrintButton } from '@/components/reports/print-button';
import { useDateFormat } from '@/components/programmes/shared';

// Attestation de fin de parcours (F-57) : une page IMPRIMABLE. Aucune
// dépendance PDF n'est présente dans le dépôt ; la boîte d'impression du
// navigateur propose « Enregistrer au format PDF », et compose correctement
// l'arabe, ce qu'une bibliothèque PDF JavaScript ne ferait pas. Lisible par
// son seul titulaire : `toolbox.getCertificate` refuse toute autre personne.
function Certificate({
  enrollmentId,
}: {
  enrollmentId: Id<'learningEnrollments'>;
}) {
  const t = useTranslations('toolbox');
  const fmt = useDateFormat();
  const cert = useQuery(api.toolbox.getCertificate, { enrollmentId });
  if (cert === undefined) return <AuthGateLoading className="max-w-3xl" />;
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link
          href="/espace-membre/parcours"
          className="text-sm text-accent-text hover:underline"
        >
          {t('backToLearning')}
        </Link>
        <span className="flex-1" />
        <PrintButton label={t('print')} />
      </div>
      <article className="mt-8 rounded-md border-2 border-line-strong bg-paper p-8 text-center sm:p-12 print:border-ink">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
          {t('certificateIssuer')}
        </p>
        <h1 className="dt-doc-title mt-6 font-display text-[clamp(28px,4vw,40px)] text-ink">
          {t('certificateTitle')}
        </h1>
        <p className="mt-8 text-lg text-ink-soft">
          {t('certificateAwardedTo')}
        </p>
        <p className="mt-2 wrap-anywhere font-display text-3xl text-ink">
          {cert.holderName}
        </p>
        <p className="mt-8 text-lg text-ink-soft">{t('certificateFor')}</p>
        <p className="mt-2 wrap-anywhere font-display text-2xl text-accent-text">
          {cert.pathTitle}
        </p>
        <p className="mt-4 text-[15px] text-ink-soft">
          {t('certificateDetails', {
            level: vocabulary(t, 'level_', cert.level),
            steps: cert.steps,
          })}
        </p>
        <p className="mt-8 text-[15px] text-ink">
          {t('certificateDate', { date: fmt(cert.completedAt) })}
        </p>
        <p className="mt-6 font-mono text-sm text-muted">
          {t('certificateCode', { code: cert.code })}
        </p>
      </article>
    </div>
  );
}

function Detail() {
  const params = useParams<{ enrollmentId: string }>();
  const id = params?.enrollmentId;
  if (!id) return <AuthGateLoading className="max-w-3xl" />;
  return <Certificate enrollmentId={id as Id<'learningEnrollments'>} />;
}

export default function CertificatePage() {
  return (
    <AuthGate className="max-w-3xl">
      <Detail />
    </AuthGate>
  );
}

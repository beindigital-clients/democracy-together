import { getTranslations } from 'next-intl/server';

// Ce que rend une page dont les DONNÉES n'ont pas pu être chargées (F-02).
//
// À ne pas confondre avec l'état vide d'une page : « aucun résultat » est une
// information vraie, « indisponible » en est une autre. Les afficher pareil
// ferait croire au visiteur que le réseau ne compte aucun membre, ou que sa
// recherche ne trouve rien — alors que c'est le backend qui est muet.
//
// Le bloc est rendu par le SERVEUR, à l'intérieur de la mise en page : le
// visiteur garde l'en-tête, la navigation et le pied de page, et il voit ce
// texte même sans JavaScript. C'est ce qui le distingue d'`error.tsx`, dont la
// limite est mesurée : la frontière d'erreur rend aujourd'hui zéro caractère
// dans le HTML servi.
export async function DataUnavailable({ className }: { className?: string }) {
  const t = await getTranslations('errors');
  return (
    <div
      role="status"
      className={`rounded-sm border border-dashed border-line-strong bg-surface px-6 py-14 text-center ${className ?? ''}`}
    >
      <p className="font-display text-lg text-ink">{t('unavailableTitle')}</p>
      <p className="mx-auto mt-2 max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">
        {t('unavailableBody')}
      </p>
    </div>
  );
}

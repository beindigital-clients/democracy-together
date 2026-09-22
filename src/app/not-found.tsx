import type { Metadata } from 'next';

// 404 de RACINE — celle que sert une adresse sans route du tout
// (`/fr/nimporte-quoi`, `/en/whatever`, `/xx`), par opposition à la 404
// localisée de `[locale]/not-found.tsx`, qui répond aux `notFound()` levés
// depuis une route existante.
//
// POURQUOI DEUX, et pourquoi celle-ci ne peut pas être celle-là (audit F-06).
//
// Mesuré sur Next 16.3.5 : une 404 déclenchée par `notFound()` depuis une
// route qui MATCHE rend un `<body>` sans aucun texte — le contenu n'arrive que
// par la charge utile RSC, donc uniquement si JavaScript s'exécute. Une 404
// SANS route correspondante, elle, est bien rendue dans le HTML servi.
// Trois hypothèses ont été écartées par la mesure avant d'en arriver là : la
// suspension du composant (une version synchrone donne le même vide), sa
// place dans l'arborescence (une `not-found` à la racine ne change rien pour
// le cas `notFound()`), et la coquille du layout (son `<head>` est rendu, son
// `<body>` non).
//
// Ce fichier ne corrige donc pas F-06 : il referme l'autre moitié du sujet.
// Sans lui, une adresse sans route recevait la 404 par défaut de Next — en
// anglais, sans charte, hors du site. C'est le reproche que l'audit § 5.1
// faisait déjà, et qui n'avait été traité que pour les `notFound()`.
//
// BILINGUE, et c'est délibéré : ce fichier vit HORS du segment `[locale]`, il
// n'a donc aucun contexte de langue — ni `params`, ni next-intl. Deviner
// d'après l'URL serait faux la moitié du temps (`/xx`, `/favicon-truc`).
// Afficher les deux langues est la seule réponse honnête.
//
// STYLES EN LIGNE : il n'existe pas de layout racine dans ce dépôt
// (`src/app/[locale]/layout.tsx` en est un de segment), donc `globals.css`
// n'est pas chargé ici. Une classe Tailwind n'aurait aucun effet.

export const metadata: Metadata = {
  title: 'Page introuvable · Democracy Together',
  robots: { index: false, follow: true },
};

const PAGE: React.CSSProperties = {
  margin: 0,
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '48px 24px',
  background: '#fbfaf8',
  color: '#15202b',
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  lineHeight: 1.55,
};

const LIEN: React.CSSProperties = {
  display: 'inline-block',
  padding: '10px 18px',
  borderRadius: 3,
  background: '#15202b',
  color: '#ffffff',
  textDecoration: 'none',
  fontWeight: 600,
  fontSize: 15,
};

export default function RootNotFound() {
  return (
    <html lang="fr">
      <body style={PAGE}>
        <main style={{ maxWidth: 560 }}>
          <div
            style={{
              width: 44,
              height: 4,
              background: '#f58b1a',
              marginBottom: 28,
            }}
          />
          <p
            style={{
              margin: 0,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 12,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#6b7683',
            }}
          >
            Erreur 404
          </p>

          <h1
            style={{
              margin: '12px 0 0',
              fontSize: 30,
              letterSpacing: '-0.01em',
            }}
          >
            Page introuvable
          </h1>
          <p style={{ margin: '10px 0 0', color: '#4a5561' }}>
            Cette adresse ne correspond à aucune page du site.
          </p>

          <h2
            lang="en"
            style={{
              margin: '28px 0 0',
              fontSize: 30,
              letterSpacing: '-0.01em',
              fontWeight: 400,
              color: '#4a5561',
            }}
          >
            Page not found
          </h2>
          <p lang="en" style={{ margin: '10px 0 0', color: '#6b7683' }}>
            This address does not match any page on the site.
          </p>

          <p style={{ margin: '32px 0 0', display: 'flex', gap: 12 }}>
            <a href="/fr" style={LIEN}>
              Accueil
            </a>
            <a
              lang="en"
              href="/en"
              style={{
                ...LIEN,
                background: '#ffffff',
                color: '#15202b',
                border: '1px solid #d7d2cb',
              }}
            >
              Home
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}

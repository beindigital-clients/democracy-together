// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "handleDisabledFileLoadingAsSuccess": true } }
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// CHARGEMENT À LA DEMANDE DU SCRIPT reCAPTCHA (issue #39).
//
// Le script de Google était posé par le layout racine, donc sur TOUTES les
// pages — y compris `/fr/mentions-legales`, du texte statique sans le moindre
// formulaire. Deux requêtes tierces payées pour rien à chaque page, sur des
// connexions mobiles à faible débit que le cadrage donne comme exigence
// structurante.
//
// Le contrat tenu ici : le script n'est injecté qu'au PREMIER RENDU d'un
// formulaire protégé, une seule fois par page, et `execute()` l'ATTEND au lieu
// de renvoyer un jeton vide — sans quoi le serveur, fail-closed
// (convex/lib/recaptcha.ts), rejetterait la soumission.

const SITE_KEY = 'cle-de-site-de-test';
const SCRIPT = 'script#recaptcha-v3';

type Recaptcha = typeof import('@/lib/recaptcha');

// La clé de site est lue à l'import du module : il faut donc la poser AVANT,
// et réimporter à neuf pour chaque cas (`pending` est un état de module).
async function loadModule(siteKey: string): Promise<Recaptcha> {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_RECAPTCHA_SITE_KEY', siteKey);
  return import('@/lib/recaptcha');
}

function scripts() {
  return document.querySelectorAll(SCRIPT);
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  for (const el of scripts()) {
    // `error` avant retrait : c'est le chemin par lequel le module abandonne
    // son attente et annule son minuteur de 10 s. Sans ça le minuteur survit au
    // test et peut se déclencher après la fermeture de l'environnement.
    el.dispatchEvent(new Event('error'));
    el.remove();
  }
  delete window.grecaptcha;
});

// Simule l'arrivée du script : Google pose `window.grecaptcha`, puis la balise
// émet `load`. C'est exactement la séquence que le module écoute.
function simulateGoogleScriptArrival(token: string) {
  window.grecaptcha = {
    ready: (cb: () => void) => cb(),
    execute: () => Promise.resolve(token),
  };
  document.querySelector(SCRIPT)?.dispatchEvent(new Event('load'));
}

describe('reCAPTCHA — le script n’est chargé qu’à la demande', () => {
  it('une page sans formulaire protégé n’injecte aucun script', async () => {
    await loadModule(SITE_KEY);
    const PageEditoriale = () => <article>Mentions légales</article>;
    render(<PageEditoriale />);
    expect(scripts()).toHaveLength(0);
  });

  it('le premier rendu d’un formulaire protégé injecte le script', async () => {
    const { useRecaptcha } = await loadModule(SITE_KEY);
    const Formulaire = () => {
      useRecaptcha();
      return <form />;
    };
    render(<Formulaire />);

    const script = document.querySelector<HTMLScriptElement>(SCRIPT);
    expect(script).not.toBeNull();
    expect(script?.src).toContain(`render=${SITE_KEY}`);
    // `async` : le script ne doit pas bloquer l’analyse du document.
    expect(script?.async).toBe(true);
  });

  it('deux formulaires sur la même page partagent un seul script', async () => {
    const { useRecaptcha } = await loadModule(SITE_KEY);
    // C’est le cas de /jeunes : candidature + mentorat.
    const Formulaire = () => {
      useRecaptcha();
      return <form />;
    };
    render(
      <>
        <Formulaire />
        <Formulaire />
      </>,
    );
    expect(scripts()).toHaveLength(1);
  });

  it('sans clé de site, rien n’est injecté et execute() renvoie ""', async () => {
    const { useRecaptcha } = await loadModule('');
    let execute: ((action: string) => Promise<string>) | null = null;
    const Formulaire = () => {
      execute = useRecaptcha();
      return <form />;
    };
    render(<Formulaire />);

    expect(scripts()).toHaveLength(0);
    const run = execute as unknown as (a: string) => Promise<string>;
    await expect(run('contact')).resolves.toBe('');
  });

  it('execute() ATTEND le script au lieu de renvoyer un jeton vide', async () => {
    // Régression guettée : le serveur est fail-closed (issue #24). Une
    // soumission partie sans jeton parce que le script n’était pas encore
    // arrivé serait REJETÉE — l’utilisateur verrait « échec du captcha ».
    const { useRecaptcha } = await loadModule(SITE_KEY);
    let execute: ((action: string) => Promise<string>) | null = null;
    const Formulaire = () => {
      execute = useRecaptcha();
      return <form />;
    };
    render(<Formulaire />);

    const run = execute as unknown as (a: string) => Promise<string>;
    const enCours = run('contact');
    // À cet instant précis le script n’est pas chargé : l’implémentation
    // précédente rendait '' sur-le-champ.
    simulateGoogleScriptArrival('jeton-google');
    await expect(enCours).resolves.toBe('jeton-google');
  });
});

// ---------------------------------------------------------------------------
// Gardes statiques : le chargement global ne doit pas revenir par une autre
// porte (un provider dans le layout, un <Script> ailleurs, une seconde
// implémentation). Ni le typecheck ni les tests de rendu ne l’attraperaient.
// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const SRC = join(process.cwd(), 'src');
const LOADER = join(SRC, 'lib', 'recaptcha.ts');

describe('reCAPTCHA — garde contre un retour du chargement global', () => {
  it('le layout racine ne monte plus rien de reCAPTCHA', () => {
    const layout = readFileSync(
      join(SRC, 'app', '[locale]', 'layout.tsx'),
      'utf8',
    );
    expect(layout.toLowerCase()).not.toContain('recaptcha');
  });

  it('un seul module injecte le script de Google', () => {
    const injecteurs = walk(SRC).filter((file) =>
      readFileSync(file, 'utf8').includes('recaptcha/api.js'),
    );
    expect(injecteurs).toEqual([LOADER]);
  });

  it('le script est injecté depuis un effet, jamais rendu par un composant', () => {
    const src = readFileSync(LOADER, 'utf8');
    // Un <Script> de next/script remonterait dans l’arbre React : il faudrait
    // de nouveau un composant parent commun, donc le layout.
    expect(src).not.toContain('next/script');
    expect(src).toContain('useEffect');
  });
});

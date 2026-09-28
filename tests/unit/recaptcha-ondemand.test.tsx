// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "handleDisabledFileLoadingAsSuccess": true } }
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ON-DEMAND LOADING OF THE reCAPTCHA SCRIPT (issue #39).
//
// Google's script was placed by the root layout, hence on EVERY
// page — including `/fr/mentions-legales`, static text without a single
// form. Two third-party requests paid for nothing on every page, over
// low-bandwidth mobile connections that the scoping document names as a structuring
// requirement.
//
// The contract held here: the script is only injected on the FIRST RENDER of a
// protected form, only once per page, and `execute()` WAITS for it instead
// of returning an empty token — otherwise the server, being fail-closed
// (convex/lib/recaptcha.ts), would reject the submission.

const SITE_KEY = 'cle-de-site-de-test';
const SCRIPT = 'script#recaptcha-v3';

type Recaptcha = typeof import('@/lib/recaptcha');

// The site key is read when the module is imported: it must therefore be set BEFORE,
// and the module re-imported fresh for each case (`pending` is module state).
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
    // `error` before removal: it is the path by which the module abandons
    // its wait and cancels its 10 s timer. Without it the timer outlives the
    // test and may fire after the environment is torn down.
    el.dispatchEvent(new Event('error'));
    el.remove();
  }
  delete window.grecaptcha;
});

// Simulates the script's arrival: Google sets `window.grecaptcha`, then the tag
// emits `load`. That is exactly the sequence the module listens for.
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
    // `async`: the script must not block document parsing.
    expect(script?.async).toBe(true);
  });

  it('deux formulaires sur la même page partagent un seul script', async () => {
    const { useRecaptcha } = await loadModule(SITE_KEY);
    // This is the case of /jeunes: application + mentoring.
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
    // Regression under watch: the server is fail-closed (issue #24). A
    // submission sent without a token because the script had not yet
    // arrived would be REJECTED — the user would see "échec du captcha".
    const { useRecaptcha } = await loadModule(SITE_KEY);
    let execute: ((action: string) => Promise<string>) | null = null;
    const Formulaire = () => {
      execute = useRecaptcha();
      return <form />;
    };
    render(<Formulaire />);

    const run = execute as unknown as (a: string) => Promise<string>;
    const enCours = run('contact');
    // At this exact moment the script is not loaded: the previous
    // implementation returned '' immediately.
    simulateGoogleScriptArrival('jeton-google');
    await expect(enCours).resolves.toBe('jeton-google');
  });
});

// ---------------------------------------------------------------------------
// Static guards: global loading must not come back through another
// door (a provider in the layout, a <Script> elsewhere, a second
// implementation). Neither the typecheck nor the render tests would catch it.
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
    // A <Script> from next/script would move up the React tree: a common
    // parent component would be needed again, hence the layout.
    expect(src).not.toContain('next/script');
    expect(src).toContain('useEffect');
  });
});

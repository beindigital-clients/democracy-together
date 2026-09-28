import { describe, it, expect } from 'vitest';
import { routing } from '@/i18n/routing';
import { direction } from '@/i18n/direction';
import { buttonVariants } from '@/components/ui/button';

describe('i18n — routing (F-03)', () => {
  it('FR par défaut, cinq langues servies, préfixe toujours', () => {
    expect(routing.defaultLocale).toBe('fr');
    expect(routing.locales).toEqual(['fr', 'en', 'es', 'pt', 'ar']);
    expect(routing.localePrefix).toBe('always');
  });

  it('chaque locale servie déclare son sens d’écriture', () => {
    // `direction()` is typed `Record<Locale, Direction>`, hence exhaustive at
    // compile time. This test holds the other half: that the declared VALUE is
    // one of the two allowed — a typo (`'rlt'`) would get past the
    // compiler if the table were ever widened.
    for (const l of routing.locales) {
      expect(['ltr', 'rtl'], `sens inconnu pour « ${l} »`).toContain(
        direction(l),
      );
    }
    expect(direction('ar')).toBe('rtl');
    expect(direction('fr')).toBe('ltr');
  });
});

describe('Design system — Button shadcn thémé (F-04)', () => {
  it('variante par défaut = aplat accent + texte contrasté (papier sur safran)', () => {
    const c = buttonVariants({ variant: 'default' });
    expect(c).toContain('bg-accent');
    expect(c).toContain('text-accent-contrast');
  });
  it('variante outline = contour', () => {
    expect(buttonVariants({ variant: 'outline' })).toContain('border');
  });
  it('fusionne les classes supplémentaires', () => {
    expect(buttonVariants({ className: 'w-full' })).toContain('w-full');
  });
});

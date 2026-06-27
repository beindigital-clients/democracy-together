import { describe, it, expect } from 'vitest';
import { routing } from '@/i18n/routing';
import { buttonVariants } from '@/components/ui/button';

describe('i18n — routing (F-03)', () => {
  it('FR par défaut, locales FR/EN, préfixe toujours', () => {
    expect(routing.defaultLocale).toBe('fr');
    expect(routing.locales).toEqual(['fr', 'en']);
    expect(routing.localePrefix).toBe('always');
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

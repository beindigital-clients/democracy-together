// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ProgressBar } from '@/components/ui/progress-bar';

afterEach(cleanup);

// BARRE DE PROGRESSION (issue #37). Ce qui compte ici n'est pas le pixel, c'est
// le contrat ARIA : une progression qui ne s'annonce pas ne vaut pas mieux que
// pas de progression du tout pour qui n'a pas l'écran sous les yeux.

describe('Barre de progression', () => {
  it('s’annonce comme une progression nommée et chiffrée', () => {
    render(
      <ProgressBar
        label="Progression du téléversement"
        percent={42}
        text="42 %"
      />,
    );
    const bar = screen.getByRole('progressbar', {
      name: 'Progression du téléversement',
    });
    expect(bar.getAttribute('aria-valuenow')).toBe('42');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.getAttribute('aria-valuetext')).toBe('42 %');
  });

  it('reste INDÉTERMINÉE quand la taille totale est inconnue', () => {
    render(
      <ProgressBar
        label="Progression du téléversement"
        percent={null}
        text="Préparation du fichier…"
      />,
    );
    const bar = screen.getByRole('progressbar');
    // L'absence de `aria-valuenow` EST le signal d'indétermination : un 0 %
    // ferait croire à un envoi arrêté au départ.
    expect(bar.getAttribute('aria-valuenow')).toBeNull();
    expect(bar.getAttribute('aria-valuetext')).toBe('Préparation du fichier…');
  });

  it('remplit la barre à la hauteur du pourcentage', () => {
    render(<ProgressBar label="Téléversement" percent={70} text="70 %" />);
    const fill = screen.getByRole('progressbar').firstElementChild;
    expect((fill as HTMLElement).style.width).toBe('70%');
  });

  it('affiche le texte de progression à l’écran', () => {
    render(<ProgressBar label="Téléversement" percent={7} text="7 %" />);
    expect(screen.getByText('7 %')).toBeTruthy();
  });
});

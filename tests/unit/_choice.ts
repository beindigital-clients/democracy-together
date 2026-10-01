import { fireEvent, screen } from '@testing-library/react';

// CHOOSING IN A SHADCN LIST, as a finger does.
//
// The site's selects are no longer native `<select>`s (a `change` event on
// the element no longer means anything): they are buttons with the
// `combobox` role that open a list of `option`s — Radix Select, or the
// searchable cmdk list. Both open on a click and pick on a click, whatever
// the pointer: happy-dom fires no pointer events, which Radix reads as a
// touch.
export function chooseOption(trigger: HTMLElement, option: string | RegExp) {
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('option', { name: option }));
}

// The options a list offers, in order: opens it, reads the labels, closes it
// with Escape (focus goes back to its button).
export function optionLabels(trigger: HTMLElement): string[] {
  fireEvent.click(trigger);
  const labels = screen
    .getAllByRole('option')
    .map((option) => option.textContent ?? '');
  fireEvent.keyDown(document.activeElement ?? trigger, { key: 'Escape' });
  return labels;
}

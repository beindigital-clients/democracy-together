import { cva } from 'class-variance-authority';

// The drawing of a choice CHIP or CARD, shared by `RadioGroupChoice`,
// `CheckboxChoice` and `ChoiceLink`, so single choices, multiple choices and
// filter links look alike wherever they sit side by side. Checked: accent
// border and tint; each of them adds a tick, so colour is not the only sign
// (RGAA 3.1). The shape is the caller's: `rounded-pill px-4` for a chip, a
// column for a card with its description.
//
// A module of its own, without `'use client'`: server pages call it too (a
// function exported by a client module cannot run on the server).
export const choiceStyle = cva(
  'group/choice inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-line bg-surface-2 text-start text-sm font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-accent-edge data-[state=checked]:bg-accent-tint data-[state=checked]:text-accent-text',
);

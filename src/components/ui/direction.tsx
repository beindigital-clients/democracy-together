'use client';

import * as React from 'react';
import * as DirectionPrimitive from '@radix-ui/react-direction';

// shadcn DirectionProvider (Radix).
//
// The Radix primitives do not read the document's `dir`: without this
// provider they fall back to `ltr` and WRITE it on what they render — the
// select's button and its portalled list came out left-to-right on the
// Arabic pages. The locale layout sets it once, from the same `direction()`
// that sets `<html dir>`; a control whose content has its own language
// (a list of languages, each in its script) can still pass its own `dir`.
function DirectionProvider({
  dir,
  children,
}: React.ComponentProps<typeof DirectionPrimitive.DirectionProvider>) {
  return (
    <DirectionPrimitive.DirectionProvider dir={dir}>
      {children}
    </DirectionPrimitive.DirectionProvider>
  );
}

const useDirection = DirectionPrimitive.useDirection;

export { DirectionProvider, useDirection };

'use client';

import { useEffect, useState } from 'react';

function currentTime(): number {
  return Date.now();
}

// The current time, refreshed every `intervalMs`.
//
// Reading the clock during render is impure (and differs between the server
// and the browser): the value is taken once at mount, then advanced by a
// timer, so "il y a 3 min" does not freeze on a dashboard left open.
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(currentTime);
  useEffect(() => {
    const id = setInterval(() => setNow(currentTime()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

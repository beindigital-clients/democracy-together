// Reading the output of `npx convex run`.
//
// THE DEFECT FIXED HERE. The old version kept only the LAST non-empty line
// of the output, assuming it carried the JSON value. That is true of a
// scalar (`"123456"`, `true`) but false of an object: the CLI prints it over
// several lines, the last one is `}`, which does not parse — and the old
// `catch` silently returned `null`.
//
// Consequence: EVERY read-back query returning an object came out as `null`.
// `latestContactForEmail`, `latestApplicationForEmail` — so `stored?.subject`
// and `stored?.organizationName` were `undefined`, and the contact,
// membership and English-journey specs failed on "Received: undefined"
// even though the form had stored correctly. The scalar helpers
// (`getOtp`, `isNewsletterSubscribed`) masked the defect by working.
//
// The output may be preceded by log lines, and followed by others: we
// therefore look for the largest block of lines, starting earliest, that
// forms valid JSON. A log line does not parse, so it is discarded
// by itself.
export function parseConvexRunOutput<T>(out: string): T | null {
  const lines = out.trim().split('\n');
  for (let start = 0; start < lines.length; start++) {
    for (let end = lines.length; end > start; end--) {
      const candidate = lines.slice(start, end).join('\n').trim();
      if (!candidate) continue;
      try {
        return JSON.parse(candidate) as T;
      } catch {
        /* pas un JSON complet : on essaie un bloc plus court */
      }
    }
  }
  return null;
}

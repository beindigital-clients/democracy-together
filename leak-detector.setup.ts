// TEMPORARY diagnostic, not committed: lists, after every test and after the
// file's own hooks, the scheduled functions still pending or running.
import { afterEach, expect, vi } from 'vitest';

const g = globalThis as unknown as { __leakInstances: unknown[] };
g.__leakInstances = [];

vi.mock('convex-test', async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown> & {
    convexTest: (...args: unknown[]) => unknown;
  };
  return {
    ...mod,
    convexTest: (...args: unknown[]) => {
      const t = mod.convexTest(...args);
      (globalThis as unknown as { __leakInstances: unknown[] }).__leakInstances.push(t);
      return t;
    },
  };
});

afterEach(async () => {
  const instances = g.__leakInstances.splice(0) as {
    run: (fn: (ctx: any) => Promise<any>) => Promise<any>;
  }[];
  const now = Date.now();
  const { testPath, currentTestName } = expect.getState();
  for (const t of instances) {
    let jobs: any[];
    try {
      jobs = await t.run((ctx) =>
        ctx.db.system.query('_scheduled_functions').collect(),
      );
    } catch (e) {
      console.log(`[LEAK] ${testPath} :: ${currentTestName} :: DETECTOR_ERROR ${String(e)}`);
      continue;
    }
    for (const j of jobs) {
      if (j.state.kind !== 'pending' && j.state.kind !== 'inProgress') continue;
      console.log(
        `[LEAK] ${testPath?.replace(/^.*\/convex\//, 'convex/')} :: ${currentTestName} :: ${j.name} :: ${j.state.kind} :: delayMs=${Math.round(j.scheduledTime - now)}`,
      );
    }
  }
});
